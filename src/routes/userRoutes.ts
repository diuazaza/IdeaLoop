import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { createUserController } from '../controllers/userController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export function createUserRoutes(db: Kysely<Database>, secret: string) {
  const users = Router();
  const auth = Router();
  const controller = createUserController(db, secret);
  const authenticate = requireAuth(db, secret);
  const credentialsLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { message: 'Too many account requests; try again later' } },
  });
  const mutationLimit = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { message: 'Too many account changes; try again later' } },
  });
  users.post('/', credentialsLimit, controller.create);
  auth.post('/register', credentialsLimit, controller.create);
  auth.post('/login', credentialsLimit, controller.login);
  users.get('/', controller.list);
  users.get('/me', authenticate, controller.me);
  users.get('/:id', controller.get);
  users.patch('/:id', mutationLimit, authenticate, controller.update);
  users.delete('/:id', mutationLimit, authenticate, controller.remove);
  return { users, auth };
}
