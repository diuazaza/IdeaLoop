import 'dotenv/config';

export interface Environment {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecret?: string;
}

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const rawPort = source.PORT ?? '5000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
      throw new Error();
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  const jwtSecret = source.JWT_SECRET || undefined;
  if (jwtSecret !== undefined && (jwtSecret.length < 32 || jwtSecret === 'your_super_secret_jwt_key_here')) {
    throw new Error('JWT_SECRET must contain at least 32 characters and must not be a placeholder');
  }

  return { ...(jwtSecret ? { jwtSecret } : {}), nodeEnv: nodeEnv as Environment['nodeEnv'], port, databaseUrl };
}
