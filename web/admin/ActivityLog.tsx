import { useState } from 'react';
import { activityCategories, type ActivityEntry, type ActivityType } from '../../shared/activity.ts';
import type { ActivityPageDto, AdminPersonDto } from '../../shared/api.ts';
import { describeActivity } from '../common/activity.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { personLabel } from '../common/components/people.tsx';
import { Badge, LoadError, LoadingBlock, Pager, SelectInput, TextInput } from '../common/components/ui.tsx';
import { PageHeader, Table } from './Table.tsx';

export function eventTone(type: ActivityType): 'neutral' | 'warn' | 'neg' | 'accent' {
  if (type.startsWith('correction.')) return 'warn';
  if (type === 'auth.login_failed' || type === 'auth.login_blocked') return 'neg';
  if (type === 'cycle.settled') return 'accent';
  return 'neutral';
}

// Start of the given local day, or of the next day, as an ISO timestamp.
function dayBoundary(date: string, nextDay: boolean): string | undefined {
  if (!date) return undefined;
  const day = new Date(`${date}T00:00:00`);
  if (nextDay) day.setDate(day.getDate() + 1);
  return day.toISOString();
}

export function ActivityLog() {
  const app = useApp();
  const { api, t, f, fill } = app;
  const [personId, setPersonId] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const persons = useLoad(() => api.get<AdminPersonDto[]>('/persons'), [api]);

  const query = new URLSearchParams();
  if (personId) query.set('personId', personId);
  if (category) query.set('category', category);
  const fromIso = dayBoundary(from, false);
  const toIso = dayBoundary(to, true);
  if (fromIso) query.set('from', fromIso);
  if (toIso) query.set('to', toIso);
  query.set('page', String(page));
  const queryString = query.toString();
  const log = useLoad(() => api.get<ActivityPageDto>(`/activity?${queryString}`), [api, queryString]);

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader title={t.admin.sections.activity} />
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <SelectInput label={t.admin.activity.person} value={personId} onChange={(e) => change(setPersonId)(e.target.value)}>
          <option value="">{t.admin.activity.all}</option>
          {(persons.data ?? []).map((item) => (
            <option key={item.person.id} value={item.person.id}>
              {personLabel(item.person)}
            </option>
          ))}
        </SelectInput>
        <SelectInput label={t.admin.activity.category} value={category} onChange={(e) => change(setCategory)(e.target.value)}>
          <option value="">{t.admin.activity.all}</option>
          {activityCategories.map((key) => (
            <option key={key} value={key}>
              {t.activity.categories[key]}
            </option>
          ))}
        </SelectInput>
        <TextInput label={t.admin.activity.from} type="date" value={from} onChange={(e) => change(setFrom)(e.target.value)} />
        <TextInput label={t.admin.activity.to} type="date" value={to} onChange={(e) => change(setTo)(e.target.value)} />
      </div>
      {log.loading && !log.data && <LoadingBlock />}
      {log.error !== null && <LoadError error={log.error} onRetry={log.reload} />}
      {log.data && (
        <>
          <Table<ActivityEntry>
            rows={log.data.entries}
            rowKey={(entry) => entry.id}
            empty={t.admin.activity.empty}
            columns={[
              { header: t.admin.activity.time, render: (entry) => <span className="whitespace-nowrap text-muted">{f.dateTime(entry.occurredAt)}</span> },
              { header: t.admin.activity.who, render: (entry) => <span className="font-semibold">{entry.actorName ?? t.activity.system}</span> },
              {
                header: t.admin.activity.event,
                primary: true,
                render: (entry) => <Badge tone={eventTone(entry.type)}>{t.activity.types[entry.type]}</Badge>,
              },
              {
                header: t.admin.activity.details,
                render: (entry) => (
                  <span>
                    {entry.cycleNumber !== null && entry.type.startsWith('correction.') && `${fill(t.activity.cycle, { number: entry.cycleNumber })} · `}
                    {describeActivity(entry, app)}
                  </span>
                ),
              },
            ]}
          />
          <Pager page={page} pages={Math.max(1, Math.ceil(log.data.total / log.data.pageSize))} onChange={setPage} />
        </>
      )}
    </>
  );
}
