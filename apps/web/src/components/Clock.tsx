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
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

export function ClockFace({
  clock,
  remainingMs,
  size = 'md',
  compact = false,
}: {
  clock: ClockView;
  remainingMs: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const isBreak = clock.kind === 'BREAK';
  const urgent = remainingMs <= 60_000 && clock.status === 'RUNNING';
  const digits =
    size === 'xl'
      ? 'text-[clamp(3.5rem,16vw,11rem)]'
      : size === 'lg'
        ? 'text-[clamp(3rem,11vw,7rem)]'
        : size === 'md'
          ? 'text-5xl sm:text-6xl'
          : 'text-3xl';

  return (
    <div className={`text-center ${compact ? '' : 'py-4'}`}>
      <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-cream-300/60">
        {isBreak ? <Coffee className="size-4" /> : <Timer className="size-4" />}
        {isBreak
          ? t('common.break')
          : clock.playLevelNumber !== null
            ? `${t('common.level')} ${clock.playLevelNumber}`
            : ''}
        {clock.status === 'PAUSED' ? <span className="text-amber-300">· {t('status.PAUSED')}</span> : null}
      </div>

      <div
        className={`clock-digits mt-1 font-display font-bold leading-none ${digits} ${
          urgent ? 'text-gold-400 animate-pulse-gold' : 'text-cream-50'
        }`}
      >
        {formatDuration(remainingMs)}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-cream-200/80">
        {isBreak ? (
          <span className="text-cream-300/70">{t('common.break')}</span>
        ) : (
          <>
            <span>
              <span className="text-cream-300/50">SB</span>{' '}
              <strong className="tabular text-cream-50">{formatChips(clock.smallBlind)}</strong>
            </span>
            <span>
              <span className="text-cream-300/50">BB</span>{' '}
              <strong className="tabular text-cream-50">{formatChips(clock.bigBlind)}</strong>
            </span>
            {clock.ante ? (
              <span>
                <span className="text-cream-300/50">Ante</span>{' '}
                <strong className="tabular text-cream-50">{formatChips(clock.ante)}</strong>
              </span>
            ) : null}
          </>
        )}
      </div>

      {clock.upcoming.length > 0 && !compact ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-cream-300/60">
          <span className="uppercase tracking-wider">Suivant</span>
          {clock.upcoming.slice(0, 3).map((segment) => (
            <span key={segment.index} className="rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">
              {segment.kind === 'BREAK'
                ? t('common.break')
                : `${formatChips(segment.smallBlind)} / ${formatChips(segment.bigBlind)}`}
            </span>
          ))}
        </div>
      ) : null}

      {clock.structureExhausted ? (
        <p className="mt-4 text-sm font-medium text-amber-300">{t('tournament.structureExhausted')}</p>
      ) : null}
    </div>
  );
}

export function ClockProgress({ clock, remainingMs }: { clock: ClockView; remainingMs: number }) {
  const ratio =
    clock.segmentDurationMs > 0
      ? Math.max(0, Math.min(1, remainingMs / clock.segmentDurationMs))
      : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${
          ratio < 0.15 ? 'bg-amber-400' : 'bg-gold-500'
        }`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
