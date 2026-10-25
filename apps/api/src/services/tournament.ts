import {
  completeClock,
  cancelClock,
  createClockState,
  nextSegment,
  pauseClock,
  previousSegment,
  recoverClock,
  resumeClock,
  setRemaining,
  startClock,
  addTime,
  viewClock,
  type ClockSegment,
  type ClockState,
  type ClockView,
  type RecoveryMode,
} from '@pokero/domain';
import type {
  AddOnConfig,
  AlertsConfig,
  BlindConfig,
  BuyInConfig,
  ClockCommandInput,
  DisplayConfig,
  RebuyConfig,
} from '@pokero/contracts';
import type { FastifyInstance } from 'fastify';
import type { Prisma, Tx } from '../db/types.ts';
import { AppError } from '../lib/app-error.ts';
import {
  assertStockAvailable,
  fetchFreeStock,
  loadChipTypes,
  planBuyIn,
  type BuyInPlan,
} from './inventory.ts';
import {
  firstSegmentDuration,
  persistAutoAdvance,
  saveClockState,
  segmentsFor,
  toClockState,
  type DbBlindLevel,
  type DbClockState,
} from './clock.ts';
import { getEnv } from '../config/env.ts';
import { hashPassword, hmacSign, hmacVerify, verifyPassword } from '../lib/crypto.ts';

export interface TournamentSettings {
  buyIn: BuyInConfig;
  blinds: BlindConfig;
  rebuy: RebuyConfig;
  addOn: AddOnConfig;
  alerts: AlertsConfig;
  display: DisplayConfig;
  chipCaseName: string;
  pinConfigured: boolean;
}

export interface PublicDisplayConfig {
  showRanking: boolean;
  showPlayers: boolean;
}

export const DEFAULT_SETTINGS: Omit<TournamentSettings, 'buyIn' | 'blinds' | 'chipCaseName' | 'pinConfigured'> = {
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
  alerts: {
    soundBeforeLevel: true,
    soundAtLevel: true,
    vibration: true,
    volume: 0.8,
  },
  display: {
    showRanking: false,
    showPlayers: true,
  },
};

export const OPEN_STATUSES = ['DRAFT', 'READY', 'RUNNING', 'PAUSED'] as const;

export function settingsFromSnapshot(snapshot: unknown): TournamentSettings {
  return snapshot as TournamentSettings;
}

export async function loadOwnedTournament(
  app: FastifyInstance,
  ownerId: string,
  tournamentId: string,
) {
  const tournament = await app.prisma.tournament.findFirst({
    where: { id: tournamentId, ownerId },
    include: {
      levels: { orderBy: { position: 'asc' } },
      clockState: true,
      configuration: true,
      participants: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!tournament) throw AppError.notFound('Tournoi introuvable.');
  return tournament;
}

export function tournamentView(
  tournament: {
    id: string;
    name: string;
    status: string;
    publicRanking: boolean;
    pinHash?: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    levels: DbBlindLevel[];
    clockState: DbClockState | null;
    participants: Array<{
      id: string;
      displayName: string;
      status: string;
      rebuyCount: number;
      addOnCount: number;
      eliminationSequence: number | null;
      userId: string | null;
    }>;
    configuration: { snapshot: unknown } | null;
  },
  now = Date.now(),
) {
  const view =
    tournament.clockState === null
      ? null
      : viewClock(
          toClockState(tournament.clockState),
          segmentsFor(tournament.levels),
          now,
        );

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    publicRanking: tournament.publicRanking,
    pinRequired: Boolean(tournament.pinHash),
    createdAt: tournament.createdAt,
    startedAt: tournament.startedAt,
    completedAt: tournament.completedAt,
    settings: tournament.configuration?.snapshot ?? null,
    clock: view,
    levels: tournament.levels,
    participants: tournament.participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      status: participant.status,
      rebuyCount: participant.rebuyCount,
      addOnCount: participant.addOnCount,
      eliminationSequence: participant.eliminationSequence,
      linkedAccount: participant.userId !== null,
    })),
    activePlayers: tournament.participants.filter((p) => p.status === 'ACTIVE').length,
  };
}

