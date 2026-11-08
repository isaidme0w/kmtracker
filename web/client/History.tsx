import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { CycleDetailsDto, CycleSummaryDto } from '../../shared/api.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { CorrectionNote } from '../common/components/CorrectionNote.tsx';
import { ChevronLeftIcon, ChevronRightIcon } from '../common/components/icons.tsx';
import { Card, IconButton, LoadError, LoadingBlock } from '../common/components/ui.tsx';
import { ReadingsList, RefuelsList, SharesList, TransfersList } from '../common/components/cycle.tsx';

export function History() {
  const { api, t } = useApp();
  const list = useLoad(() => api.get<CycleSummaryDto[]>('/cycles'), [api]);
  const { cycleId } = useParams();

  if (list.loading && !list.data) return <LoadingBlock />;
  if (list.error || !list.data) return <LoadError error={list.error} onRetry={list.reload} />;
  if (list.data.length === 0) {
    return (
      <Card title={t.history.title}>
        <p className="m-0 text-muted">{t.history.empty}</p>
      </Card>
    );
  }
  const cycles = list.data;
  const index = Math.max(0, cycleId ? cycles.findIndex((cycle) => String(cycle.id) === cycleId) : 0);
  return <CycleView key={cycles[index]!.id} cycles={cycles} index={index} />;
}

function CycleView({ cycles, index }: { cycles: CycleSummaryDto[]; index: number }) {
  const { api, t, f, fill, refreshMe } = useApp();
  const navigate = useNavigate();
  const summary = cycles[index]!;
  const details = useLoad(() => api.get<CycleDetailsDto>(`/cycles/${summary.id}`), [api, summary.id]);
  const older = cycles[index + 1];
  const newer = cycles[index - 1];

  useEffect(() => {
    if (details.data?.correctionsUnseen) void refreshMe();
  }, [details.data, refreshMe]);

  const cycle = details.data;
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <IconButton label={t.history.previousCycle} disabled={!older} onClick={() => older && navigate(`/history/${older.id}`)} className="border border-line bg-surface text-fg">
          <ChevronLeftIcon />
        </IconButton>
        <div className="text-center">
          <h1 className="m-0 text-[17px] font-bold">{fill(t.history.cycleOf, { number: summary.number, total: cycles.length })}</h1>
          <div className="text-[13px] text-muted">
            {fill(t.history.range, { from: f.date(summary.startedAt), to: summary.endedAt ? f.date(summary.endedAt) : '…' })}
          </div>
        </div>
        <IconButton label={t.history.nextCycle} disabled={!newer} onClick={() => newer && navigate(`/history/${newer.id}`)} className="border border-line bg-surface text-fg">
          <ChevronRightIcon />
        </IconButton>
      </div>

      {details.loading && !cycle && <LoadingBlock />}
      {details.error !== null && <LoadError error={details.error} onRetry={details.reload} />}
      {cycle && (
        <>
          <CorrectionNote corrections={cycle.corrections} unseen={cycle.correctionsUnseen} />
          <Card title={t.cycle.cost} actions={<span className="text-xl font-bold">{f.money(cycle.cycle.cost ?? 0)}</span>}>
            <RefuelsList refuels={cycle.refuels} />
            <span className="text-[13px] text-muted">
              {fill(t.history.odometer, {
                from: f.km(cycle.cycle.startOdometer),
                to: f.km(cycle.cycle.endOdometer ?? 0),
                km: f.km(cycle.cycle.totalKm ?? 0),
                rate: fill(t.common.perKm, {
                  amount: f.money(cycle.cycle.totalKm ? Math.round((cycle.cycle.cost ?? 0) / cycle.cycle.totalKm) : 0),
                }),
              })}
            </span>
          </Card>
          <Card title={t.cycle.shares}>
            <SharesList people={cycle.people} />
          </Card>
          <Card title={t.cycle.transfers}>
            <TransfersList transfers={cycle.transfers} />
          </Card>
          <Card title={t.cycle.readings}>
            <ReadingsList readings={cycle.readings} emptyText={t.cycle.noReadings} />
          </Card>
        </>
      )}
    </>
  );
}
