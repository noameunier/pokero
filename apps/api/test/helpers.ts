import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { getPrisma } from '../src/db/prisma.ts';

export interface TestClient {
  app: FastifyInstance;
  cookieHeader: string;
  csrf: string;
  userId: string;
  email: string;
}

let counter = 0;

export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export async function truncateAll(app: FastifyInstance): Promise<void> {
  await app.prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

export function readCookies(response: LightMyRequestResponse): {
  cookieHeader: string;
  csrf: string;
} {
  const cookies = response.cookies ?? [];
  const values = cookies.map((cookie) => `${cookie.name}=${cookie.value}`);
  const csrf = cookies.find((cookie) => cookie.name === 'pokero_csrf')?.value ?? '';
  return { cookieHeader: values.join('; '), csrf };
}

export async function createApp(): Promise<FastifyInstance> {
  return buildApp({ logger: false });
}

export async function registerUser(
  app: FastifyInstance,
  options: { email?: string; password?: string; displayName?: string } = {},
): Promise<TestClient> {
  const email = options.email ?? uniqueEmail();
  const password = options.password ?? 'correct horse battery staple';

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password, displayName: options.displayName ?? 'Testeur' },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Inscription échouée: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { user: { id: string } };
  const { cookieHeader, csrf } = readCookies(response);
  return { app, cookieHeader, csrf, userId: body.user.id, email };
}

export function request(
  client: TestClient,
  options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  },
): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = {
    cookie: client.cookieHeader,
    ...(options.headers ?? {}),
  };
  if (options.method !== 'GET' && client.csrf) {
    headers['x-csrf-token'] = client.csrf;
  }
  return client.app.inject({
    method: options.method,
    url: options.url,
    payload: options.payload as never,
    headers,
  });
}

export async function closeApp(app: FastifyInstance): Promise<void> {
  await app.close();
  await getPrisma().$disconnect().catch(() => undefined);
}
