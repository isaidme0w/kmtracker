import { useEffect, useState, type FormEvent } from 'react';
import type { AdminAccountDto, AdminPersonDto, Role, TemporaryPasswordDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import { useApp, useLoad } from '../common/app.tsx';
import { useConfirm } from '../common/components/confirm.tsx';
import { DotsIcon, PlusIcon } from '../common/components/icons.tsx';
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  Drawer,
  ErrorBox,
  IconButton,
  InfoBox,
  LoadError,
  LoadingBlock,
  Segmented,
  SelectInput,
  TextInput,
  cx,
} from '../common/components/ui.tsx';
import { PageHeader, Table } from './Table.tsx';

export function OtpDialog({ result, onClose }: { result: TemporaryPasswordDto | null; onClose: () => void }) {
  const { t, f, fill } = useApp();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [result]);
  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog
      open={result !== null}
      title={t.admin.users.otpTitle}
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t.common.done}
        </Button>
      }
    >
      {result && (
        <>
          <p className="m-0 text-muted">{fill(t.admin.users.otpText, { username: result.username })}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-muted bg-surface-2 px-4 py-3.5">
            <span className="font-mono text-[22px] font-bold tracking-wider select-all">{result.temporaryPassword}</span>
            <Button size="sm" onClick={() => void copy()}>
              {copied ? t.common.copied : t.common.copy}
            </Button>
          </div>
          <span className="text-[13px] text-muted">{fill(t.admin.users.otpExpires, { date: f.dateTime(result.expiresAt) })}</span>
        </>
      )}
    </Dialog>
  );
}

