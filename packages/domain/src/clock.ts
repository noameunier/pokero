import type { BlindLevel } from './blinds.js';
import { DomainError, assertInteger } from './errors.js';

export type ClockStatus =
  | 'DRAFT'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'RECOVERY_PENDING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ClockSegment {
  /** Index 0-based dans la structure complète (jeu + pauses). */
  index: number;
  kind: 'PLAY' | 'BREAK';
  durationMs: number;
  /** Numéro 1-based du niveau de jeu (null pour une pause). */
  playLevelNumber: number | null;
  /** Position 1-based dans la structure complète. */
  levelPosition: number;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
}

export interface ClockState {
  status: ClockStatus;
  segmentIndex: number;
  /** Horodatage serveur (ms epoch) de l'ancrage courant. Null si en pause ou non démarré. */
  anchorAt: number | null;
  /** Temps restant du segment au moment de l'ancrage. */
  remainingAtAnchorMs: number;
  /** Temps de jeu réellement écoulé avant le segment courant. */
  accumulatedPlayMs: number;
  /** Version monotone, incrémentée à chaque mutation durable. */
  version: number;
  /** Horodatage serveur de la dernière mutation. */
  updatedAt: number;
  /** Vrai si la structure de niveaux est épuisée (le tournoi continue, sans niveau suivant). */
  structureExhausted: boolean;
}

export interface ClockTransition {
  fromIndex: number;
  toIndex: number;
  /** Horodatage serveur de la fin du segment quitté. */
  endedAt: number;
  kind: 'LEVEL_ENDED' | 'STRUCTURE_EXHAUSTED';
}

export interface ResolvedClock {
  segmentIndex: number;
  remainingMs: number;
  accumulatedPlayMs: number;
  transitions: ClockTransition[];
  structureExhausted: boolean;
}

export interface ClockView {
  status: ClockStatus;
  version: number;
  serverNow: number;
  segmentIndex: number;
  levelPosition: number;
  playLevelNumber: number | null;
  kind: 'PLAY' | 'BREAK';
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  remainingMs: number;
  segmentDurationMs: number;
  elapsedInSegmentMs: number;
  endsAt: number | null;
  accumulatedPlayMs: number;
  totalPlayLevels: number;
  structureExhausted: boolean;
  upcoming: ClockSegment[];
}

export type RecoveryMode = 'CONTINUE_ELAPSED' | 'LAST_CHECKPOINT' | 'LAST_CHECKPOINT_PAUSED';

/** Garde-fou : un segment ne peut pas être prolongé de plus de 24 h. */
const MAX_SEGMENT_REMAINING_MS = 24 * 60 * 60 * 1000;

export function buildClockSegments(levels: BlindLevel[]): ClockSegment[] {
  let playLevelNumber = 0;
  return levels.map((level, index) => {
    if (level.kind === 'PLAY') playLevelNumber += 1;
    return {
      index,
      kind: level.kind,
      durationMs: level.durationMinutes * 60_000,
      playLevelNumber: level.kind === 'PLAY' ? playLevelNumber : null,
      levelPosition: level.position,
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      ante: level.ante,
    };
  });
}

export function createClockState(now = Date.now()): ClockState {
  return {
    status: 'DRAFT',
    segmentIndex: 0,
    anchorAt: null,
    remainingAtAnchorMs: 0,
    accumulatedPlayMs: 0,
    version: 0,
    updatedAt: now,
    structureExhausted: false,
  };
}

export function startClock(state: ClockState, segments: ClockSegment[], now = Date.now()): ClockState {
  if (segments.length === 0) {
    throw new DomainError('EMPTY_STRUCTURE', 'Impossible de démarrer sans structure de blindes.');
  }
  if (state.status === 'RUNNING' || state.status === 'PAUSED') {
    throw new DomainError('ALREADY_STARTED', 'Le tournoi est déjà démarré.');
  }
  if (state.status === 'COMPLETED' || state.status === 'CANCELLED') {
    throw new DomainError('CLOSED_TOURNAMENT', 'Ce tournoi est clôturé.');
  }
  return {
    ...state,
    status: 'RUNNING',
    segmentIndex: 0,
    anchorAt: now,
    remainingAtAnchorMs: segments[0]!.durationMs,
    accumulatedPlayMs: 0,
    version: state.version + 1,
    updatedAt: now,
    structureExhausted: false,
  };
}

