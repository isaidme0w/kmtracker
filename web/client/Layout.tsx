import { NavLink, Outlet, useNavigate } from 'react-router';
import { useApp } from '../common/app.tsx';
import { Logo, ThemeToggle, UserMenu, type MenuItem } from '../common/components/chrome.tsx';
import { ClockIcon, GearIcon, HomeIcon, LogoutIcon, OverviewIcon } from '../common/components/icons.tsx';
import { cx } from '../common/components/ui.tsx';

function Dot({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-warn-border"
    />
  );
}

export function Layout() {
  const { me, t, signOut } = useApp();
  const navigate = useNavigate();
  const unseen = me?.unseenCorrections ?? { active: false, history: false };

  const items: MenuItem[] = [{ label: t.common.settings, icon: <GearIcon size={18} />, onSelect: () => navigate('/settings') }];
  if (me?.account.role === 'admin') {
    items.push({ label: t.nav.adminPanel, icon: <OverviewIcon size={18} />, onSelect: () => window.location.assign('/admin') });
  }
  items.push({ label: t.common.signOut, icon: <LogoutIcon size={18} />, onSelect: () => void signOut() });

  const tabs = [
    { to: '/', label: t.nav.dashboard, icon: <HomeIcon size={22} />, dot: unseen.active, end: true },
    { to: '/history', label: t.nav.history, icon: <ClockIcon size={22} />, dot: unseen.history, end: false },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 pr-1.5 pl-4">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden gap-1 sm:flex" aria-label={t.nav.dashboard}>
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    cx(
                      'relative flex h-10 items-center rounded-xl px-3 text-sm font-semibold',
                      isActive ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-surface-2',
                    )
                  }
                >
                  <span className="relative">
                    {tab.label}
                    {tab.dot && <Dot label={t.nav.newCorrection} />}
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <UserMenu items={items} showName />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-4 pb-24 sm:pb-10">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label={t.nav.dashboard}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs',
                isActive ? 'font-bold text-accent-text' : 'font-medium text-muted',
              )
            }
          >
            <span className="relative flex">
              {tab.icon}
              {tab.dot && <Dot label={t.nav.newCorrection} />}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
