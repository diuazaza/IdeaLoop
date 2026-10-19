import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../app.js';
import { parseEnvironment } from '../config/env.js';

test('environment validates required values and applies defaults', () => {
  const databaseUrl = 'postgresql://localhost/idealoop_test';
  assert.deepEqual(parseEnvironment({ DATABASE_URL: databaseUrl }), {
    nodeEnv: 'development', port: 5000, databaseUrl,
  });
  assert.throws(() => parseEnvironment({}), /DATABASE_URL/);
  for (const port of ['0', '65536', 'abc', '1.5', '']) {
    assert.throws(() => parseEnvironment({ DATABASE_URL: databaseUrl, PORT: port }), /PORT/);
  }
  assert.throws(() => parseEnvironment({ DATABASE_URL: 'https://localhost/db' }), /DATABASE_URL/);
  assert.throws(() => parseEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: 'invalid' }), /NODE_ENV/);
  assert.throws(() => parseEnvironment({ DATABASE_URL: databaseUrl, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.equal(parseEnvironment({ DATABASE_URL: databaseUrl, JWT_SECRET: 'x'.repeat(32) }).jwtSecret, 'x'.repeat(32));
});

test('HTTP health, readiness, unknown routes, and malformed input', async () => {
  let databaseAvailable = true;
  const app = createApp({
    production: true,
    checkDatabase: async () => {
      if (!databaseAvailable) throw new Error('private database connection details');
    },
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    let response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.deepEqual(await response.json(), { status: 'ok' });
    response = await fetch(`${base}/api/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
    databaseAvailable = false;
    response = await fetch(`${base}/api/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable', database: 'disconnected' });
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    response = await fetch(`${base}/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { message: 'Route not found' } });
    response = await fetch(`${base}/api/health`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { message: 'Invalid JSON body' } });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
