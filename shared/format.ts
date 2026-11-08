import type { Language } from './preferences.ts';

const localeTags: Record<Language, string> = { pl: 'pl-PL', en: 'en-GB' };
const MINUS = '−';

export function localeTag(language: Language): string {
  return localeTags[language];
}

function numberFormat(language: Language, digits: number): Intl.NumberFormat {
  return new Intl.NumberFormat(localeTags[language], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: 'always',
  });
}

export function formatNumber(value: number, language: Language, digits = 0): string {
  return numberFormat(language, digits).format(value);
}

// Whole kilometres are shown without decimals, shared fractions with one.
export function formatKm(km: number, language: Language): string {
  const rounded = Math.round(km * 10) / 10;
  const digits = Number.isInteger(rounded) ? 0 : 1;
  return `${formatNumber(rounded, language, digits)} km`;
}

export function formatMoney(grosze: number, language: Language): string {
  const sign = grosze < 0 ? MINUS : '';
  return `${sign}${formatNumber(Math.abs(grosze) / 100, language, 2)} zł`;
}

// Balances always show their sign, so they read correctly in any colour.
export function formatSignedMoney(grosze: number, language: Language): string {
  if (grosze === 0) return formatMoney(0, language);
  return `${grosze > 0 ? '+' : MINUS}${formatNumber(Math.abs(grosze) / 100, language, 2)} zł`;
}

export function formatPercent(percent: number, language: Language): string {
  return `${formatNumber(percent, language, 2)}%`;
}

// Formats a plain amount for an input field, without the currency.
export function formatAmountInput(grosze: number, language: Language): string {
  return new Intl.NumberFormat(localeTags[language], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(grosze / 100);
}

export function formatDate(iso: string, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(localeTags[language], {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, language: Language, timeZone: string): string {
  return new Intl.DateTimeFormat(localeTags[language], {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function personName(person: { firstName: string; lastName: string | null }): string {
  return person.lastName ? `${person.firstName} ${person.lastName}` : person.firstName;
}

export function initials(person: { firstName: string; lastName: string | null }): string {
  const first = person.firstName.trim().charAt(0);
  const last = (person.lastName ?? '').trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}
