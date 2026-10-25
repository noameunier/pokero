import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Coffee,
  Maximize2,
  Minimize2,
  Spade,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatChips, formatDuration } from '../lib/format';
import { useTournamentSocket } from '../lib/realtime';
import type { TournamentDetail } from '../lib/types';
import { ClockProgress, useLevelChime, useServerSyncedRemaining } from '../components/Clock';

export function ProjectionPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.get<TournamentDetail>(`/api/tournaments/${id}`),
    enabled: Boolean(id),
  });

  const socket = useTournamentSocket(id);
  const clock = socket.clock ?? detailQuery.data?.tournament.clock ?? null;
  const remaining = useServerSyncedRemaining(clock);

  const chimeOptions = detailQuery.data?.tournament.settings?.alerts;
  const unlockChime = useLevelChime(clock, {
    enabled: Boolean(chimeOptions?.soundAtLevel ?? true),
    volume: chimeOptions?.volume ?? 0.8,
  });

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    unlockChime();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Le navigateur peut refuser sans geste utilisateur ; on ignore.
    }
  };

  const nextLevels = useMemo(() => clock?.upcoming.slice(0, 4) ?? [], [clock]);

  if (detailQuery.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center text-cream-300">{t('common.loading')}</div>
    );
  }

  const tournament = detailQuery.data?.tournament;
  if (!tournament) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="text-center">
          <p className="text-cream-200">Tournoi introuvable.</p>
          <Link to="/" className="btn-secondary mt-4">
            {t('common.back')}
          </Link>
        </div>
      </div>
    );
  }

  const activePlayers = tournament.participants.filter(
    (participant) => participant.status === 'ACTIVE',
  ).length;
  const paused = clock?.status === 'PAUSED';
  const urgent = remaining <= 60_000 && clock?.status === 'RUNNING';
  const ranking = detailQuery.data?.ranking?.entries ?? [];
  const displayName = (participantId: string) =>
    tournament.participants.find((participant) => participant.id === participantId)?.displayName ??
    'Joueur';

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden bg-night-950 px-4 py-4 sm:px-8 sm:py-6"
      onPointerDown={unlockChime}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_680px_at_50%_-15%,rgb(17_64_47/0.5),transparent_70%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(800px_400px_at_50%_110%,rgb(207_169_88/0.06),transparent_70%)]"
        aria-hidden
      />

      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={`/tournois/${id}`}
            className="btn-ghost btn-icon shrink-0 text-cream-400"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-gold-500">
              <Spade className="size-3" fill="currentColor" aria-hidden />
              Pokero · projection
            </p>
            <h1 className="mt-0.5 truncate font-display text-xl leading-tight text-cream-50 sm:text-2xl">
              {tournament.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden items-center gap-1.5 text-sm text-cream-300 sm:inline-flex">
            <Users className="size-4" aria-hidden />
            <span className="tabular font-semibold text-cream-100">{activePlayers}</span>
            <span className="text-cream-400">en course</span>
          </span>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="btn-secondary btn-icon"
            aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" aria-hidden />
            ) : (
              <Maximize2 className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col justify-center py-6 sm:py-8">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="text-center">
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] ${
                  clock?.kind === 'BREAK'
                    ? 'border-success-500/30 bg-success-500/10 text-success-300'
                    : 'border-white/10 bg-white/[0.035] text-cream-300'
                }`}
              >
                {clock?.kind === 'BREAK' ? (
                  <>
                    <Coffee className="size-3.5" aria-hidden /> Pause
                  </>
                ) : (
                  <>Niveau {clock?.playLevelNumber ?? 'N/A'}</>
                )}
              </span>
              {paused ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-500/30 bg-warning-500/10 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-warning-300">
                  <span className="size-1.5 rounded-full bg-warning-400" aria-hidden />
                  En pause
                </span>
              ) : null}
              {urgent ? (
                <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-gold-400">
                  Dernière minute
                </span>
              ) : null}
            </div>

            <div
              className={`clock-digits mt-4 ${urgent ? 'text-gold-300' : 'text-cream-50'}`}
              style={{ fontSize: 'clamp(4.5rem, 20vw, 17rem)' }}
              aria-label={`Temps restant : ${formatDuration(remaining)}`}
            >
              {clock ? formatDuration(remaining) : '--:--'}
            </div>

            {clock ? (
              <>
                <div className="mt-5 flex flex-wrap items-end justify-center gap-x-10 gap-y-4">
                  {clock.kind === 'BREAK' ? (
                    <p className="font-display text-2xl text-cream-200 sm:text-3xl">
                      Profitez de la pause
                    </p>
                  ) : (
                    <>
                      <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream-400">
                          Petite blinde
                        </div>
                        <div className="tabular mt-1 font-display text-3xl text-cream-100 sm:text-4xl">
                          {formatChips(clock.smallBlind)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gold-500">
                          Grosse blinde
                        </div>
                        <div className="tabular mt-1 font-display text-4xl font-semibold text-gold-300 sm:text-5xl">
                          {formatChips(clock.bigBlind)}
                        </div>
                      </div>
                      {clock.ante ? (
                        <div className="text-center">
                          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream-400">
                            Ante
                          </div>
                          <div className="tabular mt-1 font-display text-3xl text-cream-100 sm:text-4xl">
                            {formatChips(clock.ante)}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="mx-auto mt-7 w-full max-w-2xl">
                  <ClockProgress clock={clock} remainingMs={remaining} />
                </div>

                {clock.structureExhausted ? (
                  <p className="mt-5 inline-flex rounded-full border border-warning-500/30 bg-warning-500/10 px-4 py-2 text-sm font-semibold text-warning-300">
                    {t('tournament.structureExhausted')}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-6 text-cream-300">Le tournoi n’a pas encore démarré.</p>
            )}
          </div>

          <aside className="space-y-3">
            {nextLevels.length > 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-white/[0.07] bg-white/[0.02] p-4">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-cream-400">
                  À suivre
                </h2>
                <ul className="mt-3 space-y-2">
                  {nextLevels.map((segment, index) => (
                    <li
                      key={segment.index}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-white/[0.05] bg-night-950/30 px-3 py-2"
                    >
                      <span className="min-w-0 text-[11px] text-cream-400">
                        {segment.kind === 'BREAK'
                          ? 'Pause'
                          : `Niveau ${segment.playLevelNumber ?? index + 2}`}
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold text-cream-100">
                        {segment.kind === 'BREAK'
                          ? 'N/A'
                          : `${formatChips(segment.smallBlind)} / ${formatChips(segment.bigBlind)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tournament.publicRanking && ranking.length > 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-white/[0.07] bg-white/[0.02] p-4">
                <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-gold-500">
                  <Trophy className="size-3.5" aria-hidden />
                  Classement
                </h2>
                <ol className="mt-3 space-y-1.5">
                  {ranking.slice(0, 5).map((entry) => (
                    <li
                      key={entry.participantId}
                      className={`flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm ${
                        entry.rank === 1
                          ? 'bg-gold-500/[0.07] text-gold-200'
                          : 'text-cream-300'
                      }`}
                    >
                      <span className="w-4 text-center text-[11px] font-bold tabular text-cream-500">
                        {entry.rank}
                        {entry.tied ? '=' : ''}
                      </span>
                      <span className="truncate">{displayName(entry.participantId)}</span>
                    </li>
                  ))}
                </ol>
                {ranking.some((entry) => entry.tied) ? (
                  <p className="mt-2 text-[10px] text-cream-500">
                    « = » indique les joueurs ex æquo.
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </main>

      <footer className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-[11px] text-cream-500">
        <div className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${
              socket.connected ? 'bg-success-400' : 'bg-warning-400 animate-live'
            }`}
            aria-hidden
          />
          {socket.connected ? 'Synchronisé au serveur' : 'Reconnexion…'}
        </div>
        <span className="inline-flex items-center gap-1.5">
          <Spade className="size-3 text-gold-500" aria-hidden />
          pokero.noameunier.fr
        </span>
      </footer>
    </div>
  );
}
