import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Clock3,
  Layers3,
  Save,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatChips, formatMinutes, useApiErrorMessage } from '../lib/format';
import type { ChipCase, Preset } from '../lib/types';
import { ChipCountEditor } from '../components/ChipCountEditor';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
} from '../components/ui';
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-[12px] text-cream-400">{label}</dt>
      <dd className="tabular text-right text-[13px] font-semibold text-cream-100">{value}</dd>
    </div>
  );
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

  const chipCases = useMemo(
    () => (chipCasesQuery.data?.chipCases ?? []).filter((chipCase) => !chipCase.archived),
    [chipCasesQuery.data],
  );
  const selectedChipCase =
    chipCases.find((chipCase) => chipCase.id === config.defaultChipCaseId) ?? null;

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

  const patchConfig = (patch: Partial<PresetConfig>) =>
    setConfig((current) => ({ ...current, ...patch }));
  const patchBuyIn = (patch: Partial<PresetConfig['buyIn']>) =>
    setConfig((current) => ({ ...current, buyIn: { ...current.buyIn, ...patch } }));
  const patchBlinds = (patch: Partial<PresetConfig['blinds']>) =>
    setConfig((current) => ({ ...current, blinds: { ...current.blinds, ...patch } }));

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
    if (config.buyIn.mode === 'MANUAL') {
      const total = selectedChipCase
        ? selectedChipCase.chipTypes.reduce(
            (sum, type) =>
              sum +
              (config.buyIn.commonEnabled[type.id]
                ? config.buyIn.commonCount
                : (config.buyIn.counts[type.id] ?? 0)),
            0,
          )
        : 0;
      if (total === 0) {
        setFormError('Renseignez au moins un jeton pour la cave manuelle.');
        return;
      }
    }
    saveMutation.mutate();
  };

  const manualTotal = selectedChipCase
    ? selectedChipCase.chipTypes.reduce(
        (sum, type) =>
          sum +
          (config.buyIn.commonEnabled[type.id]
            ? config.buyIn.commonCount
            : (config.buyIn.counts[type.id] ?? 0)),
        0,
      )
    : 0;
  const manualValue = selectedChipCase
    ? selectedChipCase.chipTypes.reduce(
        (sum, type) =>
          sum +
          type.value *
            (config.buyIn.commonEnabled[type.id]
              ? config.buyIn.commonCount
              : (config.buyIn.counts[type.id] ?? 0)),
        0,
      )
    : 0;
  const manualChipTypes = selectedChipCase?.chipTypes ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link to="/presets" className="btn-ghost btn-icon -ml-1" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.7rem] leading-tight text-cream-50 sm:text-[2rem]">
              {isNew ? t('preset.new') : t('preset.edit')}
            </h1>
            <p className="text-[11.5px] text-cream-400">{t('preset.subtitle')}</p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link to="/presets" className="btn-ghost btn-sm">
            {t('common.cancel')}
          </Link>
          <Button onClick={onSubmit} loading={saveMutation.isPending} className="flex-1 sm:flex-none">
            <Save className="size-4" aria-hidden />
            {t('common.save')}
          </Button>
        </div>
      </header>

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Identité</h2>
            <div className="mt-4 space-y-4">
              <Field label={t('preset.name')} htmlFor="preset-name">
                <Input
                  id="preset-name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Soirée du vendredi"
                />
              </Field>
              <Field
                label={`${t('preset.description')} (${t('common.optional')})`}
                htmlFor="preset-description"
              >
                <Input
                  id="preset-description"
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Repris chaque semaine, 8 joueurs, 3 heures"
                />
              </Field>
              <Field
                label={t('tournament.chipCase')}
                htmlFor="preset-chip-case"
                hint="Détermine les jetons disponibles pour la cave."
              >
                <Select
                  id="preset-chip-case"
                  value={config.defaultChipCaseId ?? ''}
                  onChange={(event) => patchConfig({ defaultChipCaseId: event.target.value || null })}
                >
                  <option value="">{t('common.none')}</option>
                  {chipCases.map((chipCase) => (
                    <option key={chipCase.id} value={chipCase.id}>
                      {chipCase.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">{t('tournament.stepChips')}</h2>
              <Badge tone={config.buyIn.mode === 'MANUAL' ? 'gold' : 'neutral'}>
                {config.buyIn.mode === 'MANUAL' ? 'Manuel' : 'Automatique'}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label={t('tournament.playersExpected')} htmlFor="preset-players">
                <Input
                  id="preset-players"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={200}
                  value={config.buyIn.players}
                  onChange={(event) => patchBuyIn({ players: Number(event.target.value) || 2 })}
                />
              </Field>
              <Field label={t('tournament.buyIn')} htmlFor="preset-buyin">
                <Input
                  id="preset-buyin"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={100}
                  value={config.buyIn.targetBuyIn}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 1;
                    patchBuyIn({ targetBuyIn: value, startingStack: value });
                  }}
                />
              </Field>
              <Field label={t('tournament.startingStack')} htmlFor="preset-stack">
                <Input
                  id="preset-stack"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={100}
                  value={config.buyIn.startingStack}
                  onChange={(event) => patchBuyIn({ startingStack: Number(event.target.value) || 1 })}
                />
              </Field>
              <Field label="Jetons max / joueur" htmlFor="preset-max-chips">
                <Input
                  id="preset-max-chips"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={200}
                  value={config.buyIn.maxChipsPerPlayer}
                  onChange={(event) =>
                    patchBuyIn({ maxChipsPerPlayer: Number(event.target.value) || 60 })
                  }
                />
              </Field>
            </div>

            <div
              role="tablist"
              aria-label="Mode de distribution des jetons"
              className="mt-4 flex gap-1 rounded-[var(--radius-md)] border border-white/[0.08] bg-night-950/60 p-1"
            >
              {(['AUTO', 'MANUAL'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={config.buyIn.mode === option}
                  onClick={() => patchBuyIn({ mode: option })}
                  className={`min-h-10 flex-1 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold transition-colors ${
                    config.buyIn.mode === option
                      ? 'bg-gold-500 text-night-950'
                      : 'text-cream-300 hover:bg-white/[0.05] hover:text-cream-100'
                  }`}
                >
                  {option === 'AUTO' ? 'Automatique' : 'Manuel'}
                </button>
              ))}
            </div>

            {config.buyIn.mode === 'MANUAL' ? (
              <div className="mt-4">
                {selectedChipCase && manualChipTypes.length > 0 ? (
                  <ChipCountEditor
                    chipTypes={manualChipTypes}
                    counts={config.buyIn.counts}
                    commonEnabled={config.buyIn.commonEnabled}
                    commonCount={config.buyIn.commonCount}
                    players={config.buyIn.players}
                    onCountChange={(chipTypeId, count) =>
                      patchBuyIn({ counts: { ...config.buyIn.counts, [chipTypeId]: count } })
                    }
                    onToggleCommon={(chipTypeId, enabled) =>
                      patchBuyIn({
                        commonEnabled: {
                          ...config.buyIn.commonEnabled,
                          [chipTypeId]: enabled,
                        },
                      })
                    }
                    onCommonCountChange={(count) => patchBuyIn({ commonCount: count })}
                  />
                ) : (
                  <p className="rounded-[var(--radius-md)] border border-dashed border-white/[0.1] px-3.5 py-4 text-[12.5px] leading-relaxed text-cream-400">
                    Choisissez une mallette pour saisir la cave jeton par jeton.
                  </p>
                )}

                {selectedChipCase ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-[var(--radius-sm)] bg-white/[0.025] px-3 py-2">
                      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                        Jetons / joueur
                      </div>
                      <div className="tabular mt-0.5 text-lg font-bold text-cream-50">
                        {manualTotal}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-sm)] bg-white/[0.025] px-3 py-2">
                      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
                        Valeur / joueur
                      </div>
                      <div className="tabular mt-0.5 text-lg font-bold text-cream-50">
                        {formatChips(manualValue)}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] leading-relaxed text-cream-400">
                Pokero répartit automatiquement les jetons pour atteindre la cave cible.
              </p>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">{t('tournament.stepBlinds')}</h2>
              <Badge tone="neutral">
                {config.blinds.autoGenerate ? 'Générée' : 'Sur mesure'}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              <Switch
                label={t('tournament.autoStructure')}
                hint="Génère une progression régulière jusqu’à la durée cible."
                checked={config.blinds.autoGenerate}
                onChange={(checked) => patchBlinds({ autoGenerate: checked })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('tournament.targetDuration')} htmlFor="preset-duration">
                  <Input
                    id="preset-duration"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={1440}
                    value={config.blinds.targetDurationMinutes}
                    onChange={(event) =>
                      patchBlinds({ targetDurationMinutes: Number(event.target.value) || 60 })
                    }
                  />
                </Field>
                <Field label={t('tournament.levelDuration')} htmlFor="preset-level-duration">
                  <Input
                    id="preset-level-duration"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    value={config.blinds.levelDurationMinutes}
                    onChange={(event) =>
                      patchBlinds({ levelDurationMinutes: Number(event.target.value) || 20 })
                    }
                  />
                </Field>
                <Field label={t('tournament.breakDuration')} htmlFor="preset-break-duration">
                  <Input
                    id="preset-break-duration"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    value={config.blinds.breakDurationMinutes}
                    onChange={(event) =>
                      patchBlinds({ breakDurationMinutes: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label={t('tournament.breakEvery')} htmlFor="preset-break-every">
                  <Input
                    id="preset-break-every"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={20}
                    value={config.blinds.breakEveryLevels}
                    onChange={(event) =>
                      patchBlinds({ breakEveryLevels: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label={t('tournament.roundUnit')} htmlFor="preset-round-unit">
                  <Input
                    id="preset-round-unit"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={config.blinds.roundUnit}
                    onChange={(event) =>
                      patchBlinds({ roundUnit: Number(event.target.value) || 25 })
                    }
                  />
                </Field>
                <Field label="Ante à partir du niveau" htmlFor="preset-ante-level">
                  <Input
                    id="preset-ante-level"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={config.blinds.anteFromLevel}
                    onChange={(event) =>
                      patchBlinds({ anteFromLevel: Number(event.target.value) || 1 })
                    }
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Rebuys & add-ons</h2>
            <div className="mt-4 space-y-3">
              <Switch
                label="Rebuys activés"
                hint="Permet de recaver un joueur éliminé tant que la limite n’est pas atteinte."
                checked={config.rebuy.enabled}
                onChange={(checked) =>
                  setConfig((current) => ({
                    ...current,
                    rebuy: { ...current.rebuy, enabled: checked },
                  }))
                }
              />
              {config.rebuy.enabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Jusqu’au niveau">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={config.rebuy.untilLevel ?? ''}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          rebuy: {
                            ...current.rebuy,
                            untilLevel: event.target.value ? Number(event.target.value) : null,
                          },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Maximum par joueur" hint="Vide = illimité">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={config.rebuy.maxPerPlayer ?? ''}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          rebuy: {
                            ...current.rebuy,
                            unlimited: event.target.value === '',
                            maxPerPlayer: event.target.value
                              ? Number(event.target.value)
                              : null,
                          },
                        }))
                      }
                    />
                  </Field>
                </div>
              ) : null}

              <div className="divider" />

              <Switch
                label="Add-ons activés"
                hint="Un complément de jetons facultatif en fin de période de rebuy."
                checked={config.addOn.enabled}
                onChange={(checked) =>
                  setConfig((current) => ({
                    ...current,
                    addOn: { ...current.addOn, enabled: checked },
                  }))
                }
              />
              {config.addOn.enabled ? (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Valeur">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={config.addOn.value ?? config.buyIn.targetBuyIn}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          addOn: { ...current.addOn, value: Number(event.target.value) || null },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Au niveau">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={config.addOn.atLevel ?? ''}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          addOn: {
                            ...current.addOn,
                            atLevel: event.target.value ? Number(event.target.value) : null,
                          },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Limite">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={10}
                      value={config.addOn.limitPerPlayer}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          addOn: {
                            ...current.addOn,
                            limitPerPlayer: Number(event.target.value) || 1,
                          },
                        }))
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">Aperçu</h2>
              <Sparkles className="size-4 text-gold-500" aria-hidden />
            </div>
            <dl className="mt-2 divide-y divide-white/[0.05]">
              <SummaryRow
                label="Cave"
                value={`${formatChips(config.buyIn.targetBuyIn)} jetons`}
              />
              <SummaryRow label="Joueurs prévus" value={String(config.buyIn.players)} />
              <SummaryRow
                label="Durée cible"
                value={formatMinutes(config.blinds.targetDurationMinutes)}
              />
              <SummaryRow
                label="Niveaux"
                value={
                  config.blinds.autoGenerate
                    ? `${Math.max(
                        1,
                        Math.round(
                          config.blinds.targetDurationMinutes /
                            Math.max(1, config.blinds.levelDurationMinutes),
                        ),
                      )} estimés`
                    : `${config.blinds.levels?.length ?? 0} définis`
                }
              />
              <SummaryRow
                label="Options"
                value={[
                  config.rebuy.enabled ? 'rebuys' : null,
                  config.addOn.enabled ? 'add-on' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'aucune'}
              />
            </dl>
            <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] text-cream-400">
              <WalletCards className="size-3.5 shrink-0 text-gold-500" aria-hidden />
              {selectedChipCase ? selectedChipCase.name : 'Aucune mallette associée'}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Affichage spectateur</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-cream-400">
              Choisissez ce que voient les joueurs depuis le lien partagé.
            </p>
            <div className="mt-3 space-y-2">
              <Switch
                label="Afficher le classement"
                checked={config.display.showRanking}
                onChange={(checked) =>
                  setConfig((current) => ({
                    ...current,
                    display: { ...current.display, showRanking: checked },
                  }))
                }
              />
              <Switch
                label="Afficher les joueurs"
                checked={config.display.showPlayers}
                onChange={(checked) =>
                  setConfig((current) => ({
                    ...current,
                    display: { ...current.display, showPlayers: checked },
                  }))
                }
              />
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Structure</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[11px] text-cream-300">
                <Users className="size-3" aria-hidden />
                {config.buyIn.players} joueurs
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[11px] text-cream-300">
                <Clock3 className="size-3" aria-hidden />
                {config.blinds.levelDurationMinutes} min / niveau
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[11px] text-cream-300">
                <Layers3 className="size-3" aria-hidden />
                {config.blinds.breakEveryLevels > 0
                  ? `pause / ${config.blinds.breakEveryLevels} niveaux`
                  : 'sans pause'}
              </span>
            </div>
            {formError ? (
              <p className="field-error mt-3" role="alert">
                {formError}
              </p>
            ) : null}
            <Button type="submit" loading={saveMutation.isPending} className="mt-4 w-full">
              <Save className="size-4" aria-hidden />
              {isNew ? 'Créer le preset' : 'Enregistrer les modifications'}
            </Button>
          </Card>
        </aside>
      </form>
    </div>
  );
}
