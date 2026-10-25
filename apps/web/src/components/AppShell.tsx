import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  ChevronDown,
  Layers3,
  LogOut,
  Menu,
  Plus,
  Settings,
  Spade,
  Trophy,
  WalletCards,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Spinner } from './ui';
import { useToast } from './Toast';

function Brand() {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gold-500 text-felt-950 shadow-lg shadow-gold-500/20 transition group-hover:bg-gold-400">
        <Spade className="size-5" fill="currentColor" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight text-cream-50">Pokero</span>
    </Link>
  );
}

const desktopNav = [
  { to: '/', key: 'nav.dashboard', icon: Trophy, end: true },
  { to: '/mallettes', key: 'nav.chipCases', icon: Layers3 },
  { to: '/presets', key: 'nav.presets', icon: WalletCards },
  { to: '/statistiques', key: 'nav.stats', icon: BarChart3 },
];

const mobileNav = [
  { to: '/', key: 'nav.dashboard', icon: Trophy, end: true },
  { to: '/mallettes', key: 'nav.chipCases', icon: Layers3 },
  { to: '/tournois/nouveau', key: 'nav.newTournament', icon: Plus },
  { to: '/statistiques', key: 'nav.stats', icon: BarChart3 },
  { to: '/compte', key: 'nav.account', icon: Settings },
];

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { success } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return <Navigate to="/connexion" replace />;

  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-felt-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Brand />
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {desktopNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                <item.icon className="size-4" />
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/tournois/nouveau" className="btn-primary btn-sm hidden sm:inline-flex">
              <Plus className="size-4" />
              {t('nav.newTournament')}
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-2.5 text-sm hover:bg-white/10"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-gold-500/20 text-xs font-bold text-gold-300">
                {initials || 'PK'}
              </span>
              <span className="hidden max-w-28 truncate sm:block">{user.displayName}</span>
              <ChevronDown className="size-4 text-cream-300/60" />
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="absolute right-4 top-14 z-40 w-56 rounded-xl border border-white/10 bg-felt-900 p-1.5 shadow-2xl">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="truncate text-sm font-medium text-cream-50">{user.displayName}</p>
              <p className="truncate text-xs text-cream-300/60">{user.email}</p>
            </div>
            <Link
              to="/compte"
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream-200 hover:bg-white/10"
            >
              <Settings className="size-4" />
              {t('nav.account')}
            </Link>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => success(t('auth.logoutDone')));
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/10"
            >
              <LogOut className="size-4" />
              {t('nav.logout')}
            </button>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pb-12 sm:pt-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-felt-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {mobileNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium ${
                  isActive ? 'text-gold-400' : 'text-cream-300/60'
                }`
              }
            >
              <item.icon className="size-5" />
              <span className="max-w-full truncate">{t(item.key)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function FullscreenShell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function MobileMenuButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button type="button" onClick={onClick} className="btn-ghost btn-sm p-2" aria-label="Menu">
      {open ? <X className="size-5" /> : <Menu className="size-5" />}
    </button>
  );
}

export { Brand };
