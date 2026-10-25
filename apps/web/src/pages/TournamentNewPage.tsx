import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coffee,
  Layers3,
  Plus,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react';
import { generateBlindStructure } from '@pokero/domain';
import { api } from '../lib/api';
import { formatChips, formatMinutes, useApiErrorMessage } from '../lib/format';
import type { BuyInPlan, ChipCase, Preset, Tournament } from '../lib/types';
import { ChipCountEditor } from '../components/ChipCountEditor';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Switch,
} from '../components/ui';
import { useToast } from '../components/Toast';

interface ManualLevel {
  kind: 'PLAY' | 'BREAK';
  smallBlind: string;
  bigBlind: string;
  ante: string;
  durationMinutes: string;
}

const STEPS = ['stepInfo', 'stepChips', 'stepBlinds', 'stepOptions'] as const;
const MAX_CHIPS_PER_PLAYER = 60;

const NEW_PRESET_DEFAULTS = {
  players: 8,
  targetBuyIn: 10_000,
  targetDurationMinutes: 180,
  levelDurationMinutes: 20,
  firstLevelDurationMinutes: 20,
  breakDurationMinutes: 15,
  breakEveryLevels: 4,
  roundUnit: 25,
  anteFromLevel: 5,
  antePercentOfBigBlind: 0.125,
};

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-cream-400">
        {label}
      </div>
      <div className="tabular mt-0.5 truncate text-[15px] font-bold text-cream-50">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[10.5px] text-cream-500">{hint}</div> : null}
    </div>
  );
}

