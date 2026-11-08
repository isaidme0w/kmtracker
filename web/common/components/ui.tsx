import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { initials } from '../../../shared/format.ts';
import type { PersonRef } from '../../../shared/api.ts';
import { useApp } from '../app.tsx';
import { XIcon } from './icons.tsx';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 border border-transparent',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-fg border border-transparent hover:bg-surface-2',
  danger: 'bg-surface text-neg border border-line hover:bg-neg-bg',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  busy,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-[15px]',
        size === 'lg' && 'h-12 px-5 text-base',
        block && 'w-full',
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {busy && <Spinner size={16} />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-[13px] font-semibold text-neg" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[13px] text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

const inputBase = 'w-full rounded-xl px-3.5 text-fg outline-none placeholder:text-muted/70';
const inputClass = `${inputBase} h-12 border border-line bg-surface-2 text-base focus:border-accent`;
const largeInputClass = `${inputBase} h-14 border-[1.5px] border-accent bg-surface text-[22px] font-semibold`;

export function TextInput({
  label,
  hint,
  error,
  suffix,
  large,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  suffix?: ReactNode;
  large?: boolean;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="relative">
        <input
          id={inputId}
          className={cx(large ? largeInputClass : inputClass, suffix ? 'pr-12' : undefined, className)}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold text-muted">{suffix}</span>
        )}
      </div>
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  children,
  id,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId}>
      <select id={selectId} className={cx(inputClass, 'pr-8', className)} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3 text-left"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </span>
      <span
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full border transition',
          checked ? 'border-accent bg-accent' : 'border-line bg-surface-2',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-[22px] w-[22px] rounded-full transition-all',
            checked ? 'left-[22px] bg-accent-fg' : 'left-0.5 bg-muted',
          )}
        />
      </span>
    </button>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="m-0 text-[17px] font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'warn' | 'neg' | 'pos'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        tone === 'neutral' && 'bg-surface-2 text-muted',
        tone === 'accent' && 'bg-accent-soft text-fg',
        tone === 'warn' && 'bg-warn-bg text-warn-text',
        tone === 'neg' && 'bg-neg-bg text-neg-text',
        tone === 'pos' && 'bg-pos-bg text-pos',
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ person, muted, size = 34 }: { person: Pick<PersonRef, 'firstName' | 'lastName'>; muted?: boolean; size?: number }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
        muted ? 'bg-surface-2 text-fg' : 'bg-accent text-accent-fg',
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(person)}
    </span>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-neg/40 bg-neg-bg px-3.5 py-3 text-sm font-semibold text-neg-text">
      {children}
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm text-fg">{children}</div>;
}

export function WarnBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-warn-border bg-warn-bg px-3.5 py-3 text-sm text-warn-text">{children}</div>;
}

export function LoadingBlock() {
  const { t } = useApp();
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted">
      <Spinner />
      <span>{t.common.loading}</span>
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { errorText, t } = useApp();
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorBox>{errorText(error)}</ErrorBox>
      <Button onClick={onRetry}>{t.common.retry}</Button>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            'rounded-xl px-4 py-2.5 text-sm font-semibold shadow-pop',
            toast.kind === 'success' ? 'bg-fg text-bg' : 'bg-neg text-white',
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// Open dialogs, newest last, so that Escape closes only the topmost one.
const openDialogs: symbol[] = [];

function useEscapeToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const id = Symbol('dialog');
    openDialogs.push(id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openDialogs.at(-1) === id) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(id), 1);
    };
  }, [open, onClose]);
}

// A modal window. On phones it can be shown as a sheet attached to the bottom.
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  sheet,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  sheet?: boolean;
  wide?: boolean;
}) {
  const { t } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEscapeToClose(open, onClose);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    focusable?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={cx('fixed inset-0 z-40 flex justify-center', sheet ? 'items-end sm:items-center' : 'items-center p-4')}>
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col gap-3 overflow-y-auto bg-surface p-5 shadow-pop',
          sheet ? 'rounded-t-3xl sm:rounded-2xl' : 'rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-[19px] font-bold">
            {title}
          </h2>
          <IconButton label={t.common.close} onClick={onClose} data-close="">
            <XIcon />
          </IconButton>
        </div>
        {children}
        {footer && <div className="mt-1 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// A panel that slides in from the right, used for creating and editing in the panel.
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useApp();
  const titleId = useId();
  useEscapeToClose(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-5 shadow-pop sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-xl font-bold">
            {title}
          </h2>
          <IconButton label={t.common.close} onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>
        {children}
        {footer && <div className="mt-auto flex justify-end gap-2 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t, fill } = useApp();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 text-[13px] text-muted">
      <Button size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label={t.common.previous}>
        ‹
      </Button>
      <span>{fill(t.common.pageOf, { page, pages })}</span>
      <Button size="sm" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label={t.common.next}>
        ›
      </Button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'h-9 rounded-lg text-sm font-semibold transition',
            option.value === value ? 'bg-surface text-fg shadow-sm' : 'text-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
