import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { AdminCycleDetailsDto, AdminPersonDto, PersonRef, ReadingDto, RefuelDto, SelectablePersonDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { CorrectionNote } from '../common/components/CorrectionNote.tsx';
import { useConfirm } from '../common/components/confirm.tsx';
import { ParticipantsPicker, personLabel } from '../common/components/people.tsx';
import { Button, Card, Dialog, ErrorBox, LoadError, LoadingBlock, SelectInput, TextInput } from '../common/components/ui.tsx';
import { SharesList, TransfersList } from '../common/components/cycle.tsx';
import { PageHeader, Table } from './Table.tsx';

// Converts between ISO timestamps and the value of a datetime-local input,
// which uses the browser's local time.
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

type ReadingEdit = { mode: 'edit'; reading: ReadingDto } | { mode: 'new' };
type RefuelEdit = { mode: 'edit'; refuel: RefuelDto } | { mode: 'new' };

export function CycleDetail() {
  const { api, t, f, fill, notify, errorText } = useApp();
  const confirm = useConfirm();
  const { cycleId } = useParams();
  const details = useLoad(() => api.get<AdminCycleDetailsDto>(`/cycles/${cycleId}`), [api, cycleId]);
  const personsLoad = useLoad(() => api.get<AdminPersonDto[]>('/persons'), [api]);
  const [readingEdit, setReadingEdit] = useState<ReadingEdit | null>(null);
  const [refuelEdit, setRefuelEdit] = useState<RefuelEdit | null>(null);
  const [startEdit, setStartEdit] = useState(false);

  if (details.loading && !details.data) return <LoadingBlock />;
  if (details.error || !details.data) return <LoadError error={details.error} onRetry={details.reload} />;
  const data = details.data;
  const cycle = data.cycle;
  const persons: SelectablePersonDto[] = (personsLoad.data ?? []).map((item) => ({ ...item.person, selectable: true }));

  const createPerson = async (firstName: string, lastName: string | null): Promise<PersonRef> => {
    const person = await api.post<PersonRef>('/persons', { firstName, lastName });
    await personsLoad.reload();
    return person;
  };

  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await details.reload();
    } catch (error) {
      notify(errorText(error), 'error');
    }
  };

  const period = cycle.closed
    ? fill(t.history.range, { from: f.date(cycle.startedAt), to: f.date(cycle.endedAt ?? '') })
    : fill(t.admin.cycles.since, { date: f.date(cycle.startedAt) });
  const end = cycle.endOdometer ?? data.readings.at(-1)?.odometer ?? cycle.startOdometer;

  return (
    <>
      <Link to="/cycles" className="text-sm font-semibold text-accent-text">
        {t.admin.cycles.back}
      </Link>
      <PageHeader
        title={fill(t.admin.cycles.detailTitle, { number: cycle.number, period })}
        subtitle={[
          fill(t.admin.cycles.detailSummary, { from: f.km(cycle.startOdometer), to: f.km(end), km: f.km(end - cycle.startOdometer) }),
          cycle.cost !== null ? fill(t.admin.cycles.costSummary, { cost: f.money(cycle.cost) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setReadingEdit({ mode: 'new' })}>+ {t.admin.cycles.insertReading}</Button>
            <Button onClick={() => setRefuelEdit({ mode: 'new' })}>+ {t.admin.cycles.addRefuel}</Button>
            {cycle.number === 1 && <Button onClick={() => setStartEdit(true)}>{t.admin.cycles.startOdometer}</Button>}
            {data.isLatestClosed && (
              <Button
                variant="danger"
                disabled={!data.canUndoSettlement}
                onClick={() =>
                  void (async () => {
                    const ok = await confirm({
                      message: fill(t.admin.cycles.confirmUndo, { number: cycle.number }),
                      confirmLabel: t.admin.cycles.undoSettlement,
                      danger: true,
                    });
                    if (ok) await act(() => api.post('/cycles/undo-settlement'));
                  })()
                }
              >
                {t.admin.cycles.undoSettlement}
              </Button>
            )}
          </div>
        }
      />
      {data.isLatestClosed && !data.canUndoSettlement && <span className="-mt-3 text-[13px] text-muted">{t.admin.cycles.undoNote}</span>}

      <CorrectionNote corrections={data.corrections} unseen={false} />

      <h2 className="m-0 mt-1 text-[13px] font-bold tracking-wide text-muted uppercase">{t.admin.cycles.readings}</h2>
      <Table<ReadingDto>
        rows={data.readings}
        rowKey={(reading) => reading.id}
        empty={t.cycle.noReadings}
        columns={[
          { header: t.admin.cycles.date, render: (reading) => <span className="whitespace-nowrap text-muted">{f.dateTime(reading.recordedAt)}</span> },
          { header: t.admin.cycles.participants, primary: true, render: (reading) => <span className="font-semibold">{reading.participants.map(personName).join(', ')}</span> },
          { header: t.admin.cycles.odometer, render: (reading) => f.km(reading.odometer) },
          { header: t.admin.cycles.distanceColumn, render: (reading) => <span className="font-bold text-accent-text">+{f.km(reading.km)}</span> },
          {
            header: '',
            className: 'text-right',
            render: (reading) => (
              <span className="flex justify-end gap-1.5">
                <Button size="sm" onClick={() => setReadingEdit({ mode: 'edit', reading })}>
                  {t.common.edit}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    void (async () => {
                      const ok = await confirm({
                        message: fill(t.admin.cycles.confirmDeleteReading, { odometer: f.km(reading.odometer) }),
                        confirmLabel: t.common.delete,
                        danger: true,
                      });
                      if (ok) await act(() => api.delete(`/readings/${reading.id}`));
                    })()
                  }
                >
                  {t.common.delete}
                </Button>
              </span>
            ),
          },
        ]}
      />

      <h2 className="m-0 mt-1 text-[13px] font-bold tracking-wide text-muted uppercase">{t.admin.cycles.refuels}</h2>
      <Table<RefuelDto>
        rows={data.refuels}
        rowKey={(refuel) => refuel.id}
        empty={t.cycle.noRefuels}
        columns={[
          { header: t.admin.cycles.date, render: (refuel) => <span className="whitespace-nowrap text-muted">{f.dateTime(refuel.recordedAt)}</span> },
          { header: t.admin.cycles.paidBy, primary: true, render: (refuel) => <span className="font-semibold">{personName(refuel.paidBy)}</span> },
          { header: t.admin.cycles.amount, render: (refuel) => f.money(refuel.amount) },
          {
            header: t.admin.cycles.kind,
            render: (refuel) => (refuel.closesCycle ? t.admin.cycles.closing : refuel.isFull ? t.common.full : t.common.notFull),
          },
          {
            header: '',
            className: 'text-right',
            render: (refuel) => (
              <span className="flex justify-end gap-1.5">
                <Button size="sm" onClick={() => setRefuelEdit({ mode: 'edit', refuel })}>
                  {t.common.edit}
                </Button>
                {!refuel.closesCycle && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      void (async () => {
                        const ok = await confirm({
                          message: fill(t.admin.cycles.confirmDeleteRefuel, { amount: f.money(refuel.amount) }),
                          confirmLabel: t.common.delete,
                          danger: true,
                        });
                        if (ok) await act(() => api.delete(`/refuels/${refuel.id}`));
                      })()
                    }
                  >
                    {t.common.delete}
                  </Button>
                )}
              </span>
            ),
          },
        ]}
      />

      {cycle.closed && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t.cycle.shares}>
            <SharesList people={data.people} />
          </Card>
          <Card title={t.cycle.transfers}>
            <TransfersList transfers={data.transfers} />
          </Card>
        </div>
      )}

      <ReadingDialog
        edit={readingEdit}
        cycleId={cycle.id}
        defaultDate={cycle.endedAt ?? new Date().toISOString()}
        persons={persons}
        onCreatePerson={createPerson}
        onClose={() => setReadingEdit(null)}
        onSaved={() => {
          setReadingEdit(null);
          void details.reload();
        }}
      />
      <RefuelDialog
        edit={refuelEdit}
        cycleId={cycle.id}
        defaultDate={cycle.endedAt ?? new Date().toISOString()}
        persons={persons}
        onClose={() => setRefuelEdit(null)}
        onSaved={() => {
          setRefuelEdit(null);
          void details.reload();
        }}
      />
      <StartOdometerDialog
        open={startEdit}
        current={cycle.startOdometer}
        onClose={() => setStartEdit(false)}
        onSaved={() => {
          setStartEdit(false);
          void details.reload();
        }}
      />
    </>
  );
}

