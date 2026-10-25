import { DomainError, assertInteger } from './errors.js';

/** Un type de jeton physique appartenant à une mallette. */
export interface ChipStock {
  id: string;
  label: string;
  /** Valeur entière strictement positive, en unités fictives de tournoi. */
  value: number;
  /** Quantité physique totale possédée. */
  available: number;
  /** Quantité déjà réservée pour des rebuys / add-ons (non disponible pour les caves). */
  reserved?: number;
}

export interface ChipCount {
  chipTypeId: string;
  count: number;
}

export type DistributionWarningCode =
  | 'TARGET_NOT_REACHED'
  | 'TOO_MANY_CHIPS'
  | 'SMALL_CHIPS_INSUFFICIENT'
  | 'TIME_BUDGET_EXCEEDED'
  | 'STOCK_LIMITED'
  | 'NO_USABLE_CHIP_TYPE';

export interface DistributionWarning {
  code: DistributionWarningCode;
  message: string;
  details?: Record<string, number | string>;
}

export interface DistributionRequest {
  chipTypes: ChipStock[];
  players: number;
  targetBuyIn: number;
  startSmallBlind?: number;
  startBigBlind?: number;
  /** Quantités à réserver par type de jeton pour les rebuys / add-ons. */
  reserveByType?: Record<string, number>;
  /** Nombre maximal de jetons par cave (défaut : 60). */
  maxChipsPerPlayer?: number;
  /** Nombre maximal d'exemplaires d'un même type par cave (défaut : 40). */
  maxPerTypePerPlayer?: number;
  /** Budget de calcul de la recherche exacte (défaut : 1500 ms). */
  timeBudgetMs?: number;
}

export interface DistributionResult {
  counts: ChipCount[];
  players: number;
  /** Valeur d'une cave avec la composition proposée. */
  perPlayerValue: number;
  perPlayerChipCount: number;
  /** Valeur totale distribuée à tous les joueurs. */
  totalValue: number;
  targetBuyIn: number;
  /** perPlayerValue - targetBuyIn (négatif = cave incomplète). */
  difference: number;
  exact: boolean;
  totalByType: ChipCount[];
  warnings: DistributionWarning[];
  algorithm: 'DP' | 'GREEDY_FALLBACK';
  elapsedMs: number;
}

interface NormalizedType {
  id: string;
  label: string;
  value: number;
  availableForBuyIn: number;
  capacityPerPlayer: number;
  valueUnits: number;
  index: number;
}

const DEFAULT_MAX_CHIPS_PER_PLAYER = 60;
const DEFAULT_MAX_PER_TYPE = 40;
const DEFAULT_TIME_BUDGET_MS = 1500;
/** Au-delà, la programmation dynamique devient trop coûteuse : repli glouton. */
const MAX_DP_STATES = 250_000;

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function gcdOf(values: number[]): number {
  return values.reduce((acc, value) => gcd(acc, value), 0) || 1;
}

function normalizeTypes(request: DistributionRequest): NormalizedType[] {
  const reserve = request.reserveByType ?? {};
  const maxPerType = request.maxPerTypePerPlayer ?? DEFAULT_MAX_PER_TYPE;

  return request.chipTypes
    .map((type, index) => {
      assertInteger(type.value, `Valeur du jeton ${type.label}`, { min: 1 });
      assertInteger(type.available, `Quantité du jeton ${type.label}`, { min: 0 });
      const reserved = reserve[type.id] ?? type.reserved ?? 0;
      assertInteger(reserved, `Réservation du jeton ${type.label}`, { min: 0 });
      if (reserved > type.available) {
        throw new DomainError(
          'RESERVED_EXCEEDS_STOCK',
          `La réserve (${reserved}) dépasse le stock (${type.available}) pour ${type.label}.`,
        );
      }
      return {
        id: type.id,
        label: type.label,
        value: type.value,
        availableForBuyIn: type.available - reserved,
        capacityPerPlayer: 0,
        valueUnits: type.value,
        index,
      };
    })
    .filter((type) => type.availableForBuyIn > 0);
}

