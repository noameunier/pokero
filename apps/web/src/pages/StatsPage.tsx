import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Award, BarChart3, Crown, Medal, Target, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateShort } from '../lib/format';
import type { MyStats } from '../lib/types';
import { Card, EmptyState, Spinner, Stat } from '../components/ui';

export function StatsPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['stats-me'],
    queryFn: () => api.get<MyStats>('/api/stats/me'),
  });

  if (query.isLoading) return <Spinner />;
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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-500/80">
          {t('stats.title')}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-cream-50">{t('stats.title')}</h1>
        <p className="mt-1.5 text-sm text-cream-300/70">{t('stats.subtitle')}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('stats.played')} value={stats.totals.played} icon={<BarChart3 className="size-5" />} />
        <Stat label={t('stats.wins')} value={stats.totals.wins} icon={<Crown className="size-5" />} />
        <Stat label={t('stats.podiums')} value={stats.totals.podiums} icon={<Medal className="size-5" />} />
        <Stat
          label={t('stats.bestRank')}
          value={bestRank ?? '—'}
          icon={<TrendingUp className="size-5" />}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-cream-300/60">
              {t('stats.averageRank')}
            </span>
            <Target className="size-4 text-gold-500/70" />
          </div>
          <div className="stat-value mt-2">
            {averageRank === null ? '—' : averageRank.toFixed(1)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-cream-300/60">
            {t('stats.rebuys')}
          </div>
          <div className="stat-value mt-2">{totalRebuys}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-cream-300/60">
            {t('stats.addOns')}
          </div>
          <div className="stat-value mt-2">{totalAddOns}</div>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-cream-50">
          <Award className="size-5 text-gold-500" />
          {t('stats.history')}
        </h2>
        {stats.participations.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-9" />}
            title={t('stats.noResults')}
            description="Vos résultats apparaîtront ici lorsque vous serez inscrit à un tournoi terminé."
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-white/10 text-left text-[10px] uppercase tracking-wider text-cream-300/50">
                <tr>
                  <th className="px-4 py-3">{t('stats.tournament')}</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-center">{t('stats.rank')}</th>
                  <th className="px-4 py-3 text-center">Rebuys</th>
                  <th className="px-4 py-3 text-center">Add-ons</th>
                </tr>
              </thead>
              <tbody>
                {stats.participations.map((participation) => (
                  <tr
                    key={participation.tournamentId}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-cream-100">
                      {participation.tournamentName}
                    </td>
                    <td className="px-4 py-3 text-xs text-cream-300/60">
                      {participation.status === 'COMPLETED'
                        ? 'Terminé'
                        : participation.status === 'RUNNING'
                          ? 'En cours'
                          : participation.status}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {participation.rank === 1 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-gold-300">
                          <Crown className="size-3.5" />1
                        </span>
                      ) : (
                        <span className="text-cream-200">{participation.rank ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-cream-300/70">
                      {participation.rebuys}
                    </td>
                    <td className="px-4 py-3 text-center text-cream-300/70">
                      {participation.addOns}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {results.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-cream-50">Derniers résultats classés</h2>
          <div className="space-y-2">
            {results.slice(0, 10).map((result) => (
              <div
                key={result.tournamentId}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
              >
                <span
                  className={`grid size-8 place-items-center rounded-lg text-sm font-bold ${
                    result.rank === 1
                      ? 'bg-gold-500/20 text-gold-300'
                      : 'bg-white/5 text-cream-300/70'
                  }`}
                >
                  {result.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-cream-100">
                    {result.tournamentName}
                  </p>
                  <p className="text-xs text-cream-300/50">
                    {result.startedAt ? formatDateShort(result.startedAt) : '—'}
                  </p>
                </div>
                <span className="text-xs text-cream-300/50">
                  {result.rebuys > 0 ? `${result.rebuys} R` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
