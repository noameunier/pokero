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
import { PlayerChipTracker } from '../components/PlayerChipTracker';

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
      <div className="grid min-h-dvh place-items-center text-cream-300">
        {t('common.loading')}
      </div>
    );
  }

  if (invalid || !payload) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-[var(--radius-lg)] border border-white/[0.08] bg-white/[0.03] text-cream-400">
            <Spade className="size-7" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-3xl text-cream-50">{t('spectator.invalid')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-cream-400">
            Demandez un nouveau lien à l’organisateur du tournoi.
          </p>
          <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.3em] text-cream-500">
            Pokero
          </p>
        </div>
      </div>
    );
  }

  const isLive = payload.tournament.status === 'RUNNING' || payload.tournament.status === 'PAUSED';
  const paused = payload.tournament.status === 'PAUSED';
  const ranking = payload.ranking;
  const active = payload.participants.filter((participant) => participant.status === 'ACTIVE');
  const eliminated = payload.participants
    .filter((participant) => participant.status === 'ELIMINATED')
    .sort((a, b) => (a.eliminationSequence ?? 0) - (b.eliminationSequence ?? 0));

  return (
    <div className="relative min-h-dvh overflow-hidden pb-12">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(900px_540px_at_50%_-20%,rgb(17_64_47/0.55),transparent_72%)]"
        aria-hidden
      />

      <header className="relative mx-auto max-w-3xl px-5 pt-10 text-center">
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.32em] text-gold-500">
          <Spade className="size-3.5" fill="currentColor" aria-hidden />
          Pokero · spectateur
        </div>
        <h1 className="mt-3 font-display text-[2.1rem] leading-tight text-cream-50 sm:text-[2.7rem]">
          {payload.tournament.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
          {isLive ? (
            <Badge tone={paused ? 'warning' : 'success'} dot>
              {paused ? t('status.PAUSED') : t('spectator.live')}
            </Badge>
          ) : (
            <Badge>{payload.tournament.status === 'COMPLETED' ? 'Terminé' : t('spectator.waiting')}</Badge>
          )}
          <span className="inline-flex items-center gap-1.5 text-sm text-cream-300">
            <Users className="size-4" aria-hidden />
            <span className="tabular font-semibold text-cream-100">{payload.activePlayers}</span>
            en course · {payload.participants.length} inscrits
          </span>
        </div>
      </header>

      <main className="relative mx-auto mt-7 max-w-3xl space-y-4 px-4 sm:px-5">
        <section className="card-command p-5 text-center sm:p-7" aria-label="Chronomètre">
          {clock ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.035] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cream-300">
                  {clock.kind === 'BREAK' ? (
                    <>
                      <Coffee className="size-3.5" aria-hidden /> Pause
                    </>
                  ) : (
                    <>Niveau {clock.playLevelNumber ?? 'N/A'}</>
                  )}
                </span>
                {paused ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-warning-300">
                    <span className="size-1.5 rounded-full bg-warning-400" aria-hidden />
                    En pause
                  </span>
                ) : null}
              </div>

              <div
                className={`clock-digits mt-3 ${
                  remaining <= 60_000 && clock.status === 'RUNNING'
                    ? 'text-gold-300'
                    : 'text-cream-50'
                }`}
                style={{ fontSize: 'clamp(4rem, 18vw, 7.5rem)' }}
                aria-label={`Temps restant : ${formatDuration(remaining)}`}
              >
                {formatDuration(remaining)}
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-center gap-x-8 gap-y-3">
                {clock.kind === 'BREAK' ? (
                  <span className="font-display text-xl text-cream-300">Profitez de la pause</span>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-cream-400">
                        Petite
                      </div>
                      <div className="tabular mt-0.5 text-xl font-bold text-cream-50">
                        {formatChips(clock.smallBlind)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-gold-500">
                        Grosse
                      </div>
                      <div className="tabular mt-0.5 font-display text-3xl text-gold-300">
                        {formatChips(clock.bigBlind)}
                      </div>
                    </div>
                    {clock.ante ? (
                      <div className="text-center">
                        <div className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-cream-400">
                          Ante
                        </div>
                        <div className="tabular mt-0.5 text-xl font-bold text-cream-50">
                          {formatChips(clock.ante)}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="mx-auto mt-5 max-w-xl">
                <ClockProgress clock={clock} remainingMs={remaining} />
              </div>

              {clock.upcoming.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-cream-400">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-cream-500">
                    À suivre
                  </span>
                  {clock.upcoming.slice(0, 3).map((segment) => (
                    <span
                      key={segment.index}
                      className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2.5 py-1 text-cream-300"
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
            <p className="py-10 text-sm text-cream-400">{t('spectator.waiting')}</p>
          )}
        </section>

        {payload.display.showPlayers ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cream-400">
                <Users className="size-3.5 text-success-400" aria-hidden />
                En course · {active.length}
              </h2>
              {active.length === 0 ? (
                <p className="mt-3 text-sm text-cream-400">Aucun joueur.</p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {active.map((participant) => (
                    <li
                      key={participant.id}
                      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-white/[0.02]"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-success-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-cream-100">
                        {participant.displayName}
                      </span>
                      {participant.rebuyCount > 0 ? (
                        <span className="text-[10px] tabular text-cream-500">
                          {participant.rebuyCount} R
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-4">
              <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cream-400">
                <Trophy className="size-3.5 text-gold-500" aria-hidden />
                Éliminés · {eliminated.length}
              </h2>
              {eliminated.length === 0 ? (
                <p className="mt-3 text-sm text-cream-400">Personne pour l’instant.</p>
              ) : (
                <ul className="mt-3 space-y-0.5">
                  {eliminated.map((participant) => (
                    <li
                      key={participant.id}
                      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm"
                    >
                      <span className="w-5 shrink-0 text-center text-[10px] font-semibold tabular text-cream-500">
                        {participant.eliminationSequence}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-cream-400">
                        {participant.displayName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {isLive && payload.display.showPlayers && payload.participants.length > 0 ? (
          <PlayerChipTracker
            tournamentId={payload.tournament.id}
            participants={payload.participants}
            startingStack={payload.startingStack}
            levelNumber={clock?.playLevelNumber ?? null}
          />
        ) : null}

        {payload.display.showRanking && ranking && ranking.length > 0 ? (
          <section className="card p-4 sm:p-5">
            <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-500">
              <Crown className="size-3.5" aria-hidden />
              {t('spectator.ranking')}
            </h2>
            <ol className="mt-3 space-y-1">
              {ranking.map((entry) => (
                <li
                  key={entry.participantId}
                  className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-sm ${
                    entry.rank === 1
                      ? 'bg-gold-500/[0.07] text-gold-200'
                      : 'text-cream-200'
                  }`}
                >
                  <span className="w-5 text-center text-[11px] font-bold tabular">
                    {entry.rank === 1 ? (
                      <Trophy className="mx-auto size-3.5 text-gold-400" aria-hidden />
                    ) : (
                      entry.rank
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.displayName}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <footer className="pt-3 text-center text-[10.5px] text-cream-500">
          Lien spectateur en lecture seule · Pokero
        </footer>
      </main>
    </div>
  );
}
