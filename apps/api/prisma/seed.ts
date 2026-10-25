import 'dotenv/config';
import { generateBlindStructure } from '@pokero/domain';
import { getEnv } from '../src/config/env.ts';
import { createPrismaClient } from '../src/db/prisma.ts';
import { hashPassword } from '../src/lib/crypto.ts';
import type { Prisma } from '../src/db/types.ts';

/**
 * Données de démonstration Pokero.
 *
 * Le seed est idempotent : il supprime puis recrée les données du compte de
 * démonstration. Il est désactivé sauf si SEED_DEMO=true.
 */

const DEMO_EMAIL = 'demo@pokero.local';
const DEMO_PASSWORD = 'PokeroDemo2026!';
const DEMO_DISPLAY_NAME = 'Noa';

const STARTING_STACK = 10_000;
const BUY_IN = 10_000;
const TOTAL_PLAYERS = 8;

const CHIP_TYPES = [
  { label: 'Blanc', color: '#F5F1E6', value: 25, quantity: 400 },
  { label: 'Rouge', color: '#C0392B', value: 100, quantity: 300 },
  { label: 'Vert', color: '#1E8449', value: 500, quantity: 200 },
  { label: 'Noir', color: '#111827', value: 1_000, quantity: 150 },
  { label: 'Violet', color: '#7D3C98', value: 5_000, quantity: 75 },
  { label: 'Jaune', color: '#F1C40F', value: 10_000, quantity: 25 },
] as const;

/** Répartition de cave : 8×25 + 8×100 + 6×500 + 6×1000 = 10 000. */
const PER_PLAYER_COUNTS = [
  { label: 'Blanc', count: 8 },
  { label: 'Rouge', count: 8 },
  { label: 'Vert', count: 6 },
  { label: 'Noir', count: 6 },
] as const;

const PLAYER_NAMES = [
  'Noa',
  'Camille',
  'Lucas',
  'Inès',
  'Hugo',
  'Léa',
  'Nathan',
  'Chloé',
  'Manon',
  'Théo',
] as const;

const BLIND_SETTINGS = {
  autoGenerate: true,
  targetDurationMinutes: 180,
  levelDurationMinutes: 20,
  breakDurationMinutes: 15,
  breakEveryLevels: 4,
  roundUnit: 25,
  anteFromLevel: 5,
  antePercentOfBigBlind: 0.125,
} as const;

function buildSettings(chipCaseName: string, pinConfigured = false) {
  return {
    buyIn: {
      players: TOTAL_PLAYERS,
      targetBuyIn: BUY_IN,
      startingStack: STARTING_STACK,
      mode: 'AUTO',
      counts: {},
      commonEnabled: {},
      commonCount: 0,
      maxChipsPerPlayer: 60,
    },
    blinds: {
      ...BLIND_SETTINGS,
      growthFactor: 1.35,
      startingSmallBlind: 50,
      startingBigBlind: 100,
    },
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
    alerts: { soundBeforeLevel: true, soundAtLevel: true, vibration: true, volume: 0.8 },
    display: { showRanking: true, showPlayers: true },
    chipCaseName,
    pinConfigured,
  };
}

