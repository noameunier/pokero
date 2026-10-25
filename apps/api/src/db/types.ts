import type { Prisma } from '../../generated/prisma/client.ts';
import type { PrismaClient } from '../../generated/prisma/client.ts';

export type Tx = PrismaClient | Prisma.TransactionClient;
export type { Prisma, PrismaClient };
