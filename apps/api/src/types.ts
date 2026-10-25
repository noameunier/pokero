import type { EventEmitter } from 'node:events';
import type { PrismaClient } from './db/prisma.ts';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  locale: string;
  publicProfile: boolean;
  publicResults: boolean;
  emailVerifiedAt: Date | null;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }

  interface FastifyInstance {
    prisma: PrismaClient;
    events: EventEmitter;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
