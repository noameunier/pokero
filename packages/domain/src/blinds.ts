import { DomainError, assertInteger, roundTo } from './errors.js';

export type BlindLevelKind = 'PLAY' | 'BREAK';

export interface BlindLevel {
  /** Position 1-based dans la structure. */
  position: number;
  kind: BlindLevelKind;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  durationMinutes: number;
  /** Durée cumulée à la fin de ce niveau (minutes). */
  cumulativeMinutes: number;
}

export type BlindWarningCode =
  | 'TARGET_DURATION_UNREACHABLE'
  | 'STARTING_DEPTH_LOW'
  | 'STRUCTURE_TOO_SHALLOW'
  | 'STRUCTURE_TOO_DEEP'
  | 'NO_BREAK';

export interface BlindWarning {
  code: BlindWarningCode;
  message: string;
  details?: Record<string, number | string>;
}

export interface BlindStructure {
  levels: BlindLevel[];
  startingStack: number;
  startingSmallBlind: number;
  startingBigBlind: number;
  startingDepth: number;
  targetDurationMinutes: number;
  totalDurationMinutes: number;
  warnings: BlindWarning[];
  heuristic: string;
}

export interface BlindsRequest {
  startingStack: number;
  targetDurationMinutes: number;
  levelDurationMinutes?: number;
  breakDurationMinutes?: number;
  breakEveryLevels?: number;
  startingSmallBlind?: number;
  startingBigBlind?: number;
  /** Plus petite dénomination utilisable (les blindes seront des multiples). */
  roundUnit?: number;
  anteFromLevel?: number;
  antePercentOfBigBlind?: number;
  maxLevels?: number;
  growthFactor?: number;
}

const DEFAULT_LEVEL_MINUTES = 20;
const DEFAULT_BREAK_MINUTES = 15;
const DEFAULT_BREAK_EVERY = 4;
const DEFAULT_MAX_LEVELS = 40;
const DEFAULT_ANTE_FROM = 5;
const DEFAULT_ANTE_PERCENT = 0.125;
const MIN_GROWTH = 1.15;
const MAX_GROWTH = 1.6;

/**
 * Génère une structure de blindes régulière.
 *
 * Heuristique :
 *  - profondeur de départ cible : 100 grosses blindes ;
 *  - progression géométrique, facteur calculé pour terminer vers 10 BB
 *    (borné entre +15 % et +60 % par niveau) ;
 *  - blindes arrondies à la plus petite dénomination disponible ;
 *  - ante à partir du niveau 5, environ 12,5 % de la grosse blinde ;
 *  - pause toutes les 4 mains.
 *
 * La durée cible est une estimation : la durée réelle dépend des éliminations.
 * La structure n'annonce jamais de vainqueur et peut être prolongée.
 */
