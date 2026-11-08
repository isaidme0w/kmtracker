import { useEffect, useMemo, useState } from 'react';
import type { AppSettingsDto } from '../../shared/api.ts';
import { formatDateTime } from '../../shared/format.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { Button, Card, ErrorBox, InfoBox, LoadError, LoadingBlock, SelectInput } from '../common/components/ui.tsx';
import { PageHeader } from './Table.tsx';
import { timeZones } from './SetupWizard.tsx';

export function AppSettings() {
  const { api, t, fill, language, notify, refreshMe, errorText } = useApp();
  const settings = useLoad(() => api.get<AppSettingsDto>('/settings'), [api]);
  const [timeZone, setTimeZone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (settings.data) setTimeZone(settings.data.timeZone);
  }, [settings.data]);

  const zones = useMemo(() => timeZones(settings.data?.timeZone ?? 'UTC'), [settings.data]);

  if (settings.loading && !settings.data) return <LoadingBlock />;
  if (settings.error || !settings.data) return <LoadError error={settings.error} onRetry={settings.reload} />;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      settings.setData(await api.patch<AppSettingsDto>('/settings', { timeZone }));
      await refreshMe();
      notify(t.admin.settings.saved);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t.admin.sections.settings} subtitle={t.admin.settings.subtitle} />
      <Card title={t.admin.settings.timeZone}>
        <div className="max-w-md">
          <SelectInput label={t.admin.settings.timeZoneLabel} value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </SelectInput>
        </div>
        <span className="text-[13px] text-muted">
          {fill(t.admin.settings.preview, { date: timeZone ? formatDateTime(new Date().toISOString(), language, timeZone) : '' })}
        </span>
        <InfoBox>{t.admin.settings.info}</InfoBox>
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <div>
          <Button variant="primary" busy={busy} onClick={() => void save()} disabled={timeZone === settings.data.timeZone}>
            {t.common.save}
          </Button>
        </div>
      </Card>
    </>
  );
}
