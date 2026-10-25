import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.ts';
import { getEnv } from '../config/env.ts';

export type Database = PrismaClient;
export type { PrismaClient };

let instance: PrismaClient | null = null;

export function createPrismaClient(url = getEnv().DATABASE_URL): PrismaClient {
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log:
      getEnv().NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
        : [{ emit: 'event', level: 'error' }],
  });
}

export function getPrisma(): PrismaClient {
  instance ??= createPrismaClient();
  return instance;
}

export async function disconnectPrisma(): Promise<void> {
  if (instance) {
    await instance.$disconnect();
    instance = null;
  }
}
