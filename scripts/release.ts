// Builds the container image and pushes it to a registry, with Podman or Docker.
//
// Usage: npm run release -- <image> [--engine podman|docker] [--insecure] [--latest-only]
// Example: npm run release -- registry.example.lan/kmtracker
//
// Registries that require signing in: the script uses the engine's own
// credentials. If a push is refused, it signs in (with REGISTRY_USERNAME and
// REGISTRY_PASSWORD when set, otherwise interactively) and tries once more.
//
// --latest-only pushes only the `latest` tag and then deletes the previous
// `latest` from the registry and the previous local image, so no old versions
// accumulate. The registry must allow deleting, and its garbage collection
// frees the space.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Engine = 'podman' | 'docker';

const projectDir = resolve(import.meta.dirname, '..');

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

interface Options {
  image: string;
  engine: Engine | null;
  insecure: boolean;
  latestOnly: boolean;
}

const USAGE = 'Usage: npm run release -- <image> [--engine podman|docker] [--insecure] [--latest-only]';

function parseArgs(argv: string[]): Options {
  let image: string | null = null;
  let engine: Engine | null = null;
  let insecure = false;
  let latestOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--insecure') insecure = true;
    else if (arg === '--latest-only') latestOnly = true;
    else if (arg === '--engine') {
      const value = argv[++i];
      if (value !== 'podman' && value !== 'docker') fail('--engine must be "podman" or "docker".');
      engine = value;
    } else if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    else if (image === null) image = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  if (!image) fail(USAGE);
  if (/:[^/]+$/.test(image)) fail('Give the image without a tag; the version from package.json is used.');
  return { image, engine, insecure, latestOnly };
}

function isInstalled(command: string): boolean {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

function chooseEngine(requested: Engine | null): Engine {
  const fromEnv = process.env.CONTAINER_ENGINE;
  const choice = requested ?? (fromEnv === 'podman' || fromEnv === 'docker' ? fromEnv : null);
  if (choice) {
    if (!isInstalled(choice)) fail(`${choice} is not installed.`);
    return choice;
  }
  if (isInstalled('podman')) return 'podman';
  if (isInstalled('docker')) return 'docker';
  fail('Neither Podman nor Docker is installed.');
}

// The registry part of an image name, as used by `login`.
function registryOf(image: string): string {
  const first = image.split('/')[0]!;
  const hasRegistry = image.includes('/') && (first.includes('.') || first.includes(':') || first === 'localhost');
  return hasRegistry ? first : 'docker.io';
}

function run(command: string, args: string[]): void {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: projectDir });
  if (result.status !== 0) fail(`${command} ${args[0]} failed.`);
}

// Runs a command, showing its output while keeping a copy of the errors.
function runCapturing(command: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'pipe'], cwd: projectDir });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolvePromise({ ok: code === 0, stderr }));
  });
}

const AUTH_ERROR = /unauthori[sz]ed|authentication required|access to the resource is denied|requested access .* denied|denied|status: 401|status: 403|no basic auth credentials/i;
const TLS_ERROR = /x509|certificate|tls:|http: server gave http response to https client/i;

function signIn(engine: Engine, registry: string, insecure: boolean): void {
  const tlsArgs = engine === 'podman' && insecure ? ['--tls-verify=false'] : [];
  const username = process.env.REGISTRY_USERNAME;
  const password = process.env.REGISTRY_PASSWORD;
  if (username && password) {
    const args = ['login', ...tlsArgs, '--username', username, '--password-stdin', registry];
    console.log(`\n$ ${engine} ${args.join(' ')}`);
    // The password goes through standard input, never as an argument.
    const result = spawnSync(engine, args, { input: password, stdio: ['pipe', 'inherit', 'inherit'] });
    if (result.status !== 0) fail(`Signing in to ${registry} failed.`);
    return;
  }
  run(engine, ['login', ...tlsArgs, registry]);
}

function explainTls(engine: Engine, registry: string): void {
  if (engine === 'podman') {
    console.error(`\nThe registry ${registry} has no trusted HTTPS certificate. Run again with --insecure,`);
    console.error('or add the registry’s certificate to the system’s trusted certificates.');
  } else {
    console.error(`\nThe registry ${registry} has no trusted HTTPS certificate. Docker can’t skip verification for one command.`);
    console.error('Add it to /etc/docker/daemon.json and restart Docker:');
    console.error(`  { "insecure-registries": ["${registry}"] }`);
    console.error('or add the registry’s certificate to the system’s trusted certificates.');
  }
}

async function push(engine: Engine, reference: string, registry: string, insecure: boolean): Promise<void> {
  const args = ['push', ...(engine === 'podman' && insecure ? ['--tls-verify=false'] : []), reference];
  let result = await runCapturing(engine, args);
  if (!result.ok && AUTH_ERROR.test(result.stderr) && !TLS_ERROR.test(result.stderr)) {
    console.log(`\nThe registry refused the push. Signing in to ${registry}…`);
    signIn(engine, registry, insecure);
    result = await runCapturing(engine, args);
  }
  if (!result.ok) {
    if (TLS_ERROR.test(result.stderr)) explainTls(engine, registry);
    fail(`Pushing ${reference} failed.`);
  }
}

// Registry HTTP API, used by --latest-only to find and delete the previous image

const MANIFEST_TYPES = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
].join(', ');

class RegistryApi {
  private readonly host: string;
  private readonly repository: string;
  private readonly insecure: boolean;
  private scheme: 'https' | 'http' = 'https';
  private authorization: string | null = null;

