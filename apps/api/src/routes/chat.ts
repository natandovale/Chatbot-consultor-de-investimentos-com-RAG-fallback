import type { FastifyPluginAsync } from 'fastify';
import { chatRequestSchema } from '@hero/contracts';
import {
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

export type GetGraph = () => GraphLike | Promise<GraphLike>;

export interface ChatRouteOptions {
  getGraph?: GetGraph;
}

const chatRoute: FastifyPluginAsync<ChatRouteOptions> = async (app, { getGraph }) => {
  app.post('/chat', async (request, reply) => {
    // 1. Valida o payload da requisição com o schema de @hero/contracts.
    // Erros de validação (ZodError) não são capturados aqui e sobem para o errorHandler central.
    const { question } = chatRequestSchema.parse(request.body ?? {});

    if (!getGraph) {
      throw new Error('Grafo do agente não está configurado na aplicação.');
    }

    const graph = await getGraph();

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
      // 4. Se o grafo lançar erro no meio do stream (após headers 200 SSE enviados),
      // escreve um evento SSE de erro e encerra a conexão sem derrubar o processo
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
