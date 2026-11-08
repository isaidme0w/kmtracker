import { useEffect, useState, type FormEvent } from 'react';
import type {
  ActiveCycleDto,
  CycleDetailsDto,
  PersonRef,
  RefuelResultDto,
  SelectablePersonDto,
  SettlementPreviewDto,
} from '../../shared/api.ts';
import { parseAmount, parseOdometer } from '../../shared/validation.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { CorrectionNote } from '../common/components/CorrectionNote.tsx';
import { useConfirm } from '../common/components/confirm.tsx';
import { FuelIcon, PlusIcon } from '../common/components/icons.tsx';
import { ParticipantsPicker, PersonDialog, personLabel } from '../common/components/people.tsx';
import { Button, Card, Dialog, ErrorBox, LoadError, LoadingBlock, SelectInput, Switch, TextInput } from '../common/components/ui.tsx';
import { DistanceBars, ReadingsList, RefuelsList, SharesList, Stat, TransfersList } from '../common/components/cycle.tsx';

const LARGE_JUMP_KM = 1500;

function usePersons() {
  const { api } = useApp();
  const persons = useLoad(() => api.get<SelectablePersonDto[]>('/persons'), [api]);
  const create = async (firstName: string, lastName: string | null): Promise<PersonRef> => {
    const person = await api.post<PersonRef>('/persons', { firstName, lastName });
    await persons.reload();
    return person;
  };
  return { persons: persons.data ?? [], create };
}

export function Dashboard() {
  const { me } = useApp();
  if (!me?.vehicleSetupDone) return <VehicleSetup />;
  return <ActiveDashboard />;
}

function VehicleSetup() {
  const { api, t, refreshMe, errorText } = useApp();
  const [odometer, setOdometer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/vehicle/setup', { odometer });
      await refreshMe();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t.vehicle.title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="m-0 text-muted">{t.vehicle.text}</p>
        <TextInput label={t.vehicle.odometer} inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} large suffix="km" required />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <Button type="submit" variant="primary" size="lg" block busy={busy}>
          {t.vehicle.submit}
        </Button>
      </form>
    </Card>
  );
}

function ActiveDashboard() {
  const { api, t, f, fill, refreshMe, notify, errorText } = useApp();
  const confirm = useConfirm();
  const active = useLoad(() => api.get<ActiveCycleDto>('/cycles/active'), [api]);
  const { persons, create } = usePersons();
  const [refuelOpen, setRefuelOpen] = useState(false);
  const [settled, setSettled] = useState<CycleDetailsDto | null>(null);

  useEffect(() => {
    if (active.data?.correctionsUnseen) void refreshMe();
  }, [active.data, refreshMe]);

  if (active.loading && !active.data) return <LoadingBlock />;
  if (active.error || !active.data) return <LoadError error={active.error} onRetry={active.reload} />;
  const cycle = active.data;

  const undo = async (readingId: number, odometer: number) => {
    const ok = await confirm({ message: fill(t.cycle.undoConfirm, { odometer: f.km(odometer) }), confirmLabel: t.cycle.undo });
    if (!ok) return;
    try {
      active.setData(await api.delete<ActiveCycleDto>(`/readings/${readingId}`));
    } catch (error) {
      notify(errorText(error), 'error');
    }
  };

  return (
    <>
      <ReadingForm cycle={cycle} persons={persons} onCreatePerson={create} onSaved={active.setData} />

      <Button size="lg" block onClick={() => setRefuelOpen(true)} className="h-[52px] rounded-2xl">
        <FuelIcon size={20} />
        {t.dashboard.refuel}
      </Button>

      <CorrectionNote corrections={cycle.corrections} unseen={cycle.correctionsUnseen} />

      <Card title={t.cycle.active}>
        <span className="-mt-2 text-[13px] text-muted">
          {fill(t.cycle.sinceActive, { number: cycle.cycle.number, date: f.date(cycle.cycle.startedAt) })}
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t.cycle.distance} value={f.km(cycle.totalKm)} />
          <Stat label={t.cycle.refuels} value={f.money(cycle.refuelsTotal)} />
        </div>
        {cycle.refuels.length > 0 ? <RefuelsList refuels={cycle.refuels} /> : <p className="m-0 text-sm text-muted">{t.cycle.noRefuels}</p>}
        <DistanceBars people={cycle.people} />
        <p className="m-0 border-t border-line pt-2.5 text-[13px] text-muted">
          {cycle.rate
            ? fill(t.cycle.estimateNote, { rate: fill(t.common.perKm, { amount: f.money(Math.round((cycle.rate.cost / cycle.rate.km) * 100) / 100) }) })
            : t.cycle.noEstimate}
        </p>
      </Card>

      <Card title={t.cycle.readings}>
        <ReadingsList readings={cycle.readings} emptyText={t.cycle.noReadings} onUndo={(reading) => void undo(reading.id, reading.odometer)} />
      </Card>

      <RefuelDialog
        open={refuelOpen}
        onClose={() => setRefuelOpen(false)}
        cycle={cycle}
        persons={persons}
        onCreatePerson={create}
        onDone={(result) => {
          setRefuelOpen(false);
          if (result.settled && result.cycle) setSettled(result.cycle);
          void active.reload();
        }}
      />

      <Dialog
        open={settled !== null}
        title={settled ? fill(t.cycle.settledTitle, { number: settled.cycle.number }) : ''}
        onClose={() => setSettled(null)}
        sheet
        footer={
          <Button variant="primary" onClick={() => setSettled(null)}>
            {t.common.done}
          </Button>
        }
      >
        {settled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t.cycle.totalDistance} value={f.km(settled.cycle.totalKm ?? 0)} />
              <Stat label={t.cycle.cost} value={f.money(settled.cycle.cost ?? 0)} />
            </div>
            <SharesList people={settled.people} />
            <h3 className="m-0 text-base font-bold">{t.cycle.transfers}</h3>
            <TransfersList transfers={settled.transfers} />
          </>
        )}
      </Dialog>
    </>
  );
}