/**
 * Calcule l'état temporel à `now` sans le persister. Gère la traversée de
 * plusieurs niveaux et les pauses programmées.
 */
export function resolveClock(
  state: ClockState,
  segments: ClockSegment[],
  now = Date.now(),
): ResolvedClock {
  if (segments.length === 0) {
    return {
      segmentIndex: 0,
      remainingMs: 0,
      accumulatedPlayMs: state.accumulatedPlayMs,
      transitions: [],
      structureExhausted: true,
    };
  }

  if (state.status !== 'RUNNING' || state.anchorAt === null) {
    return {
      segmentIndex: Math.min(state.segmentIndex, segments.length - 1),
      remainingMs: Math.max(0, state.remainingAtAnchorMs),
      accumulatedPlayMs: state.accumulatedPlayMs,
      transitions: [],
      structureExhausted: state.structureExhausted,
    };
  }

  const elapsed = Math.max(0, now - state.anchorAt);
  let remaining = state.remainingAtAnchorMs - elapsed;
  let index = Math.min(state.segmentIndex, segments.length - 1);
  let accumulated = state.accumulatedPlayMs;
  const transitions: ClockTransition[] = [];
  let structureExhausted = false;
  let cursorTime = state.remainingAtAnchorMs;

  while (remaining <= 0) {
    const current = segments[index];
    if (!current) break;
    if (current.kind === 'PLAY') accumulated += current.durationMs;

    if (index + 1 >= segments.length) {
      transitions.push({
        fromIndex: index,
        toIndex: index,
        endedAt: state.anchorAt + cursorTime,
        kind: 'STRUCTURE_EXHAUSTED',
      });
      remaining = 0;
      structureExhausted = true;
      break;
    }

    transitions.push({
      fromIndex: index,
      toIndex: index + 1,
      endedAt: state.anchorAt + cursorTime,
      kind: 'LEVEL_ENDED',
    });
    index += 1;
    const next = segments[index]!;
    cursorTime += next.durationMs;
    remaining += next.durationMs;
  }

  return {
    segmentIndex: index,
    remainingMs: Math.max(0, remaining),
    accumulatedPlayMs: accumulated,
    transitions,
    structureExhausted,
  };
}

/** Persiste une éventuelle traversée de niveau. Sans transition, renvoie l'état inchangé. */
export function advanceClock(
  state: ClockState,
  segments: ClockSegment[],
  now = Date.now(),
): { state: ClockState; transitions: ClockTransition[] } {
  const resolved = resolveClock(state, segments, now);
  if (resolved.transitions.length === 0) {
    return { state, transitions: [] };
  }
  return {
    state: {
      ...state,
      segmentIndex: resolved.segmentIndex,
      anchorAt: state.status === 'RUNNING' ? now : null,
      remainingAtAnchorMs: resolved.remainingMs,
      accumulatedPlayMs: resolved.accumulatedPlayMs,
      structureExhausted: resolved.structureExhausted,
      version: state.version + 1,
      updatedAt: now,
    },
    transitions: resolved.transitions,
  };
}

export function pauseClock(
  state: ClockState,
  segments: ClockSegment[],
  now = Date.now(),
): ClockState {
  if (state.status !== 'RUNNING') {
    throw new DomainError('NOT_RUNNING', 'Le tournoi n’est pas en cours.');
  }
  const advanced = advanceClock(state, segments, now).state;
  const resolved = resolveClock(advanced, segments, now);
  return {
    ...advanced,
    status: 'PAUSED',
    anchorAt: null,
    remainingAtAnchorMs: resolved.remainingMs,
    accumulatedPlayMs: resolved.accumulatedPlayMs,
    version: advanced.version + 1,
    updatedAt: now,
  };
}

