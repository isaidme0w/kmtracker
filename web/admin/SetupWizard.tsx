import { useMemo, useState, type FormEvent } from 'react';
import type { MeDto } from '../../shared/api.ts';
import { request } from '../common/api.ts';
import { useApp } from '../common/app.tsx';
import { AuthLayout } from '../common/auth.tsx';
import { Button, ErrorBox, InfoBox, SelectInput, TextInput } from '../common/components/ui.tsx';

export function timeZones(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([current, 'UTC', ...zones])].sort((a, b) => a.localeCompare(b));
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const { t, language, setMe, errorText } = useApp();
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
  const zones = useMemo(() => timeZones(detected), [detected]);
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [timeZone, setTimeZone] = useState(detected);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

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
      const me = await request<MeDto>('POST', '/api/setup', { code, username, firstName, lastName, password, timeZone, language });
      setMe(me);
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout wide>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold">{t.setup.title}</h1>
          <span className="text-muted">{t.setup.intro}</span>
        </div>
        <TextInput
          label={t.setup.code}
          hint={t.setup.codeHint}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          large
          className="font-mono tracking-widest"
          required
        />
        <TextInput
          label={t.setup.username}
          hint={t.setup.usernameHint}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label={t.setup.firstName} value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required />
          <TextInput label={t.setup.lastName} value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label={t.setup.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          <TextInput
            label={t.setup.repeatPassword}
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            error={mismatch ? t.auth.passwordsDontMatch : undefined}
            required
          />
        </div>
        <SelectInput label={t.setup.timeZone} hint={t.setup.timeZoneHint} value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </SelectInput>
        <InfoBox>{t.setup.account}</InfoBox>
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <Button type="submit" variant="primary" size="lg" block busy={busy}>
          {t.setup.submit}
        </Button>
      </form>
    </AuthLayout>
  );
}
