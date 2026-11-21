import Fastify from 'fastify';
import healthRoute from './routes/health.js';
import chatRoute, { type GraphLike } from './routes/chat.js';
import { checkDatabase as defaultCheckDatabase } from './db.js';

export interface BuildOptions {
  checkDatabase?: () => Promise<boolean>;
  graph?: GraphLike;
}

export function build({ checkDatabase = defaultCheckDatabase, graph }: BuildOptions = {}) {
  const app = Fastify({ logger: true });

  app.register(
    async (api) => {
      api.register(healthRoute, { checkDatabase });
      api.register(chatRoute, { graph });
    },
    { prefix: '/api' },
  );

  return app;
}