export function resumeClock(state: ClockState, now = Date.now()): ClockState {
  if (state.status !== 'PAUSED') {
    throw new DomainError('NOT_PAUSED', 'Le tournoi n’est pas en pause.');
  }
  return {
    ...state,
    status: 'RUNNING',
    anchorAt: now,
    version: state.version + 1,
    updatedAt: now,
  };
}

export function nextSegment(
  state: ClockState,
  segments: ClockSegment[],
  now = Date.now(),
): { state: ClockState; transitions: ClockTransition[] } {
  const advanced = advanceClock(state, segments, now);
  const base = advanced.state;
  const resolved = resolveClock(base, segments, now);
  const current = segments[resolved.segmentIndex];
  if (!current) {
    throw new DomainError('EMPTY_STRUCTURE', 'Aucun segment disponible.');
  }
  const elapsedInCurrent =
    base.status === 'RUNNING' && base.anchorAt !== null
      ? Math.max(0, current.durationMs - resolved.remainingMs)
      : 0;
  const accumulated =
    resolved.accumulatedPlayMs + (current.kind === 'PLAY' ? elapsedInCurrent : 0);

  if (resolved.segmentIndex + 1 >= segments.length) {
    return {
      state: {
        ...base,
        segmentIndex: resolved.segmentIndex,
        anchorAt: base.status === 'RUNNING' ? now : null,
        remainingAtAnchorMs: 0,
        accumulatedPlayMs: accumulated,
        structureExhausted: true,
        version: base.version + 1,
        updatedAt: now,
      },
      transitions: [
        ...advanced.transitions,
        {
          fromIndex: resolved.segmentIndex,
          toIndex: resolved.segmentIndex,
          endedAt: now,
          kind: 'STRUCTURE_EXHAUSTED',
        },
      ],
    };
  }

  const nextIndex = resolved.segmentIndex + 1;
  const next = segments[nextIndex]!;
  return {
    state: {
      ...base,
      segmentIndex: nextIndex,
      anchorAt: base.status === 'RUNNING' ? now : null,
      remainingAtAnchorMs: next.durationMs,
      accumulatedPlayMs: accumulated,
      structureExhausted: false,
      version: base.version + 1,
      updatedAt: now,
    },
    transitions: advanced.transitions,
  };
}

export function previousSegment(
  state: ClockState,
  segments: ClockSegment[],
  now = Date.now(),
): ClockState {
  const advanced = advanceClock(state, segments, now).state;
  const resolved = resolveClock(advanced, segments, now);
  const targetIndex = Math.max(0, resolved.segmentIndex - 1);
  const target = segments[targetIndex];
  if (!target) throw new DomainError('EMPTY_STRUCTURE', 'Aucun segment disponible.');
  return {
    ...advanced,
    segmentIndex: targetIndex,
    anchorAt: state.status === 'RUNNING' ? now : null,
    remainingAtAnchorMs: target.durationMs,
    structureExhausted: false,
    version: advanced.version + 1,
    updatedAt: now,
  };
}

export function addTime(
  state: ClockState,
  segments: ClockSegment[],
  deltaMs: number,
  now = Date.now(),
): ClockState {
  assertInteger(deltaMs, 'Ajustement de temps');
  const advanced = advanceClock(state, segments, now).state;
  const resolved = resolveClock(advanced, segments, now);
  const current = segments[resolved.segmentIndex];
  if (!current) throw new DomainError('EMPTY_STRUCTURE', 'Aucun segment disponible.');
  const updatedRemaining = Math.min(
    MAX_SEGMENT_REMAINING_MS,
    Math.max(0, resolved.remainingMs + deltaMs),
  );
  return {
    ...advanced,
    anchorAt: advanced.status === 'RUNNING' ? now : null,
    remainingAtAnchorMs: updatedRemaining,
    accumulatedPlayMs: resolved.accumulatedPlayMs,
    version: advanced.version + 1,
    updatedAt: now,
  };
}

