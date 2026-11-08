import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MeDto } from '../../shared/api.ts';
import {
  formatDate,
  formatDateTime,
  formatKm,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
} from '../../shared/format.ts';
import type { Accent, Language } from '../../shared/preferences.ts';
import { ApiRequestError, PASSWORD_CHANGE_EVENT, UNAUTHENTICATED_EVENT, createApi, type Api } from './api.ts';
import { dictionaries, fill, plural, type Plural, type Translations } from './i18n/index.ts';
import {
  applyAccent,
  applyLanguage,
  applyTheme,
  initialAccent,
  initialLanguage,
  initialTheme,
  type Theme,
} from './preferences.ts';

export interface Formatters {
  km: (km: number) => string;
  money: (grosze: number) => string;
  signedMoney: (grosze: number) => string;
  percent: (percent: number) => string;
  number: (value: number, digits?: number) => string;
  date: (iso: string) => string;
  dateTime: (iso: string) => string;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

export interface AppValue {
  api: Api;
  me: MeDto | null;
  loading: boolean;
  setMe: (me: MeDto | null) => void;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
  theme: Theme;
  toggleTheme: () => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  timeZone: string;
  t: Translations;
  f: Formatters;
  fill: typeof fill;
  plural: (forms: Plural, count: number, params?: Record<string, string | number>) => string;
  errorText: (error: unknown) => string;
  toasts: Toast[];
  notify: (message: string, kind?: Toast['kind']) => void;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';

// Session, preferences, translations, and notifications for one frontend.
export function AppProvider({ base, children }: { base: '/api' | '/api/admin'; children: ReactNode }) {
  const api = useMemo(() => createApi(base), [base]);
  const [me, setMeState] = useState<MeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [accent, setAccentState] = useState<Accent>(initialAccent);
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => applyTheme(theme, false), [theme]);
  useEffect(() => applyAccent(accent), [accent]);
  useEffect(() => applyLanguage(language), [language]);

  const setMe = useCallback((value: MeDto | null) => {
    setMeState(value);
    if (value) {
      setAccentState(value.account.accent);
      setLanguageState(value.account.language);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.get<MeDto>('/me'));
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'UNAUTHENTICATED') setMeState(null);
      else throw error;
    }
  }, [api, setMe]);

  useEffect(() => {
    refreshMe()
      .catch(() => setMeState(null))
      .finally(() => setLoading(false));
  }, [refreshMe]);

  useEffect(() => {
    const onUnauthenticated = () => setMeState(null);
    const onPasswordChange = () => {
      setMeState((current) => (current ? { ...current, account: { ...current.account, mustChangePassword: true } } : current));
    };
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    window.addEventListener(PASSWORD_CHANGE_EVENT, onPasswordChange);
    return () => {
      window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
      window.removeEventListener(PASSWORD_CHANGE_EVENT, onPasswordChange);
    };
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setMeState(null);
  }, [api]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
      return next;
    });
  }, []);

  const savePreference = useCallback(
    (patch: { accent?: Accent; language?: Language }) => {
      if (!me) return;
      api
        .patch<MeDto>('/me/preferences', patch)
        .then(setMeState)
        .catch(() => undefined);
    },
    [api, me],
  );

  const setAccent = useCallback(
    (value: Accent) => {
      setAccentState(value);
      savePreference({ accent: value });
    },
    [savePreference],
  );

  const setLanguage = useCallback(
    (value: Language) => {
      setLanguageState(value);
      savePreference({ language: value });
    },
    [savePreference],
  );

  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, message, kind }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3500);
  }, []);

  const timeZone = me?.timeZone ?? browserTimeZone;
  const t = dictionaries[language];

  const value = useMemo<AppValue>(() => {
    const f: Formatters = {
      km: (km) => formatKm(km, language),
      money: (grosze) => formatMoney(grosze, language),
      signedMoney: (grosze) => formatSignedMoney(grosze, language),
      percent: (percent) => formatPercent(percent, language),
      number: (number, digits = 0) => formatNumber(number, language, digits),
      date: (iso) => formatDate(iso, language, timeZone),
      dateTime: (iso) => formatDateTime(iso, language, timeZone),
    };
    const errorText = (error: unknown): string => {
      if (error instanceof ApiRequestError) {
        const params = { ...error.params };
        if (typeof params.last === 'number') params.last = formatNumber(params.last, language);
        return fill(t.errors[error.code] ?? t.errors.INTERNAL_ERROR, params);
      }
      return t.errors.INTERNAL_ERROR;
    };
    return {
      api,
      me,
      loading,
      setMe,
      refreshMe,
      signOut,
      theme,
      toggleTheme,
      accent,
      setAccent,
      language,
      setLanguage,
      timeZone,
      t,
      f,
      fill,
      plural: (forms, count, params) => plural(forms, count, language, params),
      errorText,
      toasts,
      notify,
    };
  }, [api, me, loading, setMe, refreshMe, signOut, theme, toggleTheme, accent, setAccent, language, setLanguage, timeZone, t, toasts, notify]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Loads data on mount and whenever the dependencies change.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}
