import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

// Format: scrypt$<N>$<r>$<p>$<salt>$<hash>, with salt and hash in base64.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION });
  return ['scrypt', COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, hashText] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashText, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltText, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

// Spends the same time as a real check, so that sign-in responses don't
// reveal whether a username exists.
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy password for timing');
  await verifyPassword(password, await dummyHash);
}

// Characters that are hard to confuse with each other (no 0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function randomGroup(length: number): string {
  let text = '';
  for (let i = 0; i < length; i++) text += ALPHABET[randomInt(ALPHABET.length)];
  return text;
}

// A one-time password such as "K7mQ-x4pW-z9rT".
export function generateTemporaryPassword(): string {
  return [randomGroup(4), randomGroup(4), randomGroup(4)].join('-');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// A setup code such as "7KQM-4XWP-Z9RT", case-insensitive.
export function generateSetupCode(): string {
  const group = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return [group(), group(), group()].join('-');
}

export function normalizeSetupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
