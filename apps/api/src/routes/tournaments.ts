import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  clockCommandSchema,
  eliminateInputSchema,
  participantInputSchema,
  participantUpdateSchema,
  pinUnlockSchema,
  rebuyInputSchema,
  addOnInputSchema,
  tournamentCreateSchema,
} from '@pokero/contracts';
import { computeFinalRanking, generateBlindStructure } from '@pokero/domain';
import type { Prisma } from '../db/types.ts';
import { AppError, isUniqueConstraintError } from '../lib/app-error.ts';
import { hashToken, randomToken } from '../lib/crypto.ts';
import { getEnv } from '../config/env.ts';
import { parseInput } from '../lib/http.ts';
import {
  assertStockAvailable,
  fetchFreeStock,
  loadChipTypes,
  planBuyIn,
} from '../services/inventory.ts';
import {
  firstSegmentDuration,
  persistAutoAdvance,
  saveClockState,
  segmentsFor,
  toClockState,
} from '../services/clock.ts';
import {
  DEFAULT_SETTINGS,
  applyClockCommand,
  composeChipsForValue,
  hashPin,
  loadOwnedTournament,
  releaseReservations,
  reserveExtraChips,
  settingsFromSnapshot,
  signPinUnlockToken,
  syncAllocation,
  tournamentView,
  verifyPin,
  verifyPinUnlockToken,
} from '../services/tournament.ts';

const OPEN = ['DRAFT', 'READY', 'RUNNING', 'PAUSED'] as const;
const CLOSED = ['COMPLETED', 'CANCELLED'] as const;

function emitClock(app: FastifyInstance, tournamentId: string, view: unknown): void {
  app.events.emit('clock:updated', { tournamentId, view });
}

async function assertPin(
  request: FastifyRequest,
  tournament: { id: string; pinHash: string | null },
): Promise<void> {
  if (!tournament.pinHash) return;
  const header = request.headers['x-pin-unlock'];
  const token = typeof header === 'string' ? header : undefined;
  if (!verifyPinUnlockToken(token, tournament.id, request.auth!.user.id)) {
    throw new AppError(403, 'PIN_REQUIRED', 'Déverrouillez le tournoi avec son PIN.');
  }
}

