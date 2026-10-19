import express from 'express';
import { createErrorHandler, notFound } from './middleware/errorHandler.js';

interface AppOptions {
  checkDatabase: () => Promise<void>;
  production?: boolean;
}

export function createApp({ checkDatabase, production = false }: AppOptions) {
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

  app.use(notFound);
  app.use(createErrorHandler(production));
  return app;
}
