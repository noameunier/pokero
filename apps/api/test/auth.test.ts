import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  closeApp,
  createApp,
  readCookies,
  registerUser,
  request,
  truncateAll,
  uniqueEmail,
} from './helpers.ts';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createApp();
});

beforeEach(async () => {
  await truncateAll(app);
});

afterAll(async () => {
  await closeApp(app);
});

describe('authentification', () => {
  it('inscrit un utilisateur et ouvre une session', async () => {
    const client = await registerUser(app);
    const me = await request(client, { method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(200);
    const body = me.json() as { user: { email: string; emailVerified: boolean } };
    expect(body.user.email).toBe(client.email);
    expect(body.user.emailVerified).toBe(true);
    expect(client.csrf.length).toBeGreaterThan(10);
  });

  it('refuse un email déjà utilisé', async () => {
    const client = await registerUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: client.email, password: 'another long password', displayName: 'Autre' },
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('EMAIL_TAKEN');
  });

  it('refuse un mot de passe trop court', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: uniqueEmail(), password: 'court', displayName: 'Test' },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('connecte puis refuse un mauvais mot de passe', async () => {
    const client = await registerUser(app);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: client.email, password: 'correct horse battery staple' },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: client.email, password: 'mauvais mot de passe' },
    });
    expect(bad.statusCode).toBe(401);
    expect((bad.json() as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('révoque la session à la déconnexion', async () => {
    const client = await registerUser(app);
    const logout = await request(client, { method: 'POST', url: '/api/auth/logout' });
    expect(logout.statusCode).toBe(204);

    const me = await request(client, { method: 'GET', url: '/api/auth/me' });
    expect((me.json() as { user: unknown }).user).toBeNull();
  });

  it('exige le jeton CSRF sur les mutations authentifiées', async () => {
    const client = await registerUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/chip-cases',
      headers: { cookie: client.cookieHeader, 'content-type': 'application/json' },
      payload: { name: 'Sans CSRF', chipTypes: [{ label: 'A', color: '#FFFFFF', value: 25, quantity: 10 }] },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('CSRF_MISSING');
  });

  it('refuse une origine non autorisée', async () => {
    const client = await registerUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/chip-cases',
      headers: {
        cookie: client.cookieHeader,
        'x-csrf-token': client.csrf,
        origin: 'https://evil.example.com',
        'content-type': 'application/json',
      },
      payload: { name: 'Origine', chipTypes: [{ label: 'A', color: '#FFFFFF', value: 25, quantity: 10 }] },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('UNTRUSTED_ORIGIN');
  });

  it('exporte les données personnelles', async () => {
    const client = await registerUser(app);
    const response = await request(client, { method: 'GET', url: '/api/auth/export' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    const body = JSON.parse(response.body) as { user: { email: string }; application: string };
    expect(body.application).toBe('Pokero');
    expect(body.user.email).toBe(client.email);
  });

  it('supprime le compte et anonymise les participations', async () => {
    const client = await registerUser(app);
    const chipCase = await request(client, {
      method: 'POST',
      url: '/api/chip-cases',
      payload: { name: 'Mallette', chipTypes: [{ label: 'Blanc', color: '#FFFFFF', value: 25, quantity: 100 }] },
    });
    expect(chipCase.statusCode).toBe(201);

    const removed = await request(client, {
      method: 'POST',
      url: '/api/auth/delete-account',
      payload: { password: 'correct horse battery staple', confirmation: 'SUPPRIMER' },
    });
    expect(removed.statusCode).toBe(204);

    const me = await request(client, { method: 'GET', url: '/api/auth/me' });
    expect((me.json() as { user: unknown }).user).toBeNull();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: client.email, password: 'correct horse battery staple' },
    });
    expect(login.statusCode).toBe(401);
  });

  it('réinitialise le mot de passe via un jeton', async () => {
    const client = await registerUser(app);
    const forgot = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: client.email },
    });
    expect(forgot.statusCode).toBe(202);

    const user = await app.prisma.user.findUnique({ where: { email: client.email } });
    expect(user?.passwordResetTokenHash).toBeTruthy();

    const token = 'jeton-de-test-suffisamment-long-pour-la-validation';
    await app.prisma.user.update({
      where: { id: client.userId },
      data: {
        passwordResetTokenHash: (
          await import('../src/lib/crypto.ts')
        ).hashToken(token, process.env.TOKEN_PEPPER ?? ''),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'nouveau mot de passe solide' },
    });
    expect(reset.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: client.email, password: 'nouveau mot de passe solide' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.cookies.some((cookie) => cookie.name === 'pokero_session')).toBe(true);
  });

  it('configure les attributs de sécurité des cookies', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });
    const setCookie = response.headers['set-cookie'];
    const header = Array.isArray(setCookie) ? setCookie.join('\n') : String(setCookie ?? '');
    expect(header).toContain('pokero_csrf=');
    expect(header.toLowerCase()).not.toMatch(/pokero_csrf=[^;]*;.*httponly/i);
    expect(header.toLowerCase()).toContain('samesite=lax');
  });
});
