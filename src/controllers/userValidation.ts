import { HttpError } from '../middleware/httpError.js';

export function objectBody(body: unknown, allowed: string[]): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'A JSON object body is required');
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new HttpError(400, 'Request contains unsupported fields');
  }
  return value;
}

export function username(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_]{3,50}$/.test(value.trim())) {
    throw new HttpError(400, 'Username must contain 3–50 letters, numbers, or underscores');
  }
  return value.trim();
}

export function email(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new HttpError(400, 'A valid email address of at most 255 characters is required');
  }
  return value.trim().toLowerCase();
}

export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw new HttpError(400, 'Password must contain 12–128 characters');
  }
  return value;
}

export function bio(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 2000) {
    throw new HttpError(400, 'Bio must be a string of at most 2000 characters or null');
  }
  return value.trim();
}

export function avatar(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 512) {
    throw new HttpError(400, 'Avatar URL must be an HTTP(S) URL of at most 512 characters or null');
  }
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch { throw new HttpError(400, 'Avatar URL must be a valid HTTP(S) URL without credentials'); }
  return value;
}

export function userId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
    throw new HttpError(400, 'User ID must be a positive integer');
  }
  return Number(value);
}

export function pagination(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) ||
    Number(value) > max || (fallback !== 0 && Number(value) === 0)) {
    throw new HttpError(400, 'Invalid pagination parameters');
  }
  return Number(value);
}
