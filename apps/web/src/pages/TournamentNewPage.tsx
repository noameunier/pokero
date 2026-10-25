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
import { Badge, Button, Card, Field, Input, Select, Switch } from '../components/ui';
import { useToast } from '../components/Toast';

interface ManualLevel {
  kind: 'PLAY' | 'BREAK';
  smallBlind: string;
  bigBlind: string;
  ante: string;
  durationMinutes: string;
}

const STEPS = ['stepInfo', 'stepChips', 'stepBlinds', 'stepOptions'] as const;

const NEW_PRESET_DEFAULTS = {
  players: 8,
  targetBuyIn: 10_000,
  startingStack: 10_000,
  maxChipsPerPlayer: 60,
  targetDurationMinutes: 180,
  levelDurationMinutes: 20,
  breakDurationMinutes: 15,
  breakEveryLevels: 4,
  roundUnit: 25,
  anteFromLevel: 5,
  antePercentOfBigBlind: 0.125,
};

export function TournamentNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { success, error: notifyError } = useToast();
  const errorMessage = useApiErrorMessage();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [chipCaseId, setChipCaseId] = useState('');
  const [presetId, setPresetId] = useState(params.get('preset') ?? '');
  const [players, setPlayers] = useState(NEW_PRESET_DEFAULTS.players);
  const [targetBuyIn, setTargetBuyIn] = useState(NEW_PRESET_DEFAULTS.targetBuyIn);
  const [startingStack, setStartingStack] = useState(NEW_PRESET_DEFAULTS.startingStack);
  const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualCounts, setManualCounts] = useState<Record<string, number>>({});
  const [maxChipsPerPlayer, setMaxChipsPerPlayer] = useState(NEW_PRESET_DEFAULTS.maxChipsPerPlayer);

  const [autoGenerate, setAutoGenerate] = useState(true);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(
    NEW_PRESET_DEFAULTS.targetDurationMinutes,
  );
  const [levelDurationMinutes, setLevelDurationMinutes] = useState(
    NEW_PRESET_DEFAULTS.levelDurationMinutes,
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
    const preset = presetsQuery.data?.presets.find((item) => item.id === (params.get('preset') ?? ''));
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
      | { players?: number; targetBuyIn?: number; startingStack?: number; maxChipsPerPlayer?: number }
      | undefined;
    const blinds = config.blinds as
      | {
          autoGenerate?: boolean;
          targetDurationMinutes?: number;
          levelDurationMinutes?: number;
          breakDurationMinutes?: number;
          breakEveryLevels?: number;
          roundUnit?: number;
          anteFromLevel?: number;
          startingSmallBlind?: number;
          startingBigBlind?: number;
        }
      | undefined;
    const rebuy = config.rebuy as
      | { enabled?: boolean; unlimited?: boolean; maxPerPlayer?: number | null; untilLevel?: number | null }
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
    if (buyIn?.startingStack) setStartingStack(buyIn.startingStack);
    if (buyIn?.maxChipsPerPlayer) setMaxChipsPerPlayer(buyIn.maxChipsPerPlayer);
    if (blinds?.autoGenerate !== undefined) setAutoGenerate(blinds.autoGenerate);
    if (blinds?.targetDurationMinutes) setTargetDurationMinutes(blinds.targetDurationMinutes);
    if (blinds?.levelDurationMinutes) setLevelDurationMinutes(blinds.levelDurationMinutes);
    if (blinds?.breakDurationMinutes !== undefined) setBreakDurationMinutes(blinds.breakDurationMinutes);
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
      startingStack,
      mode,
      maxChipsPerPlayer,
      JSON.stringify(manualCounts),
    ],
    queryFn: () =>
      api.post<{ plan: BuyInPlan }>(`/api/chip-cases/${chipCaseId}/buyin/preview`, {
        players,
        targetBuyIn,
        startingStack,
        mode,
        counts: mode === 'MANUAL' ? manualCounts : {},
        commonEnabled: {},
        commonCount: 0,
        maxChipsPerPlayer,
      }),
    enabled: Boolean(chipCaseId) && players >= 2 && targetBuyIn > 0,
    retry: false,
  });

  const generatedLevels = useMemo(() => {
    if (!autoGenerate) return null;
    try {
      return generateBlindStructure({
        startingStack,
        targetDurationMinutes,
        levelDurationMinutes,
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
    startingStack,
    targetDurationMinutes,
    levelDurationMinutes,
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
          startingStack,
          mode,
          counts: mode === 'MANUAL' ? manualCounts : {},
          commonEnabled: {},
          commonCount: 0,
          maxChipsPerPlayer,
        },
        blinds: autoGenerate
          ? {
              autoGenerate: true,
              targetDurationMinutes,
              levelDurationMinutes,
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="btn-ghost btn-sm p-2" aria-label={t('common.back')}>
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-cream-50 sm:text-3xl">
              {t('tournament.new')}
            </h1>
            <p className="text-sm text-cream-300/60">{t('common.tagline')}</p>
          </div>
        </div>
        <Badge tone="gold">
          {step + 1} / {STEPS.length}
        </Badge>
      </header>

      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((key, index) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              className={`w-full rounded-xl border px-2 py-2.5 text-center text-[11px] font-semibold transition sm:text-xs ${
                index === step
                  ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                  : index < step
                    ? 'border-white/10 bg-white/5 text-cream-200 hover:bg-white/10'
                    : 'border-white/5 bg-white/[0.02] text-cream-300/40'
              }`}
            >
              {index < step ? <Check className="mx-auto mb-1 size-4" /> : <span className="mb-1 block text-base">{index + 1}</span>}
              {t(`tournament.${key}`)}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-cream-50">{t('tournament.stepInfo')}</h2>
            <div className="space-y-4">
              <Field label={t('tournament.name')}>
                <Input
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Tournoi du vendredi"
                />
              </Field>
              <Field label={t('tournament.chipCase')} hint={selectedChipCase ? `${selectedChipCase.chipTypes.length} valeurs de jetons` : undefined}>
                <Select value={chipCaseId} onChange={(event) => setChipCaseId(event.target.value)}>
                  {chipCases.length === 0 ? <option value="">Aucune mallette</option> : null}
                  {chipCases.map((chipCase) => (
                    <option key={chipCase.id} value={chipCase.id}>
                      {chipCase.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {chipCases.length === 0 ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 text-sm text-amber-100">
                  <Layers3 className="mr-2 inline size-4" />
                  Créez d’abord une <Link to="/mallettes/nouvelle" className="font-semibold underline">mallette de jetons</Link>.
                </div>
              ) : null}
              <Field label={t('tournament.preset')}>
                <Select
                  value={presetId}
                  onChange={(event) => {
                    setPresetId(event.target.value);
                    setAppliedPreset(null);
                  }}
                >
                  <option value="">— {t('common.none')} —</option>
                  {(presetsQuery.data?.presets ?? []).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-cream-50">Résumé de la mallette</h2>
            {selectedChipCase ? (
              <>
                <div className="space-y-2">
                  {selectedChipCase.chipTypes.map((type) => (
                    <div key={type.id} className="flex items-center gap-3 text-sm">
                      <span
                        className="size-5 rounded-full ring-1 ring-white/25"
                        style={{ backgroundColor: type.color }}
                      />
                      <span className="flex-1 text-cream-200">{type.label}</span>
                      <span className="tabular text-cream-300/60">
                        {formatChips(type.value)} × {formatChips(type.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-white/10 pt-3 text-sm text-cream-300/70">
                  Valeur totale :{' '}
                  <span className="font-semibold text-cream-50">
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
              <p className="text-sm text-cream-300/60">Sélectionnez une mallette.</p>
            )}
          </Card>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-cream-50">
              <Users className="size-5 text-gold-400" />
              {t('tournament.stepChips')}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('tournament.playersExpected')}>
                <Input
                  type="number"
                  min={2}
                  max={200}
                  value={players}
                  onChange={(event) => setPlayers(Number(event.target.value) || 2)}
                />
              </Field>
              <Field label={t('tournament.buyIn')}>
                <Input
                  type="number"
                  min={1}
                  step={100}
                  value={targetBuyIn}
                  onChange={(event) => {
                    const value = Number(event.target.value) || 1;
                    setTargetBuyIn(value);
                    setStartingStack(value);
                  }}
                />
              </Field>
              <Field label={t('tournament.startingStack')}>
                <Input
                  type="number"
                  min={1}
                  step={100}
                  value={startingStack}
                  onChange={(event) => setStartingStack(Number(event.target.value) || 1)}
                />
              </Field>
              <Field label="Jetons max / joueur">
                <Input
                  type="number"
                  min={5}
                  max={200}
                  value={maxChipsPerPlayer}
                  onChange={(event) => setMaxChipsPerPlayer(Number(event.target.value) || 60)}
                />
              </Field>
            </div>

            <div className="mt-4 flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
              {(['AUTO', 'MANUAL'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    mode === option
                      ? 'bg-gold-500 text-felt-950'
                      : 'text-cream-200/70 hover:bg-white/5'
                  }`}
                >
                  {option === 'AUTO' ? 'Automatique' : 'Manuel'}
                </button>
              ))}
            </div>

            {mode === 'MANUAL' && selectedChipCase ? (
              <div className="mt-4 space-y-2">
                {selectedChipCase.chipTypes.map((type) => (
                  <div key={type.id} className="flex items-center gap-2">
                    <span
                      className="size-5 rounded-full ring-1 ring-white/25"
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="flex-1 text-sm text-cream-200">
                      {type.label}{' '}
                      <span className="text-cream-300/50">({formatChips(type.value)})</span>
                    </span>
                    <Input
                      type="number"
                      min={0}
                      className="w-20"
                      value={manualCounts[type.id] ?? 0}
                      onChange={(event) =>
                        setManualCounts((current) => ({
                          ...current,
                          [type.id]: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-cream-50">
              <Sparkles className="size-5 text-gold-400" />
              {t('tournament.distribution')}
            </h2>
            {planQuery.isFetching ? (
              <p className="text-sm text-cream-300/60">{t('common.loading')}</p>
            ) : null}
            {planQuery.error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-950/30 p-3 text-sm text-red-100">
                {errorMessage(planQuery.error)}
              </div>
            ) : null}
            {planQuery.data ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-medium ${
                      planQuery.data.plan.exact ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {planQuery.data.plan.exact
                      ? t('tournament.exactDistribution')
                      : t('tournament.approximateDistribution', {
                          difference: formatChips(planQuery.data.plan.difference),
                        })}
                  </span>
                  <Badge tone="neutral">{planQuery.data.plan.algorithm}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {planQuery.data.plan.counts
                    .filter((count) => count.perPlayer > 0)
                    .map((count) => (
                      <div
                        key={count.chipTypeId}
                        className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-sm"
                      >
                        <span
                          className="size-4 shrink-0 rounded-full ring-1 ring-white/25"
                          style={{ backgroundColor: count.color }}
                        />
                        <span className="flex-1 truncate text-cream-200">{count.label}</span>
                        <span className="tabular font-semibold text-cream-50">
                          ×{count.perPlayer}
                        </span>
                      </div>
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center text-xs">
                  <div>
                    <div className="tabular text-lg font-semibold text-cream-50">
                      {formatChips(planQuery.data.plan.perPlayerValue)}
                    </div>
                    <div className="text-cream-300/50">par joueur</div>
                  </div>
                  <div>
                    <div className="tabular text-lg font-semibold text-cream-50">
                      {planQuery.data.plan.perPlayerChipCount}
                    </div>
                    <div className="text-cream-300/50">jetons</div>
                  </div>
                  <div>
                    <div className="tabular text-lg font-semibold text-cream-50">
                      {formatChips(planQuery.data.plan.totalValue)}
                    </div>
                    <div className="text-cream-300/50">total</div>
                  </div>
                </div>
                {planQuery.data.plan.warnings.length > 0 ? (
                  <ul className="space-y-1 text-xs text-amber-200/80">
                    {planQuery.data.plan.warnings.map((warning, index) => (
                      <li key={index}>• {warning.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-cream-50">
                <Coffee className="size-5 text-gold-400" />
                {t('tournament.stepBlinds')}
              </h2>
              <div className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
                {[true, false].map((option) => (
                  <button
                    key={String(option)}
                    type="button"
                    onClick={() => setAutoGenerate(option)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      autoGenerate === option
                        ? 'bg-gold-500 text-felt-950'
                        : 'text-cream-200/70 hover:bg-white/5'
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
                    min={10}
                    max={1440}
                    value={targetDurationMinutes}
                    onChange={(event) => setTargetDurationMinutes(Number(event.target.value) || 60)}
                  />
                </Field>
                <Field label={t('tournament.levelDuration')}>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={levelDurationMinutes}
                    onChange={(event) => setLevelDurationMinutes(Number(event.target.value) || 20)}
                  />
                </Field>
                <Field label={t('tournament.breakDuration')}>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={breakDurationMinutes}
                    onChange={(event) => setBreakDurationMinutes(Number(event.target.value) || 0)}
                  />
                </Field>
                <Field label={t('tournament.breakEvery')}>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={breakEveryLevels}
                    onChange={(event) => setBreakEveryLevels(Number(event.target.value) || 0)}
                  />
                </Field>
                <Field label={t('tournament.roundUnit')}>
                  <Input
                    type="number"
                    min={1}
                    value={roundUnit}
                    onChange={(event) => setRoundUnit(Number(event.target.value) || 25)}
                  />
                </Field>
                <Field label="Ante dès le niveau">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={anteFromLevel}
                    onChange={(event) => setAnteFromLevel(Number(event.target.value) || 1)}
                  />
                </Field>
                <Field label="SB de départ" hint="Vide = 100 BB">
                  <Input
                    type="number"
                    min={1}
                    value={startingSmallBlind}
                    onChange={(event) => setStartingSmallBlind(event.target.value)}
                  />
                </Field>
                <Field label="BB de départ" hint="Vide = 2 × SB">
                  <Input
                    type="number"
                    min={1}
                    value={startingBigBlind}
                    onChange={(event) => setStartingBigBlind(event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <div className="hidden grid-cols-[3rem_1fr_1fr_1fr_5rem_2.5rem] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-cream-300/50 sm:grid">
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
                    className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-2 sm:grid-cols-[3rem_1fr_1fr_1fr_5rem_2.5rem] sm:items-center"
                  >
                    <Select
                      aria-label="Type de niveau"
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
                      min={1}
                      placeholder="SB"
                      disabled={level.kind === 'BREAK'}
                      value={level.smallBlind}
                      onChange={(event) => updateManualLevel(index, { smallBlind: event.target.value })}
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="BB"
                      disabled={level.kind === 'BREAK'}
                      value={level.bigBlind}
                      onChange={(event) => updateManualLevel(index, { bigBlind: event.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Ante"
                      disabled={level.kind === 'BREAK'}
                      value={level.ante}
                      onChange={(event) => updateManualLevel(index, { ante: event.target.value })}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={level.durationMinutes}
                      onChange={(event) =>
                        updateManualLevel(index, { durationMinutes: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() =>
                        setManualLevels((current) => current.filter((_, i) => i !== index))
                      }
                      className="grid size-8 place-items-center rounded-lg text-cream-300/50 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
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
                  <Plus className="size-4" />
                  Ajouter un niveau
                </Button>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-cream-50">Aperçu de la structure</h2>
            <p className="mb-3 text-xs text-cream-300/60">
              {autoGenerate && generatedLevels
                ? `${generatedLevels.levels.filter((level) => level.kind === 'PLAY').length} niveaux de jeu · ${
                    generatedLevels.totalDurationMinutes
                  } min au total`
                : `${manualLevels.length} segments`}
            </p>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-felt-900/95 text-left text-[10px] uppercase tracking-wider text-cream-300/60">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Blindes</th>
                    <th className="px-3 py-2">Ante</th>
                    <th className="px-3 py-2 text-right">Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {(autoGenerate ? generatedLevels?.levels ?? [] : manualLevels).map((level, index) => {
                    const isBreak = level.kind === 'BREAK';
                    return (
                      <tr key={index} className="border-t border-white/5">
                        <td className="px-3 py-1.5 text-cream-300/50">{index + 1}</td>
                        <td className="px-3 py-1.5 tabular text-cream-100">
                          {isBreak
                            ? 'Pause'
                            : `${formatChips(Number(level.smallBlind))} / ${formatChips(Number(level.bigBlind))}`}
                        </td>
                        <td className="px-3 py-1.5 tabular text-cream-300/70">
                          {isBreak || !level.ante ? '—' : formatChips(Number(level.ante))}
                        </td>
                        <td className="px-3 py-1.5 text-right text-cream-300/70">
                          {level.durationMinutes} min
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {generatedLevels ? (
              <p className="mt-3 text-xs text-cream-300/60">
                Durée totale estimée : <strong className="text-cream-100">{formatMinutes(generatedLevels.totalDurationMinutes)}</strong>
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-cream-50">Rebuys & add-ons</h2>
            <div className="space-y-3">
              <Switch label="Rebuys activés" checked={rebuyEnabled} onChange={setRebuyEnabled} />
              {rebuyEnabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Jusqu’au niveau">
                    <Input
                      type="number"
                      min={1}
                      value={rebuyUntilLevel}
                      onChange={(event) => setRebuyUntilLevel(event.target.value)}
                    />
                  </Field>
                  <Field label="Max par joueur" hint="Vide = illimité">
                    <Input
                      type="number"
                      min={0}
                      value={rebuyMax}
                      onChange={(event) => {
                        setRebuyMax(event.target.value);
                        setRebuyUnlimited(event.target.value === '');
                      }}
                    />
                  </Field>
                </div>
              ) : null}
              <div className="divider" />
              <Switch label="Add-ons activés" checked={addOnEnabled} onChange={setAddOnEnabled} />
              {addOnEnabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valeur de l’add-on">
                    <Input
                      type="number"
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
                      min={1}
                      value={addOnAtLevel}
                      onChange={(event) => setAddOnAtLevel(event.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-cream-50">Affichage & sécurité</h2>
            <div className="space-y-3">
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
              >
                <Input
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

          <Card className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-cream-50">Récapitulatif</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Tournoi</div>
                <div className="mt-1 truncate font-semibold text-cream-50">{name || '—'}</div>
                <div className="text-xs text-cream-300/60">{selectedChipCase?.name ?? '—'}</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Cave</div>
                <div className="mt-1 tabular font-semibold text-cream-50">
                  {formatChips(targetBuyIn)}
                </div>
                <div className="text-xs text-cream-300/60">
                  {players} joueurs · 100 BB
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Structure</div>
                <div className="mt-1 font-semibold text-cream-50">
                  {autoGenerate
                    ? `${generatedLevels?.levels.filter((level) => level.kind === 'PLAY').length ?? 0} niveaux`
                    : `${manualLevels.length} segments`}
                </div>
                <div className="text-xs text-cream-300/60">
                  {autoGenerate ? formatMinutes(targetDurationMinutes) : 'sur mesure'}
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-wide text-cream-300/50">Options</div>
                <div className="mt-1 font-semibold text-cream-50">
                  {rebuyEnabled ? 'Rebuys' : 'Sans rebuy'}
                  {addOnEnabled ? ' + add-on' : ''}
                </div>
                <div className="text-xs text-cream-300/60">
                  {pin ? 'PIN activé' : 'Sans PIN'}
                </div>
              </div>
            </div>

            {planQuery.data ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-cream-300/70">
                <span>
                  <WalletCards className="mr-1.5 inline size-4" />
                  {planQuery.data.plan.perPlayerChipCount} jetons / joueur
                </span>
                <span>
                  Total{' '}
                  <strong className="text-cream-100">
                    {formatChips(planQuery.data.plan.totalValue)}
                  </strong>
                </span>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {formError ? (
        <div className="rounded-xl border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
          {formError}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => (step === 0 ? navigate('/') : setStep((current) => current - 1))}
        >
          <ArrowLeft className="size-4" />
          {t('common.previous')}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>
            {t('common.next')}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" onClick={submit} loading={createMutation.isPending}>
            <Check className="size-4" />
            {t('common.create')}
          </Button>
        )}
      </div>
    </div>
  );
}
