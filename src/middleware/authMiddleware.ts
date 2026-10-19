import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { credentialVersion } from '../security/password.js';
import { verifyToken } from '../security/token.js';
import { HttpError } from './httpError.js';

export function requireAuth(db: Kysely<Database>, secret: string): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '');
    if (!match) throw new HttpError(401, 'A valid Bearer token is required');
    let claims: ReturnType<typeof verifyToken>;
    try { claims = verifyToken(match[1]!, secret); }
    catch { throw new HttpError(401, 'Invalid or expired access token'); }
    const user = await db.selectFrom('users').select(['id', 'password_hash'])
      .where('id', '=', claims.id).executeTakeFirst();
    if (!user || claims.version !== credentialVersion(user.password_hash)) {
      throw new HttpError(401, 'Invalid or expired access token');
    }
    res.locals.userId = user.id;
    next();
  };
}
