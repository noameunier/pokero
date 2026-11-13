import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  Clock3,
  Layers3,
  Monitor,
  Plus,
  Search,
  Spade,
  Trash2,
  Trophy,
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
  useLocale,
  useStatusLabel,
} from '../lib/format';
import type { ChipCase, ClockView, MyStats, Preset, TournamentSummary } from '../lib/types';
import {
  Badge,
  ConfirmDialog,
  ErrorState,
  FilterChips,
  InlineNotice,
  Input,
  PageHeader,
  SectionHeading,
  Skeleton,
} from '../components/ui';
import { ClockProgress, useServerSyncedRemaining } from '../components/Clock';
import { useToast } from '../components/Toast';

function LiveCard({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const query = useQuery({
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

  const clock = query.data?.tournament.clock ?? null;
  const remaining = useServerSyncedRemaining(clock);
  const activePlayers = query.data?.tournament.activePlayers;
  const buyIn = query.data?.tournament.settings.buyIn.targetBuyIn;
  const next = clock?.upcoming[0];

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
          <h2 className="mt-3 break-words font-display text-[1.85rem] leading-tight text-cream-50 sm:text-[2.2rem]">
            {tournament.name}
          </h2>
        </div>
        <span className="hidden size-10 shrink-0 place-items-center rounded-full border border-gold-500/20 bg-gold-500/[0.08] text-gold-400 sm:grid">
          <Spade className="size-5" fill="currentColor" strokeWidth={1.5} aria-hidden />
        </span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] sm:items-end">
        <div className="min-w-0">
          <p className="mb-2 text-xs text-cream-300">{t('dashboard.timeRemaining')}</p>
          <div
            className="clock-digits text-[clamp(3.5rem,10vw,5.5rem)] text-cream-50"
            role="timer"
            aria-label={t('dashboard.timeRemaining')}
          >
            {clock ? formatDuration(remaining) : '--:--'}
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

        <dl className="grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4 sm:gap-3 sm:border-t-0 sm:pt-0">
          <div>
            <dt className="text-xs text-cream-300">{t('dashboard.stillIn')}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold text-cream-50">
              {activePlayers ?? '—'}
              <span className="ml-1 text-sm font-medium text-cream-400">
                / {tournament.participantsCount}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-cream-300">{t('dashboard.buyIn')}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold text-cream-50">
              {buyIn === undefined ? '—' : formatChips(buyIn)}
            </dd>
          </div>
        </dl>
      </div>

      {clock ? (
        <div className="mt-4">
          <ClockProgress clock={clock} remainingMs={remaining} />
        </div>
      ) : null}

      {next ? (
        <p className="mt-3 text-xs text-cream-300">
          {t('dashboard.upNext')}
          <span className="tabular ml-2 text-cream-100">
            {next.kind === 'BREAK'
              ? t('common.break')
              : `${formatChips(next.smallBlind)} / ${formatChips(next.bigBlind)}`}
          </span>
        </p>
      ) : null}

      {query.isError ? (
        <div className="mt-4">
          <InlineNotice
            description={t('dashboard.clockUnavailable')}
            retryLabel={t('common.retry')}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-4">
        <Link
          to={`/tournois/${tournament.id}`}
          className="btn-primary flex-1 whitespace-nowrap px-3 text-[13px] sm:flex-none sm:px-4 sm:text-sm"
        >
          {t('dashboard.openConsole')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link
          to={`/projection/${tournament.id}`}
          className="btn-secondary flex-1 whitespace-nowrap px-3 text-[13px] sm:flex-none sm:px-4 sm:text-sm"
          aria-label={t('tournament.projection')}
        >
          <Monitor className="size-4" aria-hidden />
          {t('dashboard.project')}
        </Link>
      </div>
    </article>
  );
}

function DeleteTournamentButton({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api.delete(`/api/tournaments/${tournament.id}`),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      success(t('dashboard.deleted'));
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('dashboard.deleteNamed', { name: tournament.name })}
        title={t('common.delete')}
        className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] text-cream-500 transition-colors hover:bg-danger-500/10 hover:text-danger-300 sm:size-9"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      <ConfirmDialog
        open={open}
        title={t('dashboard.deleteTitle')}
        description={t('dashboard.deleteDescription')}
        confirmLabel={t('common.delete')}
        loading={mutation.isPending}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

function TournamentRow({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const statusLabel = useStatusLabel();
  const isLive = tournament.status === 'RUNNING' || tournament.status === 'PAUSED';
  const canDelete = ['DRAFT', 'COMPLETED', 'CANCELLED'].includes(tournament.status);

  return (
    <li className="group flex items-center gap-1 px-2 transition-colors hover:bg-white/[0.025] sm:gap-3 sm:px-4">
      <Link
        to={`/tournois/${tournament.id}`}
        className="flex min-h-[84px] min-w-0 flex-1 items-center gap-3 py-3"
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
          <span className="block break-words text-sm font-semibold text-cream-100">
            {tournament.name}
          </span>
          <span className="mt-1 block text-xs text-cream-400">
            {t('dashboard.playersCount', { count: tournament.participantsCount })} ·{' '}
            {formatDateShort(tournament.startedAt ?? tournament.createdAt, locale)}
          </span>
          <span className={`badge mt-1.5 sm:hidden ${statusTone(tournament.status)}`}>
            {statusLabel(tournament.status)}
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
      {canDelete ? <DeleteTournamentButton tournament={tournament} /> : null}
    </li>
  );
}

function ChipCaseCard({ chipCase }: { chipCase: ChipCase }) {
  const { t } = useTranslation();
  const freeChips = chipCase.chipTypes.reduce(
    (total, type) => total + (type.freeQuantity ?? type.quantity),
    0,
  );

  return (
    <Link
      to={`/mallettes/${chipCase.id}`}
      className="card-flat group block p-4 transition-colors hover:border-gold-500/25"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-cream-50">{chipCase.name}</h3>
          <p className="mt-0.5 text-[11.5px] text-cream-400">
            {t('dashboard.freeChips', { count: freeChips })}
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
    </Link>
  );
}

function DashboardSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('common.loading')} className="space-y-7">
      <Skeleton className="h-24 max-w-md" />
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const errorMessage = useApiErrorMessage();
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(6);

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

  if (tournamentsQuery.isLoading) return <DashboardSkeleton />;
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
  const chipCases = (chipCasesQuery.data?.chipCases ?? []).filter((item) => !item.archived);
  const presets = (presetsQuery.data?.presets ?? []).filter((item) => !item.archived);
  const isEmpty = tournaments.length === 0;

  const displayName = user?.displayName ?? '';
  const today = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);

  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  const filtered = (
    filter === 'upcoming' ? upcoming : filter === 'completed' ? completed : tournaments
  ).filter((tournament) => normalize(tournament.name).includes(normalize(search.trim())));
  const notice = (description: string, refetch: () => unknown) => (
    <InlineNotice
      description={description}
      retryLabel={t('common.retry')}
      onRetry={() => void refetch()}
    />
  );

  return (
    <div className="space-y-7 sm:space-y-8">
      <PageHeader
        eyebrow={todayLabel}
        title={t('dashboard.greeting', { name: displayName })}
        description={live.length > 0 ? t('dashboard.liveSubtitle') : t('dashboard.subtitle')}
        actionsClassName="hidden lg:flex"
        actions={
          !isEmpty ? (
            <Link
              to="/tournois/nouveau"
              className={live.length > 0 ? 'btn-secondary' : 'btn-primary'}
            >
              <Plus className="size-4" aria-hidden />
              {t('nav.newTournament')}
            </Link>
          ) : undefined
        }
      />

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0 space-y-7">
          {isEmpty ? (
            <section className="card-command p-5 sm:p-7">
              <span className="eyebrow">{t('dashboard.welcome')}</span>
              <h2 className="mt-4 font-display text-3xl text-cream-50">
                {t('dashboard.noTournaments')}
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-cream-300">
                {t('dashboard.onboarding')}
              </p>
              <ol className="my-6 space-y-3 border-y border-white/[0.08] py-5 text-sm text-cream-200">
                {[
                  t('dashboard.setupChips'),
                  t('dashboard.setupTournament'),
                  t('dashboard.setupPlay'),
                ].map((step, index) => (
                  <li key={step} className="flex items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/10 text-xs text-gold-300">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              {chipCasesQuery.isLoading ? (
                <Skeleton className="h-11" />
              ) : chipCasesQuery.isError ? (
                notice(t('dashboard.chipsUnavailable'), chipCasesQuery.refetch)
              ) : (
                <Link
                  to={chipCases.length > 0 ? '/tournois/nouveau' : '/mallettes/nouvelle'}
                  className="btn-primary"
                >
                  <Plus className="size-4" aria-hidden />
                  {chipCases.length > 0 ? t('dashboard.createFirst') : t('chipCase.new')}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
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
            <section aria-labelledby="dashboard-tournaments-title" className="card overflow-hidden">
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="dashboard-tournaments-title"
                    className="font-display text-2xl text-cream-50"
                  >
                    {t('dashboard.yourTournaments')}
                  </h2>
                  <div className="relative w-full sm:w-60">
                    <label htmlFor="tournament-search" className="sr-only">
                      {t('dashboard.searchTournaments')}
                    </label>
                    <Search
                      className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-cream-400"
                      aria-hidden
                    />
                    <Input
                      id="tournament-search"
                      type="search"
                      value={search}
                      placeholder={t('dashboard.searchTournaments')}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setVisibleCount(6);
                      }}
                      className="pl-10"
                    />
                  </div>
                </div>
                <FilterChips
                  label={t('dashboard.filterTournaments')}
                  value={filter}
                  onChange={(value) => {
                    setFilter(value);
                    setVisibleCount(6);
                  }}
                  options={[
                    { value: 'all', label: t('dashboard.all'), count: tournaments.length },
                    { value: 'upcoming', label: t('dashboard.upcoming'), count: upcoming.length },
                    { value: 'completed', label: t('dashboard.finished'), count: completed.length },
                  ]}
                />
              </div>
              <p className="sr-only" role="status">
                {t('dashboard.resultCount', { count: filtered.length })}
              </p>
              {filtered.length === 0 ? (
                <div className="border-t border-white/[0.07] p-6 text-center">
                  <p className="text-sm text-cream-300">{t('dashboard.noMatch')}</p>
                  <button
                    type="button"
                    className="btn-ghost mt-2"
                    onClick={() => {
                      setSearch('');
                      setFilter('all');
                      setVisibleCount(6);
                    }}
                  >
                    {t('dashboard.resetFilters')}
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07]">
                  {filtered.slice(0, visibleCount).map((tournament) => (
                    <TournamentRow key={tournament.id} tournament={tournament} />
                  ))}
                </ul>
              )}
              {filtered.length > visibleCount ? (
                <div className="border-t border-white/[0.07] p-3 text-center">
                  <button
                    type="button"
                    className="btn-ghost w-full"
                    onClick={() => setVisibleCount((count) => count + 6)}
                  >
                    {t('dashboard.showMore')}
                    <ChevronRight className="size-4 rotate-90" aria-hidden />
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside aria-label={t('dashboard.prepare')} className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="font-display text-2xl text-cream-50">{t('dashboard.prepare')}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-cream-300">
              {t('dashboard.prepareHint')}
            </p>
            <div className="mt-5">
              <SectionHeading
                as="h3"
                title={t('nav.chipCases')}
                action={
                  <Link to="/mallettes" className="text-link">
                    {t('dashboard.viewAll')}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              {chipCasesQuery.isLoading ? (
                <Skeleton className="h-32" />
              ) : chipCasesQuery.isError ? (
                notice(t('dashboard.chipsUnavailable'), chipCasesQuery.refetch)
              ) : chipCases.length > 0 ? (
                <div className="space-y-2">
                  {chipCases.slice(0, 2).map((item) => (
                    <ChipCaseCard key={item.id} chipCase={item} />
                  ))}
                </div>
              ) : (
                <Link to="/mallettes/nouvelle" className="btn-secondary w-full">
                  <Layers3 className="size-4" aria-hidden />
                  {t('chipCase.new')}
                </Link>
              )}
            </div>
            <div className="mt-5 border-t border-white/[0.08] pt-5">
              <SectionHeading
                as="h3"
                title={t('nav.presets')}
                action={
                  <Link to="/presets" className="text-link">
                    {t('dashboard.viewAll')}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              {presetsQuery.isLoading ? (
                <Skeleton className="h-20" />
              ) : presetsQuery.isError ? (
                notice(t('dashboard.presetsUnavailable'), presetsQuery.refetch)
              ) : presets.length > 0 ? (
                <div className="space-y-2">
                  {presets.slice(0, 2).map((preset) => (
                    <Link
                      key={preset.id}
                      to={`/tournois/nouveau?preset=${preset.id}`}
                      className="group flex min-h-16 items-center gap-3 rounded-[var(--radius-md)] border border-white/[0.07] px-3 py-3 transition-colors hover:border-gold-500/25 hover:bg-white/[0.03]"
                    >
                      <WalletCards className="size-4 shrink-0 text-gold-400" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[13px] font-semibold text-cream-100">
                          {preset.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-cream-400">
                          {t('dashboard.startWithPreset')}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-cream-400" aria-hidden />
                    </Link>
                  ))}
                </div>
              ) : (
                <Link to="/presets/nouveau" className="btn-secondary w-full">
                  <Plus className="size-4" aria-hidden />
                  {t('preset.new')}
                </Link>
              )}
            </div>
          </section>

          <section className="card-flat p-5" aria-labelledby="dashboard-stats-title">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 id="dashboard-stats-title" className="section-title">
                {t('dashboard.stats')}
              </h2>
              <Link to="/statistiques" className="text-link" aria-label={t('nav.stats')}>
                <BarChart3 className="size-4" aria-hidden />
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {statsQuery.isLoading ? (
              <Skeleton className="h-16" />
            ) : statsQuery.isError ? (
              notice(t('dashboard.statsUnavailable'), statsQuery.refetch)
            ) : (
              <dl className="grid grid-cols-3 gap-2">
                {[
                  [t('dashboard.playedShort'), stats?.played],
                  [t('dashboard.wins'), stats?.wins],
                  [t('dashboard.podiums'), stats?.podiums],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] text-cream-300">{label}</dt>
                    <dd className="tabular mt-2 text-2xl font-semibold text-cream-50">
                      {value ?? '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
