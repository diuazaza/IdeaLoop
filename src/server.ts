import { sql } from 'kysely';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { db, closeDatabase } from './db/connection.js';

const env = parseEnvironment(process.env);
const app = createApp({
  production: env.nodeEnv === 'production',
  checkDatabase: async () => { await sql`select 1`.execute(db); },
});

const server = app.listen(env.port, () => {
  console.log(`IdeaLoop API listening on port ${env.port}`);
});

let stopping = false;
function shutdown(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => {
    console.error('Shutdown timed out');
    process.exit(1);
  }, 10_000);
  timeout.unref();
  server.close(async () => {
    try {
      await closeDatabase();
      process.exitCode = exitCode;
    } catch (error) {
      console.error('Database shutdown failed:', error);
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  });
}
server.on('error', (error) => {
  console.error('Server failed:', error);
  shutdown(1);
});
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
