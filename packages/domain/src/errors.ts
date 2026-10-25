export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function assertInteger(value: number, name: string, opts: { min?: number } = {}): void {
  if (!Number.isInteger(value)) {
    throw new DomainError('INVALID_INTEGER', `${name} doit être un entier.`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new DomainError('OUT_OF_RANGE', `${name} doit être supérieur ou égal à ${opts.min}.`);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, unit: number): number {
  if (unit <= 0) return value;
  return Math.max(unit, Math.round(value / unit) * unit);
}
