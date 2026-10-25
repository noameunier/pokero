import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getEnv } from '../config/env.ts';
import { hashIp, hashToken, randomToken } from '../lib/crypto.ts';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  assertCsrf,
  csrfCookieOptions,
  readSessionToken,
  sessionCookieOptions,
  sessionTokenHash,
} from '../lib/security.ts';
import { AppError } from '../lib/app-error.ts';

const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  const env = getEnv();

  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMITED',
        message: 'Trop de requêtes, réessayez dans une minute.',
      },
    }),
  });

  app.decorateRequest('auth', null);

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      if (!request.auth) throw AppError.unauthorized();
    },
  );

  app.decorate(
    'requireAdmin',
    async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
      if (!request.auth) throw AppError.unauthorized();
      if (request.auth.user.role !== 'ADMIN') throw AppError.forbidden();
    },
  );

  app.addHook('onRequest', async (request, reply) => {
    assertCsrf(request);

    if (!request.cookies[CSRF_COOKIE]) {
      reply.setCookie(CSRF_COOKIE, randomToken(24), csrfCookieOptions());
    }
  });

  app.addHook('preHandler', async (request) => {
    const token = readSessionToken(request);
    if (!token) return;

    const session = await app.prisma.userSession.findUnique({
      where: { tokenHash: sessionTokenHash(token) },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.deletedAt !== null
    ) {
      return;
    }

    if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      await app.prisma.userSession
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }

    request.auth = {
      sessionId: session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        role: session.user.role,
        locale: session.user.locale,
        publicProfile: session.user.publicProfile,
        publicResults: session.user.publicResults,
        emailVerifiedAt: session.user.emailVerifiedAt,
      },
    };
  });
}

export async function createSession(
  app: FastifyInstance,
  input: { userId: string; userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const env = getEnv();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const session = await app.prisma.userSession.create({
    data: {
      userId: input.userId,
      tokenHash: hashToken(token, env.TOKEN_PEPPER),
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      ipHash: hashIp(input.ip, env.TOKEN_PEPPER),
      expiresAt,
    },
  });
  return { token, expiresAt, sessionId: session.id };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().COOKIE_SECURE,
    domain: getEnv().COOKIE_DOMAIN || undefined,
  });
}

export async function revokeSession(app: FastifyInstance, sessionId: string): Promise<void> {
  await app.prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}