/** Recalcule l'allocation de caves pour le nombre actuel de participants. */
export async function syncAllocation(tx: Tx, tournamentId: string): Promise<BuyInPlan | null> {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      participants: true,
      configuration: true,
    },
  });
  if (!tournament || !tournament.chipCaseId || !tournament.configuration) return null;

  const settings = settingsFromSnapshot(tournament.configuration.snapshot);
  const players = tournament.participants.length;
  const chipTypes = await loadChipTypes(tx, tournament.chipCaseId);

  const ownReservations = await tx.inventoryReservation.findMany({
    where: { tournamentId, status: 'ACTIVE' },
  });
  const ownByType = new Map(ownReservations.map((row) => [row.chipTypeId, row.quantity]));
  const freeOther = await fetchFreeStock(
    tx,
    chipTypes.map((type) => type.id),
  );

  if (players === 0) {
    await releaseReservations(tx, tournamentId);
    await tx.chipAllocation.deleteMany({ where: { tournamentId } });
    return null;
  }

  const potential = new Map(
    chipTypes.map((type) => [
      type.id,
      (freeOther.get(type.id) ?? 0) + (ownByType.get(type.id) ?? 0),
    ]),
  );

  const plan = planBuyIn({
    chipTypes,
    config: { ...settings.buyIn, players },
    freeStock: potential,
    startBigBlind: settings.blinds.startingBigBlind,
  });
  assertStockAvailable(plan);

  await tx.chipAllocation.deleteMany({ where: { tournamentId } });

  for (const count of plan.counts) {
    if (count.total > 0) {
      await tx.chipAllocation.create({
        data: {
          tournamentId,
          chipTypeId: count.chipTypeId,
          perPlayerCount: count.perPlayer,
          players,
          totalQuantity: count.total,
        },
      });
    }

    const own = ownByType.get(count.chipTypeId) ?? 0;
    if (count.total === 0) {
      if (own > 0) {
        await tx.inventoryReservation.updateMany({
          where: { tournamentId, chipTypeId: count.chipTypeId, status: 'ACTIVE' },
          data: { status: 'RELEASED', releasedAt: new Date(), quantity: 0 },
        });
      }
      continue;
    }

    if (own > 0) {
      await tx.inventoryReservation.updateMany({
        where: { tournamentId, chipTypeId: count.chipTypeId, status: 'ACTIVE' },
        data: { quantity: count.total },
      });
    } else {
      await tx.inventoryReservation.create({
        data: { tournamentId, chipTypeId: count.chipTypeId, quantity: count.total },
      });
    }
  }

  return plan;
}

export async function releaseReservations(tx: Tx, tournamentId: string): Promise<void> {
  await tx.inventoryReservation.updateMany({
    where: { tournamentId, status: 'ACTIVE' },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
}

export function composeChipsForValue(input: {
  chipTypes: Awaited<ReturnType<typeof loadChipTypes>>;
  freeStock: Map<string, number>;
  value: number;
  maxChipsPerPlayer: number;
  startBigBlind?: number;
}): BuyInPlan {
  return planBuyIn({
    chipTypes: input.chipTypes,
    config: {
      players: 1,
      targetBuyIn: input.value,
      startingStack: input.value,
      mode: 'AUTO',
      counts: {},
      commonEnabled: {},
      commonCount: 0,
      maxChipsPerPlayer: input.maxChipsPerPlayer,
    },
    freeStock: input.freeStock,
    startBigBlind: input.startBigBlind,
  });
}

export async function reserveExtraChips(
  tx: Tx,
  tournamentId: string,
  counts: Array<{ chipTypeId: string; count: number }>,
): Promise<void> {
  for (const count of counts) {
    if (count.count <= 0) continue;
    const existing = await tx.inventoryReservation.findFirst({
      where: { tournamentId, chipTypeId: count.chipTypeId },
    });
    if (existing && existing.status === 'ACTIVE') {
      await tx.inventoryReservation.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + count.count },
      });
    } else if (existing) {
      await tx.inventoryReservation.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', releasedAt: null, quantity: count.count },
      });
    } else {
      await tx.inventoryReservation.create({
        data: { tournamentId, chipTypeId: count.chipTypeId, quantity: count.count },
      });
    }
  }
}

