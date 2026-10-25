import { EventEmitter } from 'node:events';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import { DomainError } from '@pokero/domain';
import { getEnv } from './config/env.ts';
import { getPrisma } from './db/prisma.ts';
import { AppError } from './lib/app-error.ts';
import { registerSecurity } from './plugins/security.ts';
import { authRoutes } from './routes/auth.ts';
import { chipCaseRoutes } from './routes/chip-cases.ts';
import { presetRoutes } from './routes/presets.ts';
import { publicRoutes } from './routes/public.ts';
import { tournamentRoutes } from './routes/tournaments.ts';
import './types.ts';

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  prismaUrl?: string;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = getEnv();

  const app = Fastify({
    logger:
      options.logger ??
      (env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
                : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    requestIdHeader: 'x-request-id',
  });

  app.decorate('prisma', getPrisma());
  app.decorate('events', new EventEmitter());

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const raw = typeof body === 'string' ? body.trim() : '';
    if (raw.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(Object.assign(new Error('Corps JSON invalide.'), { statusCode: 400, code: 'INVALID_JSON' }), undefined);
    }
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await registerSecurity(app);

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error instanceof Error ? error.message : 'Requête invalide.',
          details: error.details,
          requestId,
        },
      });
    }

    if (error instanceof DomainError) {
      const status = error.code === 'ALREADY_STARTED' || error.code === 'ALREADY_CLOSED' ? 409 : 400;
      return reply.code(status).send({
        error: { code: error.code, message: error.message, requestId },
      });
    }

    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: 'Cette ressource existe déjà.', requestId },
      });
    }
    if (code === 'P2025') {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Ressource introuvable.', requestId },
      });
    }

    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Trop de requêtes, réessayez plus tard.',
          requestId,
        },
      });
    }
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: {
          code: code ?? 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Requête invalide.',
          requestId,
        },
      });
    }

    request.log.error({ err: error, requestId }, 'Erreur interne');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue.',
        requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route inconnue : ${request.method} ${request.url}`,
        requestId: request.id,
      },
    });
  });

  app.get('/health', async () => {
    const startedAt = Date.now();
    await app.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
      dbLatencyMs: Date.now() - startedAt,
      now: new Date().toISOString(),
    };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(chipCaseRoutes);
      await api.register(presetRoutes);
      await api.register(tournamentRoutes);
      await api.register(publicRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
