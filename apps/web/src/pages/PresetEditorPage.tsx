import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../lib/api';
import { useApiErrorMessage } from '../lib/format';
import type { ChipCase, Preset } from '../lib/types';
import { Button, Card, Field, Input, Select, Spinner, Switch } from '../components/ui';
import { useToast } from '../components/Toast';

interface PresetConfig {
  defaultChipCaseId: string | null;
  buyIn: {
    players: number;
    targetBuyIn: number;
    startingStack: number;
    mode: 'AUTO' | 'MANUAL';
    counts: Record<string, number>;
    commonEnabled: Record<string, boolean>;
    commonCount: number;
    maxChipsPerPlayer: number;
  };
  blinds: {
    autoGenerate: boolean;
    targetDurationMinutes: number;
    levelDurationMinutes: number;
    breakDurationMinutes: number;
    breakEveryLevels: number;
    roundUnit: number;
    anteFromLevel: number;
    antePercentOfBigBlind: number;
    growthFactor?: number;
    levels?: Array<{
      kind: 'PLAY' | 'BREAK';
      smallBlind: number | null;
      bigBlind: number | null;
      ante: number | null;
      durationMinutes: number;
    }>;
  };
  rebuy: {
    enabled: boolean;
    unlimited: boolean;
    maxPerPlayer: number | null;
    value: number | null;
    untilLevel: number | null;
  };
  addOn: {
    enabled: boolean;
    value: number | null;
    atLevel: number | null;
    limitPerPlayer: number;
  };
  alerts: { soundBeforeLevel: boolean; soundAtLevel: boolean; vibration: boolean; volume: number };
  display: { showRanking: boolean; showPlayers: boolean };
}

export function defaultPresetConfig(): PresetConfig {
  return {
    defaultChipCaseId: null,
    buyIn: {
      players: 8,
      targetBuyIn: 10_000,
      startingStack: 10_000,
      mode: 'AUTO',
      counts: {},
      commonEnabled: {},
      commonCount: 0,
      maxChipsPerPlayer: 60,
    },
    blinds: {
      autoGenerate: true,
      targetDurationMinutes: 180,
      levelDurationMinutes: 20,
      breakDurationMinutes: 15,
      breakEveryLevels: 4,
      roundUnit: 25,
      anteFromLevel: 5,
      antePercentOfBigBlind: 0.125,
    },
    rebuy: {
      enabled: true,
      unlimited: true,
      maxPerPlayer: null,
      value: null,
      untilLevel: 6,
    },
    addOn: {
      enabled: false,
      value: null,
      atLevel: null,
      limitPerPlayer: 1,
    },
    alerts: { soundBeforeLevel: true, soundAtLevel: true, vibration: true, volume: 0.8 },
    display: { showRanking: true, showPlayers: true },
  };
}

function deepMergeConfig(base: PresetConfig, incoming: Partial<PresetConfig>): PresetConfig {
  return {
    ...base,
    ...incoming,
    buyIn: { ...base.buyIn, ...(incoming.buyIn ?? {}) },
    blinds: { ...base.blinds, ...(incoming.blinds ?? {}) },
    rebuy: { ...base.rebuy, ...(incoming.rebuy ?? {}) },
    addOn: { ...base.addOn, ...(incoming.addOn ?? {}) },
    alerts: { ...base.alerts, ...(incoming.alerts ?? {}) },
    display: { ...base.display, ...(incoming.display ?? {}) },
  };
}

