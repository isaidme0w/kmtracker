import { useState, type FormEvent, type ReactNode } from 'react';
import type { MeDto } from '../../shared/api.ts';
import { useApp } from './app.tsx';
import { LanguageDropdown, ThemeToggle } from './components/chrome.tsx';
import { GaugeIcon } from './components/icons.tsx';
import { Button, ErrorBox, InfoBox, TextInput } from './components/ui.tsx';

// Layout of the pages shown before signing in: language and theme on top,
// the form in the middle.
export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { t } = useApp();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end gap-1.5 p-2 sm:p-3">
        <LanguageDropdown />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center px-5 pt-4 pb-16 sm:justify-center sm:pt-0">
        <div className={wide ? 'flex w-full max-w-xl flex-col gap-6' : 'flex w-full max-w-sm flex-col gap-6'}>
          <div className="flex flex-col items-center gap-2.5 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              <GaugeIcon size={28} strokeWidth={2.2} />
            </span>
            <span className="text-2xl font-bold">KM Tracker</span>
            <span className="text-muted">{t.auth.subtitle}</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function LoginForm({ title }: { title: string }) {
  const { api, t, setMe, errorText } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await api.post<MeDto>('/auth/login', { username, password }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <h1 className="m-0 text-xl font-bold">{title}</h1>
      <TextInput label={t.auth.username} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
      <TextInput label={t.auth.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
      <Button type="submit" variant="primary" size="lg" block busy={busy}>
        {t.auth.signIn}
      </Button>
    </form>
  );
}

// Shown after signing in with a one-time password, before anything else.
export function ForcedPasswordChange() {
  const { api, t, setMe, signOut, errorText } = useApp();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [mismatch, setMismatch] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setBusy(true);
    setError(null);
    try {
      setMe(await api.post<MeDto>('/me/password', { newPassword: password }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
        <h1 className="m-0 text-xl font-bold">{t.auth.changeTitle}</h1>
        <InfoBox>{t.auth.changeText}</InfoBox>
        <TextInput label={t.auth.newPassword} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <TextInput
          label={t.auth.repeatPassword}
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          autoComplete="new-password"
          error={mismatch ? t.auth.passwordsDontMatch : undefined}
          required
        />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <Button type="submit" variant="primary" size="lg" block busy={busy}>
          {t.auth.saveAndContinue}
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          {t.common.signOut}
        </Button>
      </form>
    </AuthLayout>
  );
}