export function generateBlindStructure(request: BlindsRequest): BlindStructure {
  assertInteger(request.startingStack, 'Tapis de départ', { min: 1 });
  assertInteger(request.targetDurationMinutes, 'Durée cible', { min: 1 });

  const levelMinutes = request.levelDurationMinutes ?? DEFAULT_LEVEL_MINUTES;
  const breakMinutes = request.breakDurationMinutes ?? DEFAULT_BREAK_MINUTES;
  const breakEvery = Math.max(0, request.breakEveryLevels ?? DEFAULT_BREAK_EVERY);
  const roundUnit = Math.max(1, request.roundUnit ?? 1);
  const anteFromLevel = Math.max(1, request.anteFromLevel ?? DEFAULT_ANTE_FROM);
  const antePercent = request.antePercentOfBigBlind ?? DEFAULT_ANTE_PERCENT;
  const maxLevels = Math.max(1, request.maxLevels ?? DEFAULT_MAX_LEVELS);

  assertInteger(levelMinutes, 'Durée d’un niveau', { min: 1 });
  assertInteger(breakMinutes, 'Durée d’une pause', { min: 0 });

  const startingSmallBlind =
    request.startingSmallBlind ??
    Math.max(roundUnit, roundTo(request.startingStack / 200, roundUnit));
  const startingBigBlind = request.startingBigBlind ?? startingSmallBlind * 2;

  if (startingSmallBlind <= 0 || startingBigBlind <= 0) {
    throw new DomainError('INVALID_BLINDS', 'Les blindes de départ doivent être positives.');
  }
  if (startingBigBlind < startingSmallBlind * 2) {
    throw new DomainError('INVALID_BLINDS', 'La grosse blinde doit valoir au moins deux fois la petite.');
  }

  const playLevelCount = countPlayLevels({
    targetDurationMinutes: request.targetDurationMinutes,
    levelMinutes,
    breakMinutes,
    breakEvery,
    maxLevels,
  });

  const startingDepth = request.startingStack / startingBigBlind;
  const targetEndBigBlind = Math.max(startingBigBlind, request.startingStack / 10);
  const steps = Math.max(1, playLevelCount - 1);
  const theoreticalGrowth = Math.pow(targetEndBigBlind / startingBigBlind, 1 / steps);
  const growth = clampGrowth(request.growthFactor ?? theoreticalGrowth);

  const levels: BlindLevel[] = [];
  let cumulative = 0;
  let smallBlind = startingSmallBlind;

  for (let index = 0; index < playLevelCount; index += 1) {
    if (index > 0) {
      const next = roundTo(smallBlind * growth, roundUnit);
      smallBlind = Math.max(smallBlind + roundUnit, next);
    }
    const bigBlind = smallBlind * 2;
    const ante =
      index + 1 >= anteFromLevel
        ? Math.max(roundUnit, roundTo(bigBlind * antePercent, roundUnit))
        : 0;

    cumulative += levelMinutes;
    levels.push({
      position: levels.length + 1,
      kind: 'PLAY',
      smallBlind,
      bigBlind,
      ante: ante > 0 ? ante : null,
      durationMinutes: levelMinutes,
      cumulativeMinutes: cumulative,
    });

    if (breakEvery > 0 && (index + 1) % breakEvery === 0 && index + 1 < playLevelCount) {
      cumulative += breakMinutes;
      levels.push({
        position: levels.length + 1,
        kind: 'BREAK',
        smallBlind: null,
        bigBlind: null,
        ante: null,
        durationMinutes: breakMinutes,
        cumulativeMinutes: cumulative,
      });
    }
  }

  const totalDurationMinutes = cumulative;
  const finalBigBlind = levels
    .filter((level) => level.kind === 'PLAY')
    .at(-1)?.bigBlind ?? startingBigBlind;

  const warnings: BlindWarning[] = [];
  if (totalDurationMinutes < request.targetDurationMinutes * 0.9) {
    warnings.push({
      code: 'TARGET_DURATION_UNREACHABLE',
      message: `La structure atteint ${totalDurationMinutes} min pour une cible de ${request.targetDurationMinutes} min (limite de ${maxLevels} niveaux).`,
      details: { totalDurationMinutes, targetDurationMinutes: request.targetDurationMinutes, maxLevels },
    });
  }
  if (startingDepth < 30) {
    warnings.push({
      code: 'STARTING_DEPTH_LOW',
      message: `Profondeur de départ faible : ${Math.round(startingDepth)} grosses blindes.`,
      details: { startingDepth },
    });
  }
  if (finalBigBlind < request.startingStack / 40) {
    warnings.push({
      code: 'STRUCTURE_TOO_SHALLOW',
      message: 'La structure monte très vite : le tournoi risque de se terminer avant la durée cible.',
      details: { finalBigBlind },
    });
  }
  if (finalBigBlind > request.startingStack / 6) {
    warnings.push({
      code: 'STRUCTURE_TOO_DEEP',
      message: 'La structure reste profonde : le tournoi risque de dépasser la durée cible.',
      details: { finalBigBlind },
    });
  }
  if (breakEvery === 0) {
    warnings.push({ code: 'NO_BREAK', message: 'Aucune pause programmée.' });
  }

  return {
    levels,
    startingStack: request.startingStack,
    startingSmallBlind,
    startingBigBlind,
    startingDepth,
    targetDurationMinutes: request.targetDurationMinutes,
    totalDurationMinutes,
    warnings,
    heuristic:
      'Progression géométrique bornée, arrondie à la plus petite dénomination ; durée indicative.',
  };
}

