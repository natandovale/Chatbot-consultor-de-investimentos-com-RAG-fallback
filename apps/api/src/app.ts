import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import Fastify from 'fastify';
import healthRoute from './routes/health.js';
import metricsRoute from './routes/metrics.js';
import chatRoute, { type GetGraph } from './routes/chat.js';
import { checkDatabase as defaultCheckDatabase } from './db.js';
import { errorHandler } from './error-handler.js';

export interface BuildOptions {
  checkDatabase?: () => Promise<boolean>;
  getChatGraph?: GetGraph;
  getMcpGraph?: unknown;
}

const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW = '1 minute';

/**
 * Calcula as opções do `@fastify/rate-limit` em runtime (dentro de `build()`),
 * lendo `RATE_LIMIT_MAX` e `RATE_LIMIT_WINDOW` do ambiente no momento da construção
 * da aplicação para funcionar tanto em produção quanto em testes que alteram env vars.
 */
export function buildRateLimitOptions(
  env: Record<string, string | undefined> = process.env,
): RateLimitPluginOptions {
  const rawMax = env.RATE_LIMIT_MAX?.trim();
  const parsedMax = rawMax ? Number(rawMax) : Number.NaN;
  const max = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : DEFAULT_RATE_LIMIT_MAX;

  const rawWindow = env.RATE_LIMIT_WINDOW?.trim();
  const timeWindow: number | string =
    rawWindow && /^\d+$/.test(rawWindow)
      ? Number(rawWindow)
      : rawWindow && rawWindow.length > 0
        ? rawWindow
        : DEFAULT_RATE_LIMIT_WINDOW;

  return {
    global: true,
    max,
    timeWindow,
  };
}

export function build({ checkDatabase = defaultCheckDatabase, getChatGraph }: BuildOptions = {}) {
  const app = Fastify({ logger: true });

  app.setErrorHandler(errorHandler);

  app.register(rateLimit, buildRateLimitOptions());

  // Disponibiliza /health e /metrics tanto na raiz quanto sob /api, sempre com rateLimit desligado
  app.register(healthRoute, { checkDatabase });
  app.register(metricsRoute);

  app.register(
    async (api) => {
      api.register(healthRoute, { checkDatabase });
      api.register(metricsRoute);
      api.register(chatRoute, { getGraph: getChatGraph });
    },
    { prefix: '/api' },
  );

  return app;
}
