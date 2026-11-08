import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useApp } from '../common/app.tsx';
import { Logo, ThemeToggle, UserMenu, type MenuItem } from '../common/components/chrome.tsx';
import {
  CycleIcon,
  GearIcon,
  HomeIcon,
  ListIcon,
  LogoutIcon,
  MenuIcon,
  OverviewIcon,
  SlidersIcon,
  UserIcon,
  UsersIcon,
} from '../common/components/icons.tsx';
import { IconButton, cx } from '../common/components/ui.tsx';

export function AdminLayout({ version }: { version: string }) {
  const { t, fill, signOut } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const sections = [
    { to: '/', label: t.admin.sections.overview, icon: <OverviewIcon size={18} />, end: true },
    { to: '/activity', label: t.admin.sections.activity, icon: <ListIcon size={18} />, end: false },
    { to: '/users', label: t.admin.sections.users, icon: <UserIcon size={18} />, end: false },
    { to: '/people', label: t.admin.sections.people, icon: <UsersIcon size={18} />, end: false },
    { to: '/cycles', label: t.admin.sections.cycles, icon: <CycleIcon size={18} />, end: false },
    { to: '/settings', label: t.admin.sections.settings, icon: <SlidersIcon size={18} />, end: false },
  ];

  const items: MenuItem[] = [
    { label: t.common.settings, icon: <GearIcon size={18} />, onSelect: () => navigate('/account') },
    { label: t.admin.app, icon: <HomeIcon size={18} />, onSelect: () => window.location.assign('/') },
    { label: t.admin.signOutPanel, icon: <LogoutIcon size={18} />, onSelect: () => void signOut() },
  ];

  const current = sections.find((section) => (section.end ? location.pathname === section.to : location.pathname.startsWith(section.to)));

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label={t.admin.menu}>
      {sections.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end={section.end}
          className={({ isActive }) =>
            cx(
              'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm',
              isActive ? 'bg-accent-soft font-bold text-fg [&>span]:text-accent-text' : 'font-medium text-fg hover:bg-surface-2 [&>span]:text-muted',
            )
          }
        >
          <span className="flex">{section.icon}</span>
          {section.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-2 border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="px-2 pb-3">
          <Logo subtitle={t.admin.panel} />
        </div>
        {nav}
        <div className="mt-auto border-t border-line px-2 pt-3 text-xs text-muted">{fill(t.admin.version, { version })}</div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-2 bg-surface px-3 py-4 shadow-pop">
            <div className="px-2 pb-3">
              <Logo subtitle={t.admin.panel} />
            </div>
            {nav}
            <div className="mt-auto border-t border-line px-2 pt-3 text-xs text-muted">{fill(t.admin.version, { version })}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-15 items-center justify-between gap-2 border-b border-line bg-surface py-2 pr-3 pl-2 lg:pl-8">
          <div className="flex items-center gap-1">
            <IconButton label={t.admin.menu} onClick={() => setMenuOpen(true)} className="lg:hidden">
              <MenuIcon />
            </IconButton>
            <span className="text-sm text-muted">{current ? current.label : t.common.settings}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <UserMenu items={items} showName />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