const pinRateLimit = {
  rateLimit: { max: 8, timeWindow: '1 minute' },
};

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tournaments', { preHandler: [app.authenticate] }, async (request) => {
    const tournaments = await app.prisma.tournament.findMany({
      where: { ownerId: request.auth!.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        clockState: true,
        _count: { select: { participants: true } },
      },
      take: 100,
    });

    return {
      tournaments: tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        publicRanking: tournament.publicRanking,
        participantsCount: tournament._count.participants,
        createdAt: tournament.createdAt,
        startedAt: tournament.startedAt,
        completedAt: tournament.completedAt,
        clockVersion: tournament.clockState?.version ?? 0,
      })),
    };
  });

  app.post('/tournaments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = parseInput(tournamentCreateSchema, request.body);

    const chipCase = await app.prisma.chipCase.findFirst({
      where: { id: input.chipCaseId, ownerId: request.auth!.user.id },
      include: { chipTypes: { orderBy: { position: 'asc' } } },
    });
    if (!chipCase) throw AppError.badRequest('UNKNOWN_CHIP_CASE', 'Mallette introuvable.');
    if (chipCase.archivedAt !== null) {
      throw AppError.badRequest('ARCHIVED_CHIP_CASE', 'Cette mallette est archivée.');
    }
    if (chipCase.chipTypes.length === 0) {
      throw AppError.badRequest('EMPTY_CHIP_CASE', 'Cette mallette ne contient aucun jeton.');
    }

    if (input.presetId) {
      const preset = await app.prisma.preset.findFirst({
        where: { id: input.presetId, ownerId: request.auth!.user.id },
        select: { id: true },
      });
      if (!preset) throw AppError.badRequest('UNKNOWN_PRESET', 'Preset introuvable.');
    }

    // Une cave et un tapis de départ sont la même valeur : le tapis suit toujours la cave.
    input.buyIn.startingStack = input.buyIn.targetBuyIn;

    let domainLevels;
    if (input.blinds.autoGenerate) {
      const generated = generateBlindStructure({
        startingStack: input.buyIn.startingStack,
        targetDurationMinutes: input.blinds.targetDurationMinutes,
        levelDurationMinutes: input.blinds.levelDurationMinutes,
        firstLevelDurationMinutes: input.blinds.firstLevelDurationMinutes,
        breakDurationMinutes: input.blinds.breakDurationMinutes,
        breakEveryLevels: input.blinds.breakEveryLevels,
        startingSmallBlind: input.blinds.startingSmallBlind,
        startingBigBlind: input.blinds.startingBigBlind,
        roundUnit: input.blinds.roundUnit,
        anteFromLevel: input.blinds.anteFromLevel,
        antePercentOfBigBlind: input.blinds.antePercentOfBigBlind,
        growthFactor: input.blinds.growthFactor,
      });
      domainLevels = generated.levels;
      input.blinds.startingSmallBlind = generated.startingSmallBlind;
      input.blinds.startingBigBlind = generated.startingBigBlind;
    } else {
      const levels = input.blinds.levels ?? [];
      if (levels.length === 0) {
        throw AppError.badRequest('EMPTY_STRUCTURE', 'Ajoutez au moins un niveau de blindes.');
      }
      let cumulative = 0;
      domainLevels = levels.map((level, index) => {
        cumulative += level.durationMinutes;
        return {
          position: index + 1,
          kind: level.kind,
          smallBlind: level.smallBlind,
          bigBlind: level.bigBlind,
          ante: level.ante,
          durationMinutes: level.durationMinutes,
          cumulativeMinutes: cumulative,
        };
      });
    }

    const freeStock = await fetchFreeStock(
      app.prisma,
      chipCase.chipTypes.map((type) => type.id),
    );
    const plan = planBuyIn({
      chipTypes: chipCase.chipTypes,
      config: input.buyIn,
      freeStock,
      startBigBlind: input.blinds.startingBigBlind,
    });
    assertStockAvailable(plan);
    if (plan.perPlayerChipCount === 0 || plan.counts.every((count) => count.perPlayer === 0)) {
      throw AppError.conflict(
        'INSUFFICIENT_STOCK',
        'Le stock disponible ne permet pas de composer une cave pour ce tournoi.',
      );
    }

    const settings = {
      buyIn: input.buyIn,
      blinds: input.blinds,
      rebuy: { ...DEFAULT_SETTINGS.rebuy, ...input.rebuy },
      addOn: { ...DEFAULT_SETTINGS.addOn, ...input.addOn },
      alerts: { ...DEFAULT_SETTINGS.alerts, ...input.alerts },
      display: { ...DEFAULT_SETTINGS.display, ...input.display },
      chipCaseName: chipCase.name,
      pinConfigured: Boolean(input.pin),
    };

    const pinHash = input.pin ? await hashPin(input.pin) : null;
    const firstDuration = firstSegmentDuration(
      domainLevels.map((level) => ({
        position: level.position,
        kind: level.kind,
        smallBlind: level.smallBlind,
        bigBlind: level.bigBlind,
        ante: level.ante,
        durationMinutes: level.durationMinutes,
      })),
    );

    const tournament = await app.prisma.$transaction(async (tx) => {
      const created = await tx.tournament.create({
        data: {
          ownerId: request.auth!.user.id,
          chipCaseId: chipCase.id,
          presetId: input.presetId ?? null,
          name: input.name,
          status: 'DRAFT',
          publicRanking: input.publicRanking,
          pinHash,
          configuration: {
            create: { snapshot: settings as unknown as Prisma.InputJsonValue },
          },
          levels: {
            createMany: {
              data: domainLevels.map((level) => ({
                position: level.position,
                kind: level.kind,
                smallBlind: level.smallBlind,
                bigBlind: level.bigBlind,
                ante: level.ante,
                durationMinutes: level.durationMinutes,
              })),
            },
          },
          clockState: {
            create: {
              status: 'DRAFT',
              segmentIndex: 0,
              remainingAtAnchorMs: firstDuration,
              version: 0,
            },
          },
        },
      });

      for (const count of plan.counts) {
        if (count.total <= 0) continue;
        await tx.chipAllocation.create({
          data: {
            tournamentId: created.id,
            chipTypeId: count.chipTypeId,
            perPlayerCount: count.perPlayer,
            players: input.buyIn.players,
            totalQuantity: count.total,
          },
        });
        await tx.inventoryReservation.create({
          data: { tournamentId: created.id, chipTypeId: count.chipTypeId, quantity: count.total },
        });
      }

      await tx.tournamentEvent.create({
        data: {
          tournamentId: created.id,
          actorId: request.auth!.user.id,
          type: 'TOURNAMENT_CREATED',
          payload: {
            players: input.buyIn.players,
            targetBuyIn: input.buyIn.targetBuyIn,
            chipCaseId: chipCase.id,
          },
          version: 0,
        },
      });

      return created;
    });

    const full = await loadOwnedTournament(app, request.auth!.user.id, tournament.id);
    return reply.code(201).send({
      tournament: tournamentView(full),
      plan,
    });
  });

  app.get('/tournaments/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const tournament = await app.prisma.tournament.findFirst({
      where: { id, ownerId: request.auth!.user.id },
      include: {
        levels: { orderBy: { position: 'asc' } },
        clockState: true,
        configuration: true,
        participants: { orderBy: { createdAt: 'asc' } },
        allocations: { include: { chipType: true } },
        rebuys: { orderBy: { createdAt: 'desc' } },
        addOns: { orderBy: { createdAt: 'desc' } },
        eliminations: { orderBy: { sequence: 'asc' } },
        finalRankings: { orderBy: { rank: 'asc' } },
        invitations: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!tournament) throw AppError.notFound('Tournoi introuvable.');

    const ranking =
      tournament.participants.length > 0
        ? computeFinalRanking({
            participantIds: tournament.participants.map((participant) => participant.id),
            eliminations: tournament.eliminations.map((elimination) => ({
              participantId: elimination.participantId,
              sequence: elimination.sequence,
            })),
            winnerId:
              tournament.status === 'COMPLETED'
                ? tournament.participants.find((participant) => participant.status === 'ACTIVE')?.id
                : undefined,
          })
        : null;

    return {
      tournament: tournamentView(tournament),
      allocations: tournament.allocations,
      rebuys: tournament.rebuys,
      addOns: tournament.addOns,
      eliminations: tournament.eliminations,
      ranking,
      finalRankings: tournament.finalRankings,
      spectatorTokens: tournament.invitations.map((invitation) => ({
        id: invitation.id,
        createdAt: invitation.createdAt,
      })),
      events: tournament.events.map((event) => ({
        id: event.id,
        type: event.type,
        payload: event.payload,
        version: event.version,
        createdAt: event.createdAt,
      })),
    };
  });

  app.patch('/tournaments/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 1 || name.length > 100) {
        throw AppError.badRequest('INVALID_NAME', 'Le nom doit contenir entre 1 et 100 caractères.');
      }
      await app.prisma.tournament.update({ where: { id }, data: { name } });
    }

    if (body.publicRanking !== undefined) {
      await app.prisma.tournament.update({
        where: { id },
        data: { publicRanking: Boolean(body.publicRanking) },
      });
    }

    if (body.display !== undefined || body.rebuy !== undefined || body.addOn !== undefined || body.alerts !== undefined) {
      const settings = settingsFromSnapshot(tournament.configuration?.snapshot);
      if (body.display !== undefined) {
        settings.display = {
          showRanking: Boolean((body.display as Record<string, unknown>).showRanking),
          showPlayers: Boolean((body.display as Record<string, unknown>).showPlayers),
        };
      }
      if (body.alerts !== undefined) {
        settings.alerts = { ...settings.alerts, ...(body.alerts as object) };
      }
      if (body.rebuy !== undefined) {
        settings.rebuy = { ...settings.rebuy, ...(body.rebuy as object) };
      }
      if (body.addOn !== undefined) {
        settings.addOn = { ...settings.addOn, ...(body.addOn as object) };
      }
      await app.prisma.tournamentConfiguration.update({
        where: { tournamentId: id },
        data: { snapshot: settings as unknown as Prisma.InputJsonValue },
      });
    }

    if (body.pin !== undefined) {
      if (body.pin === null || body.pin === '') {
        await app.prisma.tournament.update({ where: { id }, data: { pinHash: null } });
      } else {
        const pin = String(body.pin);
        if (!/^\d{4,8}$/.test(pin)) {
          throw AppError.badRequest('INVALID_PIN', 'Le PIN doit contenir 4 à 8 chiffres.');
        }
        await app.prisma.tournament.update({ where: { id }, data: { pinHash: await hashPin(pin) } });
      }
    }

    const updated = await loadOwnedTournament(app, request.auth!.user.id, id);
    return { tournament: tournamentView(updated) };
  });

  app.delete('/tournaments/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    if (!CLOSED.includes(tournament.status as (typeof CLOSED)[number]) && tournament.status !== 'DRAFT') {
      throw AppError.conflict('TOURNAMENT_IN_USE', 'Annulez le tournoi avant de le supprimer.');
    }
    await app.prisma.$transaction(async (tx) => {
      await releaseReservations(tx, id);
      await tx.tournament.delete({ where: { id } });
    });
    return reply.code(204).send();
  });

  // --- Participants ---

  app.post('/tournaments/:id/participants', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parseInput(participantInputSchema, request.body);
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    if (CLOSED.includes(tournament.status as (typeof CLOSED)[number])) {
      throw AppError.conflict('TOURNAMENT_CLOSED', 'Ce tournoi est clôturé.');
    }

    try {
      let createdId: string | null = null;
      await app.prisma.$transaction(async (tx) => {
        const created = await tx.tournamentParticipant.create({
          data: {
            tournamentId: id,
            displayName: input.displayName,
            userId: input.userId ?? null,
          },
        });
        createdId = created.id;
        await syncAllocation(tx, id);
        await tx.tournamentEvent.create({
          data: {
            tournamentId: id,
            actorId: request.auth!.user.id,
            type: 'PARTICIPANT_ADDED',
            payload: { participantId: created.id, displayName: created.displayName },
            version: tournament.clockState?.version ?? 0,
          },
        });
      });

      const full = await loadOwnedTournament(app, request.auth!.user.id, id);
      emitClock(app, id, tournamentView(full).clock);
      return reply.code(201).send({ participantId: createdId, tournament: tournamentView(full) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict('DUPLICATE_PARTICIPANT', 'Un joueur porte déjà ce nom dans ce tournoi.');
      }
      throw error;
    }
  });

  app.patch('/tournaments/:id/participants/:participantId', { preHandler: [app.authenticate] }, async (request) => {
    const { id, participantId } = request.params as { id: string; participantId: string };
    const input = parseInput(participantUpdateSchema, request.body);
    await loadOwnedTournament(app, request.auth!.user.id, id);

    const participant = await app.prisma.tournamentParticipant.findFirst({
      where: { id: participantId, tournamentId: id },
    });
    if (!participant) throw AppError.notFound('Participant introuvable.');

    try {
      const updated = await app.prisma.tournamentParticipant.update({
        where: { id: participantId },
        data: { displayName: input.displayName },
      });
      return { participant: updated };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict('DUPLICATE_PARTICIPANT', 'Un joueur porte déjà ce nom dans ce tournoi.');
      }
      throw error;
    }
  });

  app.delete('/tournaments/:id/participants/:participantId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, participantId } = request.params as { id: string; participantId: string };
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    if (tournament.status !== 'DRAFT' && tournament.status !== 'READY') {
      throw AppError.conflict('TOURNAMENT_STARTED', 'Un participant ne peut être retiré qu’avant le démarrage.');
    }

    const participant = await app.prisma.tournamentParticipant.findFirst({
      where: { id: participantId, tournamentId: id },
      include: { _count: { select: { rebuys: true, addOns: true, eliminations: true } } },
    });
    if (!participant) throw AppError.notFound('Participant introuvable.');
    if (participant._count.rebuys + participant._count.addOns + participant._count.eliminations > 0) {
      throw AppError.conflict('PARTICIPANT_HAS_HISTORY', 'Ce participant a un historique de jeu.');
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.tournamentParticipant.delete({ where: { id: participantId } });
      await syncAllocation(tx, id);
      await tx.tournamentEvent.create({
        data: {
          tournamentId: id,
          actorId: request.auth!.user.id,
          type: 'PARTICIPANT_REMOVED',
          payload: { participantId, displayName: participant.displayName },
          version: tournament.clockState?.version ?? 0,
        },
      });
    });

    return reply.code(204).send();
  });

  // --- Rebuys / add-ons ---

  app.post('/tournaments/:id/rebuys', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parseInput(rebuyInputSchema, request.body);
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    await assertPin(request, tournament);

    if (tournament.status !== 'RUNNING' && tournament.status !== 'PAUSED') {
      throw AppError.conflict('TOURNAMENT_NOT_RUNNING', 'Les rebuys ne sont disponibles qu’en cours de tournoi.');
    }
    if (!tournament.clockState) throw AppError.conflict('NO_CLOCK', 'Chronomètre absent.');

    const settings = settingsFromSnapshot(tournament.configuration?.snapshot);
    if (!settings.rebuy.enabled) throw AppError.conflict('REBUY_DISABLED', 'Les rebuys sont désactivés.');

    const participant = await app.prisma.tournamentParticipant.findFirst({
      where: { id: input.participantId, tournamentId: id, status: 'ACTIVE' },
    });
    if (!participant) throw AppError.conflict('PARTICIPANT_NOT_ACTIVE', 'Ce joueur n’est pas en course.');

    if (!settings.rebuy.unlimited && settings.rebuy.maxPerPlayer !== null) {
      if (participant.rebuyCount >= settings.rebuy.maxPerPlayer) {
        throw AppError.conflict('REBUY_LIMIT_REACHED', 'Ce joueur a atteint sa limite de rebuys.');
      }
    }

    const view = tournamentView(tournament).clock;
    if (settings.rebuy.untilLevel !== null && view && view.playLevelNumber !== null) {
      if (view.playLevelNumber > settings.rebuy.untilLevel) {
        throw AppError.conflict('REBUY_PERIOD_OVER', 'La période de rebuy est terminée.');
      }
    }

    const value = input.value ?? settings.rebuy.value ?? settings.buyIn.targetBuyIn;
    const chipTypes = await loadChipTypes(app.prisma, tournament.chipCaseId!);
    const freeStock = await fetchFreeStock(
      app.prisma,
      chipTypes.map((type) => type.id),
    );
    const plan = composeChipsForValue({
      chipTypes,
      freeStock,
      value,
      maxChipsPerPlayer: settings.buyIn.maxChipsPerPlayer,
      startBigBlind: settings.blinds.startingBigBlind,
    });
    assertStockAvailable(plan);

    const counts = plan.counts
      .filter((count) => count.perPlayer > 0)
      .map((count) => ({ chipTypeId: count.chipTypeId, count: count.perPlayer }));

    const rebuy = await app.prisma.$transaction(async (tx) => {
      const created = await tx.rebuy.create({
        data: {
          tournamentId: id,
          participantId: participant.id,
          value: plan.perPlayerValue,
          counts: counts as unknown as Prisma.InputJsonValue,
          createdById: request.auth!.user.id,
        },
      });
      await tx.tournamentParticipant.update({
        where: { id: participant.id },
        data: { rebuyCount: { increment: 1 } },
      });
      await reserveExtraChips(tx, id, counts);
      await tx.tournamentEvent.create({
        data: {
          tournamentId: id,
          actorId: request.auth!.user.id,
          type: 'REBUY',
          payload: { participantId: participant.id, value: plan.perPlayerValue, counts },
          version: tournament.clockState?.version ?? 0,
        },
      });
      return created;
    });

    return reply.code(201).send({ rebuy, plan, tournament: tournamentView(await loadOwnedTournament(app, request.auth!.user.id, id)) });
  });

  app.post('/tournaments/:id/add-ons', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parseInput(addOnInputSchema, request.body);
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    await assertPin(request, tournament);

    if (tournament.status !== 'RUNNING' && tournament.status !== 'PAUSED') {
      throw AppError.conflict('TOURNAMENT_NOT_RUNNING', 'Les add-ons ne sont disponibles qu’en cours de tournoi.');
    }

    const settings = settingsFromSnapshot(tournament.configuration?.snapshot);
    if (!settings.addOn.enabled) throw AppError.conflict('ADDON_DISABLED', 'Les add-ons sont désactivés.');

    const participant = await app.prisma.tournamentParticipant.findFirst({
      where: { id: input.participantId, tournamentId: id, status: 'ACTIVE' },
    });
    if (!participant) throw AppError.conflict('PARTICIPANT_NOT_ACTIVE', 'Ce joueur n’est pas en course.');
    if (participant.addOnCount >= settings.addOn.limitPerPlayer) {
      throw AppError.conflict('ADDON_LIMIT_REACHED', 'Ce joueur a atteint sa limite d’add-ons.');
    }

    const view = tournamentView(tournament).clock;
    if (settings.addOn.atLevel !== null) {
      if (!view || view.playLevelNumber !== settings.addOn.atLevel) {
        throw AppError.conflict('ADDON_NOT_AVAILABLE', `L’add-on est disponible au niveau ${settings.addOn.atLevel}.`);
      }
    }

    const value = input.value ?? settings.addOn.value ?? settings.buyIn.targetBuyIn;
    const chipTypes = await loadChipTypes(app.prisma, tournament.chipCaseId!);
    const freeStock = await fetchFreeStock(
      app.prisma,
      chipTypes.map((type) => type.id),
    );
    const plan = composeChipsForValue({
      chipTypes,
      freeStock,
      value,
      maxChipsPerPlayer: settings.buyIn.maxChipsPerPlayer,
      startBigBlind: settings.blinds.startingBigBlind,
    });
    assertStockAvailable(plan);

    const counts = plan.counts
      .filter((count) => count.perPlayer > 0)
      .map((count) => ({ chipTypeId: count.chipTypeId, count: count.perPlayer }));

    const addOn = await app.prisma.$transaction(async (tx) => {
      const created = await tx.addOn.create({
        data: {
          tournamentId: id,
          participantId: participant.id,
          value: plan.perPlayerValue,
          counts: counts as unknown as Prisma.InputJsonValue,
          createdById: request.auth!.user.id,
        },
      });
      await tx.tournamentParticipant.update({
        where: { id: participant.id },
        data: { addOnCount: { increment: 1 } },
      });
      await reserveExtraChips(tx, id, counts);
      await tx.tournamentEvent.create({
        data: {
          tournamentId: id,
          actorId: request.auth!.user.id,
          type: 'ADD_ON',
          payload: { participantId: participant.id, value: plan.perPlayerValue, counts },
          version: tournament.clockState?.version ?? 0,
        },
      });
      return created;
    });

    return reply.code(201).send({ addOn, plan, tournament: tournamentView(await loadOwnedTournament(app, request.auth!.user.id, id)) });
  });

  // --- Eliminations ---

  app.post('/tournaments/:id/eliminations', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = parseInput(eliminateInputSchema, request.body);
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    await assertPin(request, tournament);

    if (tournament.status !== 'RUNNING' && tournament.status !== 'PAUSED') {
      throw AppError.conflict('TOURNAMENT_NOT_RUNNING', 'Les éliminations sont possibles en cours de tournoi.');
    }

    const participant = await app.prisma.tournamentParticipant.findFirst({
      where: { id: input.participantId, tournamentId: id, status: 'ACTIVE' },
    });
    if (!participant) throw AppError.conflict('PARTICIPANT_NOT_ACTIVE', 'Ce joueur n’est pas en course.');

    const max = await app.prisma.elimination.aggregate({
      where: { tournamentId: id },
      _max: { sequence: true },
    });
    const sequence = input.sequence ?? (max._max.sequence ?? 0) + 1;

    try {
      const elimination = await app.prisma.$transaction(async (tx) => {
        const created = await tx.elimination.create({
          data: {
            tournamentId: id,
            participantId: participant.id,
            sequence,
            createdById: request.auth!.user.id,
          },
        });
        await tx.tournamentParticipant.update({
          where: { id: participant.id },
          data: { status: 'ELIMINATED', eliminatedAt: new Date(), eliminationSequence: sequence },
        });
        await tx.tournamentEvent.create({
          data: {
            tournamentId: id,
            actorId: request.auth!.user.id,
            type: 'ELIMINATION',
            payload: { participantId: participant.id, sequence },
            version: tournament.clockState?.version ?? 0,
          },
        });
        return created;
      });

      const full = await loadOwnedTournament(app, request.auth!.user.id, id);
      return reply.code(201).send({ elimination, tournament: tournamentView(full) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict('ELIMINATION_CONFLICT', 'Ce joueur est déjà éliminé ou cette place est occupée.');
      }
      throw error;
    }
  });

  app.delete('/tournaments/:id/eliminations/:participantId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, participantId } = request.params as { id: string; participantId: string };
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    await assertPin(request, tournament);

    const latest = await app.prisma.elimination.findFirst({
      where: { tournamentId: id },
      orderBy: { sequence: 'desc' },
    });
    if (!latest || latest.participantId !== participantId) {
      throw AppError.conflict('NOT_LAST_ELIMINATION', 'Seule la dernière élimination peut être annulée.');
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.elimination.delete({ where: { id: latest.id } });
      await tx.tournamentParticipant.update({
        where: { id: participantId },
        data: { status: 'ACTIVE', eliminatedAt: null, eliminationSequence: null },
      });
      await tx.tournamentEvent.create({
        data: {
          tournamentId: id,
          actorId: request.auth!.user.id,
          type: 'ELIMINATION_UNDONE',
          payload: { participantId, sequence: latest.sequence },
          version: tournament.clockState?.version ?? 0,
        },
      });
    });

    return reply.code(204).send();
  });

  // --- Clock ---

  app.get('/tournaments/:id/clock', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    if (!tournament.clockState) throw AppError.conflict('NO_CLOCK', 'Chronomètre absent.');

    const advanced = await app.prisma.$transaction(async (tx) => {
      return persistAutoAdvance(tx, id, tournament.clockState!, tournament.levels);
    });

    const full = advanced.changed
      ? await loadOwnedTournament(app, request.auth!.user.id, id)
      : tournament;
    const view = tournamentView(full).clock;
    if (advanced.changed) emitClock(app, id, view);
    return { clock: view, participants: tournamentView(full, Date.now()).participants };
  });

  app.post('/tournaments/:id/clock', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseInput(clockCommandSchema, request.body);
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    await assertPin(request, tournament);

    const result = await applyClockCommand(app, {
      ownerId: request.auth!.user.id,
      tournamentId: id,
      actorId: request.auth!.user.id,
      command: input,
    });

    if (!result.replayed) emitClock(app, id, result.view);
    return { clock: result.view, replayed: result.replayed };
  });

  app.post('/tournaments/:id/heartbeat', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadOwnedTournament(app, request.auth!.user.id, id);
    const now = new Date();

    await app.prisma.tournamentPresence.upsert({
      where: { tournamentId_sessionId: { tournamentId: id, sessionId: request.auth!.sessionId } },
      create: {
        tournamentId: id,
        userId: request.auth!.user.id,
        sessionId: request.auth!.sessionId,
        role: 'ORGANIZER',
        lastHeartbeatAt: now,
      },
      update: { lastHeartbeatAt: now },
    });

    await app.prisma.tournamentClockState.updateMany({
      where: { tournamentId: id },
      data: { lastAdminHeartbeatAt: now, lastAdminSessionId: request.auth!.sessionId },
    });

    return { ok: true, serverNow: now.getTime() };
  });

  app.post('/tournaments/:id/pin/unlock', { preHandler: [app.authenticate], config: pinRateLimit }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseInput(pinUnlockSchema, request.body);
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);

    if (!tournament.pinHash) return { unlocked: true, token: null, expiresAt: null };

    if (tournament.pinLockedUntil && tournament.pinLockedUntil.getTime() > Date.now()) {
      throw new AppError(429, 'PIN_LOCKED', 'Trop de tentatives. Réessayez plus tard.', {
        lockedUntil: tournament.pinLockedUntil,
      });
    }

    const ok = await verifyPin(tournament.pinHash, input.pin);
    if (!ok) {
      const failed = tournament.pinFailedAttempts + 1;
      const lockedUntil = failed >= 5 ? new Date(Date.now() + 5 * 60_000) : null;
      await app.prisma.tournament.update({
        where: { id },
        data: {
          pinFailedAttempts: lockedUntil ? 0 : failed,
          pinLockedUntil: lockedUntil,
        },
      });
      throw new AppError(403, 'INVALID_PIN', 'PIN incorrect.');
    }

    await app.prisma.$transaction([
      app.prisma.tournament.update({
        where: { id },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      }),
      app.prisma.tournamentEvent.create({
        data: {
          tournamentId: id,
          actorId: request.auth!.user.id,
          type: 'PIN_UNLOCKED',
          payload: {},
          version: tournament.clockState?.version ?? 0,
        },
      }),
    ]);

    const token = signPinUnlockToken(id, request.auth!.user.id);
    return { unlocked: true, token: token.token, expiresAt: token.expiresAt };
  });

  // --- Finalisation ---

  app.post('/tournaments/:id/finalize', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const tournament = await loadOwnedTournament(app, request.auth!.user.id, id);
    await assertPin(request, tournament);

    if (CLOSED.includes(tournament.status as (typeof CLOSED)[number])) {
      throw AppError.conflict('TOURNAMENT_CLOSED', 'Ce tournoi est déjà clôturé.');
    }

    const active = tournament.participants.filter((participant) => participant.status === 'ACTIVE');
    const body = (request.body ?? {}) as { winnerId?: string };
    const winnerId = body.winnerId ?? active[0]?.id;
    if (!winnerId) throw AppError.conflict('NO_WINNER', 'Aucun vainqueur possible.');
    if (active.length !== 1) {
      throw AppError.conflict(
        'PLAYERS_REMAIN',
        'Il reste plusieurs joueurs en course : enregistrez leurs éliminations avant de clôturer.',
      );
    }

    const ranking = computeFinalRanking({
      participantIds: tournament.participants.map((participant) => participant.id),
      eliminations: await app.prisma.elimination
        .findMany({ where: { tournamentId: id } })
        .then((rows) => rows.map((row) => ({ participantId: row.participantId, sequence: row.sequence }))),
      winnerId,
    });

    const now = Date.now();
    await app.prisma.$transaction(async (tx) => {
      await tx.finalRanking.deleteMany({ where: { tournamentId: id } });
      for (const entry of ranking.entries) {
        await tx.finalRanking.create({
          data: {
            tournamentId: id,
            participantId: entry.participantId,
            rank: entry.rank,
          },
        });
      }

      const clock = tournament.clockState;
      if (clock) {
        const state = {
          ...toClockState(clock),
          status: 'COMPLETED' as const,
          anchorAt: null,
          remainingAtAnchorMs: 0,
          version: clock.version + 1,
          updatedAt: now,
        };
        await saveClockState(tx, id, state);
      }

      await tx.tournament.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(now) },
      });
      await releaseReservations(tx, id);
      await tx.tournamentEvent.create({
        data: {
          tournamentId: id,
          actorId: request.auth!.user.id,
          type: 'TOURNAMENT_COMPLETED',
          payload: { winnerId, ranked: ranking.entries.length },
          version: (tournament.clockState?.version ?? 0) + 1,
        },
      });
    });

    const full = await loadOwnedTournament(app, request.auth!.user.id, id);
    const view = tournamentView(full).clock;
    emitClock(app, id, view);
    return { ranking, tournament: tournamentView(full) };
  });

  // --- Invitations spectateurs ---

  app.get('/tournaments/:id/spectator-tokens', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadOwnedTournament(app, request.auth!.user.id, id);
    const invitations = await app.prisma.spectatorInvitation.findMany({
      where: { tournamentId: id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      tokens: invitations.map((invitation) => ({
        id: invitation.id,
        createdAt: invitation.createdAt,
        url: null,
      })),
    };
  });

  app.post('/tournaments/:id/spectator-tokens', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await loadOwnedTournament(app, request.auth!.user.id, id);

    const token = randomToken(32);
    const invitation = await app.prisma.spectatorInvitation.create({
      data: {
        tournamentId: id,
        tokenHash: hashToken(token, getEnv().TOKEN_PEPPER),
        createdById: request.auth!.user.id,
      },
    });

    return reply.code(201).send({
      token,
      id: invitation.id,
      url: `${getEnv().APP_BASE_URL}/spectateur/${token}`,
    });
  });

  app.delete('/tournaments/:id/spectator-tokens/:tokenId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, tokenId } = request.params as { id: string; tokenId: string };
    await loadOwnedTournament(app, request.auth!.user.id, id);
    const updated = await app.prisma.spectatorInvitation.updateMany({
      where: { id: tokenId, tournamentId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) throw AppError.notFound('Invitation introuvable.');
    return reply.code(204).send();
  });

  // --- Statistiques personnelles ---

  app.get('/stats/me', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.auth!.user.id;
    const participations = await app.prisma.tournamentParticipant.findMany({
      where: { userId },
      include: {
        tournament: { select: { id: true, name: true, ownerId: true, status: true, startedAt: true } },
        finalRanking: true,
        eliminations: true,
      },
    });

    const results = participations
      .filter((participation) => participation.tournament.status === 'COMPLETED')
      .map((participation) => ({
        tournamentId: participation.tournament.id,
        tournamentName: participation.tournament.name,
        organizerId: participation.tournament.ownerId,
        rank: participation.finalRanking?.rank ?? 0,
        rebuys: participation.rebuyCount,
        addOns: participation.addOnCount,
        startedAt: participation.tournament.startedAt,
      }));

    return {
      participations: participations.map((participation) => ({
        tournamentId: participation.tournament.id,
        tournamentName: participation.tournament.name,
        status: participation.tournament.status,
        participantStatus: participation.status,
        rank: participation.finalRanking?.rank ?? null,
        rebuys: participation.rebuyCount,
        addOns: participation.addOnCount,
      })),
      results,
      totals: {
        played: results.length,
        wins: results.filter((result) => result.rank === 1).length,
        podiums: results.filter((result) => result.rank <= 3).length,
      },
    };
  });
}
