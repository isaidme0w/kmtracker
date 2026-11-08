import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatKm, formatMoney, formatPercent, formatSignedMoney, personName } from './format.ts';

const normalize = (text: string) => text.replace(/[  ]/g, ' ');

describe('format', () => {
  it('formats money in both languages', () => {
    expect(normalize(formatMoney(123450, 'pl'))).toBe('1 234,50 zł');
    expect(formatMoney(123450, 'en')).toBe('1,234.50 zł');
    expect(formatSignedMoney(5000, 'pl')).toBe('+50,00 zł');
    expect(formatSignedMoney(-5000, 'en')).toBe('−50.00 zł');
    expect(formatSignedMoney(0, 'pl')).toBe('0,00 zł');
  });

  it('formats distances', () => {
    expect(normalize(formatKm(101330, 'pl'))).toBe('101 330 km');
    expect(formatKm(33.3333, 'en')).toBe('33.3 km');
    expect(formatKm(120, 'en')).toBe('120 km');
  });

  it('formats percentages', () => {
    expect(formatPercent(57.14, 'pl')).toBe('57,14%');
    expect(formatPercent(57.14, 'en')).toBe('57.14%');
  });

  it('formats dates in the time zone', () => {
    const iso = '2026-11-07T23:30:00.000Z';
    expect(formatDate(iso, 'pl', 'Europe/Warsaw')).toBe('08.11.2026');
    expect(formatDate(iso, 'en', 'UTC')).toBe('07/11/2026');
    expect(formatDateTime(iso, 'pl', 'Europe/Warsaw')).toBe('08.11.2026, 00:30');
  });

  it('builds names', () => {
    expect(personName({ firstName: 'Kasia', lastName: null })).toBe('Kasia');
    expect(personName({ firstName: 'Anna', lastName: 'Kowalska' })).toBe('Anna Kowalska');
  });
});
