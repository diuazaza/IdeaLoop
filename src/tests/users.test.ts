import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { Kysely, PostgresDialect, sql, type PostgresPoolClient } from 'kysely';
import jwt from 'jsonwebtoken';
import type { Database } from '../db/types.js';
import { createApp } from '../app.js';
import { up as usersMigration } from '../db/migrations/001_users_skills.js';
import { up as projectsMigration } from '../db/migrations/002_projects_media.js';
import { up as engagementMigration } from '../db/migrations/003_engagement.js';
import { up as requestsMigration } from '../db/migrations/004_requests.js';
import { up as identityMigration, down as identityRollback } from '../db/migrations/005_user_identity.js';
import { verifyPassword } from '../security/password.js';

const secret = 'test-only-secret-with-at-least-32-characters';
const password = 'correct horse battery staple';

test('User CRUD against embedded PostgreSQL and real migrations', async t => {
  const postgres = new PGlite();
  // Thin test-only adapter: Kysely still compiles PostgreSQL SQL, executed by PostgreSQL in WASM.
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: {
    options: {},
    connect: async () => ({
      query: async (query: string, parameters: readonly unknown[]) => {
        const result = await postgres.query(query, [...parameters]);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length,
          command: /^(insert|update|delete|merge)/i.exec(query)?.[1]?.toUpperCase() ?? 'SELECT' };
      },
      release() {},
    }) as PostgresPoolClient,
    end: () => postgres.close(),
  } }) });
  const app = createApp({ checkDatabase: async () => { await sql`select 1`.execute(db); },
    production: true, users: { db, jwtSecret: secret } });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    for (const migrate of [usersMigration, projectsMigration, engagementMigration, requestsMigration, identityMigration]) {
      await migrate(db);
    }
    // The new index migration is reversible and can be reapplied.
    await identityRollback(db);
    await identityMigration(db);

    async function request(method: string, path: string, body?: unknown, token?: string) {
      const response = await fetch(`${base}${path}`, {
        method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, location: response.headers.get('location'),
        body: response.status === 204 ? null : await response.json() as any };
    }
    let alice: number;
    let aliceToken: string;
    let bob: number;
    let bobToken: string;

    await t.test('create persists a salted password hash and returns only safe fields', async () => {
      const response = await request('POST', '/api/users', {
        username: 'Alice', email: ' ALICE@EXAMPLE.COM ', password, bio: 'Artist',
      });
      assert.equal(response.status, 201);
      alice = response.body.user.id;
      aliceToken = response.body.token;
      assert.equal(response.location, `/api/users/${alice}`);
      assert.equal(response.body.user.email, 'alice@example.com');
      assert.equal(response.body.user.password_hash, undefined);
      assert.equal(response.body.user.password, undefined);
      const stored = await db.selectFrom('users').select('password_hash').where('id', '=', alice).executeTakeFirstOrThrow();
      assert.notEqual(stored.password_hash, password);
      assert.equal(await verifyPassword(password, stored.password_hash), true);
      assert.equal(await verifyPassword('incorrect password', stored.password_hash), false);
      const second = await request('POST', '/api/auth/register', { username: 'Bob', email: 'bob@example.com', password });
      assert.equal(second.status, 201);
      bob = second.body.user.id;
      bobToken = second.body.token;
      const storedBob = await db.selectFrom('users').select('password_hash').where('id', '=', bob).executeTakeFirstOrThrow();
      assert.notEqual(stored.password_hash, storedBob.password_hash);
    });

    await t.test('case-insensitive duplicates and concurrent inserts return 409', async () => {
      for (const body of [
        { username: 'alice', email: 'other@example.com', password },
        { username: 'Other', email: 'ALICE@example.com', password },
      ]) assert.equal((await request('POST', '/api/users', body)).status, 409);
      const results = await Promise.all([1, 2].map(() => request('POST', '/api/users', {
        username: 'Concurrent', email: 'concurrent@example.com', password,
      })));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    });

    await t.test('list and read profiles omit email and hashes; owner can read email', async () => {
      const list = await request('GET', '/api/users?limit=1&offset=0');
      assert.equal(list.status, 200);
      assert.equal(list.body.users.length, 1);
      assert.deepEqual(list.body.pagination, { limit: 1, offset: 0 });
      assert.equal(list.body.users[0].id, alice);
      assert.equal(list.body.users[0].email, undefined);
      assert.equal(list.body.users[0].password_hash, undefined);
      const profile = await request('GET', `/api/users/${alice}`);
      assert.equal(profile.status, 200);
      assert.equal(profile.body.user.email, undefined);
      assert.equal(profile.body.user.username, 'Alice');
      const me = await request('GET', '/api/users/me', undefined, aliceToken);
      assert.equal(me.status, 200);
      assert.equal(me.body.user.email, 'alice@example.com');
      assert.equal(me.body.user.password_hash, undefined);
      assert.equal((await request('GET', '/api/users/2147483647')).status, 404);
    });

    await t.test('rejects invalid inputs without writing unsafe fields', async () => {
      for (const body of [null, [], {}, { username: 'ok', email: 'bad', password },
        { username: 'Valid', email: 'valid@example.com', password: 'short' },
        { username: 'Valid', email: 'valid@example.com', password, password_hash: 'injected' },
        { username: 'Valid', email: 'valid@example.com', password, avatar_url: 'javascript:alert(1)' },
      ]) assert.equal((await request('POST', '/api/users', body)).status, 400);
      for (const path of ['/api/users/abc', '/api/users/0', '/api/users/2147483648',
        '/api/users?limit=0', '/api/users?limit=101', '/api/users?offset=-1', '/api/users?limit=1&limit=2']) {
        assert.equal((await request('GET', path)).status, 400, path);
      }
      for (const body of [{}, { id: bob }, { bio: 'x'.repeat(2001) }, { avatar_url: 'file:///tmp/a' },
        { username: null }, { email: 'invalid' }]) {
        assert.equal((await request('PATCH', `/api/users/${alice}`, body, aliceToken)).status, 400);
      }
    });

    await t.test('requires verified unexpired tokens and enforces ownership', async () => {
      assert.equal((await request('PATCH', `/api/users/${alice}`, { bio: 'no' })).status, 401);
      assert.equal((await request('DELETE', `/api/users/${alice}`)).status, 401);
      assert.equal((await request('GET', '/api/users/me', undefined, 'forged')).status, 401);
      assert.equal((await request('PATCH', `/api/users/${alice}`, { bio: 'no' }, bobToken)).status, 403);
      assert.equal((await request('DELETE', `/api/users/${alice}`, undefined, bobToken)).status, 403);
      const payload = jwt.decode(aliceToken) as jwt.JwtPayload;
      for (const token of [
        jwt.sign({ version: payload.version }, secret, { algorithm: 'HS256', subject: String(alice),
          issuer: 'idealoop', audience: 'idealoop-api', expiresIn: -1 }),
        jwt.sign({ version: payload.version }, 'wrong-secret', { subject: String(alice), expiresIn: '1h' }),
        jwt.sign({ version: payload.version }, secret, { algorithm: 'HS384', subject: String(alice),
          issuer: 'idealoop', audience: 'idealoop-api', expiresIn: '1h' }),
      ]) assert.equal((await request('GET', '/api/users/me', undefined, token)).status, 401);
    });

    await t.test('owner updates profile and credentials; password change revokes old tokens', async () => {
      const before = await db.selectFrom('users').select('updated_at').where('id', '=', alice).executeTakeFirstOrThrow();
      const updated = await request('PATCH', `/api/users/${alice}`, {
        bio: null, username: 'AliceUpdated', avatar_url: 'https://example.com/avatar.png',
      }, aliceToken);
      assert.equal(updated.status, 200);
      assert.equal(updated.body.user.username, 'AliceUpdated');
      assert.equal(updated.body.user.bio, null);
      assert.ok(new Date(updated.body.user.updated_at).getTime() >= new Date(before.updated_at!).getTime());
      assert.equal((await request('PATCH', `/api/users/${alice}`, { username: 'bOB' }, aliceToken)).status, 409);
      assert.equal((await request('PATCH', `/api/users/${alice}`, { email: 'new@example.com' }, aliceToken)).status, 400);
      assert.equal((await request('PATCH', `/api/users/${alice}`, {
        email: 'new@example.com', current_password: 'incorrect password',
      }, aliceToken)).status, 401);
      const emailUpdated = await request('PATCH', `/api/users/${alice}`, {
        email: 'NEW@example.com', current_password: password,
      }, aliceToken);
      assert.equal(emailUpdated.status, 200);
      assert.equal(emailUpdated.body.user.email, 'new@example.com');
      const login = await request('POST', '/api/auth/login', { email: 'NEW@example.com', password });
      assert.equal(login.status, 200);
      const passwordUpdated = await request('PATCH', `/api/users/${alice}`, {
        password: 'a different secure password', current_password: password,
      }, aliceToken);
      assert.equal(passwordUpdated.status, 200);
      assert.ok(passwordUpdated.body.token);
      assert.equal((await request('GET', '/api/users/me', undefined, aliceToken)).status, 401);
      assert.equal((await request('GET', '/api/users/me', undefined, login.body.token)).status, 401);
      aliceToken = passwordUpdated.body.token;
      assert.equal((await request('GET', '/api/users/me', undefined, aliceToken)).status, 200);
      assert.equal((await request('POST', '/api/auth/login', { email: 'new@example.com', password })).status, 401);
      assert.equal((await request('POST', '/api/auth/login', { email: 'unknown@example.com', password })).status, 401);
      assert.equal((await request('POST', '/api/auth/login', {
        email: 'new@example.com', password: 'a different secure password',
      })).status, 200);
    });

    await t.test('delete cascades dependent data and rejects the deleted user token', async () => {
      const project = await db.insertInto('projects').values({ user_id: bob, title: 'Test', description: 'Test' })
        .returning('id').executeTakeFirstOrThrow();
      await db.insertInto('project_comments').values({ project_id: project.id, user_id: bob, content: 'Test' }).execute();
      await db.insertInto('learning_requests').values({ learner_id: alice, creator_id: bob,
        skill_id: (await db.insertInto('skills').values({ name: 'Drawing', category: 'Art' }).returning('id').executeTakeFirstOrThrow()).id,
      }).execute();
      assert.equal((await request('DELETE', `/api/users/${bob}`, undefined, bobToken)).status, 204);
      assert.equal((await request('GET', `/api/users/${bob}`)).status, 404);
      assert.equal((await request('GET', '/api/users/me', undefined, bobToken)).status, 401);
      assert.deepEqual(await db.selectFrom('projects').selectAll().where('id', '=', project.id).execute(), []);
      assert.deepEqual(await db.selectFrom('project_comments').selectAll().execute(), []);
      assert.deepEqual(await db.selectFrom('learning_requests').selectAll().execute(), []);
    });

    await t.test('account endpoints enforce rate limits', async () => {
      let status = 0;
      for (let i = 0; i < 21 && status !== 429; i++) {
        status = (await request('POST', '/api/auth/login', {})).status;
      }
      assert.equal(status, 429);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.destroy();
  }
});
