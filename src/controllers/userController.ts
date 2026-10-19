import type { RequestHandler } from 'express';
import { sql, type Kysely, type Updateable } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { issueToken } from '../security/token.js';
import * as validate from './userValidation.js';

const publicFields = ['id', 'username', 'bio', 'avatar_url', 'created_at', 'updated_at'] as const;
const ownFields = [...publicFields, 'email'] as const;

export function createUserController(db: Kysely<Database>, secret: string) {
  // Match the work factor for existing and unknown accounts during login.
  const dummyHash = hashPassword('not-a-real-account-password');

  const create: RequestHandler = async (req, res) => {
    const body = validate.objectBody(req.body, ['username', 'email', 'password', 'bio', 'avatar_url']);
    const input = {
      username: validate.username(body.username), email: validate.email(body.email),
      bio: body.bio === undefined ? null : validate.bio(body.bio),
      avatar_url: body.avatar_url === undefined ? null : validate.avatar(body.avatar_url),
    };
    const password = validate.password(body.password);
    const user = await db.insertInto('users').values({ ...input, password_hash: await hashPassword(password) })
      .returning([...ownFields, 'password_hash']).executeTakeFirstOrThrow();
    const { password_hash, ...profile } = user;
    res.status(201).location(`/api/users/${user.id}`).json({
      user: profile, token: issueToken(user.id, password_hash, secret),
    });
  };

  const login: RequestHandler = async (req, res) => {
    const body = validate.objectBody(req.body, ['email', 'password']);
    const email = validate.email(body.email);
    const password = validate.password(body.password);
    const user = await db.selectFrom('users').select([...ownFields, 'password_hash'])
      .where(sql<string>`lower(email)`, '=', email).executeTakeFirst();
    const valid = await verifyPassword(password, user?.password_hash ?? await dummyHash);
    if (!user || !valid) throw new HttpError(401, 'Invalid email or password');
    const { password_hash, ...profile } = user;
    res.json({ user: profile, token: issueToken(user.id, password_hash, secret) });
  };

  const list: RequestHandler = async (req, res) => {
    const limit = validate.pagination(req.query.limit, 20, 100);
    const offset = validate.pagination(req.query.offset, 0, 2147483647);
    const users = await db.selectFrom('users').select(publicFields).orderBy('id')
      .limit(limit).offset(offset).execute();
    res.json({ users, pagination: { limit, offset } });
  };

  const get: RequestHandler = async (req, res) => {
    const id = validate.userId(req.params.id);
    const user = await db.selectFrom('users').select(publicFields).where('id', '=', id).executeTakeFirst();
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user });
  };

  const me: RequestHandler = async (_req, res) => {
    const user = await db.selectFrom('users').select(ownFields)
      .where('id', '=', res.locals.userId as number).executeTakeFirst();
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user });
  };

  const update: RequestHandler = async (req, res) => {
    const id = validate.userId(req.params.id);
    if (id !== res.locals.userId) throw new HttpError(403, 'You can only modify your own account');
    const body = validate.objectBody(req.body, ['username', 'email', 'password', 'current_password', 'bio', 'avatar_url']);
    const updates: Updateable<Database['users']> = {};
    if (body.username !== undefined) updates.username = validate.username(body.username);
    if (body.email !== undefined) updates.email = validate.email(body.email);
    if (body.bio !== undefined) updates.bio = validate.bio(body.bio);
    if (body.avatar_url !== undefined) updates.avatar_url = validate.avatar(body.avatar_url);
    const newPassword = body.password === undefined ? undefined : validate.password(body.password);
    if (Object.keys(updates).length === 0 && newPassword === undefined) {
      throw new HttpError(400, 'Provide at least one field to update');
    }
    const existing = await db.selectFrom('users').select('password_hash').where('id', '=', id).executeTakeFirst();
    if (!existing) throw new HttpError(404, 'User not found');
    if (updates.email !== undefined || newPassword !== undefined) {
      const current = validate.password(body.current_password);
      if (!await verifyPassword(current, existing.password_hash)) throw new HttpError(401, 'Current password is incorrect');
    }
    if (newPassword !== undefined) updates.password_hash = await hashPassword(newPassword);
    updates.updated_at = new Date();
    const user = await db.updateTable('users').set(updates).where('id', '=', id)
      .where('password_hash', '=', existing.password_hash).returning(ownFields).executeTakeFirst();
    if (!user) throw new HttpError(409, 'Account changed; sign in again and retry');
    res.json({ user, ...(updates.password_hash ? { token: issueToken(id, updates.password_hash, secret) } : {}) });
  };

  const remove: RequestHandler = async (req, res) => {
    const id = validate.userId(req.params.id);
    if (id !== res.locals.userId) throw new HttpError(403, 'You can only delete your own account');
    const result = await db.deleteFrom('users').where('id', '=', id).executeTakeFirst();
    if (result.numDeletedRows === 0n) throw new HttpError(404, 'User not found');
    res.status(204).end();
  };

  return { create, login, list, get, me, update, remove };
}
