import type { Db } from '../db/database.ts';
import { hasProtectedAccount } from '../services/accounts.ts';
import { MemoryLimiter } from './limiter.ts';
import { generateSetupCode, normalizeSetupCode, sha256 } from './passwords.ts';

// Setup mode lasts while no administrator account exists. A new code is
// generated at every start; only its hash is kept.
export class SetupState {
  required: boolean;
  private codeHash: string | null = null;
  readonly limiter = new MemoryLimiter();

  constructor(db: Db) {
    this.required = !hasProtectedAccount(db);
  }

  generateCode(): string {
    const code = generateSetupCode();
    this.codeHash = sha256(normalizeSetupCode(code));
    return code;
  }

  // For tests: sets a known code.
  useCode(code: string): void {
    this.codeHash = sha256(normalizeSetupCode(code));
  }

  verifyCode(code: string): boolean {
    return this.codeHash !== null && sha256(normalizeSetupCode(code)) === this.codeHash;
  }

  complete(): void {
    this.required = false;
    this.codeHash = null;
  }
}

export function setupMessage(code: string, port: number): string {
  return [
    '',
    'KM Tracker: initial setup',
    `Open http://<address>:${port}/admin/setup and enter the code: ${code}`,
    '',
  ].join('\n');
}