function ReadingForm({
  cycle,
  persons,
  onCreatePerson,
  onSaved,
}: {
  cycle: ActiveCycleDto;
  persons: SelectablePersonDto[];
  onCreatePerson: (firstName: string, lastName: string | null) => Promise<PersonRef>;
  onSaved: (cycle: ActiveCycleDto) => void;
}) {
  const { api, me, t, f, fill, notify, errorText } = useApp();
  const confirm = useConfirm();
  const [odometer, setOdometer] = useState('');
  const [participants, setParticipants] = useState<PersonRef[]>(me ? [me.person] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const value = parseOdometer(odometer);
  const diff = value === null ? null : value - cycle.lastOdometer;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (diff !== null && diff > LARGE_JUMP_KM) {
      const ok = await confirm({ message: fill(t.dashboard.confirmLarge, { km: f.km(diff) }), confirmLabel: t.common.save });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.post<ActiveCycleDto>('/readings', { odometer, participantIds: participants.map((p) => p.id) }));
      setOdometer('');
      setParticipants(me ? [me.person] : []);
      notify(t.dashboard.readingSaved);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  let preview: { text: string; className: string } | null = null;
  if (diff !== null) {
    if (diff <= 0) preview = { text: fill(t.dashboard.tooLow, { last: f.km(cycle.lastOdometer) }), className: 'text-sm font-semibold text-neg' };
    else if (diff > LARGE_JUMP_KM) {
      preview = { text: fill(t.dashboard.largeJump, { km: f.km(diff) }), className: 'rounded-xl bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-text' };
    } else preview = { text: fill(t.dashboard.added, { km: f.km(diff) }), className: 'text-base font-bold text-accent-text' };
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-muted">{t.dashboard.lastOdometer}</span>
          {cycle.lastReadingAt && <span className="text-[13px] text-muted">{f.dateTime(cycle.lastReadingAt)}</span>}
        </div>
        <div className="text-3xl font-bold tracking-tight">{f.km(cycle.lastOdometer)}</div>
        <TextInput
          label={t.dashboard.newOdometer}
          inputMode="numeric"
          autoComplete="off"
          placeholder={fill(t.dashboard.placeholder, { example: f.number(cycle.lastOdometer + 120) })}
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          large
          suffix="km"
        />
        {preview && <div className={preview.className}>{preview.text}</div>}
        <span className="text-[13px] font-semibold text-muted">{t.dashboard.participants}</span>
        <ParticipantsPicker value={participants} onChange={setParticipants} persons={persons} onCreate={onCreatePerson} />
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={diff === null || diff <= 0 || participants.length === 0}>
          {t.dashboard.saveReading}
        </Button>
      </form>
    </Card>
  );
}

function RefuelDialog({
  open,
  onClose,
  cycle,
  persons,
  onCreatePerson,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  cycle: ActiveCycleDto;
  persons: SelectablePersonDto[];
  onCreatePerson: (firstName: string, lastName: string | null) => Promise<PersonRef>;
  onDone: (result: RefuelResultDto) => void;
}) {
  const { api, me, t, f, fill, notify, errorText } = useApp();
  const [amount, setAmount] = useState('');
  const [odometer, setOdometer] = useState(String(cycle.lastOdometer));
  const [paidBy, setPaidBy] = useState<number>(me?.person.id ?? 0);
  const [extraPayers, setExtraPayers] = useState<PersonRef[]>([]);
  const [isFull, setIsFull] = useState(true);
  const [participants, setParticipants] = useState<PersonRef[]>(me ? [me.person] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<SettlementPreviewDto | null>(null);
  const [payerDialog, setPayerDialog] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setOdometer(String(cycle.lastOdometer));
      setPaidBy(me?.person.id ?? 0);
      setIsFull(true);
      setParticipants(me ? [me.person] : []);
      setError(null);
      setPreview(null);
    }
  }, [open, cycle.lastOdometer, me]);

  const odometerValue = parseOdometer(odometer);
  const moved = odometerValue !== null ? odometerValue - cycle.lastOdometer : 0;
  const payers = [...persons.filter((person) => person.selectable), ...extraPayers.filter((p) => !persons.some((q) => q.id === p.id))];

  const body = () => ({
    amount,
    odometer,
    paidBy,
    isFull,
    participantIds: moved > 0 ? participants.map((p) => p.id) : [],
  });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<RefuelResultDto>('/refuels', body());
      if (!result.settled) notify(isFull ? t.refuel.savedNoDistance : t.refuel.saved);
      onDone(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isFull) return save();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<SettlementPreviewDto>('/refuels/preview', body());
      setBusy(false);
      if (result.willClose) setPreview(result);
      else await save();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open && preview === null} title={t.refuel.title} onClose={onClose} sheet>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <TextInput
            label={t.refuel.amount}
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            large
            suffix="zł"
            error={amount && parseAmount(amount) === null ? t.errors.AMOUNT_INVALID : undefined}
          />
          <TextInput label={t.refuel.odometer} inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} suffix="km" />
          <SelectInput label={t.refuel.paidBy} value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))}>
            {payers.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </SelectInput>
          <button type="button" onClick={() => setPayerDialog(true)} className="-mt-1 flex items-center gap-1.5 self-start py-1 text-sm font-semibold text-accent-text">
            <PlusIcon size={14} />
            {t.people.addPerson}
          </button>
          <Switch checked={isFull} onChange={setIsFull} label={t.refuel.full} hint={isFull ? t.refuel.fullHintOn : t.refuel.fullHintOff} />
          {moved > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-muted">{t.refuel.participants}</span>
              <span className="text-[13px] text-muted">{fill(t.refuel.participantsHint, { km: f.km(moved) })}</span>
              <ParticipantsPicker value={participants} onChange={setParticipants} persons={persons} onCreate={onCreatePerson} />
            </div>
          )}
          {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            busy={busy}
            disabled={parseAmount(amount) === null || odometerValue === null || (moved > 0 && participants.length === 0)}
          >
            {isFull ? t.refuel.next : t.refuel.save}
          </Button>
        </form>
      </Dialog>

      <PersonDialog
        open={payerDialog}
        onClose={() => setPayerDialog(false)}
        persons={persons}
        onPick={(person) => {
          setExtraPayers((current) => [...current, person]);
          setPaidBy(person.id);
        }}
        onCreate={onCreatePerson}
      />

      <Dialog
        open={preview !== null}
        title={fill(t.refuel.confirmTitle, { number: cycle.cycle.number })}
        onClose={() => setPreview(null)}
        sheet
        footer={
          <>
            <Button onClick={() => setPreview(null)}>{t.common.back}</Button>
            <Button variant="primary" busy={busy} onClick={() => void save()}>
              {t.refuel.confirm}
            </Button>
          </>
        }
      >
        {preview && (
          <>
            <p className="m-0 text-sm text-muted">{t.refuel.confirmText}</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t.cycle.totalDistance} value={f.km(preview.totalKm)} />
              <Stat label={t.cycle.cost} value={f.money(preview.cost)} />
            </div>
            <SharesList people={preview.people} />
            <h3 className="m-0 text-base font-bold">{t.cycle.transfers}</h3>
            <TransfersList transfers={preview.transfers} />
            {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
          </>
        )}
      </Dialog>
    </>
  );
}
