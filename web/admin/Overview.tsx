import { Link } from 'react-router';
import type { OverviewDto } from '../../shared/api.ts';
import { describeActivity } from '../common/activity.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { AlertIcon } from '../common/components/icons.tsx';
import { Badge, Card, LoadError, LoadingBlock } from '../common/components/ui.tsx';
import { PageHeader } from './Table.tsx';
import { eventTone } from './ActivityLog.tsx';

export function Overview() {
  const app = useApp();
  const { api, t, f, fill, plural } = app;
  const overview = useLoad(() => api.get<OverviewDto>('/overview'), [api]);

  if (overview.loading && !overview.data) return <LoadingBlock />;
  if (overview.error || !overview.data) return <LoadError error={overview.error} onRetry={overview.reload} />;
  const { activeCycle, warnings, recent } = overview.data;

  return (
    <>
      <PageHeader title={t.admin.sections.overview} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t.admin.overview.activeCycle}>
          {activeCycle ? (
            <>
              <span className="-mt-2 text-[13px] text-muted">
                {fill(t.cycle.sinceActive, { number: activeCycle.number, date: f.date(activeCycle.startedAt) })}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span className="text-[13px] text-muted">{t.cycle.distance}</span>
                  <span className="text-[22px] font-bold">{f.km(activeCycle.totalKm)}</span>
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span className="text-[13px] text-muted">{t.cycle.refuels}</span>
                  <span className="text-[22px] font-bold">{f.money(activeCycle.refuelsTotal)}</span>
                </div>
              </div>
              <span className="text-[13px] text-muted">
                {plural(t.admin.overview.stats, activeCycle.readingsCount)}
                {activeCycle.lastReadingAt && ` · ${fill(t.admin.overview.lastReading, { date: f.date(activeCycle.lastReadingAt) })}`}
              </span>
            </>
          ) : (
            <p className="m-0 text-muted">{t.admin.overview.noCycle}</p>
          )}
        </Card>
        <Card title={t.admin.overview.warnings}>
          {warnings.length === 0 && <p className="m-0 text-muted">{t.admin.overview.noWarnings}</p>}
          {warnings.map((warning) => (
            <div key={warning.username} className="flex gap-2.5 rounded-xl border border-warn-border bg-warn-bg p-3 text-sm text-warn-text">
              <AlertIcon size={18} className="mt-px shrink-0" />
              <span>
                {fill(warning.type === 'temporary_password_expired' ? t.admin.overview.expired : t.admin.overview.expiring, {
                  username: warning.username,
                  date: f.date(warning.expiresAt),
                })}
              </span>
            </div>
          ))}
        </Card>
      </div>
      <Card
        title={t.admin.overview.recent}
        actions={
          <Link to="/activity" className="text-sm font-semibold text-accent-text">
            {t.admin.overview.fullLog}
          </Link>
        }
      >
        <div className="flex flex-col">
          {recent.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line py-2.5 text-sm first:border-t-0">
              <span className="w-32 shrink-0 text-[13px] text-muted">{f.dateTime(entry.occurredAt)}</span>
              <Badge tone={eventTone(entry.type)}>{t.activity.types[entry.type]}</Badge>
              <span className="font-semibold">{entry.actorName ?? t.activity.system}</span>
              <span className="text-muted">{describeActivity(entry, app)}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
