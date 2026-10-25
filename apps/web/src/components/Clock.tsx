import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coffee, Timer } from 'lucide-react';
import type { ClockView } from '../lib/types';
import { formatChips, formatDuration } from '../lib/format';

/** Recale le temps restant sur l'horloge locale à partir de l'ancre serveur. */
export function useServerSyncedRemaining(clock: ClockView | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  return useMemo(() => {
    if (!clock) return 0;
    if (clock.status !== 'RUNNING' || clock.endsAt === null) return clock.remainingMs;
    const offset = clock.serverNow - now;
    return Math.max(0, clock.remainingMs + offset);
  }, [clock, now]);
}

export function useLevelChime(
  clock: ClockView | null | undefined,
  options: { enabled: boolean; volume: number },
): () => void {
  const previous = useRef<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const unlock = () => {
    if (typeof window === 'undefined') return;
    if (!contextRef.current) {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) contextRef.current = new AudioContextClass();
    }
    void contextRef.current?.resume();
  };

  useEffect(() => {
    if (!clock) return;
    const signature = `${clock.segmentIndex}:${clock.kind}`;
    if (previous.current === null) {
      previous.current = signature;
      return;
    }
    if (previous.current !== signature) {
      previous.current = signature;
      if (options.enabled && contextRef.current) {
        const context = contextRef.current;
        const gain = context.createGain();
        gain.gain.value = Math.max(0, Math.min(1, options.volume));
        gain.connect(context.destination);
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = clock.kind === 'BREAK' ? 520 : 760;
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.35);
        if (navigator.vibrate) navigator.vibrate(120);
      }
    }
  }, [clock, options.enabled, options.volume]);

  return unlock;
}

const digitSizes = {
  sm: 'text-[2.35rem]',
  md: 'text-[clamp(3.2rem,9vw,4.4rem)]',
  lg: 'text-[clamp(4rem,13vw,8.5rem)]',
  xl: 'text-[clamp(5rem,18vw,14rem)]',
} as const;

export function ClockFace({
  clock,
  remainingMs,
  size = 'md',
  compact = false,
  showUpcoming = true,
}: {
  clock: ClockView;
  remainingMs: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  compact?: boolean;
  showUpcoming?: boolean;
}) {
  const { t } = useTranslation();
  const isBreak = clock.kind === 'BREAK';
  const urgent = remainingMs <= 60_000 && clock.status === 'RUNNING';
  const paused = clock.status === 'PAUSED';

  return (
    <div className={`text-center ${compact ? '' : 'py-2'}`}>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] ${
            isBreak
              ? 'border-success-500/25 bg-success-500/10 text-success-300'
              : 'border-white/[0.09] bg-white/[0.035] text-cream-300'
          }`}
        >
          {isBreak ? <Coffee className="size-3.5" aria-hidden /> : <Timer className="size-3.5" aria-hidden />}
          {isBreak
            ? t('common.break')
            : clock.playLevelNumber !== null
              ? `${t('common.level')} ${clock.playLevelNumber}`
              : t('tournament.structure')}
        </span>
        {paused ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-warning-300">
            <span className="size-1.5 rounded-full bg-warning-400" aria-hidden />
            {t('status.PAUSED')}
          </span>
        ) : null}
        {urgent && !paused ? (
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold-400">
            Dernière minute
          </span>
        ) : null}
      </div>

      <div
        className={`clock-digits mt-3 ${digitSizes[size]} ${urgent ? 'text-gold-300' : 'text-cream-50'}`}
        aria-live="off"
        aria-label={`Temps restant : ${formatDuration(remainingMs)}`}
      >
        {formatDuration(remainingMs)}
      </div>

      {isBreak ? (
        <p className="mt-3 font-display text-xl text-cream-300">Profitez de la pause.</p>
      ) : (
        <div
          className={`mx-auto mt-4 grid max-w-md gap-2 ${clock.ante ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          <div className="rounded-[var(--radius-md)] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-cream-400">
              Petite blinde
            </div>
            <div className="tabular mt-0.5 text-lg font-bold text-cream-50">
              {formatChips(clock.smallBlind)}
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-gold-500/20 bg-gold-500/[0.06] px-3 py-2">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-gold-500">
              Grosse blinde
            </div>
            <div className="tabular mt-0.5 text-lg font-bold text-gold-300">
              {formatChips(clock.bigBlind)}
            </div>
          </div>
          {clock.ante ? (
            <div className="rounded-[var(--radius-md)] border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-cream-400">
                Ante
              </div>
              <div className="tabular mt-0.5 text-lg font-bold text-cream-50">
                {formatChips(clock.ante)}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showUpcoming && clock.upcoming.length > 0 && !compact ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cream-400">
            À suivre
          </span>
          {clock.upcoming.slice(0, 3).map((segment) => (
            <span
              key={segment.index}
              className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-cream-300"
            >
              {segment.kind === 'BREAK'
                ? t('common.break')
                : `${formatChips(segment.smallBlind)} / ${formatChips(segment.bigBlind)}`}
            </span>
          ))}
        </div>
      ) : null}

      {clock.structureExhausted ? (
        <p className="mt-4 inline-flex rounded-full border border-warning-500/30 bg-warning-500/10 px-3 py-1.5 text-xs font-semibold text-warning-300">
          {t('tournament.structureExhausted')}
        </p>
      ) : null}
    </div>
  );
}

export function ClockProgress({ clock, remainingMs }: { clock: ClockView; remainingMs: number }) {
  const ratio =
    clock.segmentDurationMs > 0
      ? Math.max(0, Math.min(1, remainingMs / clock.segmentDurationMs))
      : 0;
  const tone = ratio < 0.15 ? 'bg-warning-400' : 'bg-gold-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