export function clockJson(state: ClockState): Prisma.InputJsonValue {
  return {
    status: state.status,
    segmentIndex: state.segmentIndex,
    anchorAt: state.anchorAt,
    remainingAtAnchorMs: state.remainingAtAnchorMs,
    accumulatedPlayMs: state.accumulatedPlayMs,
    version: state.version,
    structureExhausted: state.structureExhausted,
    updatedAt: state.updatedAt,
  };
}

export interface ClockCommandResult {
  view: ClockView;
  replayed: boolean;
  eventId: string | null;
}

export async function applyClockCommand(
  app: FastifyInstance,
  input: {
    ownerId: string;
    tournamentId: string;
    actorId: string;
    command: ClockCommandInput;
  },
): Promise<ClockCommandResult> {
  const { ownerId, tournamentId, actorId, command } = input;

  const result = await app.prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findFirst({
      where: { id: tournamentId, ownerId },
      include: {
        levels: { orderBy: { position: 'asc' } },
        clockState: true,
        participants: { where: { status: 'ACTIVE' } },
      },
    });
    if (!tournament) throw AppError.notFound('Tournoi introuvable.');
    if (!tournament.clockState) throw AppError.conflict('NO_CLOCK', 'Ce tournoi n’a pas de chronomètre.');

    const existingEvent = await tx.tournamentEvent.findFirst({
      where: { tournamentId, idempotencyKey: command.idempotencyKey },
    });
    if (existingEvent) {
      const view = viewClock(
        toClockState(tournament.clockState),
        segmentsFor(tournament.levels),
        Date.now(),
      );
      return { view, replayed: true, eventId: existingEvent.id };
    }

    if (tournament.clockState.version !== command.expectedVersion) {
      throw AppError.conflict('VERSION_CONFLICT', 'L’état du chronomètre a changé. Rechargez puis réessayez.', {
        currentVersion: tournament.clockState.version,
        expectedVersion: command.expectedVersion,
      });
    }

    const now = Date.now();
    const segments = segmentsFor(tournament.levels);
    let state = toClockState(tournament.clockState);
    let tournamentStatus = tournament.status;
    let startedAt = tournament.startedAt;
    let completedAt = tournament.completedAt;
    let cancelledAt = tournament.cancelledAt;
    let release = false;

    switch (command.action) {
      case 'START': {
        if (tournament.participants.length < 2) {
          throw AppError.conflict('NOT_ENOUGH_PLAYERS', 'Il faut au moins deux joueurs pour démarrer.');
        }
        state = startClock(state, segments, now);
        state = { ...state, remainingAtAnchorMs: firstSegmentDuration(tournament.levels) };
        tournamentStatus = 'RUNNING';
        startedAt ??= new Date(now);
        break;
      }
      case 'PAUSE':
        state = pauseClock(state, segments, now);
        tournamentStatus = 'PAUSED';
        break;
      case 'RESUME':
        state = resumeClock(state, now);
        tournamentStatus = 'RUNNING';
        break;
      case 'NEXT': {
        const advanced = nextSegment(state, segments, now);
        state = advanced.state;
        break;
      }
      case 'PREVIOUS':
        state = previousSegment(state, segments, now);
        break;
      case 'ADD_TIME': {
        if (typeof command.seconds !== 'number' || command.seconds === 0) {
          throw AppError.badRequest('MISSING_SECONDS', 'Indiquez un nombre de secondes non nul.');
        }
        state = addTime(state, segments, command.seconds * 1000, now);
        break;
      }
      case 'SET_REMAINING': {
        if (typeof command.seconds !== 'number' || command.seconds < 0) {
          throw AppError.badRequest('MISSING_SECONDS', 'Indiquez un temps restant en secondes.');
        }
        state = setRemaining(state, segments, command.seconds * 1000, now);
        break;
      }
      case 'COMPLETE': {
        if (tournament.participants.length > 1) {
          throw AppError.conflict(
            'PLAYERS_REMAIN',
            'Des joueurs sont encore en course : éliminez-les ou déclarez le vainqueur.',
          );
        }
        state = completeClock(state, now);
        tournamentStatus = 'COMPLETED';
        completedAt = new Date(now);
        release = true;
        break;
      }
      case 'CANCEL':
        state = cancelClock(state, now);
        tournamentStatus = 'CANCELLED';
        cancelledAt = new Date(now);
        release = true;
        break;
      case 'RECOVER': {
        const mode = command.recoveryMode;
        if (!mode) {
          throw AppError.badRequest('MISSING_RECOVERY_MODE', 'Choisissez un mode de récupération.');
        }
        if (state.status !== 'RUNNING' && state.status !== 'PAUSED') {
          throw AppError.conflict('NOT_RECOVERABLE', 'Ce tournoi n’est pas dans un état récupérable.');
        }
        const recovered = recoverClock(state, segments, mode as RecoveryMode, now);
        state = recovered.state;
        tournamentStatus = state.status === 'PAUSED' ? 'PAUSED' : 'RUNNING';
        break;
      }
      default:
        throw AppError.badRequest('UNKNOWN_ACTION', 'Action inconnue.');
    }

    await saveClockState(tx, tournamentId, state);

    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        status: tournamentStatus as
          | 'DRAFT'
          | 'READY'
          | 'RUNNING'
          | 'PAUSED'
          | 'RECOVERY_PENDING'
          | 'COMPLETED'
          | 'CANCELLED',
        startedAt,
        completedAt,
        cancelledAt,
      },
    });

    if (release) {
      await releaseReservations(tx, tournamentId);
    }

    const event = await tx.tournamentEvent.create({
      data: {
        tournamentId,
        actorId,
        type: `CLOCK_${command.action}`,
        payload: {
          action: command.action,
          fromVersion: command.expectedVersion,
          toVersion: state.version,
          seconds: command.seconds ?? null,
          recoveryMode: command.recoveryMode ?? null,
          segmentIndex: state.segmentIndex,
        },
        version: state.version,
        idempotencyKey: command.idempotencyKey,
      },
    });

    await tx.tournamentClockCheckpoint.create({
      data: {
        tournamentId,
        state: clockJson(state),
        version: state.version,
        reason: command.action,
        createdById: actorId,
      },
    });

    const view = viewClock(state, segments, now);
    return { view, replayed: false, eventId: event.id };
  });

  return result;
}

