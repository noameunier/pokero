import type { z } from 'zod';
import { AppError } from './app-error.ts';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.badRequest('VALIDATION_ERROR', 'Données invalides.', {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function publicUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  locale: string;
  publicProfile: boolean;
  publicResults: boolean;
  emailVerifiedAt: Date | null;
  createdAt?: Date;
}): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    locale: user.locale,
    publicProfile: user.publicProfile,
    publicResults: user.publicResults,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt?.toISOString(),
  };
}
