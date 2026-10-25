import type { FastifyReply, FastifyRequest } from 'fastify';
import { getEnv } from '../config/env.ts';
import { hashToken, safeEqual } from './crypto.ts';
import { AppError } from './app-error.ts';

export const SESSION_COOKIE = 'pokero_session';
export const CSRF_COOKIE = 'pokero_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function sessionCookieOptions(): Parameters<FastifyReply['setCookie']>[2] {
  const env = getEnv();
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export function csrfCookieOptions(): Parameters<FastifyReply['setCookie']>[2] {
  const env = getEnv();
  return {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

export function allowedOrigins(): Set<string> {
  const env = getEnv();
  const origins = new Set<string>();
  try {
    origins.add(new URL(env.APP_BASE_URL).origin);
  } catch {
    // APP_BASE_URL est validé par Zod, ce cas est défensif.
  }
  if (env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://localhost:8080');
    origins.add('http://127.0.0.1:8080');
    origins.add('http://localhost:4000');
    origins.add('http://127.0.0.1:4000');
  }
  return origins;
}

export function assertTrustedOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const origins = allowedOrigins();
  const host = request.headers.host;
  if (host) {
    const scheme = request.protocol ?? 'https';
    origins.add(`${scheme}://${host}`);
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }
  if (!origins.has(origin)) {
    throw new AppError(403, 'UNTRUSTED_ORIGIN', `Origine non autorisée : ${origin}`);
  }
}

/**
 * Protection CSRF en double soumission.
 * Le cookie CSRF n'est requis que lorsqu'une session ambiante existe.
 */
export function assertCsrf(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return;
  assertTrustedOrigin(request);

  const hasSession = Boolean(request.cookies[SESSION_COOKIE]);
  if (!hasSession) return;

  const header = request.headers[CSRF_HEADER];
  const cookie = request.cookies[CSRF_COOKIE];
  if (typeof header !== 'string' || !cookie) {
    throw new AppError(403, 'CSRF_MISSING', 'Jeton CSRF manquant.');
  }
  if (!safeEqual(header, cookie)) {
    throw new AppError(403, 'CSRF_INVALID', 'Jeton CSRF invalide.');
  }
}

export function readSessionToken(request: FastifyRequest): string | null {
  const token = request.cookies[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 10 ? token : null;
}

export function sessionTokenHash(token: string): string {
  return hashToken(token, getEnv().TOKEN_PEPPER);
}
