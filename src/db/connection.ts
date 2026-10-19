import 'dotenv/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { parseEnvironment } from '../config/env.js';
import type { Database } from './types.js';

const { databaseUrl } = parseEnvironment(process.env);

const pool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});

pool.on('error', (error) => {
  console.error('Idle database connection failed:', error);
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}