function countPlayLevels(input: {
  targetDurationMinutes: number;
  levelMinutes: number;
  breakMinutes: number;
  breakEvery: number;
  maxLevels: number;
}): number {
  for (let count = 1; count <= input.maxLevels; count += 1) {
    const breaks = input.breakEvery > 0 ? Math.floor((count - 1) / input.breakEvery) : 0;
    const total = count * input.levelMinutes + breaks * input.breakMinutes;
    if (total >= input.targetDurationMinutes) return count;
  }
  return input.maxLevels;
}

function clampGrowth(value: number): number {
  if (!Number.isFinite(value)) return 1.3;
  return Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, value));
}

/**
 * Prolonge une structure existante sans jamais déclarer le tournoi terminé.
 * Les niveaux ajoutés poursuivent la progression à partir des dernières blindes.
 */
export function extendBlindStructure(
  structure: BlindStructure,
  levelsToAdd: number,
  options: { growthFactor?: number; roundUnit?: number; levelDurationMinutes?: number; antePercentOfBigBlind?: number } = {},
): BlindStructure {
  assertInteger(levelsToAdd, 'Nombre de niveaux à ajouter', { min: 1 });
  const roundUnit = Math.max(1, options.roundUnit ?? 1);
  const growth = clampGrowth(options.growthFactor ?? 1.3);
  const duration = options.levelDurationMinutes ?? 20;
  const antePercent = options.antePercentOfBigBlind ?? DEFAULT_ANTE_PERCENT;

  const lastPlay = [...structure.levels].reverse().find((level) => level.kind === 'PLAY');
  let smallBlind = lastPlay?.smallBlind ?? structure.startingSmallBlind;
  let cumulative = structure.levels.at(-1)?.cumulativeMinutes ?? 0;

  const levels = structure.levels.map((level) => ({ ...level }));

  for (let index = 0; index < levelsToAdd; index += 1) {
    smallBlind = Math.max(smallBlind + roundUnit, roundTo(smallBlind * growth, roundUnit));
    const bigBlind = smallBlind * 2;
    cumulative += duration;
    levels.push({
      position: levels.length + 1,
      kind: 'PLAY',
      smallBlind,
      bigBlind,
      ante: Math.max(roundUnit, roundTo(bigBlind * antePercent, roundUnit)),
      durationMinutes: duration,
      cumulativeMinutes: cumulative,
    });
  }

  return {
    ...structure,
    levels,
    totalDurationMinutes: cumulative,
    warnings: structure.warnings.filter((warning) => warning.code !== 'TARGET_DURATION_UNREACHABLE'),
  };
}

/** Structure de démonstration « Express » (≈ 1 h 30). */
export function expressBlindStructure(): BlindStructure {
  return generateBlindStructure({
    startingStack: 10_000,
    targetDurationMinutes: 90,
    levelDurationMinutes: 10,
    breakDurationMinutes: 10,
    breakEveryLevels: 5,
    roundUnit: 25,
    maxLevels: 14,
  });
}

/** Structure de démonstration « Classique » (≈ 3 h). */
export function classicBlindStructure(): BlindStructure {
  return generateBlindStructure({
    startingStack: 20_000,
    targetDurationMinutes: 180,
    levelDurationMinutes: 20,
    breakDurationMinutes: 15,
    breakEveryLevels: 4,
    roundUnit: 25,
    maxLevels: 24,
  });
}

/** Structure de démonstration « Deepstack » (≈ 5 h). */
export function deepstackBlindStructure(): BlindStructure {
  return generateBlindStructure({
    startingStack: 50_000,
    targetDurationMinutes: 300,
    levelDurationMinutes: 30,
    breakDurationMinutes: 20,
    breakEveryLevels: 4,
    roundUnit: 100,
    maxLevels: 24,
  });
}
