import type { FastifyInstance } from 'fastify';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@pokero/contracts';
import { getEnv } from '../config/env.ts';
import { AppError, isUniqueConstraintError } from '../lib/app-error.ts';
import {
  getDummyPasswordHash,
  hashPassword,
  hashToken,
  randomToken,
  sha256,
  verifyPassword,
} from '../lib/crypto.ts';
import { parseInput, publicUser } from '../lib/http.ts';
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  sendMail,
} from '../lib/mailer.ts';
import {
  clearSessionCookie,
  createSession,
  revokeSession,
  setSessionCookie,
} from '../plugins/security.ts';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const authRateLimit = {
  rateLimit: {
    max: getEnv().AUTH_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  },
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const env = getEnv();

  app.post('/auth/register', { config: authRateLimit }, async (request, reply) => {
    const input = parseInput(registerSchema, request.body);

    const existing = await app.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppError.conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse email.');
    }

    const passwordHash = await hashPassword(input.password);
    const role = env.adminEmails.includes(input.email) ? 'ADMIN' : 'USER';
    const needsVerification = env.EMAIL_VERIFICATION_REQUIRED;
    const verificationToken = needsVerification ? randomToken(32) : null;

    let user;
    try {
      user = await app.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          role,
          emailVerifiedAt: needsVerification ? null : new Date(),
          emailVerificationTokenHash: verificationToken
            ? hashToken(verificationToken, env.TOKEN_PEPPER)
            : null,
          emailVerificationExpiresAt: verificationToken
            ? new Date(Date.now() + VERIFICATION_TTL_MS)
            : null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw AppError.conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse email.');
      }
      throw error;
    }

    if (verificationToken) {
      const mail = buildVerificationEmail(user.displayName, verificationToken);
      await sendMail({ ...mail, to: user.email }, app.log);
    }

    const session = await createSession(app, {
      userId: user.id,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    setSessionCookie(reply, session.token);

    return reply.code(201).send({
      user: publicUser(user),
      emailVerificationRequired: needsVerification,
    });
  });

  app.post('/auth/login', { config: authRateLimit }, async (request, reply) => {
    const input = parseInput(loginSchema, request.body);
    const user = await app.prisma.user.findUnique({ where: { email: input.email } });

    if (!user || user.deletedAt !== null) {
      const dummy = await getDummyPasswordHash();
      await verifyPassword(dummy, input.password);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
    }

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
    }

    if (env.EMAIL_VERIFICATION_REQUIRED && user.emailVerifiedAt === null) {
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirmez votre adresse email avant de vous connecter.');
    }

    const session = await createSession(app, {
      userId: user.id,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    setSessionCookie(reply, session.token);

    return { user: publicUser(user) };
  });

  app.post('/auth/logout', async (request, reply) => {
    if (request.auth) {
      await revokeSession(app, request.auth.sessionId);
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (request) => {
    if (!request.auth) return { user: null };
    const user = await app.prisma.user.findUnique({ where: { id: request.auth.user.id } });
    return { user: user ? publicUser(user) : null };
  });

  app.patch('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const input = parseInput(updateProfileSchema, request.body);
    const user = await app.prisma.user.update({
      where: { id: request.auth!.user.id },
      data: {
        displayName: input.displayName,
        locale: input.locale,
        publicProfile: input.publicProfile,
        publicResults: input.publicResults,
      },
    });
    return { user: publicUser(user) };
  });

  app.post('/auth/verify-email', { config: authRateLimit }, async (request) => {
    const input = parseInput(verifyEmailSchema, request.body);
    const tokenHash = hashToken(input.token, env.TOKEN_PEPPER);
    const user = await app.prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });
    if (!user) {
      throw AppError.badRequest('INVALID_TOKEN', 'Lien de vérification invalide ou expiré.');
    }
    await app.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });
    return { verified: true };
  });

  app.post('/auth/resend-verification', { config: authRateLimit }, async (request, reply) => {
    if (!request.auth) throw AppError.unauthorized();
    const user = await app.prisma.user.findUnique({ where: { id: request.auth.user.id } });
    if (!user || user.emailVerifiedAt !== null) {
      return reply.code(204).send();
    }
    const token = randomToken(32);
    await app.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: hashToken(token, env.TOKEN_PEPPER),
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    const mail = buildVerificationEmail(user.displayName, token);
    await sendMail({ ...mail, to: user.email }, app.log);
    return reply.code(202).send({ sent: true });
  });

  app.post('/auth/forgot-password', { config: authRateLimit }, async (request, reply) => {
    const input = parseInput(forgotPasswordSchema, request.body);
    const user = await app.prisma.user.findUnique({ where: { email: input.email } });

    if (user && user.deletedAt === null) {
      const token = randomToken(32);
      await app.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hashToken(token, env.TOKEN_PEPPER),
          passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      });
      const mail = buildPasswordResetEmail(user.displayName, token);
      await sendMail({ ...mail, to: user.email }, app.log);
    }

    return reply.code(202).send({
      sent: true,
      message: 'Si un compte existe, un email de réinitialisation a été envoyé.',
    });
  });

  app.post('/auth/reset-password', { config: authRateLimit }, async (request, reply) => {
    const input = parseInput(resetPasswordSchema, request.body);
    const tokenHash = hashToken(input.token, env.TOKEN_PEPPER);
    const user = await app.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });
    if (!user) {
      throw AppError.badRequest('INVALID_TOKEN', 'Lien de réinitialisation invalide ou expiré.');
    }

    const passwordHash = await hashPassword(input.password);
    await app.prisma.$transaction([
      app.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      }),
      app.prisma.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    clearSessionCookie(reply);
    return { reset: true };
  });

  app.post('/auth/change-password', { preHandler: [app.authenticate], config: authRateLimit }, async (request, reply) => {
    const input = parseInput(changePasswordSchema, request.body);
    const user = await app.prisma.user.findUnique({ where: { id: request.auth!.user.id } });
    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Mot de passe actuel incorrect.');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await app.prisma.$transaction([
      app.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      app.prisma.userSession.updateMany({
        where: { userId: user.id, id: { not: request.auth!.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return reply.code(204).send();
  });

  app.post('/auth/delete-account', { preHandler: [app.authenticate], config: authRateLimit }, async (request, reply) => {
    const input = parseInput(deleteAccountSchema, request.body);
    const user = await app.prisma.user.findUnique({ where: { id: request.auth!.user.id } });
    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Mot de passe incorrect.');
    }

    const now = new Date();
    await app.prisma.$transaction(async (tx) => {
      await tx.participantAccountClaim.deleteMany({ where: { userId: user.id } });
      await tx.tournamentParticipant.updateMany({
        where: { userId: user.id },
        data: {
          userId: null,
          displayName: `Joueur supprimé ${user.id.slice(-4)}`,
        },
      });
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: `deleted+${user.id}@pokero.invalid`,
          displayName: 'Joueur supprimé',
          passwordHash: await hashPassword(randomToken(24)),
          emailVerifiedAt: null,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          publicProfile: false,
          publicResults: false,
          deletedAt: now,
        },
      });
    });

    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/auth/export', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.auth!.user.id;
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: {
        chipCases: { include: { chipTypes: true } },
        presets: true,
        tournaments: {
          include: {
            participants: true,
            rebuys: true,
            addOns: true,
            eliminations: true,
            finalRankings: true,
            events: { orderBy: { createdAt: 'asc' } },
          },
        },
        participations: {
          include: { tournament: { select: { id: true, name: true, status: true, startedAt: true } } },
        },
        sessions: {
          select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true, userAgent: true },
        },
      },
    });
    if (!user) throw AppError.notFound();

    const payload = {
      exportedAt: new Date().toISOString(),
      application: 'Pokero',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
        role: user.role,
        createdAt: user.createdAt,
        publicProfile: user.publicProfile,
        publicResults: user.publicResults,
      },
      chipCases: user.chipCases,
      presets: user.presets,
      tournaments: user.tournaments,
      participations: user.participations,
      sessions: user.sessions,
    };

    reply.header(
      'content-disposition',
      `attachment; filename="pokero-export-${sha256(userId).slice(0, 8)}.json"`,
    );
    return reply.type('application/json').send(JSON.stringify(payload, null, 2));
  });
}
