import { useNavigate } from 'react-router';
import type { AdminCycleListItemDto } from '../../shared/api.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { Badge, Button, LoadError, LoadingBlock } from '../common/components/ui.tsx';
import { PageHeader, Table } from './Table.tsx';

export function Cycles() {
  const { api, t, f, fill } = useApp();
  const navigate = useNavigate();
  const cycles = useLoad(() => api.get<AdminCycleListItemDto[]>('/cycles'), [api]);

  if (cycles.loading && !cycles.data) return <LoadingBlock />;
  if (cycles.error || !cycles.data) return <LoadError error={cycles.error} onRetry={cycles.reload} />;

  return (
    <>
      <PageHeader title={t.admin.sections.cycles} />
      <Table<AdminCycleListItemDto>
        rows={cycles.data}
        rowKey={(cycle) => cycle.id}
        empty={t.admin.cycles.empty}
        columns={[
          { header: t.admin.cycles.number, primary: true, render: (cycle) => <span className="font-bold">{cycle.number}</span> },
          {
            header: t.admin.cycles.period,
            render: (cycle) =>
              cycle.closed
                ? fill(t.history.range, { from: f.date(cycle.startedAt), to: f.date(cycle.endedAt ?? '') })
                : fill(t.admin.cycles.since, { date: f.date(cycle.startedAt) }),
          },
          { header: t.admin.cycles.distance, render: (cycle) => (cycle.totalKm !== null ? f.km(cycle.totalKm) : '—') },
          { header: t.admin.cycles.cost, render: (cycle) => (cycle.cost !== null ? f.money(cycle.cost) : '—') },
          {
            header: t.admin.cycles.status,
            render: (cycle) =>
              !cycle.closed ? (
                <Badge tone="accent">{t.admin.cycles.statusActive}</Badge>
              ) : cycle.corrected ? (
                <Badge tone="warn">{t.admin.cycles.statusCorrected}</Badge>
              ) : (
                <Badge>{t.admin.cycles.statusClosed}</Badge>
              ),
          },
          {
            header: '',
            className: 'w-24 text-right',
            render: (cycle) => (
              <Button size="sm" onClick={() => navigate(`/cycles/${cycle.id}`)}>
                {t.admin.cycles.open}
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}
