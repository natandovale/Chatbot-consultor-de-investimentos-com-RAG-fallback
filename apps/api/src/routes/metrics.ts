import type { FastifyPluginAsync } from 'fastify';
import { metricsRegistry } from '@hero/agent';

const metricsRoute: FastifyPluginAsync = async (app) => {
  app.get('/metrics', { config: { rateLimit: false } }, async (_request, reply) => {
    const body = await metricsRegistry.metrics();
    return reply.type(metricsRegistry.contentType).send(body);
  });
};

export default metricsRoute;
