export type ErrorDetails = Record<string, unknown> | undefined;

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(code: string, message: string, details?: ErrorDetails): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentification requise.'): AppError {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(message = 'Accès refusé.'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Ressource introuvable.'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string, details?: ErrorDetails): AppError {
    return new AppError(409, code, message, details);
  }

  static tooManyRequests(message = 'Trop de requêtes, réessayez plus tard.'): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static payloadTooLarge(message = 'Requête trop volumineuse.'): AppError {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}
