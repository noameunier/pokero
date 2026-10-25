import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Coffee, Maximize2, Minimize2, Trophy, Users } from 'lucide-react';
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

  const nextLevels = useMemo(() => clock?.upcoming.slice(0, 3) ?? [], [clock]);

  if (detailQuery.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center text-cream-300/60">{t('common.loading')}</div>
    );
  }

  const tournament = detailQuery.data?.tournament;
  if (!tournament) {
    return (
      <div className="grid min-h-dvh place-items-center">
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

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden bg-felt-950 px-5 py-6 sm:px-10"
      onPointerDown={unlockChime}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_700px_at_50%_-10%,#0f4a37_0%,transparent_65%)]" />

      <header className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/tournois/${id}`}
            className="btn-ghost btn-sm p-2 text-cream-300/50 hover:text-white"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold-500/70">
              Pokero
            </p>
            <h1 className="font-display text-xl font-bold text-cream-50 sm:text-2xl">
              {tournament.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm text-cream-300/70">
            <Users className="size-4" />
            {activePlayers} en course
          </span>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="btn-secondary btn-sm p-2"
            aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center py-8">
        {clock ? (
          <>
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.35em] text-cream-300/60">
              {clock.kind === 'BREAK' ? (
                <>
                  <Coffee className="size-5" /> Pause
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
              style={{ fontSize: 'clamp(5rem, 24vw, 20rem)' }}
            >
              {formatDuration(remaining)}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-12 gap-y-3">
              {clock.kind === 'BREAK' ? (
                <p className="font-display text-3xl text-cream-200">Prochaine pause</p>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-[0.3em] text-cream-300/40">
                      Petite blinde
                    </div>
                    <div className="font-display text-4xl font-bold text-cream-50 sm:text-5xl">
                      {formatChips(clock.smallBlind)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-[0.3em] text-cream-300/40">
                      Grosse blinde
                    </div>
                    <div className="font-display text-5xl font-bold text-gold-400 sm:text-6xl">
                      {formatChips(clock.bigBlind)}
                    </div>
                  </div>
                  {clock.ante ? (
                    <div className="text-center">
                      <div className="text-xs uppercase tracking-[0.3em] text-cream-300/40">Ante</div>
                      <div className="font-display text-4xl font-bold text-cream-50 sm:text-5xl">
                        {formatChips(clock.ante)}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="mt-8 w-full max-w-3xl">
              <ClockProgress clock={clock} remainingMs={remaining} />
            </div>

            {nextLevels.length > 0 ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-cream-300/50">
                <span className="uppercase tracking-wider">À suivre</span>
                {nextLevels.map((segment) => (
                  <span
                    key={segment.index}
                    className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10"
                  >
                    {segment.kind === 'BREAK'
                      ? 'Pause'
                      : `${formatChips(segment.smallBlind)} / ${formatChips(segment.bigBlind)}`}
                  </span>
                ))}
              </div>
            ) : null}

            {clock.structureExhausted ? (
              <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-950/30 px-4 py-2 text-sm text-amber-200">
                {t('tournament.structureExhausted')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-cream-300/60">Le tournoi n’a pas encore démarré.</p>
        )}
      </main>

      <footer className="relative flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-2 text-xs text-cream-300/40">
          <span
            className={`size-1.5 rounded-full ${socket.connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
          />
          {socket.connected ? 'Synchronisé' : 'Reconnexion…'}
        </div>
        {tournament.publicRanking && detailQuery.data?.ranking ? (
          <div className="flex items-center gap-2 overflow-x-auto text-sm text-cream-200/70">
            <Trophy className="size-4 shrink-0 text-gold-500" />
            {detailQuery.data.ranking.entries.slice(0, 3).map((entry) => (
              <span key={entry.participantId} className="whitespace-nowrap">
                {entry.rank}.{' '}
                {tournament.participants.find((p) => p.id === entry.participantId)?.displayName ??
                  '—'}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-cream-300/30">pokero.noameunier.fr</span>
        )}
      </footer>
    </div>
  );
}
