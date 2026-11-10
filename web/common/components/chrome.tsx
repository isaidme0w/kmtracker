import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isLanguage } from '../../../shared/preferences.ts';
import { personName } from '../../../shared/format.ts';
import { useApp } from '../app.tsx';
import { availableLanguages } from '../i18n/index.ts';
import { ChevronDownIcon, GaugeIcon, GlobeIcon, MoonIcon, SunIcon } from './icons.tsx';
import { Avatar, IconButton, cx } from './ui.tsx';

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-fg">
        <GaugeIcon size={18} strokeWidth={2.2} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[16px] font-bold">KM Tracker</span>
        {subtitle && <span className="text-[12px] text-muted">{subtitle}</span>}
      </span>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme, t } = useApp();
  return (
    <IconButton label={theme === 'dark' ? t.common.themeToLight : t.common.themeToDark} onClick={toggleTheme}>
      {theme === 'dark' ? <SunIcon size={21} /> : <MoonIcon size={21} />}
    </IconButton>
  );
}

// Compact language dropdown for pages shown before signing in.
export function LanguageDropdown() {
  const { language, setLanguage, t } = useApp();
  return (
    <label className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface pr-1 pl-2.5 text-muted">
      <GlobeIcon size={16} />
      <select
        aria-label={t.common.language}
        value={language}
        onChange={(event) => isLanguage(event.target.value) && setLanguage(event.target.value)}
        className="h-[38px] cursor-pointer border-none bg-transparent text-sm font-semibold text-fg outline-none"
      >
        {availableLanguages.map((option) => (
          <option key={option.code} value={option.code} className="bg-surface text-fg">
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export function UserMenu({ items, showName }: { items: MenuItem[]; showName?: boolean }) {
  const { me, t } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!me) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t.common.userMenu}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-xl px-1.5 text-fg hover:bg-surface-2"
      >
        <Avatar person={me.person} />
        {showName && (
          <span className="hidden items-center gap-1 text-sm font-semibold sm:flex">
            {personName(me.person)}
            <ChevronDownIcon size={16} />
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute top-12 right-0 z-30 flex w-60 flex-col rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <div className="px-3 pt-2 pb-2">
            <div className="font-bold">{personName(me.person)}</div>
            <div className="text-[13px] text-muted">
              {me.account.username} · {t.roles[me.account.role]}
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cx('flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-left text-[15px] hover:bg-surface-2')}
            >
              {item.icon && <span className="text-muted">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
