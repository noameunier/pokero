import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Coffee, Crown, Spade, Trophy, Users } from 'lucide-react';
import { api } from '../lib/api';
import { formatChips, formatDuration } from '../lib/format';
import { useTournamentSocket } from '../lib/realtime';
import type { SpectatorPayload } from '../lib/types';
import { Badge } from '../components/ui';
import { ClockProgress, useServerSyncedRemaining } from '../components/Clock';

export function SpectatorPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const [invalid, setInvalid] = useState(false);

  const query = useQuery({
    queryKey: ['public-tournament', token],
    queryFn: () => api.get<SpectatorPayload>(`/api/public/tournaments/${token}`),
    enabled: Boolean(token),
    retry: false,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (query.isError) setInvalid(true);
  }, [query.isError]);

  const socket = useTournamentSocket(query.data?.tournament.id, token);
  const payload = socket.spectator ?? query.data ?? null;
  const clock = payload?.clock ?? null;
  const remaining = useServerSyncedRemaining(clock);

  if (query.isLoading && !payload) {
    return (
      <div className="grid min-h-dvh place-items-center text-cream-300/60">
        {t('common.loading')}
      </div>
    );
  }

  if (invalid || !payload) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/5 text-cream-300/60">
            <Spade className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-cream-50">
            {t('spectator.invalid')}
          </h1>
          <p className="mt-2 text-sm text-cream-300/60">
            Demandez un nouveau lien à l’organisateur du tournoi.
          </p>
          <p className="mt-6 text-xs text-cream-300/30">Pokero</p>
        </div>
      </div>
    );
  }

  const isLive = payload.tournament.status === 'RUNNING' || payload.tournament.status === 'PAUSED';
  const ranking = payload.ranking;
  const eliminated = payload.participants.filter(
    (participant) => participant.status === 'ELIMINATED',
  );

  return (
    <div className="relative min-h-dvh overflow-hidden pb-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(900px_500px_at_50%_-20%,#12624a_0%,transparent_70%)]" />

      <header className="relative mx-auto max-w-3xl px-5 pt-8 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-gold-500/70">
          <Spade className="size-3.5" fill="currentColor" />
          Pokero
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-cream-50">
          {payload.tournament.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-cream-300/70">
          {isLive ? (
            <span className="badge bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30">
              <span className="size-1.5 animate-pulse-gold rounded-full bg-emerald-400" />
              {t('spectator.live')}
            </span>
          ) : (
            <Badge>
              {payload.tournament.status === 'COMPLETED' ? 'Terminé' : t('spectator.waiting')}
            </Badge>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" />
            {payload.activePlayers} / {payload.participants.length}
          </span>
        </div>
      </header>

      <main className="relative mx-auto mt-6 max-w-3xl space-y-5 px-4 sm:px-5">
        <section className="card p-5 text-center sm:p-7">
          {clock ? (
            <>
              <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-cream-300/60">
                {clock.kind === 'BREAK' ? (
                  <>
                    <Coffee className="size-4" /> Pause
                  </>
                ) : (
                  <>Niveau {clock.playLevelNumber ?? '—'}</>
                )}
                {clock.status === 'PAUSED' ? <span className="text-amber-300">· En pause</span> : null}
              </div>
              <div
                className={`clock-digits mt-2 font-display font-bold leading-none ${
                  remaining <= 60_000 && clock.status === 'RUNNING'
                    ? 'text-gold-400 animate-pulse-gold'
                    : 'text-cream-50'
                }`}
                style={{ fontSize: 'clamp(3.5rem, 18vw, 7rem)' }}
              >
                {formatDuration(remaining)}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
                {clock.kind === 'BREAK' ? (
                  <span className="text-cream-300/70">Prochaine pause</span>
                ) : (
                  <>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-cream-300/40">SB </span>
                      <span className="tabular font-semibold text-cream-50">
                        {formatChips(clock.smallBlind)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-cream-300/40">BB </span>
                      <span className="tabular font-display text-lg font-bold text-gold-400">
                        {formatChips(clock.bigBlind)}
                      </span>
                    </div>
                    {clock.ante ? (
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-cream-300/40">
                          Ante{' '}
                        </span>
                        <span className="tabular font-semibold text-cream-50">
                          {formatChips(clock.ante)}
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="mt-4">
                <ClockProgress clock={clock} remainingMs={remaining} />
              </div>
              {clock.upcoming.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-cream-300/50">
                  <span className="uppercase tracking-wider">À suivre</span>
                  {clock.upcoming.slice(0, 3).map((segment) => (
                    <span
                      key={segment.index}
                      className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10"
                    >
                      {segment.kind === 'BREAK'
                        ? 'Pause'
                        : `${formatChips(segment.smallBlind)} / ${formatChips(segment.bigBlind)}`}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="py-10 text-sm text-cream-300/60">{t('spectator.waiting')}</p>
          )}
        </section>

        {payload.display.showPlayers ? (
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cream-300/60">
                <Users className="size-4" /> {t('spectator.players')}
              </h2>
              {payload.participants.filter((participant) => participant.status === 'ACTIVE').length === 0 ? (
                <p className="text-sm text-cream-300/50">Aucun joueur.</p>
              ) : (
                <ul className="space-y-1.5">
                  {payload.participants
                    .filter((participant) => participant.status === 'ACTIVE')
                    .map((participant) => (
                      <li
                        key={participant.id}
                        className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        <span className="flex-1 truncate text-cream-100">
                          {participant.displayName}
                        </span>
                        {participant.rebuyCount > 0 ? (
                          <span className="text-[11px] text-cream-300/40">
                            {participant.rebuyCount}R
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cream-300/60">
                <Trophy className="size-4" /> Éliminés
              </h2>
              {eliminated.length === 0 ? (
                <p className="text-sm text-cream-300/50">Personne pour l’instant.</p>
              ) : (
                <ul className="space-y-1.5">
                  {eliminated
                    .sort((a, b) => (a.eliminationSequence ?? 0) - (b.eliminationSequence ?? 0))
                    .map((participant) => (
                      <li
                        key={participant.id}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream-300/50"
                      >
                        <span className="w-5 text-center text-[11px] tabular">
                          {participant.eliminationSequence}
                        </span>
                        <span className="flex-1 truncate">{participant.displayName}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {payload.display.showRanking && ranking ? (
          <section className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cream-300/60">
              <Crown className="size-4" /> {t('spectator.ranking')}
            </h2>
            <ol className="space-y-1.5">
              {ranking.map((entry) => (
                <li
                  key={entry.participantId}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    entry.rank === 1
                      ? 'bg-gold-500/10 text-gold-200'
                      : 'bg-white/[0.02] text-cream-200/80'
                  }`}
                >
                  <span className="w-6 text-center font-bold tabular">
                    {entry.rank === 1 ? <Trophy className="mx-auto size-4" /> : entry.rank}
                  </span>
                  <span className="flex-1 truncate">{entry.displayName}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <footer className="pt-2 text-center text-xs text-cream-300/30">
          Lien spectateur en lecture seule · Pokero
        </footer>
      </main>
    </div>
  );
}
