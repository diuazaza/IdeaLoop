import express from 'express';
import type { Kysely } from 'kysely';
import type { Database } from './db/types.js';
import { createUserRoutes } from './routes/userRoutes.js';
import { createErrorHandler, notFound } from './middleware/errorHandler.js';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  production?: boolean;
  users?: { db: Kysely<Database>; jwtSecret: string };
}

export function createApp({ checkDatabase, production = false, users }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Liveness is independent of database availability.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/health/ready', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  if (users) {
    const routes = createUserRoutes(users.db, users.jwtSecret);
    app.use('/api/users', routes.users);
    app.use('/api/auth', routes.auth);
  }

  app.use(notFound);
  app.use(createErrorHandler(production));
  return app;
}