export function setRemaining(
  state: ClockState,
  segments: ClockSegment[],
  remainingMs: number,
  now = Date.now(),
): ClockState {
  assertInteger(remainingMs, 'Temps restant', { min: 0 });
  const advanced = advanceClock(state, segments, now).state;
  const resolved = resolveClock(advanced, segments, now);
  const current = segments[resolved.segmentIndex];
  if (!current) throw new DomainError('EMPTY_STRUCTURE', 'Aucun segment disponible.');
  return {
    ...advanced,
    anchorAt: advanced.status === 'RUNNING' ? now : null,
    remainingAtAnchorMs: Math.min(remainingMs, MAX_SEGMENT_REMAINING_MS),
    accumulatedPlayMs: resolved.accumulatedPlayMs,
    version: advanced.version + 1,
    updatedAt: now,
  };
}

export function completeClock(state: ClockState, now = Date.now()): ClockState {
  if (state.status === 'COMPLETED' || state.status === 'CANCELLED') {
    throw new DomainError('ALREADY_CLOSED', 'Ce tournoi est déjà clôturé.');
  }
  return {
    ...state,
    status: 'COMPLETED',
    anchorAt: null,
    remainingAtAnchorMs: 0,
    version: state.version + 1,
    updatedAt: now,
  };
}

export function cancelClock(state: ClockState, now = Date.now()): ClockState {
  if (state.status === 'COMPLETED' || state.status === 'CANCELLED') {
    throw new DomainError('ALREADY_CLOSED', 'Ce tournoi est déjà clôturé.');
  }
  return {
    ...state,
    status: 'CANCELLED',
    anchorAt: null,
    version: state.version + 1,
    updatedAt: now,
  };
}

export function viewClock(
  state: ClockState,
  segments: ClockSegment[],
  now = Date.now(),
): ClockView {
  const resolved = resolveClock(state, segments, now);
  const current = segments[resolved.segmentIndex] ?? segments[0]!;
  const notStarted = state.status === 'DRAFT' || state.status === 'READY';
  const remainingMs = notStarted && state.remainingAtAnchorMs === 0
    ? current.durationMs
    : Math.max(0, resolved.remainingMs);
  const elapsedInSegmentMs = Math.max(0, current.durationMs - remainingMs);
  const totalPlayLevels = segments.filter((segment) => segment.kind === 'PLAY').length;
  const upcoming = segments.slice(resolved.segmentIndex + 1, resolved.segmentIndex + 5);

  return {
    status: state.status,
    version: state.version,
    serverNow: now,
    segmentIndex: resolved.segmentIndex,
    levelPosition: current.levelPosition,
    playLevelNumber: current.playLevelNumber,
    kind: current.kind,
    smallBlind: current.smallBlind,
    bigBlind: current.bigBlind,
    ante: current.ante,
    remainingMs,
    segmentDurationMs: current.durationMs,
    elapsedInSegmentMs,
    endsAt: state.status === 'RUNNING' ? now + remainingMs : null,
    accumulatedPlayMs:
      resolved.accumulatedPlayMs + (current.kind === 'PLAY' ? elapsedInSegmentMs : 0),
    totalPlayLevels,
    structureExhausted: resolved.structureExhausted,
    upcoming,
  };
}

/**
 * Récupération après interruption de la session organisateur.
 * Le mode est toujours une décision administrative explicite.
 */
export function recoverClock(
  checkpoint: ClockState,
  segments: ClockSegment[],
  mode: RecoveryMode,
  now = Date.now(),
): { state: ClockState; transitions: ClockTransition[] } {
  if (mode === 'CONTINUE_ELAPSED') {
    const advanced = advanceClock({ ...checkpoint, status: 'RUNNING' }, segments, now);
    return {
      state: {
        ...advanced.state,
        status: 'RUNNING',
        anchorAt: now,
        version: checkpoint.version + 1,
        updatedAt: now,
      },
      transitions: advanced.transitions,
    };
  }

  return {
    state: {
      ...checkpoint,
      status: mode === 'LAST_CHECKPOINT' ? 'RUNNING' : 'PAUSED',
      anchorAt: mode === 'LAST_CHECKPOINT' ? now : null,
      remainingAtAnchorMs: checkpoint.remainingAtAnchorMs,
      version: checkpoint.version + 1,
      updatedAt: now,
    },
    transitions: [],
  };
}

/** Formatage mm:ss (ou h:mm:ss) pour l'affichage. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
