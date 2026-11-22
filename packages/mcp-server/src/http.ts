import {
  createServer as createNodeHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getAgentGraph, registerLangfuseTelemetry } from '@hero/agent';
import { createMcpServer, type GetGraph } from './server.js';

export interface StartHttpServerOptions {
  port?: number;
  host?: string;
  getGraph?: GetGraph;
}

/**
 * Cria um handler HTTP (Node.js IncomingMessage/ServerResponse) para o transporte
 * Streamable HTTP do MCP, instanciando um servidor/transporte stateless por requisição.
 */
export function createMcpHttpHandler(getGraph: GetGraph = getAgentGraph) {
  return async (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => {
    const server = createMcpServer(getGraph);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  };
}

/**
 * Inicia o servidor MCP utilizando o transporte Streamable HTTP.
 * Registra o `NodeTracerProvider` com `LangfuseSpanProcessor` uma vez no boot.
 */
export async function startHttpServer(options: StartHttpServerOptions = {}) {
  registerLangfuseTelemetry();

  const port = options.port ?? Number(process.env.MCP_PORT ?? process.env.PORT ?? 3001);
  const host = options.host ?? '0.0.0.0';
  const handleMcpRequest = createMcpHttpHandler(options.getGraph ?? getAgentGraph);

  const httpServer = createNodeHttpServer((req, res) => {
    void handleMcpRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });

  return { httpServer, port, host };
}

const isMain =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  startHttpServer().catch((error) => {
    console.error('[mcp-server] Falha ao iniciar servidor HTTP:', error);
    process.exit(1);
  });
}
