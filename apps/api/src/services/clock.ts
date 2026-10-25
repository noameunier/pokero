import {
  advanceClock,
  buildClockSegments,
  viewClock,
  type BlindLevel,
  type ClockSegment,
  type ClockState,
  type ClockStatus,
  type ClockView,
} from '@pokero/domain';
import type { Tx } from '../db/types.ts';

export interface DbBlindLevel {
  position: number;
  kind: 'PLAY' | 'BREAK';
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  durationMinutes: number;
}

export function toDomainLevels(rows: DbBlindLevel[]): BlindLevel[] {
  let cumulative = 0;
  return rows.map((row) => {
    cumulative += row.durationMinutes;
    return {
      position: row.position,
      kind: row.kind,
      smallBlind: row.smallBlind,
      bigBlind: row.bigBlind,
      ante: row.ante,
      durationMinutes: row.durationMinutes,
      cumulativeMinutes: cumulative,
    };
  });
}

export function segmentsFor(rows: DbBlindLevel[]): ClockSegment[] {
  return buildClockSegments(toDomainLevels(rows));
}

export interface DbClockState {
  status: string;
  segmentIndex: number;
  anchorAt: Date | null;
  remainingAtAnchorMs: number;
  accumulatedPlayMs: number;
  version: number;
  structureExhausted: boolean;
  updatedAt: Date;
}

export function toClockState(row: DbClockState): ClockState {
  return {
    status: row.status as ClockStatus,
    segmentIndex: row.segmentIndex,
    anchorAt: row.anchorAt ? row.anchorAt.getTime() : null,
    remainingAtAnchorMs: row.remainingAtAnchorMs,
    accumulatedPlayMs: row.accumulatedPlayMs,
    version: row.version,
    updatedAt: row.updatedAt.getTime(),
    structureExhausted: row.structureExhausted,
  };
}

export async function saveClockState(
  tx: Tx,
  tournamentId: string,
  state: ClockState,
): Promise<void> {
  await tx.tournamentClockState.update({
    where: { tournamentId },
    data: {
      status: state.status,
      segmentIndex: state.segmentIndex,
      anchorAt: state.anchorAt === null ? null : new Date(state.anchorAt),
      remainingAtAnchorMs: state.remainingAtAnchorMs,
      accumulatedPlayMs: state.accumulatedPlayMs,
      version: state.version,
      structureExhausted: state.structureExhausted,
    },
  });
}

export function computeView(
  clockRow: DbClockState,
  levelRows: DbBlindLevel[],
  now = Date.now(),
): ClockView {
  const segments = segmentsFor(levelRows);
  return viewClock(toClockState(clockRow), segments, now);
}

/** Persiste les transitions de niveau détectées (utilisé par le ticker). */
export async function persistAutoAdvance(
  tx: Tx,
  tournamentId: string,
  clockRow: DbClockState,
  levelRows: DbBlindLevel[],
  now = Date.now(),
): Promise<{ state: ClockState; changed: boolean; transitions: ReturnType<typeof advanceClock>['transitions'] }> {
  const state = toClockState(clockRow);
  const segments = segmentsFor(levelRows);
  const result = advanceClock(state, segments, now);
  if (result.transitions.length === 0) {
    return { state, changed: false, transitions: [] };
  }
  await saveClockState(tx, tournamentId, result.state);
  return { state: result.state, changed: true, transitions: result.transitions };
}

export function firstSegmentDuration(levelRows: DbBlindLevel[]): number {
  const segments = segmentsFor(levelRows);
  return segments[0]?.durationMs ?? 0;
}
