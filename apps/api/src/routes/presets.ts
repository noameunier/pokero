import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { presetInputSchema } from '@pokero/contracts';
import type { Prisma } from '../../generated/prisma/client.ts';
import { AppError } from '../lib/app-error.ts';
import { parseInput } from '../lib/http.ts';

const presetUpdateSchema = presetInputSchema.partial().extend({
  archived: z.boolean().optional(),
});

export async function presetRoutes(app: FastifyInstance): Promise<void> {
  app.get('/presets', { preHandler: [app.authenticate] }, async (request) => {
    const presets = await app.prisma.preset.findMany({
      where: { ownerId: request.auth!.user.id },
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { versions: true } } },
    });
    return {
      presets: presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        config: preset.config,
        defaultChipCaseId: preset.defaultChipCaseId,
        archived: preset.archivedAt !== null,
        versionsCount: preset._count.versions,
        createdAt: preset.createdAt,
        updatedAt: preset.updatedAt,
      })),
    };
  });

  app.post('/presets', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = parseInput(presetInputSchema, request.body);
    await assertChipCase(app, request.auth!.user.id, input.config.defaultChipCaseId ?? null);

    const preset = await app.prisma.preset.create({
      data: {
        ownerId: request.auth!.user.id,
        name: input.name,
        description: input.description ?? null,
        defaultChipCaseId: input.config.defaultChipCaseId ?? null,
        config: input.config as Prisma.InputJsonValue,
        versions: {
          create: {
            version: 1,
            config: input.config as Prisma.InputJsonValue,
            createdById: request.auth!.user.id,
          },
        },
      },
    });
    return reply.code(201).send({ preset });
  });

  app.get('/presets/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const preset = await app.prisma.preset.findFirst({
      where: { id, ownerId: request.auth!.user.id },
      include: { versions: { orderBy: { version: 'desc' }, take: 20 } },
    });
    if (!preset) throw AppError.notFound('Preset introuvable.');
    return { preset: { ...preset, archived: preset.archivedAt !== null } };
  });

  app.patch('/presets/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const input = parseInput(presetUpdateSchema, request.body);
    const existing = await app.prisma.preset.findFirst({
      where: { id, ownerId: request.auth!.user.id },
    });
    if (!existing) throw AppError.notFound('Preset introuvable.');

    if (input.config?.defaultChipCaseId !== undefined) {
      await assertChipCase(app, request.auth!.user.id, input.config.defaultChipCaseId ?? null);
    }

    const configChanged = input.config !== undefined;
    const preset = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.preset.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          archivedAt:
            input.archived !== undefined
              ? input.archived
                ? new Date()
                : null
              : undefined,
          config: input.config ? (input.config as Prisma.InputJsonValue) : undefined,
          defaultChipCaseId: input.config ? (input.config.defaultChipCaseId ?? null) : undefined,
        },
      });

      if (configChanged) {
        const latest = await tx.presetVersion.findFirst({
          where: { presetId: id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.presetVersion.create({
          data: {
            presetId: id,
            version: (latest?.version ?? 0) + 1,
            config: input.config as Prisma.InputJsonValue,
            createdById: request.auth!.user.id,
          },
        });
      }

      return updated;
    });

    return { preset: { ...preset, archived: preset.archivedAt !== null } };
  });

  app.delete('/presets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await app.prisma.preset.findFirst({
      where: { id, ownerId: request.auth!.user.id },
    });
    if (!existing) throw AppError.notFound('Preset introuvable.');
    await app.prisma.preset.delete({ where: { id } });
    return reply.code(204).send();
  });
}

async function assertChipCase(
  app: FastifyInstance,
  ownerId: string,
  chipCaseId: string | null,
): Promise<void> {
  if (!chipCaseId) return;
  const chipCase = await app.prisma.chipCase.findFirst({
    where: { id: chipCaseId, ownerId },
    select: { id: true },
  });
  if (!chipCase) throw AppError.badRequest('UNKNOWN_CHIP_CASE', 'Mallette introuvable.');
}
