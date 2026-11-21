import type { FastifyPluginAsync } from 'fastify';
import { chatRequestSchema } from '@hero/contracts';
import {
  type ChatEvent,
  type ErrorChatEvent,
  formatSseEvent,
  translateChunks,
} from './chat-event.js';

/**
 * Interface mínima do grafo para permitir testes com fakes sem depender do LangGraph concreto.
 */
export interface GraphLike {
  stream(
    input: { question: string; [key: string]: any },
    options?: any,
  ): AsyncIterable<Record<string, any>> | Promise<AsyncIterable<Record<string, any>>>;
}

export interface ChatRouteOptions {
  graph?: GraphLike;
}

const chatRoute: FastifyPluginAsync<ChatRouteOptions> = async (app, { graph }) => {
  app.post('/chat', async (request, reply) => {
    // 1. Valida o payload da requisição com o schema de @hero/contracts
    const parseResult = chatRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: parseResult.error.issues?.[0]?.message ?? 'Dados inválidos na requisição',
      });
    }

    if (!graph) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Grafo do agente não está configurado na aplicação.',
      });
    }

    const { question } = parseResult.data;

    // 2. Configura os headers manualmente exigidos pelo Cloud Run para evitar bufferização de SSE
    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.writeHead(200);

    // 3. Itera a execução do grafo transmitindo cada nó como Server-Sent Events
    try {
      const stream = await graph.stream({ question }, { streamMode: 'updates' });
      for await (const chunk of stream) {
        const events = translateChunks(chunk);
        for (const event of events) {
          reply.raw.write(formatSseEvent(event));
        }
      }
    } catch (error: any) {
      // 4. Se o grafo lançar erro durante o stream, escreve um evento SSE de erro e encerra sem derrubar o processo
      const errorEvent: ErrorChatEvent = {
        node: 'error',
        error: error?.message || 'Erro inesperado durante a execução do grafo',
      };
      reply.raw.write(formatSseEvent(errorEvent));
    } finally {
      reply.raw.end();
    }
  });
};

export default chatRoute;
