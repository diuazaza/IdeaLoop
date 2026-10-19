import jwt from 'jsonwebtoken';
import { credentialVersion } from './password.js';

const issuer = 'idealoop';
const audience = 'idealoop-api';
export function issueToken(id: number, passwordHash: string, secret: string): string {
  return jwt.sign({ version: credentialVersion(passwordHash) }, secret, {
    algorithm: 'HS256', subject: String(id), expiresIn: '1h', issuer, audience,
  });
}

export function verifyToken(token: string, secret: string): { id: number; version: string } {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
  if (typeof payload === 'string' || typeof payload.sub !== 'string' ||
    !/^[1-9]\d*$/.test(payload.sub) || !Number.isSafeInteger(Number(payload.sub)) ||
    Number(payload.sub) > 2147483647 || typeof payload.version !== 'string' ||
    typeof payload.exp !== 'number') throw new Error('Invalid token claims');
  return { id: Number(payload.sub), version: payload.version };
}
