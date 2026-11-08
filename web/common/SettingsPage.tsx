import { useState, type FormEvent } from 'react';
import type { MeDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import { accents, isLanguage } from '../../shared/preferences.ts';
import { useApp } from './app.tsx';
import { availableLanguages } from './i18n/index.ts';
import { CheckIcon } from './components/icons.tsx';
import { Button, Card, ErrorBox, SelectInput, TextInput, cx } from './components/ui.tsx';

export function SettingsPage() {
  const { t } = useApp();
  return (
    <>
      <h1 className="m-0 text-2xl font-bold">{t.settings.title}</h1>
      <AccountCard />
      <AppearanceCard />
      <PasswordCard />
    </>
  );
}


function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3', !last && 'border-b border-line pb-2.5')}>
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function AccountCard() {
  const { me, t, f } = useApp();
  if (!me) return null;
  return (
    <Card title={t.settings.account}>
      <Row label={t.settings.username} value={me.account.username} />
      <Row label={t.settings.name} value={personName(me.person)} />
      <Row label={t.settings.role} value={t.roles[me.account.role]} />
      <Row label={t.settings.created} value={f.date(me.account.createdAt)} last />
    </Card>
  );
}

function AppearanceCard() {
  const { t, accent, setAccent, language, setLanguage } = useApp();
  return (
    <Card title={t.settings.appearance}>
      <span className="text-[13px] font-semibold text-muted">{t.settings.accent}</span>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3.5">
        {accents.map((key) => {
          const selected = key === accent;
          return (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                data-accent={key}
                aria-label={t.accents[key]}
                aria-pressed={selected}
                onClick={() => setAccent(key)}
                className={cx(
                  'flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-fg',
                  selected && 'ring-2 ring-accent ring-offset-[3px] ring-offset-surface',
                )}
              >
                {selected && <CheckIcon size={20} strokeWidth={3} />}
              </button>
              <span className={cx('text-center text-xs', selected ? 'font-bold text-fg' : 'text-muted')}>{t.accents[key]}</span>
            </div>
          );
        })}
      </div>
      <SelectInput label={t.common.language} value={language} onChange={(e) => isLanguage(e.target.value) && setLanguage(e.target.value)}>
        {availableLanguages.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </SelectInput>
      <p className="m-0 border-t border-line pt-2.5 text-[13px] text-muted">{t.settings.themeHint}</p>
    </Card>
  );
}

function PasswordCard() {
  const { api, t, setMe, notify, errorText } = useApp();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
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
      setMe(await api.post<MeDto>('/me/password', { currentPassword: current, newPassword: password }));
      setCurrent('');
      setPassword('');
      setRepeat('');
      notify(t.settings.passwordChanged);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t.settings.password}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="text" autoComplete="username" className="hidden" readOnly value="" />
        <TextInput label={t.settings.currentPassword} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <TextInput label={t.settings.newPassword} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <TextInput
          label={t.settings.repeatPassword}
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={mismatch ? t.auth.passwordsDontMatch : undefined}
          required
        />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <Button type="submit" variant="primary" size="lg" block busy={busy}>
          {t.settings.changePassword}
        </Button>
      </form>
    </Card>
  );
}