function computeCapacities(
  types: NormalizedType[],
  players: number,
  maxPerType: number,
  targetUnits: number,
  maxSumUnits: number,
): void {
  for (const type of types) {
    type.capacityPerPlayer = Math.max(
      0,
      Math.min(
        Math.floor(type.availableForBuyIn / players),
        maxPerType,
        Math.floor(maxSumUnits / type.valueUnits),
        targetUnits + Math.ceil(targetUnits / 8) + 1,
      ),
    );
  }
}

/**
 * Distribution automatique des caves.
 *
 * Contraintes dures :
 *  - composition identique pour tous les joueurs ;
 *  - jamais plus que le stock disponible (réserves déduites) ;
 *  - entiers uniquement.
 *
 * Objectifs : atteindre exactement la valeur cible si possible, sinon s'en
 * approcher au plus près, puis produire une composition utilisable (assez de
 * petites dénominations pour les premières blindes, pas de cave absurde).
 *
 * Algorithme : programmation dynamique bornée sur les sommes atteignables
 * (valeurs divisées par leur PGCD), avec score de qualité additif. Repli
 * glouton documenté si le budget de temps ou la taille de l'espace d'états
 * est dépassé.
 */
export function distributeChips(request: DistributionRequest): DistributionResult {
  const startTime = Date.now();
  const players = request.players;
  assertInteger(players, 'Nombre de joueurs', { min: 1 });
  assertInteger(request.targetBuyIn, 'Valeur cible de la cave', { min: 1 });

  const maxChipsPerPlayer = request.maxChipsPerPlayer ?? DEFAULT_MAX_CHIPS_PER_PLAYER;
  const maxPerType = request.maxPerTypePerPlayer ?? DEFAULT_MAX_PER_TYPE;
  const timeBudgetMs = request.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const startBigBlind = Math.max(1, request.startBigBlind ?? Math.round(request.targetBuyIn / 100));

  const types = normalizeTypes(request);
  if (types.length === 0) {
    return {
      counts: [],
      players,
      perPlayerValue: 0,
      perPlayerChipCount: 0,
      totalValue: 0,
      targetBuyIn: request.targetBuyIn,
      difference: -request.targetBuyIn,
      exact: false,
      totalByType: [],
      warnings: [
        {
          code: 'NO_USABLE_CHIP_TYPE',
          message: 'Aucun type de jeton avec du stock disponible pour les caves.',
        },
      ],
      algorithm: 'GREEDY_FALLBACK',
      elapsedMs: Date.now() - startTime,
    };
  }

  const unit = gcdOf(types.map((type) => type.value));
  for (const type of types) type.valueUnits = type.value / unit;

  const targetUnitsExact = request.targetBuyIn / unit;
  const targetUnits = Math.floor(targetUnitsExact);
  const maxValueUnits = Math.max(...types.map((type) => type.valueUnits));
  const maxSumUnits = Math.max(
    targetUnits + maxValueUnits,
    Math.ceil(targetUnits * 1.1) + maxValueUnits,
  );

  computeCapacities(types, players, maxPerType, targetUnits, maxSumUnits);

  const smallest = types.reduce((acc, type) => (type.value < acc.value ? type : acc), types[0]!);
  const smallNeed = Math.min(
    maxChipsPerPlayer,
    Math.max(1, Math.ceil(startBigBlind / smallest.value)),
  );

  let algorithm: DistributionResult['algorithm'] = 'DP';
  let warnings: DistributionWarning[] = [];
  let perPlayerCounts: number[] | null = null;

  if (maxSumUnits + 1 <= MAX_DP_STATES) {
    perPlayerCounts = solveWithDp({
      types,
      targetValue: request.targetBuyIn,
      maxSumUnits,
      maxChipsPerPlayer,
      smallNeed,
      startTime,
      timeBudgetMs,
      onBudgetExceeded: () => {
        algorithm = 'GREEDY_FALLBACK';
        warnings.push({
          code: 'TIME_BUDGET_EXCEEDED',
          message: 'Recherche exacte interrompue (budget de temps) : repli glouton utilisé.',
          details: { timeBudgetMs },
        });
      },
    });
  } else {
    algorithm = 'GREEDY_FALLBACK';
    warnings.push({
      code: 'TIME_BUDGET_EXCEEDED',
      message: 'Espace de recherche trop grand : repli glouton utilisé.',
      details: { maxSumUnits },
    });
  }

  if (perPlayerCounts === null) {
    perPlayerCounts = greedySolve(types, request.targetBuyIn, maxChipsPerPlayer);
    if (algorithm === 'DP') algorithm = 'GREEDY_FALLBACK';
  }

  const counts: ChipCount[] = types.map((type, i) => ({
    chipTypeId: type.id,
    count: perPlayerCounts![i] ?? 0,
  }));

  const perPlayerValue = counts.reduce((sum, count) => {
    const type = types.find((candidate) => candidate.id === count.chipTypeId)!;
    return sum + count.count * type.value;
  }, 0);
  const perPlayerChipCount = counts.reduce((sum, count) => sum + count.count, 0);
  const totalByType = counts.map((count) => ({
    chipTypeId: count.chipTypeId,
    count: count.count * players,
  }));
  const difference = perPlayerValue - request.targetBuyIn;
  const exact = difference === 0;

  if (!exact) {
    warnings.push({
      code: 'TARGET_NOT_REACHED',
      message: `Valeur exacte impossible avec le stock et les contraintes : écart de ${difference} unité(s).`,
      details: { target: request.targetBuyIn, obtained: perPlayerValue, difference },
    });
  }
  if (perPlayerChipCount > maxChipsPerPlayer) {
    warnings.push({
      code: 'TOO_MANY_CHIPS',
      message: `La cave contient ${perPlayerChipCount} jetons, au-delà de la limite de ${maxChipsPerPlayer}.`,
      details: { perPlayerChipCount, maxChipsPerPlayer },
    });
  }
  const smallestCount = counts.find((count) => count.chipTypeId === smallest.id)?.count ?? 0;
  if (smallestCount * smallest.value < startBigBlind) {
    warnings.push({
      code: 'SMALL_CHIPS_INSUFFICIENT',
      message: `Pas assez de jetons de petite dénomination pour poster la grosse blinde (${startBigBlind}).`,
      details: { smallestValue: smallest.value, smallestCount, startBigBlind },
    });
  }
  if (types.some((type) => type.capacityPerPlayer === 0)) {
    warnings.push({
      code: 'STOCK_LIMITED',
      message: 'Au moins un type de jeton a été écarté faute de stock suffisant.',
    });
  }

  return {
    counts,
    players,
    perPlayerValue,
    perPlayerChipCount,
    totalValue: perPlayerValue * players,
    targetBuyIn: request.targetBuyIn,
    difference,
    exact,
    totalByType,
    warnings,
    algorithm,
    elapsedMs: Date.now() - startTime,
  };
}

