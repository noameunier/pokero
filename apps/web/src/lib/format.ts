import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TournamentStatus } from './types';

export function formatChips(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
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
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDateShort(value: string | null | undefined, locale = 'fr-FR'): string {
  if (!value) return 'N/A';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

export function statusTone(status: TournamentStatus): string {
  switch (status) {
    case 'RUNNING':
      return 'border-success-500/30 bg-success-500/10 text-success-300';
    case 'PAUSED':
      return 'border-warning-500/30 bg-warning-500/10 text-warning-300';
    case 'COMPLETED':
      return 'border-white/10 bg-white/[0.04] text-cream-300';
    case 'CANCELLED':
      return 'border-danger-500/30 bg-danger-500/10 text-danger-300';
    case 'DRAFT':
      return 'border-white/10 bg-white/[0.03] text-cream-400';
    default:
      return 'border-gold-500/30 bg-gold-500/10 text-gold-300';
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
      return t('common.unreachable');
    },
    [t],
  );
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return useMemo(() => (i18n.language === 'en' ? 'en-GB' : 'fr-FR'), [i18n.language]);
}