export function CreateAccountDrawer({
  open,
  onClose,
  onCreated,
  presetPersonId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: TemporaryPasswordDto) => void;
  presetPersonId?: number | null;
}) {
  const { api, t, errorText } = useApp();
  const persons = useLoad(() => api.get<AdminPersonDto[]>('/persons'), [api, open]);
  const guests = (persons.data ?? []).filter((item) => !item.hasAccount);
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<Role>('driver');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [personId, setPersonId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setUsername('');
    setRole('driver');
    setError(null);
    setMode(presetPersonId ? 'existing' : 'new');
    setPersonId(presetPersonId ?? null);
    setFirstName('');
    setLastName('');
  }, [open, presetPersonId]);

  useEffect(() => {
    if (mode !== 'existing' || personId === null) return;
    const chosen = guests.find((item) => item.person.id === personId);
    if (chosen) {
      setFirstName(chosen.person.firstName);
      setLastName(chosen.person.lastName ?? '');
    }
    // Fill the name only when the chosen person changes.
  }, [mode, personId, persons.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<TemporaryPasswordDto>('/accounts', {
        username,
        firstName,
        lastName,
        role,
        personId: mode === 'existing' ? personId : undefined,
      });
      onCreated(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} title={t.admin.users.create.title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-3">
        <TextInput label={t.admin.users.create.username} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="off" required />
        <span className="text-[13px] font-semibold text-muted">{t.admin.users.create.person}</span>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'new', label: t.admin.users.create.newPerson },
            { value: 'existing', label: t.admin.users.create.existingPerson },
          ]}
        />
        {mode === 'existing' &&
          (guests.length === 0 ? (
            <p className="m-0 text-sm text-muted">{t.admin.users.create.noGuests}</p>
          ) : (
            <>
              <SelectInput
                label={t.admin.users.create.choosePerson}
                value={personId ?? ''}
                onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : null)}
                required
              >
                <option value="" />
                {guests.map((item) => (
                  <option key={item.person.id} value={item.person.id}>
                    {personName(item.person)}
                  </option>
                ))}
              </SelectInput>
              <span className="text-[13px] text-muted">{t.admin.users.create.keepsHistory}</span>
            </>
          ))}
        <div className="grid grid-cols-2 gap-2.5">
          <TextInput label={t.admin.users.create.firstName} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <TextInput label={t.admin.users.create.lastName} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <span className="text-[13px] font-semibold text-muted">{t.admin.users.create.role}</span>
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'driver', label: t.roles.driver },
            { value: 'admin', label: t.roles.admin },
          ]}
        />
        <InfoBox>{t.admin.users.create.otpInfo}</InfoBox>
        {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
        <div className="mt-auto flex justify-end gap-2 pt-3">
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" busy={busy}>
            {t.admin.users.create.submit}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

type StatusFilter = '' | 'active' | 'temporary' | 'deactivated';

export function Users() {
  const { api, t, f, fill, plural, notify, errorText } = useApp();
  const confirm = useConfirm();
  const accounts = useLoad(() => api.get<AdminAccountDto[]>('/accounts'), [api]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [otp, setOtp] = useState<TemporaryPasswordDto | null>(null);
  const [editing, setEditing] = useState<AdminAccountDto | null>(null);
  const [roleEditing, setRoleEditing] = useState<AdminAccountDto | null>(null);

  if (accounts.loading && !accounts.data) return <LoadingBlock />;
  if (accounts.error || !accounts.data) return <LoadError error={accounts.error} onRetry={accounts.reload} />;

  const run = async (action: () => Promise<AdminAccountDto[] | unknown>) => {
    try {
      const result = await action();
      if (Array.isArray(result)) accounts.setData(result as AdminAccountDto[]);
      else await accounts.reload();
      setOpenRow(null);
    } catch (error) {
      notify(errorText(error), 'error');
    }
  };

  const needle = search.trim().toLowerCase();
  const rows = accounts.data.filter((account) => {
    if (needle && !`${personName(account.person)} ${account.username}`.toLowerCase().includes(needle)) return false;
    if (roleFilter && account.role !== roleFilter) return false;
    if (statusFilter === 'active' && account.status !== 'active') return false;
    if (statusFilter === 'temporary' && account.status !== 'temporary' && account.status !== 'expired') return false;
    if (statusFilter === 'deactivated' && account.status !== 'deactivated') return false;
    return true;
  });

  const statusLabel = (account: AdminAccountDto) => {
    if (account.status === 'temporary') return fill(t.admin.users.statuses.temporary, { date: f.date(account.temporaryPasswordExpiresAt ?? '') });
    return t.admin.users.statuses[account.status];
  };

  const statusColor: Record<AdminAccountDto['status'], string> = {
    active: 'bg-pos',
    temporary: 'bg-warn-border',
    expired: 'bg-neg',
    deactivated: 'bg-muted',
  };

  const reset = async (account: AdminAccountDto) => {
    const ok = await confirm({
      message: fill(t.admin.users.confirmReset, { username: account.username }),
      confirmLabel: t.admin.users.resetPassword,
    });
    if (!ok) return;
    try {
      setOtp(await api.post<TemporaryPasswordDto>(`/accounts/${account.id}/reset-password`));
      await accounts.reload();
      setOpenRow(null);
    } catch (error) {
      notify(errorText(error), 'error');
    }
  };

  const actionsFor = (account: AdminAccountDto) => {
    const actions: { label: string; danger?: boolean; run: () => void }[] = [
      { label: t.admin.users.editName, run: () => setEditing(account) },
    ];
    if (account.isProtected || account.isSelf) {
      if (account.isSelf && !account.isProtected) actions.push({ label: t.admin.users.resetPassword, run: () => void reset(account) });
      return actions;
    }
    if (account.status === 'deactivated') {
      actions.unshift({ label: t.admin.users.activate, run: () => void run(() => api.post(`/accounts/${account.id}/activate`)) });
      return actions;
    }
    actions.push({ label: t.admin.users.changeRole, run: () => setRoleEditing(account) });
    actions.push({ label: t.admin.users.resetPassword, run: () => void reset(account) });
    actions.push({
      label: t.admin.users.deactivate,
      run: () =>
        void (async () => {
          if (!(await confirm({ message: fill(t.admin.users.confirmDeactivate, { username: account.username }), confirmLabel: t.admin.users.deactivate, danger: true }))) return;
          await run(() => api.post(`/accounts/${account.id}/deactivate`));
        })(),
    });
    if (!account.hasHistory) {
      actions.push({
        label: t.common.delete,
        danger: true,
        run: () =>
          void (async () => {
            if (!(await confirm({ message: fill(t.admin.users.confirmDelete, { username: account.username }), confirmLabel: t.common.delete, danger: true }))) return;
            await run(() => api.delete(`/accounts/${account.id}`));
          })(),
      });
    }
    return actions;
  };

  const noteFor = (account: AdminAccountDto) => {
    if (account.isProtected) return t.admin.users.protectedNote;
    if (account.isSelf) return t.admin.users.selfNote;
    if (account.hasHistory && account.status !== 'deactivated') return t.admin.users.historyNote;
    return null;
  };

  return (
    <>
      <PageHeader
        title={t.admin.sections.users}
        subtitle={plural(t.admin.users.subtitle, accounts.data.length)}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <PlusIcon size={16} strokeWidth={2.4} />
            {t.admin.users.newAccount}
          </Button>
        }
      />
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <TextInput label={t.admin.users.search} placeholder={t.admin.users.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectInput label={t.admin.users.role} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as '' | Role)}>
          <option value="">{t.admin.users.all}</option>
          <option value="driver">{t.roles.driver}</option>
          <option value="admin">{t.roles.admin}</option>
        </SelectInput>
        <SelectInput label={t.admin.users.status} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="">{t.admin.users.all}</option>
          <option value="active">{t.admin.users.statusFilter.active}</option>
          <option value="temporary">{t.admin.users.statusFilter.temporary}</option>
          <option value="deactivated">{t.admin.users.statusFilter.deactivated}</option>
        </SelectInput>
      </div>
      <Table<AdminAccountDto>
        rows={rows}
        rowKey={(account) => account.id}
        columns={[
          {
            header: t.admin.users.name,
            primary: true,
            render: (account) => (
              <span className="flex items-center gap-2.5 font-semibold">
                <Avatar person={account.person} size={32} muted={account.role !== 'admin'} />
                <span>{personName(account.person)}</span>
                {account.isSelf && <Badge>{t.common.you}</Badge>}
                {account.isProtected && <Badge>{t.common.protected}</Badge>}
              </span>
            ),
          },
          { header: t.admin.users.username, render: (account) => <span className="font-mono text-[13px]">{account.username}</span> },
          { header: t.admin.users.role, render: (account) => <Badge tone={account.role === 'admin' ? 'accent' : 'neutral'}>{t.roles[account.role]}</Badge> },
          {
            header: t.admin.users.status,
            render: (account) => (
              <span className="inline-flex items-center gap-2">
                <span className={cx('h-2 w-2 shrink-0 rounded-full', statusColor[account.status])} />
                {statusLabel(account)}
              </span>
            ),
          },
          { header: t.admin.users.created, render: (account) => <span className="text-muted">{f.date(account.createdAt)}</span> },
          {
            header: '',
            className: 'w-12',
            render: (account) => (
              <IconButton
                label={t.admin.users.actions}
                aria-expanded={openRow === account.id}
                onClick={() => setOpenRow(openRow === account.id ? null : account.id)}
              >
                <DotsIcon size={18} />
              </IconButton>
            ),
          },
        ]}
        expanded={(account) =>
          openRow === account.id ? (
            <div className="flex flex-wrap items-center gap-2 md:pl-11">
              {actionsFor(account).map((action) => (
                <Button key={action.label} size="sm" variant={action.danger ? 'danger' : 'secondary'} onClick={action.run}>
                  {action.label}
                </Button>
              ))}
              {noteFor(account) && <span className="text-[13px] text-muted">{noteFor(account)}</span>}
            </div>
          ) : null
        }
      />

      <CreateAccountDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(result) => {
          setCreating(false);
          setOtp(result);
          void accounts.reload();
        }}
      />
      <OtpDialog result={otp} onClose={() => setOtp(null)} />
      <NameDialog
        account={editing}
        onClose={() => setEditing(null)}
        onSave={async (firstName, lastName) => {
          if (!editing) return;
          accounts.setData(await api.patch<AdminAccountDto[]>(`/accounts/${editing.id}`, { firstName, lastName }));
          setEditing(null);
          setOpenRow(null);
        }}
      />
      <RoleDialog
        account={roleEditing}
        onClose={() => setRoleEditing(null)}
        onSave={async (role) => {
          if (!roleEditing) return;
          accounts.setData(await api.patch<AdminAccountDto[]>(`/accounts/${roleEditing.id}`, { role }));
          setRoleEditing(null);
          setOpenRow(null);
        }}
      />
    </>
  );
}