async function main(): Promise<void> {
  const env = getEnv();
  if (!env.SEED_DEMO) {
    console.log('SEED_DEMO désactivé : aucune donnée de démonstration créée.');
    return;
  }

  const prisma = createPrismaClient();
  const now = Date.now();

  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
      // Les tournois bloquent la suppression en cascade du compte (onDelete: Restrict).
      await prisma.tournament.deleteMany({ where: { ownerId: existing.id } });
      await prisma.preset.deleteMany({ where: { ownerId: existing.id } });
      await prisma.chipCase.deleteMany({ where: { ownerId: existing.id } });
      await prisma.userSession.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash,
        displayName: DEMO_DISPLAY_NAME,
        emailVerifiedAt: new Date(now - 30 * 24 * 3_600_000),
        publicProfile: true,
        publicResults: true,
        locale: 'fr',
      },
    });

    const chipCase = await prisma.chipCase.create({
      data: {
        ownerId: user.id,
        name: 'Mallette du club',
        description: 'Mallette de démonstration avec six valeurs de jetons.',
        chipTypes: {
          create: CHIP_TYPES.map((type, position) => ({ ...type, position })),
        },
      },
      include: { chipTypes: { orderBy: { position: 'asc' } } },
    });

    const chipTypeByLabel = new Map(chipCase.chipTypes.map((type) => [type.label, type]));

    const structure = generateBlindStructure({
      startingStack: STARTING_STACK,
      targetDurationMinutes: BLIND_SETTINGS.targetDurationMinutes,
      levelDurationMinutes: BLIND_SETTINGS.levelDurationMinutes,
      breakDurationMinutes: BLIND_SETTINGS.breakDurationMinutes,
      breakEveryLevels: BLIND_SETTINGS.breakEveryLevels,
      roundUnit: BLIND_SETTINGS.roundUnit,
      anteFromLevel: BLIND_SETTINGS.anteFromLevel,
      antePercentOfBigBlind: BLIND_SETTINGS.antePercentOfBigBlind,
    });

    const preset = await prisma.preset.create({
      data: {
        ownerId: user.id,
        name: 'Soirée club · 3 h',
        description: 'Structure équilibrée sur 3 heures, 20 minutes par niveau.',
        defaultChipCaseId: chipCase.id,
        config: buildSettings(chipCase.name) as unknown as Prisma.InputJsonValue,
        versions: {
          create: {
            version: 1,
            config: buildSettings(chipCase.name) as unknown as Prisma.InputJsonValue,
            createdById: user.id,
          },
        },
      },
    });

    const levelRows = structure.levels.map((level) => ({
      position: level.position,
      kind: level.kind,
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      ante: level.ante,
      durationMinutes: level.durationMinutes,
    }));

    const firstDurationMs = (structure.levels[0]?.durationMinutes ?? 20) * 60_000;

    async function createAllocations(
      tournamentId: string,
      players: number,
      reserve: boolean,
    ): Promise<void> {
      for (const entry of PER_PLAYER_COUNTS) {
        const chipType = chipTypeByLabel.get(entry.label);
        if (!chipType) continue;
        const total = entry.count * players;
        await prisma.chipAllocation.create({
          data: {
            tournamentId,
            chipTypeId: chipType.id,
            perPlayerCount: entry.count,
            players,
            totalQuantity: total,
          },
        });
        if (reserve) {
          await prisma.inventoryReservation.create({
            data: { tournamentId, chipTypeId: chipType.id, quantity: total },
          });
        }
      }
    }

    // --- Tournoi terminé (8 joueurs) -------------------------------------

    const completedStartedAt = new Date(now - 3 * 24 * 3_600_000);
    const completedAt = new Date(completedStartedAt.getTime() + 2.5 * 3_600_000);

    const completed = await prisma.tournament.create({
      data: {
        ownerId: user.id,
        chipCaseId: chipCase.id,
        presetId: preset.id,
        name: 'Tournoi du vendredi',
        status: 'COMPLETED',
        publicRanking: true,
        startedAt: completedStartedAt,
        completedAt,
        createdAt: new Date(completedStartedAt.getTime() - 3_600_000),
        configuration: {
          create: { snapshot: buildSettings(chipCase.name) as unknown as Prisma.InputJsonValue },
        },
        levels: { createMany: { data: levelRows } },
        clockState: {
          create: {
            status: 'COMPLETED',
            segmentIndex: levelRows.length - 1,
            remainingAtAnchorMs: 0,
            accumulatedPlayMs: 2.5 * 3_600_000,
            version: 42,
          },
        },
        participants: {
          create: PLAYER_NAMES.slice(0, TOTAL_PLAYERS).map((displayName, index) => ({
            displayName,
            userId: index === 0 ? user.id : null,
            status: index === 0 ? 'ACTIVE' : 'ELIMINATED',
            eliminationSequence: index === 0 ? null : TOTAL_PLAYERS - index,
            eliminatedAt:
              index === 0
                ? null
                : new Date(completedStartedAt.getTime() + (2.5 * 3_600_000 * (index + 1)) / 9),
            rebuyCount: index === 2 || index === 4 ? 1 : 0,
          })),
        },
      },
      include: { participants: { orderBy: { createdAt: 'asc' } } },
    });

    await createAllocations(completed.id, TOTAL_PLAYERS, false);

    const completedByName = new Map(
      completed.participants.map((participant) => [participant.displayName, participant]),
    );

    // Sequences d'élimination : 1 = premier sorti, 7 = finaliste.
    for (const participant of completed.participants) {
      if (participant.eliminationSequence === null) continue;
      await prisma.elimination.create({
        data: {
          tournamentId: completed.id,
          participantId: participant.id,
          sequence: participant.eliminationSequence,
          createdById: user.id,
          createdAt: participant.eliminatedAt ?? completedAt,
        },
      });
      await prisma.finalRanking.create({
        data: {
          tournamentId: completed.id,
          participantId: participant.id,
          rank: TOTAL_PLAYERS + 1 - participant.eliminationSequence,
        },
      });
    }

    const winner = completedByName.get('Noa');
    if (winner) {
      await prisma.finalRanking.create({
        data: { tournamentId: completed.id, participantId: winner.id, rank: 1 },
      });
    }

    for (const name of ['Lucas', 'Hugo']) {
      const participant = completedByName.get(name);
      if (!participant) continue;
      await prisma.rebuy.create({
        data: {
          tournamentId: completed.id,
          participantId: participant.id,
          value: BUY_IN,
          counts: Object.fromEntries(
            PER_PLAYER_COUNTS.map((entry) => [
              chipTypeByLabel.get(entry.label)?.id ?? entry.label,
              entry.count,
            ]),
          ),
          createdById: user.id,
          createdAt: new Date(completedStartedAt.getTime() + 40 * 60_000),
        },
      });
    }

    await prisma.tournamentEvent.createMany({
      data: [
        {
          tournamentId: completed.id,
          actorId: user.id,
          type: 'TOURNAMENT_CREATED',
          payload: { players: TOTAL_PLAYERS, targetBuyIn: BUY_IN },
          version: 0,
          createdAt: completed.createdAt,
        },
        {
          tournamentId: completed.id,
          actorId: user.id,
          type: 'CLOCK_START',
          payload: { action: 'START' },
          version: 1,
          createdAt: completedStartedAt,
        },
        {
          tournamentId: completed.id,
          actorId: user.id,
          type: 'TOURNAMENT_COMPLETED',
          payload: { winnerId: winner?.id ?? null, ranked: TOTAL_PLAYERS },
          version: 42,
          createdAt: completedAt,
        },
      ],
    });

    // --- Tournoi en cours (6 joueurs, 4 en course) ------------------------

    const liveStartedAt = new Date(now - 48 * 60_000);
    const live = await prisma.tournament.create({
      data: {
        ownerId: user.id,
        chipCaseId: chipCase.id,
        presetId: preset.id,
        name: 'Tournoi du dimanche',
        status: 'RUNNING',
        publicRanking: true,
        startedAt: liveStartedAt,
        configuration: {
          create: {
            snapshot: buildSettings(chipCase.name) as unknown as Prisma.InputJsonValue,
          },
        },
        levels: { createMany: { data: levelRows } },
        clockState: {
          create: {
            status: 'RUNNING',
            segmentIndex: 2,
            anchorAt: new Date(now - 7 * 60_000),
            remainingAtAnchorMs: 13 * 60_000,
            accumulatedPlayMs: 33 * 60_000,
            version: 12,
            lastAdminHeartbeatAt: new Date(now - 15_000),
          },
        },
        participants: {
          create: PLAYER_NAMES.slice(0, 6).map((displayName, index) => ({
            displayName,
            userId: index === 0 ? user.id : null,
            status: index < 4 ? 'ACTIVE' : 'ELIMINATED',
            eliminationSequence: index < 4 ? null : index - 3,
            eliminatedAt:
              index < 4 ? null : new Date(liveStartedAt.getTime() + (index - 3) * 18 * 60_000),
            rebuyCount: index === 1 ? 1 : 0,
          })),
        },
        invitations: {
          create: {
            tokenHash: `seed-demo-${user.id}-spectator`,
            createdById: user.id,
          },
        },
      },
      include: { participants: { orderBy: { createdAt: 'asc' } } },
    });

    await createAllocations(live.id, 6, true);

    const liveByName = new Map(
      live.participants.map((participant) => [participant.displayName, participant]),
    );

    for (const participant of live.participants) {
      if (participant.eliminationSequence === null) continue;
      await prisma.elimination.create({
        data: {
          tournamentId: live.id,
          participantId: participant.id,
          sequence: participant.eliminationSequence,
          createdById: user.id,
          createdAt: participant.eliminatedAt ?? new Date(now - 20 * 60_000),
        },
      });
    }

    for (const name of ['Camille']) {
      const participant = liveByName.get(name);
      if (!participant) continue;
      await prisma.rebuy.create({
        data: {
          tournamentId: live.id,
          participantId: participant.id,
          value: BUY_IN,
          counts: Object.fromEntries(
            PER_PLAYER_COUNTS.map((entry) => [
              chipTypeByLabel.get(entry.label)?.id ?? entry.label,
              entry.count,
            ]),
          ),
          createdById: user.id,
          createdAt: new Date(liveStartedAt.getTime() + 25 * 60_000),
        },
      });
    }

    await prisma.tournamentEvent.createMany({
      data: [
        {
          tournamentId: live.id,
          actorId: user.id,
          type: 'TOURNAMENT_CREATED',
          payload: { players: 6, targetBuyIn: BUY_IN },
          version: 0,
          createdAt: new Date(liveStartedAt.getTime() - 3_600_000),
        },
        {
          tournamentId: live.id,
          actorId: user.id,
          type: 'CLOCK_START',
          payload: { action: 'START' },
          version: 1,
          createdAt: liveStartedAt,
        },
        {
          tournamentId: live.id,
          actorId: user.id,
          type: 'CLOCK_NEXT',
          payload: { action: 'NEXT', segmentIndex: 2 },
          version: 12,
          createdAt: new Date(now - 7 * 60_000),
        },
      ],
    });

    // --- Brouillon --------------------------------------------------------

    const draft = await prisma.tournament.create({
      data: {
        ownerId: user.id,
        chipCaseId: chipCase.id,
        name: 'Tournoi de rentrée',
        status: 'DRAFT',
        configuration: {
          create: { snapshot: buildSettings(chipCase.name) as unknown as Prisma.InputJsonValue },
        },
        levels: { createMany: { data: levelRows } },
        clockState: {
          create: {
            status: 'DRAFT',
            segmentIndex: 0,
            remainingAtAnchorMs: firstDurationMs,
            version: 0,
          },
        },
        participants: {
          create: PLAYER_NAMES.slice(0, 5).map((displayName, index) => ({
            displayName,
            userId: index === 0 ? user.id : null,
          })),
        },
      },
    });

    console.log('Données de démonstration créées :');
    console.log(`  Compte     : ${DEMO_EMAIL}`);
    console.log(`  Mot de passe: ${DEMO_PASSWORD}`);
    console.log(`  Mallette   : ${chipCase.name} (${chipCase.chipTypes.length} valeurs)`);
    console.log(`  Preset     : ${preset.name}`);
    console.log(`  Tournois   : ${completed.name} (terminé), ${live.name} (en cours), ${draft.name} (brouillon)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du seed :', error);
  process.exitCode = 1;
});
