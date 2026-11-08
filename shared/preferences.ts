export const languages = ['pl', 'en'] as const;
export type Language = (typeof languages)[number];

export const accents = ['blue', 'green', 'red', 'pink', 'purple', 'aqua', 'yellow', 'lime'] as const;
export type Accent = (typeof accents)[number];

export const DEFAULT_ACCENT: Accent = 'blue';
export const DEFAULT_TIME_ZONE = 'Europe/Warsaw';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (languages as readonly string[]).includes(value);
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (accents as readonly string[]).includes(value);
}