export async function currentPlayLevel(
  clockRow: DbClockState,
  levelRows: DbBlindLevel[],
  now = Date.now(),
): Promise<number | null> {
  const view = viewClock(toClockState(clockRow), segmentsFor(levelRows), now);
  return view.playLevelNumber;
}

export async function assertClockFresh(
  tx: Tx,
  tournamentId: string,
  clockRow: DbClockState,
  levelRows: DbBlindLevel[],
  now = Date.now(),
): Promise<ClockState> {
  const result = await persistAutoAdvance(tx, tournamentId, clockRow, levelRows, now);
  return result.state;
}

export function segmentsOf(levels: DbBlindLevel[]): ClockSegment[] {
  return segmentsFor(levels);
}

export async function hashPin(pin: string): Promise<string> {
  return hashPassword(`${getEnv().PIN_PEPPER}:${pin}`);
}

export async function verifyPin(hash: string, pin: string): Promise<boolean> {
  return verifyPassword(hash, `${getEnv().PIN_PEPPER}:${pin}`);
}

export function fallbackClockState(now = Date.now()): ClockState {
  return createClockState(now);
}

const PIN_TOKEN_TTL_MS = 30 * 60 * 1000;

export function signPinUnlockToken(tournamentId: string, userId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + PIN_TOKEN_TTL_MS;
  const payload = `${tournamentId}:${userId}:${expiresAt}`;
  return { token: `${expiresAt}.${hmacSign(payload, getEnv().SESSION_SECRET)}`, expiresAt };
}

export function verifyPinUnlockToken(
  token: string | undefined,
  tournamentId: string,
  userId: string,
): boolean {
  if (!token) return false;
  const [rawExpires, signature] = token.split('.');
  if (!rawExpires || !signature) return false;
  const expiresAt = Number(rawExpires);
  if (!Number.isInteger(expiresAt) || expiresAt <= Date.now()) return false;
  return hmacVerify(`${tournamentId}:${userId}:${expiresAt}`, signature, getEnv().SESSION_SECRET);
}
