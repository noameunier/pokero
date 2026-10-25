import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Layers3,
  Play,
  Plus,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatChips, formatDate, formatDuration, statusTone, useStatusLabel } from '../lib/format';
import type { ChipCase, ClockView, MyStats, TournamentSummary } from '../lib/types';
import { Badge, Card, EmptyState, Spinner, Stat } from '../components/ui';
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

  return (
    <Card className="relative overflow-hidden border-gold-500/25 bg-gradient-to-br from-felt-800/80 to-felt-950/60">
      <div className="pointer-events-none absolute -right-16 -top-16 size-52 rounded-full bg-gold-500/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <Badge tone="gold" className="animate-pulse-gold">
            <Play className="size-3" fill="currentColor" />
            {statusLabel(tournament.status)}
          </Badge>
          <span className="text-xs text-cream-300/60">{t('dashboard.activeTournament')}</span>
        </div>
        <h2 className="mt-3 font-display text-2xl font-bold text-cream-50 sm:text-3xl">
          {tournament.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cream-300/70">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" />
            {t('dashboard.playersCount', { count: tournament.participantsCount })}
          </span>
          {clock ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-4" />
              {clock.kind === 'BREAK'
                ? t('common.break')
                : `${t('common.level')} ${clock.playLevelNumber ?? '—'}`}
              {clock.smallBlind !== null ? (
                <span className="tabular ml-1 text-cream-200">
                  {formatChips(clock.smallBlind)} / {formatChips(clock.bigBlind)}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        {clock ? (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-4">
              <div className="clock-digits font-display text-4xl font-bold text-cream-50">
                {formatDuration(remaining)}
              </div>
              <span className="text-xs uppercase tracking-wider text-cream-300/50">
                {clock.status === 'PAUSED' ? t('status.PAUSED') : t('status.RUNNING')}
              </span>
            </div>
            <div className="mt-3">
              <ClockProgress clock={clock} remainingMs={remaining} />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to={`/tournois/${tournament.id}`} className="btn-primary btn-sm">
            {t('dashboard.openConsole')}
            <ArrowRight className="size-4" />
          </Link>
          <Link to={`/projection/${tournament.id}`} className="btn-secondary btn-sm">
            {t('tournament.projection')}
          </Link>
        </div>
      </div>
    </Card>
  );
}

function TournamentRow({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  return (
    <Link
      to={`/tournois/${tournament.id}`}
      className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:border-gold-500/30 hover:bg-white/[0.05]"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-gold-400">
        <Trophy className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-cream-50">{tournament.name}</p>
        <p className="mt-0.5 text-xs text-cream-300/60">
          {t('dashboard.playersCount', { count: tournament.participantsCount })} ·{' '}
          {formatDate(tournament.startedAt ?? tournament.createdAt)}
        </p>
      </div>
      <span className={`badge ${statusTone(tournament.status)}`}>{statusLabel(tournament.status)}</span>
    </Link>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
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

  if (tournamentsQuery.isLoading) return <Spinner />;

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
  const isEmpty = tournaments.length === 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-500/80">
            {t('dashboard.title')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-cream-50 sm:text-4xl">
            {t('dashboard.greeting', { name: user?.displayName ?? '' })}
          </h1>
          <p className="mt-1.5 text-sm text-cream-300/70">{t('dashboard.subtitle')}</p>
        </div>
        <Link to="/tournois/nouveau" className="btn-primary">
          <Plus className="size-4" />
          {t('nav.newTournament')}
        </Link>
      </header>

      {isEmpty ? (
        <EmptyState
          icon={<Trophy className="size-10" />}
          title={t('dashboard.noTournaments')}
          description="Créez une mallette de jetons, définissez votre structure de blindes, et lancez votre première soirée."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/tournois/nouveau" className="btn-primary">
                <Plus className="size-4" />
                {t('dashboard.createFirst')}
              </Link>
              <Link to="/mallettes/nouvelle" className="btn-secondary">
                <Layers3 className="size-4" />
                {t('chipCase.new')}
              </Link>
            </div>
          }
        />
      ) : null}

      {live.length > 0 ? (
        <section className="space-y-3">
          {live.map((tournament) => (
            <LiveCard key={tournament.id} tournament={tournament} />
          ))}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t('dashboard.tournamentsPlayed')}
          value={stats?.played ?? 0}
          icon={<BarChart3 className="size-5" />}
        />
        <Stat label={t('dashboard.wins')} value={stats?.wins ?? 0} icon={<Trophy className="size-5" />} />
        <Stat
          label={t('dashboard.podiums')}
          value={stats?.podiums ?? 0}
          icon={<Clock3 className="size-5" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-cream-50">{t('dashboard.upcoming')}</h2>
            <span className="text-xs text-cream-300/50">{upcoming.length}</span>
          </div>
          {upcoming.length === 0 ? (
            <Card className="text-sm text-cream-300/60">{t('dashboard.noTournaments')}</Card>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 6).map((tournament) => (
                <TournamentRow key={tournament.id} tournament={tournament} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-cream-50">{t('dashboard.recent')}</h2>
            <span className="text-xs text-cream-300/50">{completed.length}</span>
          </div>
          {completed.length === 0 ? (
            <Card className="text-sm text-cream-300/60">Aucun tournoi terminé.</Card>
          ) : (
            <div className="space-y-2">
              {completed.slice(0, 6).map((tournament) => (
                <TournamentRow key={tournament.id} tournament={tournament} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cream-50">{t('nav.chipCases')}</h2>
          <Link to="/mallettes" className="text-xs font-semibold text-gold-400 hover:text-gold-300">
            Tout voir
          </Link>
        </div>
        {chipCases.length === 0 ? (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-cream-300/70">{t('chipCase.empty')}</p>
            <Link to="/mallettes/nouvelle" className="btn-secondary btn-sm">
              <Plus className="size-4" />
              {t('chipCase.new')}
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chipCases.slice(0, 3).map((chipCase) => (
              <Link key={chipCase.id} to={`/mallettes/${chipCase.id}`} className="card block p-4 transition hover:border-gold-500/30">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-cream-50">{chipCase.name}</span>
                  {chipCase.archived ? <Badge>Archivée</Badge> : null}
                </div>
                <p className="mt-1 text-xs text-cream-300/60">
                  {chipCase.chipTypes.length} valeurs ·{' '}
                  {formatChips(chipCase.chipTypes.reduce((total, type) => total + type.value * type.quantity, 0))}{' '}
                  en stock
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {chipCase.chipTypes.slice(0, 8).map((type) => (
                    <span
                      key={type.id}
                      title={`${type.label} · ${formatChips(type.value)}`}
                      className="size-5 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: type.color }}
                    />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
