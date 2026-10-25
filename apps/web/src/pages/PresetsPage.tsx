import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock3, Plus, Trash2, WalletCards } from 'lucide-react';
import { api } from '../lib/api';
import { formatChips, formatMinutes } from '../lib/format';
import { useApiErrorMessage } from '../lib/format';
import type { Preset } from '../lib/types';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui';
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

export function PresetsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();

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

  if (query.isLoading) return <Spinner />;
  const presets = query.data?.presets ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-500/80">
            {t('preset.title')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-cream-50">{t('preset.title')}</h1>
          <p className="mt-1.5 text-sm text-cream-300/70">{t('preset.subtitle')}</p>
        </div>
        <Link to="/presets/nouveau" className="btn-primary">
          <Plus className="size-4" />
          {t('preset.new')}
        </Link>
      </header>

      {presets.length === 0 ? (
        <EmptyState
          icon={<WalletCards className="size-10" />}
          title={t('preset.empty')}
          description="Enregistrez une structure de blindes et une configuration de cave pour la réutiliser en un clic."
          action={
            <Link to="/presets/nouveau" className="btn-primary">
              <Plus className="size-4" />
              {t('preset.new')}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {presets.map((preset) => {
            const config = preset.config as PresetConfig;
            const totalLevels =
              config.blinds?.levels?.filter((level) => level.kind === 'PLAY').length ?? null;
            return (
              <Card key={preset.id} className="transition hover:border-gold-500/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-cream-50">{preset.name}</h2>
                    {preset.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-cream-300/60">
                        {preset.description}
                      </p>
                    ) : null}
                  </div>
                  {preset.archived ? <Badge>Archivé</Badge> : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Cave</div>
                    <div className="tabular font-semibold text-cream-50">
                      {formatChips(config.buyIn?.targetBuyIn)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Joueurs</div>
                    <div className="tabular font-semibold text-cream-50">{config.buyIn?.players ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Durée</div>
                    <div className="font-semibold text-cream-50">
                      {config.blinds ? formatMinutes(config.blinds.targetDurationMinutes) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Niveaux</div>
                    <div className="font-semibold text-cream-50">{totalLevels ?? 'auto'}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                  <Button
                    size="sm"
                    onClick={() => navigate(`/tournois/nouveau?preset=${preset.id}`)}
                  >
                    {t('preset.use')}
                  </Button>
                  <Link to={`/presets/${preset.id}`} className="btn-secondary btn-sm">
                    {t('common.edit')}
                  </Link>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-cream-300/50">
                    <Clock3 className="size-3.5" />
                    {t('preset.version', { version: preset.versionsCount })}
                  </span>
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    onClick={() => {
                      if (window.confirm(`Supprimer le preset « ${preset.name} » ?`)) {
                        deleteMutation.mutate(preset.id);
                      }
                    }}
                    className="grid size-8 place-items-center rounded-lg text-cream-300/40 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
