import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAgentGraph } from '@hero/agent';
import { createMcpServer, type GetGraph } from './server.js';

/**
 * Inicia o servidor MCP utilizando o transporte stdio (compatível com `claude mcp add`).
 * O grafo real só é construído na primeira chamada à tool `perguntar`, nunca na inicialização.
 */
export async function startStdioServer(getGraph: GetGraph = getAgentGraph) {
  const server = createMcpServer(getGraph);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  startStdioServer().catch((error) => {
    console.error('[mcp-server] Falha ao iniciar servidor stdio:', error);
    process.exit(1);
  });
}
