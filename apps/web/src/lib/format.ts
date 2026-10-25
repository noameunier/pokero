import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TournamentStatus } from './types';

export function formatChips(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

export function formatDate(value: string | null | undefined, locale = 'fr-FR'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDateShort(value: string | null | undefined, locale = 'fr-FR'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

export function statusTone(status: TournamentStatus): string {
  switch (status) {
    case 'RUNNING':
      return 'bg-success-500/20 text-emerald-200 ring-1 ring-success-500/40';
    case 'PAUSED':
      return 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30';
    case 'COMPLETED':
      return 'bg-white/10 text-cream-200 ring-1 ring-white/15';
    case 'CANCELLED':
      return 'bg-red-500/15 text-red-200 ring-1 ring-red-500/30';
    case 'DRAFT':
      return 'bg-white/5 text-cream-300 ring-1 ring-white/10';
    default:
      return 'bg-felt-500/20 text-emerald-100 ring-1 ring-felt-500/40';
  }
}

export function useStatusLabel(): (status: TournamentStatus) => string {
  const { t } = useTranslation();
  return useCallback((status: TournamentStatus) => t(`status.${status}`), [t]);
}

export function useApiErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
        const code = String((error as { code: unknown }).code);
        const key = `errors.${code}`;
        const translated = t(key, { defaultValue: '' });
        if (translated) return translated;
        return String((error as { message: unknown }).message);
      }
      return t('common.error');
    },
    [t],
  );
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return useMemo(() => (i18n.language === 'en' ? 'en-GB' : 'fr-FR'), [i18n.language]);
}