  constructor(image: string, registry: string, insecure: boolean) {
    const path = image.startsWith(`${registry}/`) ? image.slice(registry.length + 1) : image;
    this.host = registry === 'docker.io' ? 'registry-1.docker.io' : registry;
    this.repository = registry === 'docker.io' && !path.includes('/') ? `library/${path}` : path;
    this.insecure = insecure;
    // Allows self-signed certificates for the API calls, like --tls-verify=false does for Podman.
    if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  // Returns the digest that `latest` points to, or null when there is none.
  async latestDigest(): Promise<string | null> {
    const response = await this.request('HEAD', 'manifests/latest');
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const digest = response.headers.get('docker-content-digest');
    if (!digest) throw new Error('the registry did not return the digest');
    return digest;
  }

  async deleteManifest(digest: string): Promise<void> {
    const response = await this.request('DELETE', `manifests/${digest}`);
    if (response.status === 404) return;
    if (response.status === 405) throw new Error('the registry does not allow deleting (set REGISTRY_STORAGE_DELETE_ENABLED=true)');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  private async request(method: string, path: string): Promise<Response> {
    let response = await this.send(method, path);
    if (response.status === 401 && (await this.authenticate(response.headers.get('www-authenticate')))) {
      response = await this.send(method, path);
    }
    return response;
  }

  private async send(method: string, path: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: MANIFEST_TYPES };
    if (this.authorization) headers.Authorization = this.authorization;
    const url = (scheme: string) => `${scheme}://${this.host}/v2/${this.repository}/${path}`;
    try {
      return await fetch(url(this.scheme), { method, headers });
    } catch (error) {
      // An insecure registry may speak plain HTTP.
      if (!this.insecure || this.scheme === 'http') throw error;
      this.scheme = 'http';
      return fetch(url(this.scheme), { method, headers });
    }
  }

  // Handles Basic and Bearer token challenges, using REGISTRY_USERNAME and
  // REGISTRY_PASSWORD when set.
  private async authenticate(challenge: string | null): Promise<boolean> {
    if (!challenge) return false;
    const username = process.env.REGISTRY_USERNAME;
    const password = process.env.REGISTRY_PASSWORD;
    const basic = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : null;
    if (/^basic/i.test(challenge)) {
      if (!basic) return false;
      this.authorization = basic;
      return true;
    }
    const params = Object.fromEntries([...challenge.matchAll(/(\w+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
    if (!params.realm) return false;
    const url = new URL(params.realm);
    if (params.service) url.searchParams.set('service', params.service);
    url.searchParams.set('scope', `repository:${this.repository}:pull,push,delete`);
    const response = await fetch(url, { headers: basic ? { Authorization: basic } : {} });
    if (!response.ok) return false;
    const body = (await response.json()) as { token?: string; access_token?: string };
    const token = body.token ?? body.access_token;
    if (!token) return false;
    this.authorization = `Bearer ${token}`;
    return true;
  }
}

function localImageId(engine: Engine, reference: string): string | null {
  const result = spawnSync(engine, ['image', 'inspect', '--format', '{{.Id}}', reference], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function warn(message: string): void {
  console.warn(`\n! ${message}`);
}

const { image, engine: requestedEngine, insecure, latestOnly } = parseArgs(process.argv.slice(2));
const engine = chooseEngine(requestedEngine);
const { version } = JSON.parse(readFileSync(resolve(projectDir, 'package.json'), 'utf8')) as { version: string };
const registry = registryOf(image);
const latest = `${image}:latest`;
const tags = latestOnly ? [latest] : [`${image}:${version}`, latest];
const api = latestOnly ? new RegistryApi(image, registry, insecure) : null;

console.log(`KM Tracker ${version} → ${image} (using ${engine}${latestOnly ? ', latest only' : ''})`);

// With --latest-only, remember what the previous release was, to delete it afterwards.
let previousDigest: string | null = null;
let previousLocalId: string | null = null;
if (api) {
  try {
    previousDigest = await api.latestDigest();
  } catch (error) {
    warn(`Couldn't read the current latest from the registry (${(error as Error).message}); the previous image won't be deleted.`);
  }
  previousLocalId = localImageId(engine, latest);
}

// Podman's default OCI format drops the HEALTHCHECK instruction.
const formatArgs = engine === 'podman' ? ['--format', 'docker'] : [];
run(engine, ['build', ...formatArgs, ...tags.flatMap((tag) => ['-t', tag]), '.']);

for (const tag of tags) await push(engine, tag, registry, insecure);

console.log('\n✓ Pushed:');
for (const tag of tags) console.log(`  ${tag}`);

if (api) {
  let newDigest: string | null = null;
  try {
    newDigest = await api.latestDigest();
  } catch (error) {
    warn(`Couldn't read the new latest from the registry (${(error as Error).message}).`);
  }
  if (previousDigest && newDigest && previousDigest !== newDigest) {
    try {
      await api.deleteManifest(previousDigest);
      console.log(`\n✓ Deleted the previous image from the registry: ${previousDigest}`);
      console.log('  Its space is freed by the registry’s garbage collection.');
    } catch (error) {
      warn(`Couldn't delete the previous image ${previousDigest} from the registry: ${(error as Error).message}.`);
    }
  }
  const newLocalId = localImageId(engine, latest);
  if (previousLocalId && newLocalId && previousLocalId !== newLocalId) {
    const result = spawnSync(engine, ['rmi', previousLocalId], { stdio: 'ignore' });
    if (result.status === 0) console.log(`\n✓ Deleted the previous local image: ${previousLocalId.slice(0, 19)}`);
    else warn(`Couldn't delete the previous local image ${previousLocalId}; it may still be used by a container.`);
  }
}

console.log('\nOn the target host, put this in .env and run `docker compose pull && docker compose up -d`:');
console.log(`  KMT_IMAGE=${image}`);
if (!latestOnly) console.log(`  KMT_TAG=${version}`);