export function PresetEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<PresetConfig>(defaultPresetConfig);
  const [initialized, setInitialized] = useState(isNew);
  const [formError, setFormError] = useState<string | null>(null);

  const presetQuery = useQuery({
    queryKey: ['preset', id],
    queryFn: () => api.get<{ preset: Preset }>(`/api/presets/${id}`),
    enabled: Boolean(id),
  });

  const chipCasesQuery = useQuery({
    queryKey: ['chip-cases'],
    queryFn: () => api.get<{ chipCases: ChipCase[] }>('/api/chip-cases'),
  });

  useEffect(() => {
    if (!presetQuery.data || initialized) return;
    const preset = presetQuery.data.preset;
    setName(preset.name);
    setDescription(preset.description ?? '');
    setConfig(deepMergeConfig(defaultPresetConfig(), preset.config as Partial<PresetConfig>));
    setInitialized(true);
  }, [presetQuery.data, initialized]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        config,
      };
      if (isNew) return api.post<{ preset: Preset }>('/api/presets', payload);
      return api.patch<{ preset: Preset }>(`/api/presets/${id}`, payload);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['presets'] });
      void queryClient.invalidateQueries({ queryKey: ['preset', data.preset.id] });
      success(isNew ? 'Preset créé.' : 'Preset enregistré.');
      if (isNew) navigate(`/presets/${data.preset.id}`, { replace: true });
    },
    onError: (caught) => notifyError(errorMessage(caught)),
  });

  const patchConfig = (patch: Partial<PresetConfig>) => setConfig((current) => ({ ...current, ...patch }));

  if (presetQuery.isLoading && !isNew) return <Spinner />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Le nom du preset est requis.');
      return;
    }
    if (config.buyIn.players < 2) {
      setFormError('Il faut au moins deux joueurs.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/presets" className="btn-ghost btn-sm p-2" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-cream-50 sm:text-3xl">
              {isNew ? t('preset.new') : t('preset.edit')}
            </h1>
            <p className="text-sm text-cream-300/60">{t('preset.subtitle')}</p>
          </div>
        </div>
        <Button size="sm" onClick={onSubmit} loading={saveMutation.isPending}>
          <Save className="size-4" />
          {t('common.save')}
        </Button>
      </header>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-cream-50">Identité</h2>
          <div className="space-y-4">
            <Field label={t('preset.name')}>
              <Input
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Soirée du vendredi"
              />
            </Field>
            <Field label={`${t('preset.description')} (${t('common.optional')})`}>
              <Input
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label={t('tournament.chipCase')}>
              <Select
                value={config.defaultChipCaseId ?? ''}
                onChange={(event) =>
                  patchConfig({ defaultChipCaseId: event.target.value || null })
                }
              >
                <option value="">— {t('common.none')} —</option>
                {(chipCasesQuery.data?.chipCases ?? [])
                  .filter((chipCase) => !chipCase.archived)
                  .map((chipCase) => (
                    <option key={chipCase.id} value={chipCase.id}>
                      {chipCase.name}
                    </option>
                  ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-cream-50">{t('tournament.stepChips')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('tournament.playersExpected')}>
              <Input
                type="number"
                min={2}
                max={200}
                value={config.buyIn.players}
                onChange={(event) =>
                  patchConfig({
                    buyIn: { ...config.buyIn, players: Number(event.target.value) || 2 },
                  })
                }
              />
            </Field>
            <Field label={t('tournament.buyIn')}>
              <Input
                type="number"
                min={1}
                step={100}
                value={config.buyIn.targetBuyIn}
                onChange={(event) => {
                  const value = Number(event.target.value) || 1;
                  patchConfig({
                    buyIn: { ...config.buyIn, targetBuyIn: value, startingStack: value },
                  });
                }}
              />
            </Field>
            <Field label={t('tournament.startingStack')}>
              <Input
                type="number"
                min={1}
                step={100}
                value={config.buyIn.startingStack}
                onChange={(event) =>
                  patchConfig({
                    buyIn: { ...config.buyIn, startingStack: Number(event.target.value) || 1 },
                  })
                }
              />
            </Field>
            <Field label="Jetons max / joueur">
              <Input
                type="number"
                min={5}
                max={200}
                value={config.buyIn.maxChipsPerPlayer}
                onChange={(event) =>
                  patchConfig({
                    buyIn: {
                      ...config.buyIn,
                      maxChipsPerPlayer: Number(event.target.value) || 60,
                    },
                  })
                }
              />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-cream-50">{t('tournament.stepBlinds')}</h2>
          <div className="space-y-3">
            <Switch
              label={t('tournament.autoStructure')}
              checked={config.blinds.autoGenerate}
              onChange={(checked) =>
                patchConfig({ blinds: { ...config.blinds, autoGenerate: checked } })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('tournament.targetDuration')}>
                <Input
                  type="number"
                  min={10}
                  max={1440}
                  value={config.blinds.targetDurationMinutes}
                  onChange={(event) =>
                    patchConfig({
                      blinds: {
                        ...config.blinds,
                        targetDurationMinutes: Number(event.target.value) || 60,
                      },
                    })
                  }
                />
              </Field>
              <Field label={t('tournament.levelDuration')}>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={config.blinds.levelDurationMinutes}
                  onChange={(event) =>
                    patchConfig({
                      blinds: {
                        ...config.blinds,
                        levelDurationMinutes: Number(event.target.value) || 20,
                      },
                    })
                  }
                />
              </Field>
              <Field label={t('tournament.breakDuration')}>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={config.blinds.breakDurationMinutes}
                  onChange={(event) =>
                    patchConfig({
                      blinds: {
                        ...config.blinds,
                        breakDurationMinutes: Number(event.target.value) || 0,
                      },
                    })
                  }
                />
              </Field>
              <Field label={t('tournament.breakEvery')}>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={config.blinds.breakEveryLevels}
                  onChange={(event) =>
                    patchConfig({
                      blinds: {
                        ...config.blinds,
                        breakEveryLevels: Number(event.target.value) || 0,
                      },
                    })
                  }
                />
              </Field>
              <Field label={t('tournament.roundUnit')}>
                <Input
                  type="number"
                  min={1}
                  value={config.blinds.roundUnit}
                  onChange={(event) =>
                    patchConfig({
                      blinds: { ...config.blinds, roundUnit: Number(event.target.value) || 25 },
                    })
                  }
                />
              </Field>
              <Field label="Ante à partir du niveau">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={config.blinds.anteFromLevel}
                  onChange={(event) =>
                    patchConfig({
                      blinds: {
                        ...config.blinds,
                        anteFromLevel: Number(event.target.value) || 1,
                      },
                    })
                  }
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-cream-50">Rebuys & add-ons</h2>
          <div className="space-y-3">
            <Switch
              label="Rebuys activés"
              checked={config.rebuy.enabled}
              onChange={(checked) =>
                patchConfig({ rebuy: { ...config.rebuy, enabled: checked } })
              }
            />
            {config.rebuy.enabled ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jusqu’au niveau">
                  <Input
                    type="number"
                    min={1}
                    value={config.rebuy.untilLevel ?? ''}
                    onChange={(event) =>
                      patchConfig({
                        rebuy: {
                          ...config.rebuy,
                          untilLevel: event.target.value ? Number(event.target.value) : null,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Maximum par joueur" hint="Vide = illimité">
                  <Input
                    type="number"
                    min={0}
                    value={config.rebuy.maxPerPlayer ?? ''}
                    onChange={(event) =>
                      patchConfig({
                        rebuy: {
                          ...config.rebuy,
                          unlimited: event.target.value === '',
                          maxPerPlayer: event.target.value ? Number(event.target.value) : null,
                        },
                      })
                    }
                  />
                </Field>
              </div>
            ) : null}
            <div className="divider" />
            <Switch
              label="Add-ons activés"
              checked={config.addOn.enabled}
              onChange={(checked) =>
                patchConfig({ addOn: { ...config.addOn, enabled: checked } })
              }
            />
            {config.addOn.enabled ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Valeur">
                  <Input
                    type="number"
                    min={1}
                    value={config.addOn.value ?? config.buyIn.targetBuyIn}
                    onChange={(event) =>
                      patchConfig({
                        addOn: { ...config.addOn, value: Number(event.target.value) || null },
                      })
                    }
                  />
                </Field>
                <Field label="Au niveau">
                  <Input
                    type="number"
                    min={1}
                    value={config.addOn.atLevel ?? ''}
                    onChange={(event) =>
                      patchConfig({
                        addOn: {
                          ...config.addOn,
                          atLevel: event.target.value ? Number(event.target.value) : null,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Limite">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={config.addOn.limitPerPlayer}
                    onChange={(event) =>
                      patchConfig({
                        addOn: {
                          ...config.addOn,
                          limitPerPlayer: Number(event.target.value) || 1,
                        },
                      })
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-cream-50">Affichage spectateur</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Switch
              label="Afficher le classement"
              checked={config.display.showRanking}
              onChange={(checked) =>
                patchConfig({ display: { ...config.display, showRanking: checked } })
              }
            />
            <Switch
              label="Afficher les joueurs"
              checked={config.display.showPlayers}
              onChange={(checked) =>
                patchConfig({ display: { ...config.display, showPlayers: checked } })
              }
            />
          </div>
          {formError ? <p className="field-error mt-4">{formError}</p> : null}
        </Card>
      </form>
    </div>
  );
}
