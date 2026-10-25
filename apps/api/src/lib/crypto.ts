import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Hache un token opaque avec le poivre applicatif avant stockage. */
export function hashToken(token: string, pepper: string): string {
  return sha256(`${pepper}:${token}`);
}

export function hashIp(ip: string | undefined, pepper: string): string | null {
  if (!ip) return null;
  return sha256(`${pepper}:ip:${ip}`);
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password, ARGON_OPTIONS);
  } catch {
    return false;
  }
}

/** Hash factice utilisé pour égaliser les temps de réponse quand l'email est inconnu. */
let dummyHashPromise: Promise<string> | null = null;

export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomToken(24));
  return dummyHashPromise;
}

export function hmacSign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

export function hmacVerify(payload: string, signature: string, secret: string): boolean {
  return safeEqual(hmacSign(payload, secret), signature);
}