interface DpOptions {
  types: NormalizedType[];
  targetValue: number;
  maxSumUnits: number;
  maxChipsPerPlayer: number;
  smallNeed: number;
  startTime: number;
  timeBudgetMs: number;
  onBudgetExceeded: () => void;
}

function solveWithDp(options: DpOptions): number[] | null {
  const { types, targetValue, maxSumUnits, maxChipsPerPlayer, smallNeed } = options;
  const unit = types[0]!.value / types[0]!.valueUnits;
  const targetUnits = targetValue / unit;
  const size = maxSumUnits + 1;
  const smallestIndex = types.reduce(
    (acc, type, index) => (type.value < types[acc]!.value ? index : acc),
    0,
  );

  const score = new Float64Array(size).fill(Number.NEGATIVE_INFINITY);
  score[0] = 0;
  const layers: Array<{ previous: Int32Array; count: Uint8Array }> = [];

  for (let index = 0; index < types.length; index += 1) {
    const type = types[index]!;
    const nextScore = new Float64Array(size).fill(Number.NEGATIVE_INFINITY);
    const previous = new Int32Array(size).fill(-1);
    const count = new Uint8Array(size);
    let touched = false;

    for (let sum = 0; sum < size; sum += 1) {
      const base = score[sum]!;
      if (base === Number.NEGATIVE_INFINITY) continue;
      const maxCount = Math.min(
        type.capacityPerPlayer,
        Math.floor((size - 1 - sum) / type.valueUnits),
      );
      for (let amount = 0; amount <= maxCount; amount += 1) {
        const nextSum = sum + amount * type.valueUnits;
        const candidate = base + chipUtility({
          typeIndex: index,
          smallestIndex,
          amount,
          smallNeed,
          valueUnits: type.valueUnits,
          targetUnits,
        });
        if (candidate > nextScore[nextSum]!) {
          nextScore[nextSum] = candidate;
          previous[nextSum] = sum;
          count[nextSum] = amount;
          touched = true;
        }
      }
    }

    if (!touched) return null;
    layers.push({ previous, count });
    score.set(nextScore);

    if (Date.now() - options.startTime > options.timeBudgetMs) {
      options.onBudgetExceeded();
      return null;
    }
  }

  let bestSum = -1;
  let bestDifference = Number.POSITIVE_INFINITY;
  for (let sum = 0; sum < size; sum += 1) {
    if (score[sum] === Number.NEGATIVE_INFINITY) continue;
    const value = sum * unit;
    const difference = Math.abs(value - targetValue);
    if (
      difference < bestDifference ||
      (difference === bestDifference && value < (bestSum < 0 ? Number.POSITIVE_INFINITY : bestSum * unit))
    ) {
      bestDifference = difference;
      bestSum = sum;
    }
  }
  if (bestSum < 0) return null;

  const counts = new Array<number>(types.length).fill(0);
  let cursor = bestSum;
  for (let index = types.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer) return null;
    counts[index] = layer.count[cursor] ?? 0;
    cursor = layer.previous[cursor] ?? 0;
  }
  const total = counts.reduce((sum, amount) => sum + amount, 0);
  if (total > maxChipsPerPlayer + 10) {
    // La contrainte est souple dans le score pour ne jamais rendre le problème
    // insoluble ; on préfère tout de même une composition raisonnable.
    return counts;
  }
  return counts;
}

