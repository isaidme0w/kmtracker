import { useState } from 'react';
import type { PersonRef, PersonShareDto, ReadingDto, RefuelDto, TransferDto } from '../../../shared/api.ts';
import { personName } from '../../../shared/format.ts';
import { useApp } from '../app.tsx';
import { Button, Pager, cx } from './ui.tsx';

export const READINGS_PER_PAGE = 5;

export function PersonTitle({ person }: { person: PersonRef }) {
  const { t } = useApp();
  return (
    <span className="font-semibold">
      {personName(person)}
      {!person.username && (
        <span className="ml-1.5 rounded-md bg-surface-2 px-1.5 py-0.5 align-[2px] text-[11px] font-semibold text-muted">
          {t.common.noAccount}
        </span>
      )}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}

export function RefuelsList({ refuels }: { refuels: RefuelDto[] }) {
  const { t, f } = useApp();
  return (
    <div className="flex flex-col gap-2">
      {refuels.map((refuel) => (
        <div key={refuel.id} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 rounded-xl border border-line px-3 py-2.5 text-sm">
          <span>
            {f.date(refuel.recordedAt)} · {personName(refuel.paidBy)}
          </span>
          <span className="font-semibold">
            {f.money(refuel.amount)} · {refuel.isFull ? t.common.full : t.common.notFull}
          </span>
        </div>
      ))}
    </div>
  );
}

function balanceClass(balance: number): string {
  if (balance > 0) return 'text-pos';
  if (balance < 0) return 'text-neg';
  return 'text-muted';
}

// Distances with proportional bars, for the active cycle.
export function DistanceBars({ people }: { people: PersonShareDto[] }) {
  const { t, f, fill } = useApp();
  return (
    <div className="flex flex-col gap-3.5">
      {people
        .filter((person) => person.km > 0)
        .map((person) => (
          <div key={person.person.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <PersonTitle person={person.person} />
              {person.share !== null && (
                <span className="font-bold">{fill(t.cycle.estimate, { amount: f.money(person.share) })}</span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${person.percent}%` }} />
            </div>
            <span className="text-[13px] text-muted">
              {f.km(person.km)} · {f.percent(person.percent)}
            </span>
          </div>
        ))}
    </div>
  );
}

// Final shares of a closed cycle or a settlement preview.
export function SharesList({ people }: { people: PersonShareDto[] }) {
  const { t, f, fill } = useApp();
  return (
    <div className="flex flex-col">
      {people.map((person) => (
        <div key={person.person.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
          <div className="flex min-w-0 flex-col gap-0.5">
            <PersonTitle person={person.person} />
            <span className="text-[13px] text-muted">
              {f.km(person.km)} · {f.percent(person.percent)} · {fill(t.cycle.paid, { amount: f.money(person.paid) })}
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="font-semibold">{f.money(person.share ?? 0)}</span>
            <span className={cx('text-[13px] font-bold', balanceClass(person.balance ?? 0))}>
              {fill(t.cycle.balance, { amount: f.signedMoney(person.balance ?? 0) })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TransfersList({ transfers }: { transfers: TransferDto[] }) {
  const { t, f } = useApp();
  if (transfers.length === 0) return <p className="m-0 text-sm text-muted">{t.cycle.noTransfers}</p>;
  return (
    <div className="flex flex-col gap-2">
      {transfers.map((transfer, index) => (
        <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-3.5 py-3">
          <span className="font-semibold">
            {personName(transfer.from)} → {personName(transfer.to)}
          </span>
          <span className="font-bold">{f.money(transfer.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export function ReadingsList({
  readings,
  onUndo,
  emptyText,
}: {
  readings: ReadingDto[];
  onUndo?: (reading: ReadingDto) => void;
  emptyText: string;
}) {
  const { t, f, fill } = useApp();
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(readings.length / READINGS_PER_PAGE));
  const current = Math.min(page, pages);
  const visible = readings.slice((current - 1) * READINGS_PER_PAGE, current * READINGS_PER_PAGE);
  if (readings.length === 0) return <p className="m-0 text-sm text-muted">{emptyText}</p>;
  return (
    <>
      <div className="flex flex-col">
        {visible.map((reading) => {
          const shared = reading.participants.length > 1;
          const names = reading.participants.map(personName);
          // The recorder is shown only when the reading isn't simply their own trip.
          const recorder = reading.recordedBy && !(names.length === 1 && names[0] === reading.recordedBy) ? reading.recordedBy : null;
          return (
            <div key={reading.id} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{names.join(', ')}</span>
                <span className="text-[13px] text-muted">
                  {f.dateTime(reading.recordedAt)}
                  {shared && ` · ${fill(t.cycle.sharedEach, { km: f.km(reading.km / reading.participants.length) })}`}
                  {recorder && ` · ${fill(t.cycle.recordedBy, { name: recorder })}`}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {reading.canUndo && onUndo && (
                  <Button size="sm" variant="ghost" onClick={() => onUndo(reading)}>
                    {t.cycle.undo}
                  </Button>
                )}
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-semibold">{f.km(reading.odometer)}</span>
                  <span className="text-[13px] font-bold text-accent-text">+{f.km(reading.km)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Pager page={current} pages={pages} onChange={setPage} />
    </>
  );
}
