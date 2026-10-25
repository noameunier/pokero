import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  Layers3,
  ListOrdered,
  Plus,
  Spade,
  Trophy,
  Users,
  WalletCards,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  formatChips,
  formatDateShort,
  formatDuration,
  statusTone,
  useApiErrorMessage,
  useStatusLabel,
} from '../lib/format';
import type { ChipCase, ClockView, MyStats, Preset, TournamentSummary } from '../lib/types';
import { Badge, EmptyState, ErrorState, SectionHeading, Spinner, Stat } from '../components/ui';
import { ClockProgress, useServerSyncedRemaining } from '../components/Clock';

function LiveCard({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const { data } = useQuery({
    queryKey: ['tournament-live', tournament.id],
    queryFn: () =>
      api.get<{
        tournament: {
          id: string;
          clock: ClockView;
          activePlayers: number;
          settings: { buyIn: { targetBuyIn: number } };
        };
      }>(`/api/tournaments/${tournament.id}`),
    refetchInterval: 15_000,
  });

  const clock = data?.tournament.clock ?? null;
  const remaining = useServerSyncedRemaining(clock);
  const activePlayers = data?.tournament.activePlayers ?? tournament.participantsCount;
  const buyIn = data?.tournament.settings.buyIn.targetBuyIn;

  return (
    <article className="card-command p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tournament.status === 'PAUSED' ? 'warning' : 'success'} dot>
              {statusLabel(tournament.status)}
            </Badge>
            {clock?.kind === 'BREAK' ? (
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400">
                {t('common.break')}
              </span>
            ) : null}
          </div>
          <h2 className="mt-2.5 font-display text-[1.85rem] leading-tight text-cream-50 sm:text-[2.2rem]">
            {tournament.name}
          </h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-gold-500/20 bg-gold-500/[0.08] text-gold-400">
          <Spade className="size-5" fill="currentColor" strokeWidth={1.5} aria-hidden />
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <div className="clock-digits text-[clamp(3.4rem,11vw,5.2rem)] text-cream-50">
            {clock ? formatDuration(remaining) : '—:—'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-cream-300">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5 text-gold-500" aria-hidden />
              {clock?.kind === 'BREAK'
                ? t('common.break')
                : `${t('common.level')} ${clock?.playLevelNumber ?? '—'}`}
            </span>
            {clock?.smallBlind !== null && clock?.smallBlind !== undefined ? (
              <span className="tabular text-cream-200">
                {formatChips(clock.smallBlind)} / {formatChips(clock.bigBlind)}
                {clock.ante ? ` · ante ${formatChips(clock.ante)}` : ''}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[var(--radius-md)] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-cream-400">
              En course
            </div>
            <div className="tabular mt-0.5 text-xl font-bold text-cream-50">
              {activePlayers}
              <span className="ml-1 text-sm font-medium text-cream-400">
                / {tournament.participantsCount}
              </span>
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-cream-400">
              Cave
            </div>
            <div className="tabular mt-0.5 text-xl font-bold text-cream-50">
              {formatChips(buyIn)}
            </div>
          </div>
        </div>
      </div>

      {clock ? (
        <div className="mt-4">
          <ClockProgress clock={clock} remainingMs={remaining} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link to={`/tournois/${tournament.id}`} className="btn-primary btn-sm">
          {t('dashboard.openConsole')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link to={`/projection/${tournament.id}`} className="btn-secondary btn-sm">
          <Spade className="size-3.5" aria-hidden />
          {t('tournament.projection')}
        </Link>
      </div>
    </article>
  );
}

function TournamentRow({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const isLive = tournament.status === 'RUNNING' || tournament.status === 'PAUSED';
  return (
    <Link
      to={`/tournois/${tournament.id}`}
      className="group flex min-h-[62px] items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2.5 transition-colors hover:border-white/[0.07] hover:bg-white/[0.025]"
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full border ${
          isLive
            ? 'border-gold-500/25 bg-gold-500/[0.09] text-gold-400'
            : 'border-white/[0.07] bg-white/[0.025] text-cream-400'
        }`}
      >
        <Trophy className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-cream-100">
          {tournament.name}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-cream-400">
          {t('dashboard.playersCount', { count: tournament.participantsCount })} ·{' '}
          {formatDateShort(tournament.startedAt ?? tournament.createdAt)}
        </span>
      </span>
      <span className={`badge hidden sm:inline-flex ${statusTone(tournament.status)}`}>
        {statusLabel(tournament.status)}
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-cream-500 transition-transform group-hover:translate-x-0.5 group-hover:text-cream-300"
        aria-hidden
      />
    </Link>
  );
}

function ChipCaseCard({ chipCase }: { chipCase: ChipCase }) {
  const totalChips = chipCase.chipTypes.reduce((total, type) => total + type.quantity, 0);
  const totalValue = chipCase.chipTypes.reduce(
    (total, type) => total + type.value * type.quantity,
    0,
  );
  const freeChips = chipCase.chipTypes.reduce(
    (total, type) => total + (type.freeQuantity ?? type.quantity),
    0,
  );
  const reserved = Math.max(0, totalChips - freeChips);

  return (
    <Link
      to={`/mallettes/${chipCase.id}`}
      className="card group block p-4 transition-colors hover:border-gold-500/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-cream-50">{chipCase.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-cream-400">
            {chipCase.chipTypes.length} valeurs · {formatChips(totalValue)} en jeu
          </p>
        </div>
        <ArrowUpRight
          className="size-4 shrink-0 text-cream-500 transition-colors group-hover:text-gold-400"
          aria-hidden
        />
      </div>

      <div className="mt-4 flex h-7 items-center pl-1">
        {chipCase.chipTypes.slice(0, 7).map((type, index) => (
          <span
            key={type.id}
            title={`${type.label} · ${formatChips(type.value)}`}
            className="chip-swatch -ml-1.5 size-7 first:ml-0"
            style={{ backgroundColor: type.color, zIndex: 10 - index }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 text-[11px]">
        <span className="text-cream-400">
          <strong className="tabular font-semibold text-cream-200">{formatChips(freeChips)}</strong>{' '}
          libres
        </span>
        {reserved > 0 ? (
          <span className="text-warning-300">{formatChips(reserved)} réservés</span>
        ) : (
          <span className="text-success-400">Stock complet</span>
        )}
      </div>
    </Link>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: typeof Plus;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-[72px] items-center gap-3 rounded-[var(--radius-md)] border border-white/[0.06] bg-white/[0.018] px-3.5 py-3 transition-colors hover:border-gold-500/20 hover:bg-white/[0.035]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-white/[0.07] bg-white/[0.03] text-gold-400 transition-colors group-hover:border-gold-500/25 group-hover:bg-gold-500/[0.08]">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-[13px] font-semibold text-cream-100">{label}</span>
        <span className="block truncate text-[11px] text-cream-400">{hint}</span>
      </span>
    </Link>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const { user } = useAuth();

  const tournamentsQuery = useQuery({
    queryKey: ['tournaments'],
    queryFn: () => api.get<{ tournaments: TournamentSummary[] }>('/api/tournaments'),
  });

  const statsQuery = useQuery({
    queryKey: ['stats-me'],
    queryFn: () => api.get<MyStats>('/api/stats/me'),
  });

  const chipCasesQuery = useQuery({
    queryKey: ['chip-cases'],
    queryFn: () => api.get<{ chipCases: ChipCase[] }>('/api/chip-cases'),
  });

  const presetsQuery = useQuery({
    queryKey: ['presets'],
    queryFn: () => api.get<{ presets: Preset[] }>('/api/presets'),
  });

  if (tournamentsQuery.isLoading) return <Spinner />;
  if (tournamentsQuery.isError) {
    return (
      <ErrorState
        description={errorMessage(tournamentsQuery.error)}
        onRetry={() => void tournamentsQuery.refetch()}
      />
    );
  }

  const tournaments = tournamentsQuery.data?.tournaments ?? [];
  const live = tournaments.filter(
    (tournament) => tournament.status === 'RUNNING' || tournament.status === 'PAUSED',
  );
  const upcoming = tournaments.filter((tournament) =>
    ['DRAFT', 'READY', 'RECOVERY_PENDING'].includes(tournament.status),
  );
  const completed = tournaments.filter((tournament) =>
    ['COMPLETED', 'CANCELLED'].includes(tournament.status),
  );
  const stats = statsQuery.data?.totals;
  const chipCases = chipCasesQuery.data?.chipCases ?? [];
  const presets = presetsQuery.data?.presets ?? [];
  const isEmpty = tournaments.length === 0;

  const displayName = user?.displayName ?? '';
  const today = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <div className="space-y-7 sm:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2.5">
            <span className="inline-block h-px w-6 bg-gold-500/60" aria-hidden />
            {todayLabel}
          </p>
          <h1 className="page-title mt-2">
            {t('dashboard.greeting', { name: displayName })}
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-cream-300">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link to="/tournois/nouveau" className="btn-primary flex-1 sm:flex-none">
            <Plus className="size-4" aria-hidden />
            {t('nav.newTournament')}
          </Link>
          <Link to="/mallettes" className="btn-secondary sm:hidden" aria-label={t('nav.chipCases')}>
            <Layers3 className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      {isEmpty ? (
        <section className="card relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-felt-600/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="grid size-12 place-items-center rounded-[var(--radius-md)] border border-gold-500/25 bg-gold-500/[0.08] text-gold-400">
              <Spade className="size-6" fill="currentColor" strokeWidth={1.5} aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-[1.9rem] leading-tight text-cream-50 sm:text-[2.2rem]">
              {t('dashboard.noTournaments')}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-cream-300">
              Créez votre mallette, définissez votre structure de blindes, puis lancez votre
              première soirée. Pokero s’occupe des caves, du chrono et du classement.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/mallettes/nouvelle" className="btn-primary">
                <Layers3 className="size-4" aria-hidden />
                {t('chipCase.new')}
              </Link>
              <Link to="/tournois/nouveau" className="btn-secondary">
                <Plus className="size-4" aria-hidden />
                {t('dashboard.createFirst')}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {live.length > 0 ? (
        <section aria-label={t('dashboard.activeTournament')} className="grid gap-4">
          {live.map((tournament) => (
            <LiveCard key={tournament.id} tournament={tournament} />
          ))}
        </section>
      ) : null}

      {!isEmpty ? (
        <section>
          <SectionHeading title="Accès rapide" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <QuickAction
              to="/tournois/nouveau"
              icon={Plus}
              label={t('nav.newTournament')}
              hint="Cave, blindes, options"
            />
            <QuickAction
              to="/mallettes"
              icon={Layers3}
              label={t('nav.chipCases')}
              hint={`${chipCases.length} mallette${chipCases.length > 1 ? 's' : ''}`}
            />
            <QuickAction
              to="/presets"
              icon={WalletCards}
              label={t('nav.presets')}
              hint={`${presets.length} preset${presets.length > 1 ? 's' : ''}`}
            />
            <QuickAction
              to="/statistiques"
              icon={BarChart3}
              label={t('nav.stats')}
              hint="Vos résultats"
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t('dashboard.tournamentsPlayed')}
          value={stats?.played ?? 0}
          icon={<BarChart3 className="size-4" aria-hidden />}
        />
        <Stat
          label={t('dashboard.wins')}
          value={stats?.wins ?? 0}
          icon={<Trophy className="size-4" aria-hidden />}
        />
        <Stat
          label={t('dashboard.podiums')}
          value={stats?.podiums ?? 0}
          icon={<ListOrdered className="size-4" aria-hidden />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <section>
          <SectionHeading
            title={t('dashboard.upcoming')}
            action={
              <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 text-[10.5px] font-semibold tabular text-cream-400">
                {upcoming.length}
              </span>
            }
          />
          {upcoming.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed border-white/[0.08] px-4 py-6 text-center">
              <CalendarDays className="size-5 text-cream-500" aria-hidden />
              <p className="mt-2 text-sm text-cream-400">Aucun tournoi programmé.</p>
              <Link
                to="/tournois/nouveau"
                className="mt-2 text-xs font-semibold text-gold-400 hover:text-gold-300"
              >
                Créer un tournoi
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04] rounded-[var(--radius-md)] border border-white/[0.06] bg-white/[0.012] p-1">
              {upcoming.slice(0, 6).map((tournament) => (
                <TournamentRow key={tournament.id} tournament={tournament} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeading
            title={t('dashboard.recent')}
            action={
              <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2 py-0.5 text-[10.5px] font-semibold tabular text-cream-400">
                {completed.length}
              </span>
            }
          />
          {completed.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed border-white/[0.08] px-4 py-6 text-center">
              <Trophy className="size-5 text-cream-500" aria-hidden />
              <p className="mt-2 text-sm text-cream-400">Aucun tournoi terminé.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04] rounded-[var(--radius-md)] border border-white/[0.06] bg-white/[0.012] p-1">
              {completed.slice(0, 6).map((tournament) => (
                <TournamentRow key={tournament.id} tournament={tournament} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionHeading
          title={t('nav.chipCases')}
          action={
            <Link
              to="/mallettes"
              className="inline-flex items-center gap-1 text-xs font-semibold text-gold-400 hover:text-gold-300"
            >
              Tout voir
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        {chipCases.length === 0 ? (
          <EmptyState
            icon={<Layers3 className="size-6" aria-hidden />}
            title={t('chipCase.empty')}
            description="Déclarez vos valeurs de jetons et vos quantités pour que Pokero calcule les caves au jeton près."
            action={
              <Link to="/mallettes/nouvelle" className="btn-primary">
                <Plus className="size-4" aria-hidden />
                {t('chipCase.new')}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chipCases.slice(0, 3).map((chipCase) => (
              <ChipCaseCard key={chipCase.id} chipCase={chipCase} />
            ))}
          </div>
        )}
      </section>

      {live.length === 0 && !isEmpty ? (
        <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-white/[0.06] bg-white/[0.018] px-4 py-3">
          <Users className="size-4 shrink-0 text-gold-500" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px] text-cream-300">
            Prêt pour la prochaine soirée ? Votre mallette et vos presets sont à portée de main.
          </p>
          <Link to="/tournois/nouveau" className="btn-secondary btn-sm">
            <Plus className="size-3.5" aria-hidden />
            {t('nav.newTournament')}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
