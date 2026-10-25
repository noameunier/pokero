import type { FastifyInstance } from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { getEnv } from './config/env.ts';
import { hashToken } from './lib/crypto.ts';
import { SESSION_COOKIE, sessionTokenHash } from './lib/security.ts';
import { persistAutoAdvance, segmentsFor } from './services/clock.ts';
import { buildSpectatorPayload } from './routes/public.ts';
import { viewClock, type ClockView } from '@pokero/domain';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

interface SubscribePayload {
  tournamentId?: unknown;
  spectatorToken?: unknown;
}

export function attachRealtime(app: FastifyInstance, server: FastifyInstance['server']): SocketServer {
  const env = getEnv();
  const origins = env.NODE_ENV === 'production' ? env.APP_BASE_URL.replace(/\/$/, '') : true;

  const io = new SocketServer(server, {
    path: '/socket.io',
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });

  async function authorize(
    payload: SubscribePayload,
    cookieHeader: string | undefined,
  ): Promise<{ tournamentId: string; role: 'ORGANIZER' | 'SPECTATOR' } | null> {
    const tournamentId = typeof payload.tournamentId === 'string' ? payload.tournamentId : null;
    if (!tournamentId) return null;

    if (typeof payload.spectatorToken === 'string' && payload.spectatorToken.length > 10) {
      const invitation = await app.prisma.spectatorInvitation.findFirst({
        where: {
          tournamentId,
          tokenHash: hashToken(payload.spectatorToken, env.TOKEN_PEPPER),
          revokedAt: null,
        },
        select: { id: true },
      });
      return invitation ? { tournamentId, role: 'SPECTATOR' } : null;
    }

    const cookies = parseCookies(cookieHeader);
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;

    const session = await app.prisma.userSession.findUnique({
      where: { tokenHash: sessionTokenHash(token) },
      include: { user: { select: { id: true, deletedAt: true } } },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.deletedAt !== null
    ) {
      return null;
    }

    const tournament = await app.prisma.tournament.findFirst({
      where: { id: tournamentId, ownerId: session.user.id },
      select: { id: true },
    });
    return tournament ? { tournamentId, role: 'ORGANIZER' } : null;
  }

  io.on('connection', (socket) => {
    let subscribedAt = 0;
    let subscribes = 0;

    socket.on('subscribe', async (payload: SubscribePayload, ack?: (response: unknown) => void) => {
      const now = Date.now();
      if (now - subscribedAt < 60_000) {
        subscribes += 1;
        if (subscribes > 20) {
          ack?.({ ok: false, error: 'RATE_LIMITED' });
          return;
        }
      } else {
        subscribedAt = now;
        subscribes = 1;
      }

      try {
        const authorization = await authorize(payload, socket.handshake.headers.cookie);
        if (!authorization) {
          ack?.({ ok: false, error: 'UNAUTHORIZED' });
          return;
        }

        for (const room of socket.rooms) {
          if (room !== socket.id) await socket.leave(room);
        }
        const room = `tournament:${authorization.tournamentId}`;
        await socket.join(room);

        const spectator = await buildSpectatorPayload(app, authorization.tournamentId);
        socket.emit('state', {
          role: authorization.role,
          tournamentId: authorization.tournamentId,
          spectator,
        });
        ack?.({ ok: true, role: authorization.role });
      } catch (error) {
        app.log.warn({ err: error }, 'Échec d’abonnement Socket.IO');
        ack?.({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('unsubscribe', async () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) await socket.leave(room);
      }
    });

    socket.on('error', (error) => {
      app.log.warn({ err: error }, 'Erreur Socket.IO');
    });
  });

  app.events.on('clock:updated', (payload: { tournamentId: string; view: ClockView | null }) => {
    if (!payload?.tournamentId) return;
    io.to(`tournament:${payload.tournamentId}`).emit('clock', {
      tournamentId: payload.tournamentId,
      clock: payload.view,
      serverNow: Date.now(),
    });
  });

  app.events.on('tournament:refresh', (payload: { tournamentId: string }) => {
    if (!payload?.tournamentId) return;
    io.to(`tournament:${payload.tournamentId}`).emit('refresh', {
      tournamentId: payload.tournamentId,
      serverNow: Date.now(),
    });
  });

  return io;
}

export function startScheduler(app: FastifyInstance): () => void {
  let running = false;

  const clockInterval = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const tournaments = await app.prisma.tournament.findMany({
        where: { status: 'RUNNING' },
        select: {
          id: true,
          levels: { orderBy: { position: 'asc' } },
          clockState: true,
        },
        take: 500,
      });

      for (const tournament of tournaments) {
        if (!tournament.clockState) continue;
        const result = await app.prisma.$transaction(async (tx) =>
          persistAutoAdvance(tx, tournament.id, tournament.clockState!, tournament.levels),
        );
        if (result.changed) {
          app.events.emit('clock:updated', {
            tournamentId: tournament.id,
            view: viewClock(result.state, segmentsFor(tournament.levels), Date.now()),
          });
          app.events.emit('tournament:refresh', { tournamentId: tournament.id });
        }
      }
    } catch (error) {
      app.log.error({ err: error }, 'Erreur du planificateur de chronomètre');
    } finally {
      running = false;
    }
  }, 1000);

  const cleanupInterval = setInterval(
    async () => {
      try {
        await app.prisma.userSession.deleteMany({
          where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
        });
        await app.prisma.tournamentPresence.deleteMany({
          where: { lastHeartbeatAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
      } catch (error) {
        app.log.error({ err: error }, 'Erreur du nettoyage périodique');
      }
    },
    6 * 60 * 60 * 1000,
  );

  return () => {
    clearInterval(clockInterval);
    clearInterval(cleanupInterval);
  };
}
