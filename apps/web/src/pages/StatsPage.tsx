import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Award,
  BarChart3,
  Crown,
  Medal,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDateShort, useApiErrorMessage } from '../lib/format';
import type { MyStats } from '../lib/types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  Spinner,
  Stat,
} from '../components/ui';

export function StatsPage() {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const query = useQuery({
    queryKey: ['stats-me'],
    queryFn: () => api.get<MyStats>('/api/stats/me'),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) {
    return (
      <ErrorState
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const stats = query.data;
  if (!stats) return null;

  const results = [...stats.results].sort(
    (a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime(),
  );
  const bestRank = results.length > 0 ? Math.min(...results.map((result) => result.rank)) : null;
  const averageRank =
    results.length > 0
      ? results.reduce((total, result) => total + result.rank, 0) / results.length
      : null;
  const totalRebuys = results.reduce((total, result) => total + result.rebuys, 0);
  const totalAddOns = results.reduce((total, result) => total + result.addOns, 0);
  const played = stats.totals.played;
  const winRate = played > 0 ? stats.totals.wins / played : 0;
  const podiumRate = played > 0 ? stats.totals.podiums / played : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Votre parcours"
        title={t('stats.title')}
        description={t('stats.subtitle')}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Chiffres clés">
        <Stat
          label={t('stats.played')}
          value={stats.totals.played}
          icon={<BarChart3 className="size-4" aria-hidden />}
        />
        <Stat
          label={t('stats.wins')}
          value={stats.totals.wins}
          icon={<Crown className="size-4" aria-hidden />}
        />
        <Stat
          label={t('stats.podiums')}
          value={stats.totals.podiums}
          icon={<Medal className="size-4" aria-hidden />}
        />
        <Stat
          label={t('stats.bestRank')}
          value={bestRank ?? '—'}
          icon={<TrendingUp className="size-4" aria-hidden />}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="stats-history-title">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2
              id="stats-history-title"
              className="flex items-center gap-2 font-display text-2xl text-cream-50"
            >
              <Award className="size-4 text-gold-500" aria-hidden />
              {t('stats.history')}
            </h2>
            <Badge tone="neutral">{stats.participations.length}</Badge>
          </div>

          {stats.participations.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-6" aria-hidden />}
              title={t('stats.noResults')}
              description="Vos résultats apparaîtront ici lorsque vous serez inscrit à un tournoi terminé."
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_3.5rem_4.5rem_4.5rem] gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.13em] text-cream-400 sm:grid">
                <span>{t('stats.tournament')}</span>
                <span>Statut</span>
                <span className="text-center">{t('stats.rank')}</span>
                <span className="text-center">Rebuys</span>
                <span className="text-center">Add-ons</span>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {stats.participations.map((participation) => (
                  <li
                    key={participation.tournamentId}
                    className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_3.5rem_4.5rem_4.5rem] sm:items-center sm:gap-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular ${
                          participation.rank === 1
                            ? 'bg-gold-500 text-night-950'
                            : 'border border-white/[0.08] bg-white/[0.03] text-cream-300'
                        }`}
                        aria-hidden
                      >
                        {participation.rank ?? '—'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-cream-100">
                          {participation.tournamentName}
                        </span>
                        <span className="block text-[10.5px] text-cream-500 sm:hidden">
                          {participation.rank === 1 ? 'Vainqueur' : `Place ${participation.rank ?? '—'}`}
                          {participation.rebuys > 0 ? ` · ${participation.rebuys} rebuy` : ''}
                          {participation.addOns > 0 ? ` · ${participation.addOns} add-on` : ''}
                        </span>
                      </span>
                    </div>
                    <span className="hidden text-[11.5px] sm:block">
                      <Badge tone={participation.status === 'COMPLETED' ? 'neutral' : 'success'} dot>
                        {participation.status === 'COMPLETED'
                          ? 'Terminé'
                          : participation.status === 'RUNNING'
                            ? 'En cours'
                            : participation.status}
                      </Badge>
                    </span>
                    <span className="hidden text-center sm:block">
                      {participation.rank === 1 ? (
                        <Crown className="mx-auto size-4 text-gold-400" aria-label="Vainqueur" />
                      ) : (
                        <span className="tabular text-[13px] text-cream-300">
                          {participation.rank ?? '—'}
                        </span>
                      )}
                    </span>
                    <span className="tabular hidden text-center text-[12.5px] text-cream-400 sm:block">
                      {participation.rebuys}
                    </span>
                    <span className="tabular hidden text-center text-[12.5px] text-cream-400 sm:block">
                      {participation.addOns}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">Régularité</h2>
              <Target className="size-4 text-gold-500" aria-hidden />
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="text-cream-400">Taux de victoire</span>
                  <span className="tabular font-semibold text-cream-100">
                    {Math.round(winRate * 100)} %
                  </span>
                </div>
                <ProgressBar value={winRate} tone="gold" className="mt-1.5" />
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="text-cream-400">Taux de podium</span>
                  <span className="tabular font-semibold text-cream-100">
                    {Math.round(podiumRate * 100)} %
                  </span>
                </div>
                <ProgressBar value={podiumRate} tone="success" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
                <div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                    {t('stats.averageRank')}
                  </div>
                  <div className="tabular mt-0.5 text-xl font-bold text-cream-50">
                    {averageRank === null ? '—' : averageRank.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                    Meilleure place
                  </div>
                  <div className="tabular mt-0.5 text-xl font-bold text-cream-50">
                    {bestRank ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Compléments</h2>
            <dl className="mt-3 divide-y divide-white/[0.05] text-[12.5px]">
              <div className="flex items-center justify-between gap-2 py-2">
                <dt className="flex items-center gap-2 text-cream-400">
                  <RefreshCw className="size-3.5 text-cream-500" aria-hidden />
                  {t('stats.rebuys')}
                </dt>
                <dd className="tabular font-semibold text-cream-100">{totalRebuys}</dd>
              </div>
              <div className="flex items-center justify-between gap-2 py-2">
                <dt className="flex items-center gap-2 text-cream-400">
                  <Sparkles className="size-3.5 text-cream-500" aria-hidden />
                  {t('stats.addOns')}
                </dt>
                <dd className="tabular font-semibold text-cream-100">{totalAddOns}</dd>
              </div>
            </dl>
          </Card>

          {results.length > 0 ? (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-cream-50">Derniers résultats</h2>
                <Trophy className="size-4 text-gold-500" aria-hidden />
              </div>
              <ol className="mt-3 space-y-1">
                {results.slice(0, 5).map((result) => (
                  <li
                    key={result.tournamentId}
                    className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-[12.5px]"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular ${
                        result.rank === 1
                          ? 'bg-gold-500/20 text-gold-300'
                          : 'bg-white/[0.05] text-cream-400'
                      }`}
                    >
                      {result.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-cream-200">
                      {result.tournamentName}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-cream-500">
                      {result.startedAt ? formatDateShort(result.startedAt) : '—'}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
