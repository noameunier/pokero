import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Clock3,
  Copy,
  Layers3,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatChips, formatDateShort, formatMinutes, useApiErrorMessage } from '../lib/format';
import type { Preset } from '../lib/types';
import { Badge, ConfirmDialog, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

interface PresetConfig {
  buyIn?: { players: number; targetBuyIn: number; startingStack: number };
  blinds?: {
    autoGenerate: boolean;
    targetDurationMinutes: number;
    levelDurationMinutes: number;
    levelDuration?: number;
    levels?: Array<{ durationMinutes: number; kind: string }>;
  };
  rebuy?: { enabled: boolean; unlimited: boolean };
  addOn?: { enabled: boolean };
}

function PresetMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-cream-500" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.13em] text-cream-500">
          {label}
        </span>
        <span className="tabular block truncate text-[13px] font-semibold text-cream-100">
          {value}
        </span>
      </span>
    </div>
  );
}

export function PresetsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Preset | null>(null);

  const query = useQuery({
    queryKey: ['presets'],
    queryFn: () => api.get<{ presets: Preset[] }>('/api/presets'),
  });

  const deleteMutation = useMutation({
    mutationFn: (presetId: string) => api.delete(`/api/presets/${presetId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['presets'] });
      success('Preset supprimé.');
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const duplicateMutation = useMutation({
    mutationFn: (preset: Preset) =>
      api.post<{ preset: Preset }>('/api/presets', {
        name: `${preset.name} (copie)`.slice(0, 80),
        description: preset.description,
        config: preset.config,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['presets'] });
      success('Preset dupliqué.');
      navigate(`/presets/${data.preset.id}`);
    },
    onError: (caught) => notifyError(errorMessage(caught)),
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
  const presets = query.data?.presets ?? [];
  const archivedCount = presets.filter((preset) => preset.archived).length;
  const visible = showArchived ? presets : presets.filter((preset) => !preset.archived);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bibliothèque"
        title={t('preset.title')}
        description={t('preset.subtitle')}
        actions={
          <Link to="/presets/nouveau" className="btn-primary">
            <Plus className="size-4" aria-hidden />
            {t('preset.new')}
          </Link>
        }
      />

      {presets.length === 0 ? (
        <EmptyState
          icon={<WalletCards className="size-6" aria-hidden />}
          title={t('preset.empty')}
          description="Enregistrez une structure de blindes et une configuration de cave pour la réutiliser en un clic, soirée après soirée."
          action={
            <Link to="/presets/nouveau" className="btn-primary">
              <Plus className="size-4" aria-hidden />
              {t('preset.new')}
            </Link>
          }
        />
      ) : (
        <>
          {archivedCount > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-cream-400">
                {showArchived ? 'Tous les presets' : 'Presets actifs'}
              </p>
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="text-xs font-semibold text-gold-400 hover:text-gold-300"
              >
                {showArchived ? 'Masquer les archives' : `Voir les archives (${archivedCount})`}
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((preset) => {
              const config = preset.config as PresetConfig;
              const totalLevels =
                config.blinds?.levels?.filter((level) => level.kind === 'PLAY').length ?? null;
              const isBusy = duplicateMutation.isPending || deleteMutation.isPending;

              return (
                <article
                  key={preset.id}
                  className={`card group flex flex-col p-5 transition-colors hover:border-gold-500/25 ${
                    preset.archived ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-display text-[1.45rem] leading-tight text-cream-50">
                          {preset.name}
                        </h2>
                        {preset.archived ? <Badge>Archivé</Badge> : null}
                      </div>
                      {preset.description ? (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-cream-400">
                          {preset.description}
                        </p>
                      ) : (
                        <p className="mt-1 text-[13px] text-cream-500">
                          Mis à jour le {formatDateShort(preset.updatedAt)}
                        </p>
                      )}
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold-500/15 bg-gold-500/[0.06] text-gold-500">
                      <Sparkles className="size-4" aria-hidden />
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-white/[0.06] py-3.5">
                    <PresetMetric
                      icon={<WalletCards className="size-3.5" aria-hidden />}
                      label="Cave"
                      value={`${formatChips(config.buyIn?.targetBuyIn)}`}
                    />
                    <PresetMetric
                      icon={<Users className="size-3.5" aria-hidden />}
                      label="Joueurs"
                      value={String(config.buyIn?.players ?? 'N/A')}
                    />
                    <PresetMetric
                      icon={<Clock3 className="size-3.5" aria-hidden />}
                      label="Durée"
                      value={
                        config.blinds ? formatMinutes(config.blinds.targetDurationMinutes) : 'N/A'
                      }
                    />
                    <PresetMetric
                      icon={<Layers3 className="size-3.5" aria-hidden />}
                      label="Niveaux"
                      value={totalLevels ? String(totalLevels) : 'Auto'}
                    />
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3.5">
                    <Link
                      to={`/tournois/nouveau?preset=${preset.id}`}
                      className="btn-primary btn-sm"
                    >
                      <ArrowRight className="size-3.5" aria-hidden />
                      {t('preset.use')}
                    </Link>
                    <Link to={`/presets/${preset.id}`} className="btn-secondary btn-sm">
                      <Pencil className="size-3.5" aria-hidden />
                      {t('common.edit')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => duplicateMutation.mutate(preset)}
                      disabled={isBusy}
                      aria-label={`Dupliquer ${preset.name}`}
                      title="Dupliquer"
                      className="btn-ghost btn-sm btn-icon ml-auto text-cream-400 disabled:opacity-40"
                    >
                      <Copy className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(preset)}
                      disabled={isBusy}
                      aria-label={`Supprimer ${preset.name}`}
                      title={t('common.delete')}
                      className="btn-ghost btn-sm btn-icon text-cream-500 hover:bg-danger-500/10 hover:text-danger-300 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>

                  <p className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] text-cream-500">
                    <span className="size-1 rounded-full bg-cream-500/60" aria-hidden />
                    {t('preset.version', { version: preset.versionsCount })}
                  </p>
                </article>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-white/[0.08] px-4 py-10 text-center text-sm text-cream-400">
              Aucun preset actif.
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Supprimer ce preset ?"
        description={`Le preset « ${pendingDelete?.name ?? ''} » sera supprimé. Les tournois déjà créés ne sont pas modifiés.`}
        confirmLabel="Supprimer"
        loading={deleteMutation.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMutation.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) });
        }}
      />
    </div>
  );
}
