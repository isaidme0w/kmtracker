// Builds the container image and pushes it to a registry, with Podman or Docker.
//
// Usage: npm run release -- <image> [--engine podman|docker] [--insecure]
// Example: npm run release -- registry.example.lan/kmtracker
//
// Registries that require signing in: the script uses the engine's own
// credentials. If a push is refused, it signs in (with REGISTRY_USERNAME and
// REGISTRY_PASSWORD when set, otherwise interactively) and tries once more.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Engine = 'podman' | 'docker';

const projectDir = resolve(import.meta.dirname, '..');

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { image: string; engine: Engine | null; insecure: boolean } {
  let image: string | null = null;
  let engine: Engine | null = null;
  let insecure = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--insecure') insecure = true;
    else if (arg === '--engine') {
      const value = argv[++i];
      if (value !== 'podman' && value !== 'docker') fail('--engine must be "podman" or "docker".');
      engine = value;
    } else if (arg.startsWith('--')) fail(`Unknown option: ${arg}`);
    else if (image === null) image = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  if (!image) fail('Usage: npm run release -- <image> [--engine podman|docker] [--insecure]');
  if (/:[^/]+$/.test(image)) fail('Give the image without a tag; the version from package.json is used.');
  return { image, engine, insecure };
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

const { image, engine: requestedEngine, insecure } = parseArgs(process.argv.slice(2));
const engine = chooseEngine(requestedEngine);
const { version } = JSON.parse(readFileSync(resolve(projectDir, 'package.json'), 'utf8')) as { version: string };
const registry = registryOf(image);
const tags = [`${image}:${version}`, `${image}:latest`];

console.log(`KM Tracker ${version} → ${image} (using ${engine})`);

// Podman's default OCI format drops the HEALTHCHECK instruction.
const formatArgs = engine === 'podman' ? ['--format', 'docker'] : [];
run(engine, ['build', ...formatArgs, ...tags.flatMap((tag) => ['-t', tag]), '.']);

for (const tag of tags) await push(engine, tag, registry, insecure);

console.log('\n✓ Pushed:');
for (const tag of tags) console.log(`  ${tag}`);
console.log('\nOn the target host, put this in .env and run `docker compose pull && docker compose up -d`:');
console.log(`  KMT_IMAGE=${image}`);
console.log(`  KMT_TAG=${version}`);
