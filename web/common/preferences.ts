import { DEFAULT_ACCENT, isAccent, isLanguage, type Accent, type Language } from '../../shared/preferences.ts';
import { detectLanguage } from './i18n/index.ts';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'kmt-theme';
const ACCENT_KEY = 'kmt-accent';
const LANGUAGE_KEY = 'kmt-language';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable, for example in a private window.
  }
}

// Without a saved choice, the theme follows the operating system.
export function initialTheme(): Theme {
  const saved = read(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initialAccent(): Accent {
  const saved = read(ACCENT_KEY);
  return isAccent(saved) ? saved : DEFAULT_ACCENT;
}

export function initialLanguage(): Language {
  const saved = read(LANGUAGE_KEY);
  return isLanguage(saved) ? saved : detectLanguage();
}

export function applyTheme(theme: Theme, save: boolean): void {
  document.documentElement.dataset.theme = theme;
  if (save) write(THEME_KEY, theme);
}

export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
  write(ACCENT_KEY, accent);
}

export function applyLanguage(language: Language): void {
  document.documentElement.lang = language;
  write(LANGUAGE_KEY, language);
}