function chipUtility(input: {
  typeIndex: number;
  smallestIndex: number;
  amount: number;
  smallNeed: number;
  valueUnits: number;
  targetUnits: number;
}): number {
  const { typeIndex, smallestIndex, amount, smallNeed, valueUnits, targetUnits } = input;
  let utility = -amount;
  if (typeIndex === smallestIndex) {
    const useful = Math.min(amount, smallNeed);
    utility += 1.35 * useful + 0.25 * Math.max(0, amount - useful);
  }
  if (amount > 0) utility += 4;
  if (valueUnits * 4 >= targetUnits && amount > 0) utility += 1;
  return utility;
}

function greedySolve(
  types: NormalizedType[],
  target: number,
  maxChipsPerPlayer: number,
): number[] {
  const counts = new Array<number>(types.length).fill(0);
  let remaining = target;

  const byDescendingValue = types
    .map((type, index) => ({ type, index }))
    .sort((a, b) => b.type.value - a.type.value);

  for (const { type, index } of byDescendingValue) {
    if (remaining <= 0) break;
    const amount = Math.min(
      type.capacityPerPlayer,
      Math.floor(remaining / type.value),
      maxChipsPerPlayer - counts.reduce((sum, value) => sum + value, 0),
    );
    if (amount > 0) {
      counts[index] = amount;
      remaining -= amount * type.value;
    }
  }

  // Complète l'écart avec les plus petites dénominations.
  if (remaining > 0) {
    const byAscendingValue = types
      .map((type, index) => ({ type, index }))
      .sort((a, b) => a.type.value - b.type.value);
    for (const { type, index } of byAscendingValue) {
      if (remaining <= 0) break;
      const current = counts[index] ?? 0;
      const missing = Math.floor(remaining / type.value);
      const amount = Math.min(missing, type.capacityPerPlayer - current);
      if (amount > 0) {
        counts[index] = current + amount;
        remaining -= amount * type.value;
      }
    }
  }

  // Si l'on reste sous la cible, tente d'ajouter un jeton (dépassement minimal).
  if (remaining > 0) {
    let best: { index: number; overshoot: number } | null = null;
    for (let index = 0; index < types.length; index += 1) {
      const type = types[index]!;
      const current = counts[index] ?? 0;
      if (current >= type.capacityPerPlayer) continue;
      const overshoot = type.value - remaining;
      if (best === null || overshoot < best.overshoot) {
        best = { index, overshoot };
      }
    }
    if (best !== null) {
      counts[best.index] = (counts[best.index] ?? 0) + 1;
    }
  }

  return counts;
}

