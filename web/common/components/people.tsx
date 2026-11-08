import { useMemo, useState } from 'react';
import type { PersonRef, SelectablePersonDto } from '../../../shared/api.ts';
import { personName } from '../../../shared/format.ts';
import { useApp } from '../app.tsx';
import { PlusIcon, XIcon } from './icons.tsx';
import { Button, Dialog, ErrorBox, TextInput, cx } from './ui.tsx';

// People with an account are always shown with their username when chosen
// from a list, for example "Anna Kowalska (anna)".
export function personLabel(person: PersonRef): string {
  return person.username ? `${personName(person)} (${person.username})` : personName(person);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

// Search among people, with the option to add a new person without an account.
export function PersonDialog({
  open,
  onClose,
  persons,
  excludeIds = [],
  onPick,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  persons: SelectablePersonDto[];
  excludeIds?: number[];
  onPick: (person: PersonRef) => void;
  onCreate: (firstName: string, lastName: string | null) => Promise<PersonRef>;
}) {
  const { t, fill, errorText } = useApp();
  const [query, setQuery] = useState('');
  const [lastName, setLastName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    return persons
      .filter((person) => person.selectable && !excludeIds.includes(person.id))
      .filter((person) => !needle || normalize(personLabel(person)).includes(needle));
  }, [persons, excludeIds, query]);

  const close = () => {
    setQuery('');
    setLastName('');
    setError(null);
    onClose();
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const person = await onCreate(query.trim(), lastName.trim() || null);
      onPick(person);
      close();
    } catch (caught) {
      setError(caught);
    } finally {
      setCreating(false);
    }
  };

  const firstName = query.trim();
  return (
    <Dialog open={open} title={t.people.addPerson} onClose={close} sheet>
      <TextInput label={t.people.search} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      <div className="flex max-h-64 flex-col overflow-y-auto">
        {matches.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => {
              onPick(person);
              close();
            }}
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left hover:bg-surface-2"
          >
            <span className="font-semibold">{personName(person)}</span>
            {person.username ? (
              <span className="text-sm text-muted">({person.username})</span>
            ) : (
              <span className="rounded-md bg-surface-2 px-1.5 text-[11px] font-semibold text-muted">{t.common.noAccount}</span>
            )}
          </button>
        ))}
        {matches.length === 0 && !firstName && <p className="m-0 px-3 py-2 text-sm text-muted">{t.people.noResults}</p>}
      </div>
      {firstName && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
          <TextInput label={t.people.lastNameOptional} value={lastName} onChange={(event) => setLastName(event.target.value)} />
          {error !== null && <ErrorBox>{errorText(error)}</ErrorBox>}
          <Button variant="primary" onClick={create} busy={creating}>
            <PlusIcon size={16} />
            {fill(t.people.addNew, { name: [firstName, lastName.trim()].filter(Boolean).join(' ') })}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

// Chosen participants of a trip as removable chips, with a button to add more.
export function ParticipantsPicker({
  value,
  onChange,
  persons,
  onCreate,
}: {
  value: PersonRef[];
  onChange: (value: PersonRef[]) => void;
  persons: SelectablePersonDto[];
  onCreate: (firstName: string, lastName: string | null) => Promise<PersonRef>;
}) {
  const { t, fill } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {value.map((person) => (
        <span key={person.id} className="inline-flex h-9 items-center gap-0.5 rounded-full bg-accent-soft pr-0.5 pl-3 text-sm font-semibold">
          {personLabel(person)}
          <button
            type="button"
            aria-label={fill(t.people.removePerson, { name: personName(person) })}
            onClick={() => onChange(value.filter((item) => item.id !== person.id))}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface/60"
          >
            <XIcon size={14} strokeWidth={2.4} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx('inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-muted px-3 text-sm font-semibold text-accent-text')}
      >
        <PlusIcon size={14} strokeWidth={2.4} />
        {t.people.addPerson}
      </button>
      <PersonDialog
        open={open}
        onClose={() => setOpen(false)}
        persons={persons}
        excludeIds={value.map((person) => person.id)}
        onPick={(person) => onChange([...value, person])}
        onCreate={onCreate}
      />
    </div>
  );
}