export function TournamentNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { success } = useToast();
  const errorMessage = useApiErrorMessage();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [chipCaseId, setChipCaseId] = useState('');
  const [presetId, setPresetId] = useState(params.get('preset') ?? '');
  const [players, setPlayers] = useState(NEW_PRESET_DEFAULTS.players);
  const [targetBuyIn, setTargetBuyIn] = useState(NEW_PRESET_DEFAULTS.targetBuyIn);
  const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualCounts, setManualCounts] = useState<Record<string, number>>({});
  const [commonEnabled, setCommonEnabled] = useState<Record<string, boolean>>({});
  const [commonCount, setCommonCount] = useState(0);

  const [autoGenerate, setAutoGenerate] = useState(true);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(
    NEW_PRESET_DEFAULTS.targetDurationMinutes,
  );
  const [levelDurationMinutes, setLevelDurationMinutes] = useState(
    NEW_PRESET_DEFAULTS.levelDurationMinutes,
  );
  const [firstLevelDurationMinutes, setFirstLevelDurationMinutes] = useState(
    NEW_PRESET_DEFAULTS.firstLevelDurationMinutes,
  );
  const [breakDurationMinutes, setBreakDurationMinutes] = useState(
    NEW_PRESET_DEFAULTS.breakDurationMinutes,
  );
  const [breakEveryLevels, setBreakEveryLevels] = useState(NEW_PRESET_DEFAULTS.breakEveryLevels);
  const [roundUnit, setRoundUnit] = useState(NEW_PRESET_DEFAULTS.roundUnit);
  const [anteFromLevel, setAnteFromLevel] = useState(NEW_PRESET_DEFAULTS.anteFromLevel);
  const [startingSmallBlind, setStartingSmallBlind] = useState('');
  const [startingBigBlind, setStartingBigBlind] = useState('');
  const [manualLevels, setManualLevels] = useState<ManualLevel[]>([]);

  const [rebuyEnabled, setRebuyEnabled] = useState(true);
  const [rebuyUnlimited, setRebuyUnlimited] = useState(true);
  const [rebuyMax, setRebuyMax] = useState('');
  const [rebuyUntilLevel, setRebuyUntilLevel] = useState('6');
  const [addOnEnabled, setAddOnEnabled] = useState(false);
  const [addOnValue, setAddOnValue] = useState('');
  const [addOnAtLevel, setAddOnAtLevel] = useState('');
  const [showRanking, setShowRanking] = useState(true);
  const [showPlayers, setShowPlayers] = useState(true);
  const [publicRanking, setPublicRanking] = useState(false);
  const [pin, setPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);

  const chipCasesQuery = useQuery({
    queryKey: ['chip-cases'],
    queryFn: () => api.get<{ chipCases: ChipCase[] }>('/api/chip-cases'),
  });

  const presetsQuery = useQuery({
    queryKey: ['presets'],
    queryFn: () => api.get<{ presets: Preset[] }>('/api/presets'),
  });

  const chipCases = useMemo(
    () => (chipCasesQuery.data?.chipCases ?? []).filter((chipCase) => !chipCase.archived),
    [chipCasesQuery.data],
  );

  useEffect(() => {
    if (chipCaseId || chipCases.length === 0) return;
    const preset = presetsQuery.data?.presets.find(
      (item) => item.id === (params.get('preset') ?? ''),
    );
    const preferred = preset?.defaultChipCaseId;
    const match = chipCases.find((chipCase) => chipCase.id === preferred) ?? chipCases[0]!;
    setChipCaseId(match.id);
    if (!name) setName(`Tournoi du ${new Date().toLocaleDateString('fr-FR')}`);
  }, [chipCases, chipCaseId, name, params, presetsQuery.data]);

  const selectedChipCase = chipCases.find((chipCase) => chipCase.id === chipCaseId) ?? null;

  useEffect(() => {
    if (!presetId || appliedPreset === presetId) return;
    const preset = presetsQuery.data?.presets.find((item) => item.id === presetId);
    if (!preset) return;
    const config = preset.config as Record<string, unknown>;
    const buyIn = config.buyIn as
      | {
          players?: number;
          targetBuyIn?: number;
          mode?: 'AUTO' | 'MANUAL';
          counts?: Record<string, number>;
          commonEnabled?: Record<string, boolean>;
          commonCount?: number;
        }
      | undefined;
    const blinds = config.blinds as
      | {
          autoGenerate?: boolean;
          targetDurationMinutes?: number;
          levelDurationMinutes?: number;
          firstLevelDurationMinutes?: number;
          breakDurationMinutes?: number;
          breakEveryLevels?: number;
          roundUnit?: number;
          anteFromLevel?: number;
          startingSmallBlind?: number;
          startingBigBlind?: number;
        }
      | undefined;
    const rebuy = config.rebuy as
      | {
          enabled?: boolean;
          unlimited?: boolean;
          maxPerPlayer?: number | null;
          untilLevel?: number | null;
        }
      | undefined;
    const addOn = config.addOn as
      | { enabled?: boolean; value?: number | null; atLevel?: number | null }
      | undefined;
    const display = config.display as { showRanking?: boolean; showPlayers?: boolean } | undefined;

    if (preset.defaultChipCaseId) {
      const match = chipCases.find((chipCase) => chipCase.id === preset.defaultChipCaseId);
      if (match) setChipCaseId(match.id);
    }
    if (buyIn?.players) setPlayers(buyIn.players);
    if (buyIn?.targetBuyIn) setTargetBuyIn(buyIn.targetBuyIn);
    if (buyIn?.mode) setMode(buyIn.mode);
    if (buyIn?.counts) setManualCounts(buyIn.counts);
    if (buyIn?.commonEnabled) setCommonEnabled(buyIn.commonEnabled);
    if (typeof buyIn?.commonCount === 'number') setCommonCount(buyIn.commonCount);
    if (blinds?.autoGenerate !== undefined) setAutoGenerate(blinds.autoGenerate);
    if (blinds?.targetDurationMinutes) setTargetDurationMinutes(blinds.targetDurationMinutes);
    if (blinds?.levelDurationMinutes) setLevelDurationMinutes(blinds.levelDurationMinutes);
    if (blinds?.firstLevelDurationMinutes)
      setFirstLevelDurationMinutes(blinds.firstLevelDurationMinutes);
    if (blinds?.breakDurationMinutes !== undefined)
      setBreakDurationMinutes(blinds.breakDurationMinutes);
    if (blinds?.breakEveryLevels !== undefined) setBreakEveryLevels(blinds.breakEveryLevels);
    if (blinds?.roundUnit) setRoundUnit(blinds.roundUnit);
    if (blinds?.anteFromLevel) setAnteFromLevel(blinds.anteFromLevel);
    if (blinds?.startingSmallBlind) setStartingSmallBlind(String(blinds.startingSmallBlind));
    if (blinds?.startingBigBlind) setStartingBigBlind(String(blinds.startingBigBlind));
    if (rebuy?.enabled !== undefined) setRebuyEnabled(rebuy.enabled);
    if (rebuy?.unlimited !== undefined) setRebuyUnlimited(rebuy.unlimited);
    if (rebuy?.maxPerPlayer !== undefined && rebuy.maxPerPlayer !== null) {
      setRebuyMax(String(rebuy.maxPerPlayer));
    }
    if (rebuy?.untilLevel !== undefined && rebuy.untilLevel !== null) {
      setRebuyUntilLevel(String(rebuy.untilLevel));
    }
    if (addOn?.enabled !== undefined) setAddOnEnabled(addOn.enabled);
    if (addOn?.value) setAddOnValue(String(addOn.value));
    if (addOn?.atLevel) setAddOnAtLevel(String(addOn.atLevel));
    if (display?.showRanking !== undefined) setShowRanking(display.showRanking);
    if (display?.showPlayers !== undefined) setShowPlayers(display.showPlayers);
    setAppliedPreset(presetId);
    success(`Preset « ${preset.name} » chargé.`);
  }, [presetId, presetsQuery.data, appliedPreset, chipCases, success]);

  const planQuery = useQuery({
    queryKey: [
      'buyin-preview',
      chipCaseId,
      players,
      targetBuyIn,
      mode,
      JSON.stringify(manualCounts),
      JSON.stringify(commonEnabled),
      commonCount,
    ],
    queryFn: () =>
      api.post<{ plan: BuyInPlan }>(`/api/chip-cases/${chipCaseId}/buyin/preview`, {
        players,
        targetBuyIn,
        startingStack: targetBuyIn,
        mode,
        counts: mode === 'MANUAL' ? manualCounts : {},
        commonEnabled: mode === 'MANUAL' ? commonEnabled : {},
        commonCount: mode === 'MANUAL' ? commonCount : 0,
        maxChipsPerPlayer: MAX_CHIPS_PER_PLAYER,
      }),
    enabled: Boolean(chipCaseId) && players >= 2 && targetBuyIn > 0,
    retry: false,
  });

  const generatedLevels = useMemo(() => {
    if (!autoGenerate || targetBuyIn <= 0) return null;
    try {
      return generateBlindStructure({
        startingStack: targetBuyIn,
        targetDurationMinutes,
        levelDurationMinutes,
        firstLevelDurationMinutes,
        breakDurationMinutes,
        breakEveryLevels,
        roundUnit,
        startingSmallBlind: startingSmallBlind ? Number(startingSmallBlind) : undefined,
        startingBigBlind: startingBigBlind ? Number(startingBigBlind) : undefined,
        anteFromLevel,
        antePercentOfBigBlind: NEW_PRESET_DEFAULTS.antePercentOfBigBlind,
      });
    } catch {
      return null;
    }
  }, [
    autoGenerate,
    targetBuyIn,
    targetDurationMinutes,
    levelDurationMinutes,
    firstLevelDurationMinutes,
    breakDurationMinutes,
    breakEveryLevels,
    roundUnit,
    startingSmallBlind,
    startingBigBlind,
    anteFromLevel,
  ]);

  useEffect(() => {
    if (autoGenerate || !generatedLevels || manualLevels.length > 0) return;
    setManualLevels(
      generatedLevels.levels.map((level) => ({
        kind: level.kind,
        smallBlind: level.smallBlind === null ? '' : String(level.smallBlind),
        bigBlind: level.bigBlind === null ? '' : String(level.bigBlind),
        ante: level.ante === null || level.ante === 0 ? '' : String(level.ante),
        durationMinutes: String(level.durationMinutes),
      })),
    );
  }, [autoGenerate, generatedLevels, manualLevels.length]);

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        chipCaseId,
        presetId: presetId || null,
        buyIn: {
          players,
          targetBuyIn,
          startingStack: targetBuyIn,
          mode,
          counts: mode === 'MANUAL' ? manualCounts : {},
          commonEnabled: mode === 'MANUAL' ? commonEnabled : {},
          commonCount: mode === 'MANUAL' ? commonCount : 0,
          maxChipsPerPlayer: MAX_CHIPS_PER_PLAYER,
        },
        blinds: autoGenerate
          ? {
              autoGenerate: true,
              targetDurationMinutes,
              levelDurationMinutes,
              firstLevelDurationMinutes,
              breakDurationMinutes,
              breakEveryLevels,
              roundUnit,
              anteFromLevel,
              antePercentOfBigBlind: NEW_PRESET_DEFAULTS.antePercentOfBigBlind,
              ...(startingSmallBlind ? { startingSmallBlind: Number(startingSmallBlind) } : {}),
              ...(startingBigBlind ? { startingBigBlind: Number(startingBigBlind) } : {}),
            }
          : {
              autoGenerate: false,
              targetDurationMinutes,
              levelDurationMinutes,
              firstLevelDurationMinutes,
              breakDurationMinutes,
              breakEveryLevels,
              roundUnit,
              anteFromLevel,
              levels: manualLevels.map((level) => ({
                kind: level.kind,
                smallBlind: level.kind === 'BREAK' ? null : Number(level.smallBlind),
                bigBlind: level.kind === 'BREAK' ? null : Number(level.bigBlind),
                ante: level.kind === 'BREAK' || !level.ante ? null : Number(level.ante),
                durationMinutes: Number(level.durationMinutes) || 1,
              })),
            },
        rebuy: {
          enabled: rebuyEnabled,
          unlimited: rebuyUnlimited || !rebuyMax,
          maxPerPlayer: rebuyMax ? Number(rebuyMax) : null,
          value: null,
          untilLevel: rebuyUntilLevel ? Number(rebuyUntilLevel) : null,
        },
        addOn: {
          enabled: addOnEnabled,
          value: addOnValue ? Number(addOnValue) : null,
          atLevel: addOnAtLevel ? Number(addOnAtLevel) : null,
          limitPerPlayer: 1,
        },
        display: { showRanking, showPlayers },
        publicRanking,
        pin: pin ? pin : null,
      };
      return api.post<{ tournament: Tournament }>('/api/tournaments', payload);
    },
    onSuccess: (data) => {
      success('Tournoi créé. Ajoutez les joueurs puis démarrez.');
      navigate(`/tournois/${data.tournament.id}`);
    },
    onError: (caught) => setFormError(errorMessage(caught)),
  });

  const next = () => {
    setFormError(null);
    if (step === 0) {
      if (!name.trim()) return setFormError('Donnez un nom au tournoi.');
      if (!chipCaseId) return setFormError('Choisissez une mallette.');
    }
    if (step === 1) {
      if (targetBuyIn <= 0) return setFormError('Indiquez une valeur de cave positive.');
      if (players < 2) return setFormError('Il faut au moins deux joueurs.');
      if (planQuery.error) return setFormError(errorMessage(planQuery.error));
      if (!planQuery.data) return setFormError('Calcul de la cave en cours…');
      if (planQuery.data.plan.perPlayerChipCount === 0) {
        return setFormError(t('tournament.stockWarning'));
      }
    }
    if (step === 2) {
      if (autoGenerate && !generatedLevels) {
        return setFormError('Structure de blindes invalide.');
      }
      if (!autoGenerate) {
        if (manualLevels.length === 0) return setFormError('Ajoutez au moins un niveau.');
        for (const level of manualLevels) {
          if (level.kind === 'PLAY') {
            const sb = Number(level.smallBlind);
            const bb = Number(level.bigBlind);
            if (!sb || !bb || bb < sb * 2) {
              return setFormError('Vérifiez les blindes : BB ≥ 2 × SB.');
            }
          }
        }
      }
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const submit = () => {
    setFormError(null);
    if (pin && !/^\d{4,8}$/.test(pin)) {
      setFormError('Le PIN doit contenir 4 à 8 chiffres.');
      return;
    }
    createMutation.mutate();
  };

  const updateManualLevel = (index: number, patch: Partial<ManualLevel>) => {
    setManualLevels((current) =>
      current.map((level, i) => (i === index ? { ...level, ...patch } : level)),
    );
  };

  const playLevels = autoGenerate
    ? (generatedLevels?.levels.filter((level) => level.kind === 'PLAY').length ?? 0)
    : manualLevels.filter((level) => level.kind === 'PLAY').length;
  const plan = planQuery.data?.plan ?? null;
  const suggestedBuyIn =
    mode === 'AUTO' && plan && !plan.exact && plan.perPlayerValue > 0
      ? plan.perPlayerValue
      : null;
  const applySuggestedBuyIn = () => {
    if (!suggestedBuyIn) return;
    setTargetBuyIn(suggestedBuyIn);
  };
  const rebuyCapacity = useMemo(() => {
    if (!plan) return null;
    const usedTypes = plan.counts.filter((count) => count.perPlayer > 0);
    if (usedTypes.length === 0) return 0;
    let capacity = Number.POSITIVE_INFINITY;
    for (const count of usedTypes) {
      const free =
        plan.freeStock.find((stock) => stock.chipTypeId === count.chipTypeId)?.available ?? 0;
      capacity = Math.min(
        capacity,
        Math.max(0, Math.floor((free - count.total) / count.perPlayer)),
      );
    }
    return Number.isFinite(capacity) ? capacity : 0;
  }, [plan]);
  const rebuysPerPlayer =
    players > 0 && rebuyCapacity !== null ? Math.floor(rebuyCapacity / players) : 0;
  const rebuyLimitExceedsCapacity =
    rebuyEnabled &&
    !rebuyUnlimited &&
    Boolean(rebuyMax) &&
    Number(rebuyMax) > 0 &&
    rebuyCapacity !== null &&
    players * Number(rebuyMax) > rebuyCapacity;
  const manualChipTypes = selectedChipCase?.chipTypes ?? [];

  const toggleCommon = (chipTypeId: string, enabled: boolean) =>
    setCommonEnabled((current) => ({ ...current, [chipTypeId]: enabled }));

  const previewLevels = autoGenerate ? (generatedLevels?.levels ?? []) : manualLevels;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link to="/" className="btn-ghost btn-icon -ml-1" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.7rem] leading-tight text-cream-50 sm:text-[2rem]">
              {t('tournament.new')}
            </h1>
            <p className="text-[11.5px] text-cream-400">{t('common.tagline')}</p>
          </div>
        </div>
        <Badge tone="gold">
          {step + 1} / {STEPS.length}
        </Badge>
      </header>

      <nav aria-label="Étapes de création">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((key, index) => {
            const state = index === step ? 'current' : index < step ? 'done' : 'todo';
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => index < step && setStep(index)}
                  disabled={index > step}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] border px-1.5 py-2 text-center text-[10.5px] font-semibold transition-colors sm:min-h-11 sm:flex-row sm:gap-1.5 sm:text-[12px] ${
                    state === 'current'
                      ? 'border-gold-500/45 bg-gold-500/[0.12] text-gold-200'
                      : state === 'done'
                        ? 'border-white/[0.09] bg-white/[0.04] text-cream-200 hover:bg-white/[0.07]'
                        : 'border-white/[0.05] bg-white/[0.012] text-cream-500'
                  }`}
                >
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded-full text-[9.5px] font-bold ${
                      state === 'current'
                        ? 'bg-gold-500 text-night-950'
                        : state === 'done'
                          ? 'bg-success-500/25 text-success-300'
                          : 'bg-white/[0.06] text-cream-500'
                    }`}
                    aria-hidden
                  >
                    {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="truncate">{t(`tournament.${key}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">{t('tournament.stepInfo')}</h2>
            <div className="mt-4 space-y-4">
              <Field label={t('tournament.name')} htmlFor="tournament-name">
                <Input
                  id="tournament-name"
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tournoi du vendredi"
                />
              </Field>
              <Field
                label={t('tournament.chipCase')}
                htmlFor="tournament-chip-case"
                hint={
                  selectedChipCase
                    ? `${selectedChipCase.chipTypes.length} valeurs de jetons disponibles`
                    : undefined
                }
              >
                <Select
                  id="tournament-chip-case"
                  value={chipCaseId}
                  onChange={(event) => setChipCaseId(event.target.value)}
                >
                  {chipCases.length === 0 ? <option value="">Aucune mallette</option> : null}
                  {chipCases.map((chipCase) => (
                    <option key={chipCase.id} value={chipCase.id}>
                      {chipCase.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {chipCases.length === 0 ? (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning-500/25 bg-warning-500/[0.08] p-3 text-[12.5px] leading-relaxed text-warning-300">
                  <Layers3 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Créez d’abord une{' '}
                    <Link to="/mallettes/nouvelle" className="font-semibold underline">
                      mallette de jetons
                    </Link>
                    .
                  </span>
                </div>
              ) : null}
              <Field
                label={t('tournament.preset')}
                htmlFor="tournament-preset"
                hint="Préremplit la cave, les blindes et les options."
              >
                <Select
                  id="tournament-preset"
                  value={presetId}
                  onChange={(event) => {
                    setPresetId(event.target.value);
                    setAppliedPreset(null);
                  }}
                >
                  <option value="">{t('common.none')}</option>
                  {(presetsQuery.data?.presets ?? [])
                    .filter((preset) => !preset.archived)
                    .map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">Rebuys</h2>
              <Badge tone={rebuyEnabled ? 'success' : 'neutral'}>
                {rebuyEnabled ? 'Activés' : 'Désactivés'}
              </Badge>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-cream-400">
              Capacité estimée avec le stock de la mallette, une cave de{' '}
              {formatChips(targetBuyIn)} et {players} joueurs. Elle se met à jour à l’étape
              Caves.
            </p>
            <div className="mt-3 rounded-[var(--radius-sm)] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
              {plan ? (
                rebuyCapacity !== null && rebuyCapacity > 0 ? (
                  <p className="text-[12.5px] leading-relaxed text-cream-300">
                    Environ{' '}
                    <strong className="tabular text-cream-50">
                      {formatChips(rebuyCapacity)}
                    </strong>{' '}
                    rebuys possibles, soit{' '}
                    <strong className="tabular text-cream-50">
                      {formatChips(rebuysPerPlayer)}
                    </strong>{' '}
                    par joueur.
                  </p>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-warning-300">
                    Le stock restant ne permet pas de rebuy supplémentaire après les caves.
                  </p>
                )
              ) : (
                <p className="text-[12.5px] leading-relaxed text-cream-400">
                  Sélectionnez une mallette pour estimer la capacité.
                </p>
              )}
            </div>
            <div className="mt-4">
              <Switch
                label="Rebuys activés"
                hint="Recave un joueur éliminé tant que la limite n’est pas atteinte."
                checked={rebuyEnabled}
                onChange={setRebuyEnabled}
              />
            </div>
            {rebuyEnabled ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Jusqu’au niveau">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={rebuyUntilLevel}
                    onChange={(event) => setRebuyUntilLevel(event.target.value)}
                  />
                </Field>
                <Field label="Max par joueur" hint="Vide = illimité">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={rebuyMax}
                    placeholder={String(rebuysPerPlayer)}
                    onChange={(event) => {
                      setRebuyMax(event.target.value);
                      setRebuyUnlimited(event.target.value === '');
                    }}
                  />
                </Field>
              </div>
            ) : null}
            {rebuyLimitExceedsCapacity ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-warning-300">
                La limite de {rebuyMax} rebuy(s) par joueur dépasse la capacité estimée du stock.
              </p>
            ) : null}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">Résumé de la mallette</h2>
              {selectedChipCase ? (
                <Badge tone="neutral">{selectedChipCase.chipTypes.length} valeurs</Badge>
              ) : null}
            </div>
            {selectedChipCase ? (
              <>
                <ul className="mt-3 space-y-1.5">
                  {selectedChipCase.chipTypes.map((type) => (
                    <li key={type.id} className="flex items-center gap-2.5 text-[13px]">
                      <span
                        className="chip-swatch size-4"
                        style={{ backgroundColor: type.color }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate text-cream-200">{type.label}</span>
                      <span className="tabular text-cream-400">
                        {formatChips(type.value)} × {formatChips(type.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[12px]">
                  <span className="text-cream-400">Valeur totale</span>
                  <span className="tabular font-semibold text-cream-50">
                    {formatChips(
                      selectedChipCase.chipTypes.reduce(
                        (total, type) => total + type.value * type.quantity,
                        0,
                      ),
                    )}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-cream-400">Sélectionnez une mallette.</p>
            )}
          </Card>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-display text-xl text-cream-50">
              <Users className="size-4 text-gold-400" aria-hidden />
              {t('tournament.stepChips')}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label={t('tournament.playersExpected')} htmlFor="players-expected">
                <Input
                  id="players-expected"
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={200}
                  value={players}
                  onChange={(event) => setPlayers(Number(event.target.value) || 2)}
                />
              </Field>
              <Field label={t('tournament.buyIn')} htmlFor="target-buy-in">
                <Input
                  id="target-buy-in"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={100}
                  value={targetBuyIn || ''}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
                    setTargetBuyIn(value);
                  }}
                />
                {mode === 'AUTO' && plan && !planQuery.isFetching ? (
                  plan.exact ? (
                    <p className="mt-1.5 text-[11px] text-success-300">
                      Valeur réalisable avec cette mallette.
                    </p>
                  ) : suggestedBuyIn ? (
                    <>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-cream-400">
                        Valeur réalisable avec cette mallette :
                      </p>
                      <button
                        type="button"
                        onClick={applySuggestedBuyIn}
                        className="mt-1 inline-flex min-h-8 items-center rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 text-[11px] font-semibold text-gold-300 transition hover:border-gold-500/50 hover:bg-gold-500/15 hover:text-gold-200"
                      >
                        Utiliser {formatChips(suggestedBuyIn)}
                      </button>
                    </>
                  ) : null
                ) : null}
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
                  aria-selected={mode === option}
                  onClick={() => setMode(option)}
                  className={`min-h-10 flex-1 rounded-[var(--radius-sm)] px-3 text-[13px] font-semibold transition-colors ${
                    mode === option
                      ? 'bg-gold-500 text-night-950'
                      : 'text-cream-300 hover:bg-white/[0.05] hover:text-cream-100'
                  }`}
                >
                  {option === 'AUTO' ? 'Automatique' : 'Manuel'}
                </button>
              ))}
            </div>

            {mode === 'MANUAL' && selectedChipCase ? (
              <div className="mt-4">
                <ChipCountEditor
                  chipTypes={manualChipTypes}
                  counts={manualCounts}
                  commonEnabled={commonEnabled}
                  commonCount={commonCount}
                  players={players}
                  onCountChange={(chipTypeId, count) =>
                    setManualCounts((current) => ({ ...current, [chipTypeId]: count }))
                  }
                  onToggleCommon={toggleCommon}
                  onCommonCountChange={setCommonCount}
                />
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] leading-relaxed text-cream-400">
                {mode === 'AUTO'
                  ? 'Pokero répartit les jetons pour approcher la cave cible avec un nombre de jetons raisonnable.'
                  : 'Sélectionnez une mallette pour saisir la cave manuellement.'}
              </p>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl text-cream-50">
                <Sparkles className="size-4 text-gold-400" aria-hidden />
                {t('tournament.distribution')}
              </h2>
              {plan ? <Badge tone="neutral">{plan.algorithm}</Badge> : null}
            </div>

            {planQuery.isFetching ? (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-cream-400">
                <span className="size-1.5 animate-live rounded-full bg-gold-400" aria-hidden />
                {t('common.loading')}
              </p>
            ) : null}

            {planQuery.error ? (
              <div
                role="alert"
                className="mt-3 rounded-[var(--radius-md)] border border-danger-500/30 bg-danger-500/[0.08] p-3 text-[12.5px] text-danger-300"
              >
                {errorMessage(planQuery.error)}
              </div>
            ) : null}

            {plan ? (
              <div className="mt-3 space-y-3">
                <p
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    plan.exact
                      ? 'border-success-500/30 bg-success-500/10 text-success-300'
                      : 'border-warning-500/30 bg-warning-500/10 text-warning-300'
                  }`}
                >
                  {plan.exact
                    ? t('tournament.exactDistribution')
                    : t('tournament.approximateDistribution', {
                        difference: formatChips(plan.difference),
                      })}
                </p>

                <ul className="space-y-1.5">
                  {plan.counts
                    .filter((count) => count.perPlayer > 0)
                    .map((count) => (
                      <li
                        key={count.chipTypeId}
                        className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 text-[13px]"
                      >
                        <span
                          className="chip-swatch size-4"
                          style={{ backgroundColor: count.color }}
                          aria-hidden
                        />
                        <span className="flex-1 truncate text-cream-200">{count.label}</span>
                        <span className="tabular text-cream-400">
                          ×{count.perPlayer}
                          <span className="ml-1.5 text-[10.5px] text-cream-500">
                            / {formatChips(count.total)} au total
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>

                <div className="grid grid-cols-3 gap-2">
                  <SummaryTile
                    label="Par joueur"
                    value={formatChips(plan.perPlayerValue)}
                    hint="valeur"
                  />
                  <SummaryTile label="Jetons" value={String(plan.perPlayerChipCount)} hint="par joueur" />
                  <SummaryTile label="Total" value={formatChips(plan.totalValue)} hint="en jeu" />
                </div>

                {rebuyEnabled && rebuyCapacity !== null ? (
                  <p className="rounded-[var(--radius-sm)] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] leading-relaxed text-cream-400">
                    Rebuys possibles avec ce stock :{' '}
                    <strong className="tabular text-cream-100">
                      {formatChips(rebuyCapacity)}
                    </strong>{' '}
                    ({formatChips(rebuysPerPlayer)} par joueur).
                  </p>
                ) : null}

                {plan.warnings.length > 0 ? (
                  <ul className="space-y-1 rounded-[var(--radius-sm)] border border-warning-500/20 bg-warning-500/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-warning-300">
                    {plan.warnings.map((warning, index) => (
                      <li key={index} className="flex gap-1.5">
                        <span aria-hidden>•</span>
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-xl text-cream-50">
                <Coffee className="size-4 text-gold-400" aria-hidden />
                {t('tournament.stepBlinds')}
              </h2>
              <div
                role="tablist"
                aria-label="Mode de structure"
                className="flex gap-1 rounded-[var(--radius-md)] border border-white/[0.08] bg-night-950/60 p-1"
              >
                {[true, false].map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    role="tab"
                    aria-selected={autoGenerate === option}
                    onClick={() => setAutoGenerate(option)}
                    className={`min-h-9 rounded-[var(--radius-sm)] px-2.5 text-[11.5px] font-semibold transition-colors ${
                      autoGenerate === option
                        ? 'bg-gold-500 text-night-950'
                        : 'text-cream-300 hover:text-cream-100'
                    }`}
                  >
                    {option ? t('tournament.autoStructure') : t('tournament.manualStructure')}
                  </button>
                ))}
              </div>
            </div>

            {autoGenerate ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label={t('tournament.targetDuration')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={1440}
                    value={targetDurationMinutes}
                    onChange={(event) => setTargetDurationMinutes(Number(event.target.value) || 60)}
                  />
                </Field>
                <Field
                  label="Premier niveau"
                  hint="Souvent plus long"
                  htmlFor="first-level-duration"
                >
                  <Input
                    id="first-level-duration"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    value={firstLevelDurationMinutes}
                    onChange={(event) =>
                      setFirstLevelDurationMinutes(Number(event.target.value) || 20)
                    }
                  />
                </Field>
                <Field label="Niveaux suivants" htmlFor="level-duration">
                  <Input
                    id="level-duration"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={120}
                    value={levelDurationMinutes}
                    onChange={(event) => setLevelDurationMinutes(Number(event.target.value) || 20)}
                  />
                </Field>
                <Field label={t('tournament.breakDuration')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    value={breakDurationMinutes}
                    onChange={(event) => setBreakDurationMinutes(Number(event.target.value) || 0)}
                  />
                </Field>
                <Field label={t('tournament.breakEvery')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={20}
                    value={breakEveryLevels}
                    onChange={(event) => setBreakEveryLevels(Number(event.target.value) || 0)}
                  />
                </Field>
                <Field label={t('tournament.roundUnit')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={roundUnit}
                    onChange={(event) => setRoundUnit(Number(event.target.value) || 25)}
                  />
                </Field>
                <Field label="Ante dès le niveau">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={anteFromLevel}
                    onChange={(event) => setAnteFromLevel(Number(event.target.value) || 1)}
                  />
                </Field>
                <Field label="SB de départ" hint="Vide = 100 BB">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={startingSmallBlind}
                    onChange={(event) => setStartingSmallBlind(event.target.value)}
                  />
                </Field>
                <Field label="BB de départ" hint="Vide = 2 × SB">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={startingBigBlind}
                    onChange={(event) => setStartingBigBlind(event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <div className="hidden grid-cols-[3rem_1fr_1fr_1fr_5rem_2.5rem] gap-2 px-1 text-[9.5px] font-bold uppercase tracking-[0.13em] text-cream-400 sm:grid">
                  <span>Type</span>
                  <span>SB</span>
                  <span>BB</span>
                  <span>Ante</span>
                  <span>Durée</span>
                  <span />
                </div>
                {manualLevels.map((level, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-white/[0.07] bg-white/[0.018] p-2 sm:grid-cols-[3rem_1fr_1fr_1fr_5rem_2.5rem] sm:items-center"
                  >
                    <Select
                      aria-label={`Type du niveau ${index + 1}`}
                      value={level.kind}
                      onChange={(event) =>
                        updateManualLevel(index, {
                          kind: event.target.value as 'PLAY' | 'BREAK',
                        })
                      }
                      className="col-span-2 sm:col-span-1"
                    >
                      <option value="PLAY">Jeu</option>
                      <option value="BREAK">Pause</option>
                    </Select>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="SB"
                      aria-label={`Petite blinde du niveau ${index + 1}`}
                      disabled={level.kind === 'BREAK'}
                      value={level.smallBlind}
                      onChange={(event) =>
                        updateManualLevel(index, { smallBlind: event.target.value })
                      }
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="BB"
                      aria-label={`Grosse blinde du niveau ${index + 1}`}
                      disabled={level.kind === 'BREAK'}
                      value={level.bigBlind}
                      onChange={(event) =>
                        updateManualLevel(index, { bigBlind: event.target.value })
                      }
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="Ante"
                      aria-label={`Ante du niveau ${index + 1}`}
                      disabled={level.kind === 'BREAK'}
                      value={level.ante}
                      onChange={(event) => updateManualLevel(index, { ante: event.target.value })}
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      aria-label={`Durée du niveau ${index + 1} en minutes`}
                      value={level.durationMinutes}
                      onChange={(event) =>
                        updateManualLevel(index, { durationMinutes: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Supprimer le niveau ${index + 1}`}
                      onClick={() =>
                        setManualLevels((current) => current.filter((_, i) => i !== index))
                      }
                      className="grid size-10 place-items-center justify-self-end rounded-[var(--radius-sm)] text-cream-400 transition hover:bg-danger-500/10 hover:text-danger-300"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setManualLevels((current) => [
                      ...current,
                      { kind: 'PLAY', smallBlind: '', bigBlind: '', ante: '', durationMinutes: '20' },
                    ])
                  }
                >
                  <Plus className="size-4" aria-hidden />
                  Ajouter un niveau
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">Aperçu de la structure</h2>
              <Badge tone="neutral">{playLevels} niveaux</Badge>
            </div>
            <p className="mt-1 text-[11.5px] text-cream-400">
              {autoGenerate && generatedLevels
                ? `${playLevels} niveaux de jeu · ${formatMinutes(generatedLevels.totalDurationMinutes)} au total`
                : `${manualLevels.length} segments`}
            </p>
            <div className="mt-3 max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-white/[0.08]">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-night-850 text-left text-[9.5px] font-bold uppercase tracking-[0.13em] text-cream-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Blindes</th>
                    <th className="px-3 py-2 font-semibold">Ante</th>
                    <th className="px-3 py-2 text-right font-semibold">Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLevels.map((level, index) => {
                    const isBreak = level.kind === 'BREAK';
                    return (
                      <tr key={index} className="border-t border-white/[0.05]">
                        <td className="px-3 py-1.5 text-cream-500">{index + 1}</td>
                        <td className="px-3 py-1.5 tabular text-cream-100">
                          {isBreak
                            ? 'Pause'
                            : `${formatChips(Number(level.smallBlind))} / ${formatChips(Number(level.bigBlind))}`}
                        </td>
                        <td className="px-3 py-1.5 tabular text-cream-400">
                          {isBreak || !level.ante ? '0' : formatChips(Number(level.ante))}
                        </td>
                        <td className="px-3 py-1.5 text-right text-cream-400">
                          {level.durationMinutes} min
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {generatedLevels && autoGenerate ? (
              <p className="mt-3 text-[11.5px] text-cream-400">
                Durée totale estimée :{' '}
                <strong className="text-cream-100">
                  {formatMinutes(generatedLevels.totalDurationMinutes)}
                </strong>
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Add-ons</h2>
            <div className="mt-4 space-y-3">
              <Switch
                label="Add-ons activés"
                hint="Complément de jetons facultatif en fin de période de rebuy."
                checked={addOnEnabled}
                onChange={setAddOnEnabled}
              />
              {addOnEnabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valeur de l’add-on">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={100}
                      value={addOnValue}
                      placeholder={String(targetBuyIn)}
                      onChange={(event) => setAddOnValue(event.target.value)}
                    />
                  </Field>
                  <Field label="Au niveau">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={addOnAtLevel}
                      onChange={(event) => setAddOnAtLevel(event.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-display text-xl text-cream-50">Affichage & sécurité</h2>
            <div className="mt-4 space-y-2">
              <Switch
                label="Classement public"
                hint="Visible sur le lien spectateur une fois le tournoi terminé."
                checked={publicRanking}
                onChange={setPublicRanking}
              />
              <Switch
                label="Afficher le classement en direct"
                checked={showRanking}
                onChange={setShowRanking}
              />
              <Switch label="Afficher les joueurs" checked={showPlayers} onChange={setShowPlayers} />
              <Field
                label={`${t('tournament.pin')} (${t('common.optional')})`}
                hint={t('tournament.pinHint')}
                htmlFor="tournament-pin"
              >
                <Input
                  id="tournament-pin"
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  maxLength={8}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl text-cream-50">Récapitulatif</h2>
              <Badge tone="gold">{name || 'Sans nom'}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile label="Mallette" value={selectedChipCase?.name ?? 'Aucune'} />
              <SummaryTile label="Cave" value={formatChips(targetBuyIn)} hint={`${players} joueurs`} />
              <SummaryTile
                label="Structure"
                value={`${playLevels} niveaux`}
                hint={autoGenerate ? formatMinutes(targetDurationMinutes) : 'sur mesure'}
              />
              <SummaryTile
                label="Options"
                value={
                  [rebuyEnabled ? 'Rebuys' : null, addOnEnabled ? 'Add-on' : null]
                    .filter(Boolean)
                    .join(' + ') || 'Aucune'
                }
                hint={pin ? 'PIN activé' : 'Sans PIN'}
              />
            </div>
            {plan ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-cream-400">
                <span className="inline-flex items-center gap-1.5">
                  <WalletCards className="size-3.5 text-gold-500" aria-hidden />
                  {plan.perPlayerChipCount} jetons / joueur
                </span>
                <span>
                  Total en jeu{' '}
                  <strong className="tabular text-cream-100">{formatChips(plan.totalValue)}</strong>
                </span>
                <span>
                  Cave réellement distribuée{' '}
                  <strong className="tabular text-cream-100">
                    {formatChips(plan.perPlayerValue)}
                  </strong>
                </span>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-danger-500/30 bg-danger-500/[0.08] px-3.5 py-3 text-[12.5px] leading-relaxed text-danger-300"
        >
          <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger-500/25 text-[10px] font-bold text-danger-300">
            !
          </span>
          {formError}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (step === 0 ? navigate('/') : setStep((current) => current - 1))}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('common.previous')}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>
            {t('common.next')}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button type="button" onClick={submit} loading={createMutation.isPending}>
            <Check className="size-4" aria-hidden />
            {t('common.create')}
          </Button>
        )}
      </div>

    </div>
  );
}
