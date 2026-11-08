import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors.ts';
import {
  isValidTimeZone,
  parseAmount,
  parseOdometer,
  validateFirstName,
  validateLastName,
  validatePassword,
  validateUsername,
} from './validation.ts';

describe('parseAmount', () => {
  it('accepts a comma or a dot', () => {
    expect(parseAmount('123,45')).toBe(12345);
    expect(parseAmount('123.4')).toBe(12340);
    expect(parseAmount('1 234,50 zł')).toBe(123450);
    expect(parseAmount('300')).toBe(30000);
  });

  it('rejects invalid amounts', () => {
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1,234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('parseOdometer', () => {
  it('accepts whole kilometres with spaces', () => {
    expect(parseOdometer('101 330')).toBe(101330);
    expect(parseOdometer(5)).toBe(5);
  });

  it('rejects invalid values', () => {
    expect(parseOdometer('0')).toBeNull();
    expect(parseOdometer('12.5')).toBeNull();
    expect(parseOdometer('')).toBeNull();
  });
});

describe('validators', () => {
  it('normalizes usernames', () => {
    expect(validateUsername(' Anna ')).toBe('anna');
    expect(() => validateUsername('ab')).toThrow(ValidationError);
    expect(() => validateUsername('anna kowalska')).toThrow(ValidationError);
  });

  it('checks password length', () => {
    expect(() => validatePassword('short')).toThrow(ValidationError);
    expect(validatePassword('long enough')).toBe('long enough');
  });

  it('cleans names', () => {
    expect(validateFirstName('  Anna   Maria ')).toBe('Anna Maria');
    expect(() => validateFirstName('   ')).toThrow(ValidationError);
    expect(validateLastName('', false)).toBeNull();
    expect(() => validateLastName('', true)).toThrow(ValidationError);
  });

  it('recognizes time zones', () => {
    expect(isValidTimeZone('Europe/Warsaw')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
  });
});