/** Résumé d'une configuration de cave saisie manuellement (avec mode commun). */
export interface BuyInSummary {
  perPlayerValue: number;
  perPlayerChipCount: number;
  totalValue: number;
  totalChips: number;
  remainingStock: ChipCount[];
  difference: number;
  exact: boolean;
  warnings: DistributionWarning[];
}

export function summarizeBuyIn(input: {
  chipTypes: ChipStock[];
  counts: ChipCount[];
  players: number;
  targetBuyIn: number;
  startBigBlind?: number;
}): BuyInSummary {
  assertInteger(input.players, 'Nombre de joueurs', { min: 1 });
  const warnings: DistributionWarning[] = [];
  let perPlayerValue = 0;
  let perPlayerChipCount = 0;

  for (const count of input.counts) {
    assertInteger(count.count, `Quantité du jeton ${count.chipTypeId}`, { min: 0 });
    const type = input.chipTypes.find((candidate) => candidate.id === count.chipTypeId);
    if (!type) throw new DomainError('UNKNOWN_CHIP_TYPE', `Type de jeton inconnu : ${count.chipTypeId}`);
    const total = count.count * input.players;
    if (total > type.available) {
      warnings.push({
        code: 'STOCK_LIMITED',
        message: `Stock insuffisant pour ${type.label} : ${total} requis, ${type.available} disponibles.`,
        details: { required: total, available: type.available },
      });
    }
    perPlayerValue += count.count * type.value;
    perPlayerChipCount += count.count;
  }

  const difference = perPlayerValue - input.targetBuyIn;
  if (difference !== 0) {
    warnings.push({
      code: 'TARGET_NOT_REACHED',
      message: `La cave vaut ${perPlayerValue} au lieu de ${input.targetBuyIn} (écart ${difference}).`,
      details: { target: input.targetBuyIn, obtained: perPlayerValue, difference },
    });
  }
  const startBigBlind = input.startBigBlind ?? 0;
  if (startBigBlind > 0) {
    const smallest = input.chipTypes
      .slice()
      .sort((a, b) => a.value - b.value)[0];
    const smallestCount =
      input.counts.find((count) => count.chipTypeId === smallest?.id)?.count ?? 0;
    if (smallest && smallestCount * smallest.value < startBigBlind) {
      warnings.push({
        code: 'SMALL_CHIPS_INSUFFICIENT',
        message: 'Pas assez de petits jetons pour poster la grosse blinde de départ.',
      });
    }
  }

  const remainingStock = input.chipTypes.map((type) => {
    const used = (input.counts.find((count) => count.chipTypeId === type.id)?.count ?? 0) * input.players;
    return { chipTypeId: type.id, count: Math.max(0, type.available - used) };
  });

  return {
    perPlayerValue,
    perPlayerChipCount,
    totalValue: perPlayerValue * input.players,
    totalChips: perPlayerChipCount * input.players,
    remainingStock,
    difference,
    exact: difference === 0,
    warnings,
  };
}

/**
 * Applique la règle « Même nombre de jetons ».
 * Les types cochés suivent la quantité commune ; les autres gardent leur
 * quantité manuelle. Le passage d'un mode à l'autre ne détruit aucune valeur.
 */
export function resolveCommonCounts(input: {
  chipTypeIds: string[];
  commonEnabled: Record<string, boolean>;
  commonCount: number;
  manualCounts: Record<string, number>;
}): Record<string, number> {
  assertInteger(input.commonCount, 'Quantité commune', { min: 0 });
  const result: Record<string, number> = {};
  for (const id of input.chipTypeIds) {
    const manual = input.manualCounts[id] ?? 0;
    assertInteger(manual, `Quantité manuelle (${id})`, { min: 0 });
    result[id] = input.commonEnabled[id] ? input.commonCount : manual;
  }
  return result;
}

/** Nombre de jetons utilisables pour les premières blindes (diagnostic). */
export function chipDepth(startingStack: number, bigBlind: number): number {
  if (bigBlind <= 0) return 0;
  return Math.floor(startingStack / bigBlind);
}

export function formatUnits(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}
