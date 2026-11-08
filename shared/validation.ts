import { ValidationError } from './errors.ts';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_NAME_LENGTH = 60;
export const MAX_ODOMETER = 9_999_999;
export const MAX_AMOUNT_GROSZE = 100_000_000;

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string {
  const username = normalizeUsername(value);
  if (!usernamePattern.test(username)) throw new ValidationError('USERNAME_INVALID');
  return username;
}

export function validatePassword(value: string): string {
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError('PASSWORD_TOO_SHORT', { min: MIN_PASSWORD_LENGTH });
  }
  if (value.length > MAX_PASSWORD_LENGTH) throw new ValidationError('PASSWORD_TOO_LONG');
  return value;
}

export function validateFirstName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new ValidationError('NAME_REQUIRED');
  if (name.length > MAX_NAME_LENGTH) throw new ValidationError('NAME_TOO_LONG', { max: MAX_NAME_LENGTH });
  return name;
}

// The last name is optional for people without an account.
export function validateLastName(value: string | null | undefined, required: boolean): string | null {
  const name = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) {
    if (required) throw new ValidationError('LAST_NAME_REQUIRED');
    return null;
  }
  if (name.length > MAX_NAME_LENGTH) throw new ValidationError('NAME_TOO_LONG', { max: MAX_NAME_LENGTH });
  return name;
}

// Accepts digits with optional spaces used as thousands separators.
export function parseOdometer(value: string | number): number | null {
  const text = typeof value === 'number' ? String(value) : value.replace(/[\s  ]/g, '');
  if (!/^\d+$/.test(text)) return null;
  const odometer = Number(text);
  if (!Number.isSafeInteger(odometer) || odometer < 1 || odometer > MAX_ODOMETER) return null;
  return odometer;
}

export function validateOdometer(value: string | number): number {
  const odometer = parseOdometer(value);
  if (odometer === null) throw new ValidationError('ODOMETER_INVALID');
  return odometer;
}

// Parses an amount in złoty, accepting a comma or a dot as the decimal
// separator, and returns it in grosze.
export function parseAmount(value: string | number): number | null {
  const text = (typeof value === 'number' ? String(value) : value)
    .replace(/[\s  ]/g, '')
    .replace(/zł$/i, '')
    .replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const grosze = whole * 100 + fraction;
  if (!Number.isSafeInteger(grosze) || grosze < 1 || grosze > MAX_AMOUNT_GROSZE) return null;
  return grosze;
}

export function validateAmount(value: string | number): number {
  const amount = parseAmount(value);
  if (amount === null) throw new ValidationError('AMOUNT_INVALID');
  return amount;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
