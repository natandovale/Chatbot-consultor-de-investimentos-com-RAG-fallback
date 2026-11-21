import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function createDb(connectionString = process.env.DATABASE_URL) {
  const pool = new Pool(
    connectionString
      ? { connectionString, connectionTimeoutMillis: 10000 }
      : {
          host: process.env.DB_HOST || '127.0.0.1',
          port: Number(process.env.DB_PORT) || 5433,
          user: process.env.DB_USER || 'app_user',
          password: process.env.DB_PASSWORD || 'SenhaForteGCP2026!#',
          database: process.env.DB_NAME || 'ai_researcher',
          connectionTimeoutMillis: 10000,
        },
  );

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

export * from './schema.js';
