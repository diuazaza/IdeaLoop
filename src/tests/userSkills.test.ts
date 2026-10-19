
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  Kysely,
  PostgresDialect,
  sql,
  type PostgresPoolClient,
} from 'kysely';
import type { Database } from '../db/types.js';
import { createApp } from '../app.js';
import { up as usersMigration } from '../db/migrations/001_users_skills.js';
import { up as projectsMigration } from '../db/migrations/002_projects_media.js';
import { up as engagementMigration } from '../db/migrations/003_engagement.js';
import { up as requestsMigration } from '../db/migrations/004_requests.js';
import { up as identityMigration } from '../db/migrations/005_user_identity.js';

const secret = 'test-only-secret-with-at-least-32-characters';
const password = 'correct horse battery staple';

test('User Skills API integration tests', async (t) => {
  const postgres = new PGlite();

  // Use the same embedded PostgreSQL adapter as users.test.ts.
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: {
        options: {},
        connect: async () => ({
          query: async (query: string, parameters: readonly unknown[]) => {
            const result = await postgres.query(query, [...parameters]);
            return {
              rows: result.rows,
              rowCount: result.affectedRows ?? result.rows.length,
              command:
                /^(insert|update|delete|merge)/i.exec(query)?.[1]?.toUpperCase()
                ?? 'SELECT',
            };
          },
          release() {},
        }) as PostgresPoolClient,
        end: () => postgres.close(),
      },
    }),
  });

  const app = createApp({
    checkDatabase: async () => {
      await sql`select 1`.execute(db);
    },
    production: true,
    users: { db, jwtSecret: secret },
  });

  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');

    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const base = `http://127.0.0.1:${address.port}`;

    // Apply the actual project migrations.
    for (const migrate of [
      usersMigration,
      projectsMigration,
      engagementMigration,
      requestsMigration,
      identityMigration,
    ]) {
      await migrate(db);
    }

    async function request(
      method: string,
      path: string,
      body?: unknown,
      token?: string,
    ) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(token
            ? { Authorization: `Bearer ${token}` }
            : {}),
        },
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
      });

      return {
        status: response.status,
        body: await response.json() as any,
      };
    }

    // Create two users for authentication and ownership tests.
    const aliceResponse = await request('POST', '/api/auth/register', {
      username: 'SkillsAlice',
      email: 'skillsalice@example.com',
      password,
    });
    assert.equal(aliceResponse.status, 201);

    const aliceId: number = aliceResponse.body.user.id;
    const aliceToken: string = aliceResponse.body.token;

    const bobResponse = await request('POST', '/api/auth/register', {
      username: 'SkillsBob',
      email: 'skillsbob@example.com',
      password,
    });
    assert.equal(bobResponse.status, 201);

    const bobId: number = bobResponse.body.user.id;
    const bobToken: string = bobResponse.body.token;

    // Seed the skills catalog.
    const drawing = await db.insertInto('skills')
      .values({ name: 'Drawing', category: 'Art' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const coding = await db.insertInto('skills')
      .values({ name: 'Coding', category: 'Technology' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const music = await db.insertInto('skills')
      .values({ name: 'Music', category: 'Music' })
      .returning('id')
      .executeTakeFirstOrThrow();

    const path = `/api/users/${aliceId}/skills`;

    await t.test('GET returns an empty skills list', async () => {
      const response = await request('GET', path);

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { skills: [] });
    });

    await t.test('GET rejects nonexistent users', async () => {
      const response = await request(
        'GET',
        '/api/users/2147483647/skills',
      );

      assert.equal(response.status, 404);
    });

    await t.test('GET rejects invalid user IDs', async () => {
      for (const id of ['abc', '0', '-1']) {
        const response = await request(
          'GET',
          `/api/users/${id}/skills`,
        );

        assert.equal(response.status, 400);
      }
    });

    await t.test('PUT requires authentication', async () => {
      const response = await request('PUT', path, {
        skills: [{ skill_id: drawing.id }],
      });

      assert.equal(response.status, 401);
    });

    await t.test('PUT rejects invalid tokens', async () => {
      const response = await request(
        'PUT',
        path,
        { skills: [{ skill_id: drawing.id }] },
        'invalid-token',
      );

      assert.equal(response.status, 401);
    });

    await t.test('PUT enforces user ownership', async () => {
      const response = await request(
        'PUT',
        path,
        { skills: [{ skill_id: drawing.id }] },
        bobToken,
      );

      assert.equal(response.status, 403);
    });

    await t.test('PUT saves valid skills', async () => {
      const response = await request(
        'PUT',
        path,
        {
          skills: [
            {
              skill_id: drawing.id,
              proficiency_level: 'Advanced',
              is_open_to_teach: true,
            },
            {
              skill_id: coding.id,
              proficiency_level: 'Beginner',
              is_open_to_teach: false,
            },
          ],
        },
        aliceToken,
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.skills.length, 2);

      const saved = await request('GET', path);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.skills.length, 2);

      const drawingSkill = saved.body.skills.find(
        (skill: any) => skill.id === drawing.id,
      );

      assert.equal(drawingSkill.name, 'Drawing');
      assert.equal(drawingSkill.category, 'Art');
      assert.equal(drawingSkill.proficiency_level, 'Advanced');
      assert.equal(drawingSkill.is_open_to_teach, true);
    });

    await t.test('PUT rejects duplicate skill IDs', async () => {
      const response = await request(
        'PUT',
        path,
        {
          skills: [
            { skill_id: drawing.id },
            { skill_id: drawing.id },
          ],
        },
        aliceToken,
      );

      assert.equal(response.status, 400);
    });

    await t.test('PUT validates malformed inputs', async () => {
      const invalidBodies = [
        {},
        { skills: null },
        { skills: 'Drawing' },
        { skills: [null] },
        { skills: [5] },
        { skills: [{ skill_id: -1 }] },
        { skills: [{ skill_id: 'abc' }] },
        { skills: [{ skill_id: 1.5 }] },
        {
          skills: [{
            skill_id: drawing.id,
            proficiency_level: 'Master',
          }],
        },
        {
          skills: [{
            skill_id: drawing.id,
            is_open_to_teach: 'yes',
          }],
        },
        {
          skills: Array.from(
            { length: 51 },
            () => ({ skill_id: drawing.id }),
          ),
        },
      ];

      for (const body of invalidBodies) {
        const response = await request(
          'PUT',
          path,
          body,
          aliceToken,
        );

        assert.equal(response.status, 400);
      }
    });

    await t.test('PUT replaces existing skills', async () => {
      const response = await request(
        'PUT',
        path,
        {
          skills: [{
            skill_id: music.id,
            proficiency_level: 'Expert',
            is_open_to_teach: true,
          }],
        },
        aliceToken,
      );

      assert.equal(response.status, 200);

      const saved = await request('GET', path);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.skills.length, 1);
      assert.equal(saved.body.skills[0].id, music.id);

      const rows = await db.selectFrom('user_skills')
        .selectAll()
        .where('user_id', '=', aliceId)
        .execute();

      assert.equal(rows.length, 1);
      assert.equal(rows[0].skill_id, music.id);
    });

    await t.test('PUT rejects nonexistent skill IDs', async () => {
      const response = await request(
        'PUT',
        path,
        {
          skills: [{ skill_id: 2147483647 }],
        },
        aliceToken,
      );

      assert.equal(response.status, 400);

      // A failed replacement must preserve existing skills.
      const saved = await request('GET', path);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.skills.length, 1);
      assert.equal(saved.body.skills[0].id, music.id);
    });

    await t.test('PUT accepts an empty skills list', async () => {
      const response = await request(
        'PUT',
        path,
        { skills: [] },
        aliceToken,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { skills: [] });

      const saved = await request('GET', path);
      assert.deepEqual(saved.body, { skills: [] });
    });

    await t.test('User skills remain isolated', async () => {
      const response = await request(
        'GET',
        `/api/users/${bobId}/skills`,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { skills: [] });
    });

  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error ? reject(error) : resolve(),
      ),
    );

    await db.destroy();
  }
});
