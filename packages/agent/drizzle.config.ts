import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 5433,
        user: process.env.DB_USER || 'app_user',
        password: 'iqu9+0FjNCVvJFCdknw7m3kc',
        database: process.env.DB_NAME || 'ai_researcher',
        ssl: false,
      },
});
