import type { FastifyInstance } from 'fastify';
import {
  buyInConfigSchema,
  chipCaseInputSchema,
  chipCaseUpdateSchema,
  inventoryAdjustmentSchema,
} from '@pokero/contracts';
import { AppError } from '../lib/app-error.ts';
import { parseInput } from '../lib/http.ts';
import {
  assertStockAvailable,
  fetchFreeStock,
  loadChipTypes,
  planBuyIn,
} from '../services/inventory.ts';

const OPEN_STATUSES = ['DRAFT', 'READY', 'RUNNING', 'PAUSED', 'RECOVERY_PENDING'] as const;

function normalizeChipTypes(
  chipTypes: Array<{ label: string; color: string; value: number; quantity: number }>,
) {
  const values = new Set<number>();
  for (const type of chipTypes) {
    if (values.has(type.value)) {
      throw AppError.badRequest('DUPLICATE_CHIP_VALUE', `La valeur ${type.value} est présente deux fois.`);
    }
    values.add(type.value);
  }
  return chipTypes.map((type, index) => ({
    label: type.label,
    color: type.color,
    value: type.value,
    quantity: type.quantity,
    position: index,
  }));
}

async function ownedChipCase(app: FastifyInstance, ownerId: string, chipCaseId: string) {
  const chipCase = await app.prisma.chipCase.findFirst({
    where: { id: chipCaseId, ownerId },
    include: { chipTypes: { orderBy: { position: 'asc' } } },
  });
  if (!chipCase) throw AppError.notFound('Mallette introuvable.');
  return chipCase;
}