export function NameDialog({
  account,
  title,
  requireLastName = true,
  onClose,
  onSave,
}: {
  account: { person: { firstName: string; lastName: string | null } } | null;
  title?: string;
  requireLastName?: boolean;
  onClose: () => void;
  onSave: (firstName: string, lastName: string) => Promise<void>;
}) {
  const { t, errorText } = useApp();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (account) {
      setFirstName(account.person.firstName);
      setLastName(account.person.lastName ?? '');
      setError(null);
    }
  }, [account]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(firstName, lastName);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={account !== null} title={title ?? t.admin.users.editTitle} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextInput label={t.admin.users.create.firstName} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <TextInput
          label={requireLastName ? t.admin.users.create.lastName : t.people.lastNameOptional}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required={requireLastName}
        />
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

function RoleDialog({
  account,
  onClose,
  onSave,
}: {
  account: AdminAccountDto | null;
  onClose: () => void;
  onSave: (role: Role) => Promise<void>;
}) {
  const { t, errorText } = useApp();
  const [role, setRole] = useState<Role>('driver');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (account) {
      setRole(account.role);
      setError(null);
    }
  }, [account]);
  return (
    <Dialog
      open={account !== null}
      title={t.admin.users.roleTitle}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              setBusy(true);
              onSave(role)
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <Segmented
        value={role}
        onChange={setRole}
        options={[
          { value: 'driver', label: t.roles.driver },
          { value: 'admin', label: t.roles.admin },
        ]}
      />
      {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
    </Dialog>
  );
}