function ReadingDialog({
  edit,
  cycleId,
  defaultDate,
  persons,
  onCreatePerson,
  onClose,
  onSaved,
}: {
  edit: ReadingEdit | null;
  cycleId: number;
  defaultDate: string;
  persons: SelectablePersonDto[];
  onCreatePerson: (firstName: string, lastName: string | null) => Promise<PersonRef>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, t, errorText } = useApp();
  const [odometer, setOdometer] = useState('');
  const [participants, setParticipants] = useState<PersonRef[]>([]);
  const [recordedAt, setRecordedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!edit) return;
    setError(null);
    if (edit.mode === 'edit') {
      setOdometer(String(edit.reading.odometer));
      setParticipants(edit.reading.participants);
      setRecordedAt(toLocalInput(edit.reading.recordedAt));
    } else {
      setOdometer('');
      setParticipants([]);
      setRecordedAt(toLocalInput(defaultDate));
    }
  }, [edit, defaultDate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const participantIds = participants.map((p) => p.id);
      if (edit?.mode === 'edit') {
        // The date input has no seconds, so the date is sent only when it was changed.
        const dateChanged = recordedAt !== toLocalInput(edit.reading.recordedAt);
        await api.patch(`/readings/${edit.reading.id}`, {
          odometer,
          participantIds,
          ...(dateChanged ? { recordedAt: fromLocalInput(recordedAt) } : {}),
        });
      } else {
        await api.post('/readings', { odometer, participantIds, recordedAt: fromLocalInput(recordedAt), cycleId });
      }
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={edit !== null} title={edit?.mode === 'edit' ? t.admin.cycles.editReading : t.admin.cycles.newReading} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextInput label={t.admin.cycles.odometer} inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} suffix="km" required />
        <span className="text-[13px] font-semibold text-muted">{t.admin.cycles.participants}</span>
        <ParticipantsPicker value={participants} onChange={setParticipants} persons={persons} onCreate={onCreatePerson} />
        <TextInput label={t.admin.cycles.recordedAt} type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} required />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={participants.length === 0}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RefuelDialog({
  edit,
  cycleId,
  defaultDate,
  persons,
  onClose,
  onSaved,
}: {
  edit: RefuelEdit | null;
  cycleId: number;
  defaultDate: string;
  persons: SelectablePersonDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, t, language, errorText } = useApp();
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState<number | null>(null);
  const [recordedAt, setRecordedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!edit) return;
    setError(null);
    if (edit.mode === 'edit') {
      setAmount((edit.refuel.amount / 100).toFixed(2).replace('.', language === 'pl' ? ',' : '.'));
      setPaidBy(edit.refuel.paidBy.id);
      setRecordedAt(toLocalInput(edit.refuel.recordedAt));
    } else {
      setAmount('');
      setPaidBy(null);
      setRecordedAt(toLocalInput(defaultDate));
    }
  }, [edit, defaultDate, language]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (edit?.mode === 'edit') {
        const dateChanged = recordedAt !== toLocalInput(edit.refuel.recordedAt);
        await api.patch(`/refuels/${edit.refuel.id}`, {
          amount,
          paidBy,
          ...(dateChanged ? { recordedAt: fromLocalInput(recordedAt) } : {}),
        });
      } else {
        await api.post('/refuels', { amount, paidBy, recordedAt: fromLocalInput(recordedAt), cycleId });
      }
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={edit !== null} title={edit?.mode === 'edit' ? t.admin.cycles.editRefuel : t.admin.cycles.newRefuel} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextInput label={t.refuel.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="zł" required />
        <SelectInput label={t.refuel.paidBy} value={paidBy ?? ''} onChange={(e) => setPaidBy(e.target.value ? Number(e.target.value) : null)} required>
          <option value="" />
          {persons.map((person) => (
            <option key={person.id} value={person.id}>
              {personLabel(person)}
            </option>
          ))}
        </SelectInput>
        <TextInput label={t.admin.cycles.recordedAt} type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} required />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={paidBy === null}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StartOdometerDialog({ open, current, onClose, onSaved }: { open: boolean; current: number; onClose: () => void; onSaved: () => void }) {
  const { api, t, errorText } = useApp();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setValue(String(current));
      setError(null);
    }
  }, [open, current]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch('/vehicle', { startOdometer: value });
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} title={t.admin.cycles.startTitle} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextInput label={t.admin.cycles.startOdometer} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} suffix="km" required />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" busy={busy}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
