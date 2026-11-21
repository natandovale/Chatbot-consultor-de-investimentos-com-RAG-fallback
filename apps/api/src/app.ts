import Fastify from 'fastify';
import healthRoute from './routes/health.js';
import chatRoute, { type GetGraph } from './routes/chat.js';
import { checkDatabase as defaultCheckDatabase } from './db.js';
import { errorHandler } from './error-handler.js';

export interface BuildOptions {
  checkDatabase?: () => Promise<boolean>;
  getChatGraph?: GetGraph;
  getMcpGraph?: unknown;
}

export function build({ checkDatabase = defaultCheckDatabase, getChatGraph }: BuildOptions = {}) {
  const app = Fastify({ logger: true });

  app.setErrorHandler(errorHandler);

  app.register(
    async (api) => {
      api.register(healthRoute, { checkDatabase });
      api.register(chatRoute, { getGraph: getChatGraph });
    },
    { prefix: '/api' },
  );

  return app;
}