export async function chipCaseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/chip-cases', { preHandler: [app.authenticate] }, async (request) => {
    const chipCases = await app.prisma.chipCase.findMany({
      where: { ownerId: request.auth!.user.id },
      include: {
        chipTypes: { orderBy: { position: 'asc' } },
        _count: { select: { tournaments: true } },
      },
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      chipCases: chipCases.map((chipCase) => ({
        id: chipCase.id,
        name: chipCase.name,
        description: chipCase.description,
        archived: chipCase.archivedAt !== null,
        createdAt: chipCase.createdAt,
        updatedAt: chipCase.updatedAt,
        tournamentsCount: chipCase._count.tournaments,
        chipTypes: chipCase.chipTypes,
      })),
    };
  });

  app.post('/chip-cases', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = parseInput(chipCaseInputSchema, request.body);
    const chipCase = await app.prisma.chipCase.create({
      data: {
        ownerId: request.auth!.user.id,
        name: input.name,
        description: input.description ?? null,
        chipTypes: { create: normalizeChipTypes(input.chipTypes) },
      },
      include: { chipTypes: { orderBy: { position: 'asc' } } },
    });
    return reply.code(201).send({ chipCase });
  });

  app.get('/chip-cases/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const chipCase = await ownedChipCase(app, request.auth!.user.id, id);
    const free = await fetchFreeStock(
      app.prisma,
      chipCase.chipTypes.map((type) => type.id),
    );
    return {
      chipCase: {
        ...chipCase,
        archived: chipCase.archivedAt !== null,
        chipTypes: chipCase.chipTypes.map((type) => ({
          ...type,
          freeQuantity: free.get(type.id) ?? 0,
        })),
      },
    };
  });

  app.patch('/chip-cases/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseInput(chipCaseUpdateSchema, request.body);
    const existing = await ownedChipCase(app, request.auth!.user.id, id);

    const chipTypesInput = input.chipTypes;
    if (chipTypesInput) {
      const openTournaments = await app.prisma.tournament.count({
        where: { chipCaseId: id, status: { in: [...OPEN_STATUSES] } },
      });
      if (openTournaments > 0) {
        throw AppError.conflict(
          'CHIP_CASE_IN_USE',
          'Impossible de modifier les jetons d’une mallette utilisée par un tournoi en cours.',
        );
      }

      const normalized = normalizeChipTypes(chipTypesInput);
      const providedIds = new Set(
        chipTypesInput
          .map((type) => type.id)
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      );
      for (const typeId of providedIds) {
        if (!existing.chipTypes.some((type) => type.id === typeId)) {
          throw AppError.badRequest('UNKNOWN_CHIP_TYPE', 'Type de jeton inconnu dans cette mallette.');
        }
      }

      const reservations = await app.prisma.inventoryReservation.groupBy({
        by: ['chipTypeId'],
        where: {
          chipTypeId: { in: existing.chipTypes.map((type) => type.id) },
          status: 'ACTIVE',
          // Un tournoi terminé ou annulé ne réserve plus ses jetons.
          tournament: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        },
        _sum: { quantity: true },
      });
      const reserved = new Map(
        reservations.map((row) => [row.chipTypeId, row._sum.quantity ?? 0]),
      );

      const removed = existing.chipTypes.filter((type) => !providedIds.has(type.id));
      for (const type of removed) {
        if ((reserved.get(type.id) ?? 0) > 0) {
          throw AppError.conflict(
            'CHIP_TYPE_RESERVED',
            `Le jeton ${type.label} est réservé par un tournoi et ne peut pas être supprimé.`,
          );
        }
      }

      await app.prisma.$transaction(async (tx) => {
        if (removed.length > 0) {
          await tx.chipType.deleteMany({ where: { id: { in: removed.map((type) => type.id) } } });
        }

        // Décale temporairement les positions pour éviter les collisions d'unicité.
        if (existing.chipTypes.length > 0) {
          await tx.chipType.updateMany({
            where: { chipCaseId: id },
            data: { position: { increment: 1_000 } },
          });
        }

        for (const [index, type] of normalized.entries()) {
          const source = chipTypesInput[index]!;
          const need = source.id ? (reserved.get(source.id) ?? 0) : 0;
          if (type.quantity < need) {
            throw AppError.conflict(
              'QUANTITY_BELOW_RESERVED',
              `La quantité de ${type.label} ne peut pas être inférieure aux ${need} jetons réservés.`,
            );
          }
          if (source.id) {
            await tx.chipType.update({
              where: { id: source.id },
              data: { ...type, position: index },
            });
          } else {
            await tx.chipType.create({
              data: { ...type, position: index, chipCaseId: id },
            });
          }
        }
      });
    }

    const chipCase = await app.prisma.chipCase.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        archivedAt:
          input.archived === undefined ? undefined : input.archived ? new Date() : null,
      },
      include: { chipTypes: { orderBy: { position: 'asc' } } },
    });

    return { chipCase: { ...chipCase, archived: chipCase.archivedAt !== null } };
  });

  app.delete('/chip-cases/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await ownedChipCase(app, request.auth!.user.id, id);
    const used = await app.prisma.tournament.count({ where: { chipCaseId: id } });
    if (used > 0) {
      throw AppError.conflict(
        'CHIP_CASE_IN_USE',
        'Cette mallette est liée à des tournois : archivez-la plutôt que de la supprimer.',
      );
    }
    await app.prisma.chipCase.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post('/chip-cases/:id/adjustments', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseInput(inventoryAdjustmentSchema, request.body);
    await ownedChipCase(app, request.auth!.user.id, id);

    const chipType = await app.prisma.chipType.findFirst({ where: { id: input.chipTypeId, chipCaseId: id } });
    if (!chipType) throw AppError.notFound('Type de jeton introuvable.');

    const after = chipType.quantity + input.delta;
    if (after < 0) {
      throw AppError.badRequest('NEGATIVE_STOCK', 'La quantité ne peut pas devenir négative.');
    }

    const reservations = await app.prisma.inventoryReservation.aggregate({
      where: {
        chipTypeId: chipType.id,
        status: 'ACTIVE',
        tournament: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      },
      _sum: { quantity: true },
    });
    const reserved = reservations._sum.quantity ?? 0;
    if (after < reserved) {
      throw AppError.conflict(
        'QUANTITY_BELOW_RESERVED',
        `Cette quantité est inférieure aux ${reserved} jetons réservés par des tournois.`,
      );
    }

    const [updated] = await app.prisma.$transaction([
      app.prisma.chipType.update({
        where: { id: chipType.id },
        data: { quantity: after },
      }),
      app.prisma.inventoryAdjustment.create({
        data: {
          chipCaseId: id,
          chipTypeId: chipType.id,
          actorId: request.auth!.user.id,
          delta: input.delta,
          before: chipType.quantity,
          after,
          reason: input.reason,
        },
      }),
    ]);

    return { chipType: updated };
  });

  app.get('/chip-cases/:id/adjustments', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await ownedChipCase(app, request.auth!.user.id, id);
    const adjustments = await app.prisma.inventoryAdjustment.findMany({
      where: { chipCaseId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { adjustments };
  });

  app.post('/chip-cases/:id/buyin/preview', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseInput(buyInConfigSchema, request.body);
    await ownedChipCase(app, request.auth!.user.id, id);
    const chipTypes = await loadChipTypes(app.prisma, id);
    const freeStock = await fetchFreeStock(
      app.prisma,
      chipTypes.map((type) => type.id),
    );
    const plan = planBuyIn({ chipTypes, config: input, freeStock });
    return { plan };
  });
}

export { assertStockAvailable, planBuyIn };
