import { useEffect, useState } from 'react';
import type { AdminPersonDto, TemporaryPasswordDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { useConfirm } from '../common/components/confirm.tsx';
import { DotsIcon } from '../common/components/icons.tsx';
import { personLabel } from '../common/components/people.tsx';
import { Button, Dialog, ErrorBox, IconButton, LoadError, LoadingBlock, SelectInput, cx } from '../common/components/ui.tsx';
import { PageHeader, Table } from './Table.tsx';
import { CreateAccountDrawer, NameDialog, OtpDialog } from './Users.tsx';

export function People() {
  const { api, t, fill, notify, errorText } = useApp();
  const confirm = useConfirm();
  const persons = useLoad(() => api.get<AdminPersonDto[]>('/persons'), [api]);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<AdminPersonDto | null>(null);
  const [merging, setMerging] = useState<AdminPersonDto | null>(null);
  const [accountFor, setAccountFor] = useState<number | null>(null);
  const [otp, setOtp] = useState<TemporaryPasswordDto | null>(null);

  if (persons.loading && !persons.data) return <LoadingBlock />;
  if (persons.error || !persons.data) return <LoadError error={persons.error} onRetry={persons.reload} />;

  const run = async (action: () => Promise<AdminPersonDto[]>) => {
    try {
      persons.setData(await action());
      setOpenRow(null);
    } catch (error) {
      notify(errorText(error), 'error');
    }
  };

  const status = (item: AdminPersonDto) => {
    if (item.hasAccount && item.accountActive === false) return { label: t.admin.persons.accountInactive, color: 'bg-muted' };
    if (!item.active) return { label: t.admin.persons.inactive, color: 'bg-muted' };
    return { label: t.admin.persons.active, color: 'bg-pos' };
  };

  const actionsFor = (item: AdminPersonDto) => {
    const name = personName(item.person);
    const actions: { label: string; danger?: boolean; run: () => void }[] = [
      { label: t.admin.persons.rename, run: () => setRenaming(item) },
      { label: t.admin.persons.merge, run: () => setMerging(item) },
    ];
    if (!item.hasAccount) {
      actions.push({ label: t.admin.persons.createAccount, run: () => setAccountFor(item.person.id) });
      if (item.active) {
        actions.push({
          label: t.admin.persons.deactivate,
          run: () =>
            void (async () => {
              if (!(await confirm({ message: fill(t.admin.persons.confirmDeactivate, { name }), confirmLabel: t.admin.persons.deactivate }))) return;
              await run(() => api.post(`/persons/${item.person.id}/deactivate`));
            })(),
        });
      } else {
        actions.push({ label: t.admin.persons.activate, run: () => void run(() => api.post(`/persons/${item.person.id}/activate`)) });
      }
      if (!item.hasHistory) {
        actions.push({
          label: t.common.delete,
          danger: true,
          run: () =>
            void (async () => {
              if (!(await confirm({ message: fill(t.admin.persons.confirmDelete, { name }), confirmLabel: t.common.delete, danger: true }))) return;
              await run(() => api.delete(`/persons/${item.person.id}`));
            })(),
        });
      }
    }
    return actions;
  };

  return (
    <>
      <PageHeader title={t.admin.sections.people} subtitle={t.admin.persons.subtitle} />
      <Table<AdminPersonDto>
        rows={persons.data}
        rowKey={(item) => item.person.id}
        columns={[
          { header: t.admin.persons.name, primary: true, render: (item) => <span className="font-semibold">{personName(item.person)}</span> },
          {
            header: t.admin.persons.account,
            render: (item) =>
              item.person.username ? (
                <span className="font-mono text-[13px]">{item.person.username}</span>
              ) : (
                <span className="text-[13px] text-muted italic">{t.common.noAccount}</span>
              ),
          },
          {
            header: t.admin.persons.status,
            render: (item) => {
              const value = status(item);
              return (
                <span className="inline-flex items-center gap-2">
                  <span className={cx('h-2 w-2 rounded-full', value.color)} />
                  {value.label}
                </span>
              );
            },
          },
          {
            header: '',
            className: 'w-12',
            render: (item) => (
              <IconButton label={t.admin.users.actions} aria-expanded={openRow === item.person.id} onClick={() => setOpenRow(openRow === item.person.id ? null : item.person.id)}>
                <DotsIcon size={18} />
              </IconButton>
            ),
          },
        ]}
        expanded={(item) =>
          openRow === item.person.id ? (
            <div className="flex flex-wrap gap-2">
              {actionsFor(item).map((action) => (
                <Button key={action.label} size="sm" variant={action.danger ? 'danger' : 'secondary'} onClick={action.run}>
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      <NameDialog
        account={renaming}
        title={t.admin.persons.rename}
        requireLastName={renaming?.hasAccount ?? false}
        onClose={() => setRenaming(null)}
        onSave={async (firstName, lastName) => {
          if (!renaming) return;
          persons.setData(await api.patch<AdminPersonDto[]>(`/persons/${renaming.person.id}`, { firstName, lastName }));
          setRenaming(null);
          setOpenRow(null);
        }}
      />
      <MergeDialog
        source={merging}
        persons={persons.data}
        onClose={() => setMerging(null)}
        onMerge={async (targetId) => {
          if (!merging) return;
          persons.setData(await api.post<AdminPersonDto[]>(`/persons/${merging.person.id}/merge`, { targetId }));
          setMerging(null);
          setOpenRow(null);
        }}
      />
      <CreateAccountDrawer
        open={accountFor !== null}
        presetPersonId={accountFor}
        onClose={() => setAccountFor(null)}
        onCreated={(result) => {
          setAccountFor(null);
          setOtp(result);
          setOpenRow(null);
          void persons.reload();
        }}
      />
      <OtpDialog result={otp} onClose={() => setOtp(null)} />
    </>
  );
}

function MergeDialog({
  source,
  persons,
  onClose,
  onMerge,
}: {
  source: AdminPersonDto | null;
  persons: AdminPersonDto[];
  onClose: () => void;
  onMerge: (targetId: number) => Promise<void>;
}) {
  const { t, fill, errorText } = useApp();
  const [targetId, setTargetId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setTargetId(null);
    setError(null);
  }, [source]);
  const candidates = persons.filter((item) => source && item.person.id !== source.person.id && !(source.hasAccount && item.hasAccount));
  const name = source ? personName(source.person) : '';
  return (
    <Dialog
      open={source !== null}
      title={fill(t.admin.persons.mergeTitle, { name })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={targetId === null}
            onClick={() => {
              if (targetId === null) return;
              setBusy(true);
              onMerge(targetId)
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          >
            {t.admin.persons.mergeSubmit}
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-muted">{fill(t.admin.persons.mergeText, { name })}</p>
      <SelectInput label={t.admin.persons.mergeInto} value={targetId ?? ''} onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}>
        <option value="" />
        {candidates.map((item) => (
          <option key={item.person.id} value={item.person.id}>
            {personLabel(item.person)}
          </option>
        ))}
      </SelectInput>
      {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
    </Dialog>
  );
}
