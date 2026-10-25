import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  ChevronDown,
  Layers3,
  LogOut,
  Plus,
  Settings,
  Spade,
  Trophy,
  WalletCards,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Spinner } from './ui';
import { useToast } from './Toast';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Pokero, accueil">
      <span className="relative grid size-9 place-items-center rounded-[10px] border border-gold-400/50 bg-gold-500 text-night-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_16px_-8px_rgb(207_169_88/0.6)] transition-colors group-hover:bg-gold-400">
        <Spade className="size-[19px]" fill="currentColor" strokeWidth={1.5} />
      </span>
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[1.55rem] leading-none text-cream-50">Pokero</span>
          <span className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.28em] text-gold-500">
            Poker club
          </span>
        </span>
      ) : null}
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
  { to: '/', key: 'nav.home', icon: Trophy, end: true },
  { to: '/mallettes', key: 'nav.chipCases', icon: Layers3 },
  { to: '/tournois/nouveau', key: 'nav.create', icon: Plus, accent: true },
  { to: '/statistiques', key: 'nav.stats', icon: BarChart3 },
  { to: '/compte', key: 'nav.account', icon: Settings },
];

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { success } = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!user) return <Navigate to="/connexion" replace />;

  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-night-950"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-night-950/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[62px] w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:gap-6 lg:px-8">
          <Brand />

          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Navigation principale">
            {desktopNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                <item.icon className="size-4 opacity-70" aria-hidden />
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {!online ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-1 text-[11px] font-semibold text-warning-300 sm:inline-flex">
                <WifiOff className="size-3.5" aria-hidden />
                Hors ligne
              </span>
            ) : null}
            <Link
              to="/tournois/nouveau"
              className="btn-primary btn-sm hidden sm:inline-flex"
            >
              <Plus className="size-4" aria-hidden />
              {t('nav.newTournament')}
            </Link>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.035] py-1 pl-1 pr-2 text-sm transition hover:border-white/[0.16] hover:bg-white/[0.06]"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Menu du compte"
              >
                <span className="grid size-7 place-items-center rounded-full bg-gold-500/15 text-[11px] font-bold text-gold-300 ring-1 ring-gold-500/25">
                  {initials || 'PK'}
                </span>
                <span className="hidden max-w-28 truncate font-semibold text-cream-200 sm:block">
                  {user.displayName}
                </span>
                <ChevronDown
                  className={`size-4 text-cream-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-60 overflow-hidden rounded-[var(--radius-md)] border border-white/[0.09] bg-night-800 shadow-lifted animate-rise"
                >
                  <div className="border-b border-white/[0.07] px-3.5 py-3">
                    <p className="truncate text-sm font-semibold text-cream-50">
                      {user.displayName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-cream-400">{user.email}</p>
                  </div>
                  <div className="p-1.5">
                    <Link
                      to="/compte"
                      role="menuitem"
                      className="flex min-h-10 items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-sm text-cream-200 hover:bg-white/[0.06]"
                    >
                      <Settings className="size-4 text-cream-400" aria-hidden />
                      {t('nav.account')}
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void logout().then(() => success(t('auth.logoutDone')));
                      }}
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 text-left text-sm text-danger-300 hover:bg-danger-500/10"
                    >
                      <LogOut className="size-4" aria-hidden />
                      {t('nav.logout')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main
        id="contenu"
        className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8 md:pb-14 lg:px-8"
      >
        <Outlet />
      </main>

      <footer className="hidden border-t border-white/[0.05] px-6 py-5 md:block">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between text-[11px] text-cream-500">
          <span>Pokero · gestion de tournois de poker</span>
          <span className="inline-flex items-center gap-1.5">
            <Spade className="size-3 text-gold-500" aria-hidden />
            Les données restent sur votre serveur
          </span>
        </div>
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-night-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Navigation mobile"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
          {mobileNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                item.accent
                  ? 'relative flex flex-1 flex-col items-center justify-end gap-0.5 px-0.5 pb-2 text-[9.5px] font-semibold text-gold-400'
                  : `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[9.5px] font-semibold transition-colors ${
                      isActive ? 'text-gold-400' : 'text-cream-400'
                    }`
              }
            >
              {({ isActive }) =>
                item.accent ? (
                  <>
                    <span className="-mt-4 grid size-11 place-items-center rounded-full border border-gold-300/40 bg-gold-500 text-night-950 shadow-[0_8px_20px_-8px_rgb(207_169_88/0.8)]">
                      <item.icon className="size-5" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span className="truncate">{t(item.key)}</span>
                  </>
                ) : (
                  <>
                    <span
                      className={`grid h-6 w-9 place-items-center rounded-full transition-colors ${
                        isActive ? 'bg-gold-500/12' : ''
                      }`}
                    >
                      <item.icon
                        className="size-[19px]"
                        strokeWidth={isActive ? 2.2 : 1.8}
                        aria-hidden
                      />
                    </span>
                    <span className="max-w-full truncate">{t(item.key)}</span>
                  </>
                )
              }
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
