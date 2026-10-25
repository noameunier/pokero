import type { FastifyInstance } from 'fastify';
import { computePlayerStats, viewClock } from '@pokero/domain';
import { getEnv } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';
import { hashToken } from '../lib/crypto.ts';
import { segmentsFor, toClockState } from '../services/clock.ts';
import { settingsFromSnapshot } from '../services/tournament.ts';

export interface SpectatorPayload {
  tournament: {
    id: string;
    name: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
  };
  clock: ReturnType<typeof viewClock> | null;
  levels: Array<{
    position: number;
    kind: string;
    smallBlind: number | null;
    bigBlind: number | null;
    ante: number | null;
    durationMinutes: number;
  }>;
  participants: Array<{
    id: string;
    displayName: string;
    status: string;
    rebuyCount: number;
    addOnCount: number;
    eliminationSequence: number | null;
  }>;
  display: { showRanking: boolean; showPlayers: boolean };
  ranking: Array<{ participantId: string; rank: number; displayName: string }> | null;
  activePlayers: number;
  serverNow: number;
}

export async function buildSpectatorPayload(
  app: FastifyInstance,
  tournamentId: string,
  now = Date.now(),
): Promise<SpectatorPayload | null> {
  const tournament = await app.prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      levels: { orderBy: { position: 'asc' } },
      clockState: true,
      configuration: true,
      participants: { orderBy: { createdAt: 'asc' } },
      finalRankings: { orderBy: { rank: 'asc' } },
    },
  });
  if (!tournament) return null;

  const settings = settingsFromSnapshot(tournament.configuration?.snapshot);
  const clock =
    tournament.clockState === null
      ? null
      : viewClock(
          toClockState(tournament.clockState),
          segmentsFor(tournament.levels),
          now,
        );

  const nameById = new Map(tournament.participants.map((p) => [p.id, p.displayName]));
  const ranking =
    tournament.publicRanking && tournament.finalRankings.length > 0
      ? tournament.finalRankings.map((entry) => ({
          participantId: entry.participantId,
          rank: entry.rank,
          displayName: nameById.get(entry.participantId) ?? 'Joueur',
        }))
      : null;

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status,
      startedAt: tournament.startedAt,
      completedAt: tournament.completedAt,
    },
    clock,
    levels: tournament.levels.map((level) => ({
      position: level.position,
      kind: level.kind,
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      ante: level.ante,
      durationMinutes: level.durationMinutes,
    })),
    participants: settings.display.showPlayers
      ? tournament.participants.map((participant) => ({
          id: participant.id,
          displayName: participant.displayName,
          status: participant.status,
          rebuyCount: participant.rebuyCount,
          addOnCount: participant.addOnCount,
          eliminationSequence: participant.eliminationSequence,
        }))
      : [],
    display: {
      showRanking: settings.display.showRanking,
      showPlayers: settings.display.showPlayers,
    },
    ranking,
    activePlayers: tournament.participants.filter((participant) => participant.status === 'ACTIVE').length,
    serverNow: now,
  };
}

async function resolveInvitation(app: FastifyInstance, token: string) {
  const invitation = await app.prisma.spectatorInvitation.findFirst({
    where: {
      tokenHash: hashToken(token, getEnv().TOKEN_PEPPER),
      revokedAt: null,
    },
    select: { id: true, tournamentId: true },
  });
  if (!invitation) {
    throw new AppError(404, 'INVALID_SPECTATOR_TOKEN', 'Lien spectateur invalide ou révoqué.');
  }
  return invitation;
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/tournaments/:token', async (request) => {
    const { token } = request.params as { token: string };
    const invitation = await resolveInvitation(app, token);
    const payload = await buildSpectatorPayload(app, invitation.tournamentId);
    if (!payload) throw AppError.notFound('Tournoi introuvable.');
    return payload;
  });

  app.get('/public/players/:userId/stats', async (request) => {
    const { userId } = request.params as { userId: string };
    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null || !user.publicProfile || !user.publicResults) {
      throw AppError.notFound('Profil introuvable.');
    }

    const participations = await app.prisma.tournamentParticipant.findMany({
      where: { userId, tournament: { status: 'COMPLETED' } },
      include: {
        tournament: { select: { id: true, ownerId: true, name: true, startedAt: true } },
        finalRanking: true,
      },
    });

    const results = participations
      .filter((participation) => participation.finalRanking !== null)
      .map((participation) => ({
        tournamentId: participation.tournament.id,
        organizerId: participation.tournament.ownerId,
        participantsCount: 0,
        rank: participation.finalRanking!.rank,
        rebuys: participation.rebuyCount,
        addOns: participation.addOnCount,
      }));

    return {
      player: {
        id: user.id,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      stats: computePlayerStats(results),
      recent: participations
        .sort((a, b) => (b.tournament.startedAt?.getTime() ?? 0) - (a.tournament.startedAt?.getTime() ?? 0))
        .slice(0, 20)
        .map((participation) => ({
          tournamentId: participation.tournament.id,
          tournamentName: participation.tournament.name,
          startedAt: participation.tournament.startedAt,
          rank: participation.finalRanking?.rank ?? null,
          rebuys: participation.rebuyCount,
          addOns: participation.addOnCount,
        })),
    };
  });
}
