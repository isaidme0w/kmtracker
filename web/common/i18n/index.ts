import { languages, type Language } from '../../../shared/preferences.ts';
import { en, type Plural, type Translations } from './en.ts';
import { pl } from './pl.ts';

export type { Plural, Translations };

export const dictionaries: Record<Language, Translations> = { pl, en };

export const availableLanguages = languages.map((code) => ({ code, name: dictionaries[code].languageName }));

// Polish for a Polish browser, English for any other.
export function detectLanguage(): Language {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return preferred.some((tag) => tag?.toLowerCase().startsWith('pl')) ? 'pl' : 'en';
}

// Replaces {name} placeholders with the given values.
export function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

export function plural(forms: Plural, count: number, language: Language, params: Record<string, string | number> = {}): string {
  const category = new Intl.PluralRules(language === 'pl' ? 'pl-PL' : 'en-GB').select(count);
  const template = (forms as unknown as Record<string, string | undefined>)[category] ?? forms.other;
  return fill(template, { count, ...params });
}
