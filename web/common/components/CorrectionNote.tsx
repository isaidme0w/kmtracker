import { useState } from 'react';
import type { ActivityEntry } from '../../../shared/activity.ts';
import { describeActivity } from '../activity.ts';
import { useApp } from '../app.tsx';
import { AlertIcon, ChevronDownIcon } from './icons.tsx';
import { cx } from './ui.tsx';

// The note shown in a corrected cycle. Highlighted until the user has seen
// the latest correction, then grey; it stays as part of the cycle's record.
export function CorrectionNote({ corrections, unseen }: { corrections: ActivityEntry[]; unseen: boolean }) {
  const app = useApp();
  const { t, f, plural } = app;
  const [open, setOpen] = useState(false);
  if (corrections.length === 0) return null;
  const label = plural(unseen ? t.corrections.unseen : t.corrections.seen, corrections.length);
  return (
    <div
      className={cx(
        'rounded-2xl border',
        unseen ? 'border-warn-border bg-warn-bg text-warn-text' : 'border-line bg-surface-2 text-muted',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold"
      >
        <AlertIcon size={18} />
        <span className="flex-1">{label}</span>
        <ChevronDownIcon size={18} className={cx('transition', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="m-0 flex list-none flex-col gap-3 px-3.5 pb-3.5 pl-11 text-sm">
          {corrections.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {f.dateTime(entry.occurredAt)} · {entry.actorName ?? t.activity.system}
              </span>
              <span>
                {t.activity.types[entry.type]}: {describeActivity(entry, app)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
