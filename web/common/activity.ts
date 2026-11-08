import type { ActivityEntry, ChangeValue, Changes } from '../../shared/activity.ts';
import type { AppValue } from './app.tsx';

type Ctx = Pick<AppValue, 't' | 'f' | 'fill'>;

function formatValue(field: string, value: ChangeValue, ctx: Ctx): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') {
    if (field === 'amount' || field === 'cost') return ctx.f.money(value);
    if (field === 'odometer' || field === 'from' || field === 'to' || field === 'km') return ctx.f.km(value);
    return ctx.f.number(value);
  }
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (field === 'recordedAt') return ctx.f.dateTime(value);
  if (field === 'role' && (value === 'driver' || value === 'admin')) return ctx.t.roles[value];
  return value;
}

function describeChanges(changes: Changes | undefined, ctx: Ctx): string {
  if (!changes) return '';
  return Object.entries(changes)
    .map(([field, change]) => {
      const label = ctx.t.activity.fields[field] ?? field;
      return `${label}: ${formatValue(field, change.from, ctx)} → ${formatValue(field, change.to, ctx)}`;
    })
    .join('; ');
}

// Turns a stored event into a sentence in the viewer's language.
export function describeActivity(entry: ActivityEntry, ctx: Ctx): string {
  const { t, f, fill } = ctx;
  const d = entry.data;
  const participants = (d.participants ?? []).join(', ');
  const part = d.part ? t.activity.parts[d.part] : '';
  switch (entry.type) {
    case 'auth.login':
    case 'auth.password_changed':
      return part;
    case 'auth.login_failed':
    case 'auth.login_blocked':
      return [d.username, part].filter(Boolean).join(' · ');
    case 'setup.completed':
      return fill(t.activity.timeZone, { timeZone: d.timeZone ?? '' });
    case 'vehicle.setup':
      return fill(t.activity.startingOdometer, { odometer: f.km(d.odometer ?? 0) });
    case 'reading.created':
    case 'reading.undone':
      return `${f.km(d.odometer ?? 0)} (+${f.km(d.km ?? 0)}) · ${participants}`;
    case 'refuel.created':
      return [f.money(d.amount ?? 0), d.isFull ? t.common.full : t.common.notFull, fill(t.activity.paidBy, { name: d.paidBy ?? '' })].join(
        ' · ',
      );
    case 'cycle.settled':
      return fill(t.activity.settled, {
        number: d.cycleNumber ?? '',
        cost: f.money(d.cost ?? 0),
        km: f.km(d.km ?? 0),
        count: d.transfers ?? 0,
      });
    case 'account.created':
      return `${d.name} (${d.username}) · ${d.role === 'admin' || d.role === 'driver' ? t.roles[d.role] : ''}`;
    case 'account.updated':
      return `${d.username}: ${describeChanges(d.changes, ctx)}`;
    case 'account.password_reset':
      return d.username ?? '';
    case 'account.deactivated':
    case 'account.activated':
    case 'account.deleted':
      return `${d.name} (${d.username})`;
    case 'person.created':
    case 'person.deactivated':
    case 'person.activated':
    case 'person.deleted':
      return d.name ?? '';
    case 'person.updated':
    case 'settings.updated':
      return describeChanges(d.changes, ctx);
    case 'person.merged':
      return `${d.name} → ${d.into}`;
    case 'correction.reading_updated':
      return `${fill(t.activity.readingAt, { date: f.dateTime(d.recordedAt ?? ''), odometer: f.km(d.odometer ?? 0) })}: ${describeChanges(d.changes, ctx)}`;
    case 'correction.reading_inserted':
    case 'correction.reading_deleted':
      return `${f.km(d.odometer ?? 0)} · ${participants} · ${f.dateTime(d.recordedAt ?? '')}`;
    case 'correction.refuel_updated':
      return `${fill(t.activity.refuelAt, { date: f.dateTime(d.recordedAt ?? ''), amount: f.money(d.amount ?? 0) })}: ${describeChanges(d.changes, ctx)}`;
    case 'correction.refuel_added':
    case 'correction.refuel_deleted':
      return `${f.money(d.amount ?? 0)} · ${fill(t.activity.paidBy, { name: d.paidBy ?? '' })} · ${f.dateTime(d.recordedAt ?? '')}`;
    case 'correction.start_odometer':
      return `${formatValue('odometer', d.from ?? null, ctx)} → ${formatValue('odometer', d.to ?? null, ctx)}`;
    case 'correction.settlement_undone':
      return fill(t.activity.cycle, { number: d.cycleNumber ?? '' });
  }
}
