import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function createDb(connectionString = process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString:
      connectionString || 'postgresql://postgres:postgres@localhost:5432/ai_researcher',
    connectionTimeoutMillis: 5000,
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

export * from './schema.js';
