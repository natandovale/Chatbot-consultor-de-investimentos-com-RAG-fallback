import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAgentGraph, withLangfuseCallbacks } from '@hero/agent';

export const PERGUNTAR_TOOL_NAME = 'perguntar';

/**
 * Descrição voltada ao cliente MCP (LLM) para decisão de roteamento de tool calls.
 * Explicita o domínio (20 empresas da B3, dados financeiros trimestrais da CVM)
 * e repete o guardrail (nunca recomenda decisão de investimento).
 */
export const PERGUNTAR_TOOL_DESCRIPTION =
  'Consulta fundamentos financeiros e informações sobre as 20 empresas da B3 cobertas pelo corpus oficial de demonstrações financeiras da CVM (ITR e DFP: receita líquida, lucro bruto, lucro líquido, ativo total, patrimônio líquido e caixa operacional), com fallback automático de busca na web para eventos recentes. ' +
  'Guardrail obrigatório: esta ferramenta é estritamente analítica e informativa — NUNCA recomenda compra, venda ou manutenção de ações e nunca emite recomendação ou aconselhamento de decisão de investimento, retornando apenas fatos citados com suas fontes.';

export const GENERIC_TOOL_ERROR_MESSAGE =
  'Não foi possível processar a pergunta no momento. Tente novamente mais tarde.';

export interface GraphLike {
  invoke?(
    input: { question: string; [key: string]: unknown },
    options?: unknown,
  ): Promise<{
    answer?: string;
    [key: string]: unknown;
  }>;
  stream?(
    input: { question: string; [key: string]: unknown },
    options?: unknown,
  ): AsyncIterable<Record<string, unknown>> | Promise<AsyncIterable<Record<string, unknown>>>;
}

export type GetGraph = () => GraphLike | Promise<GraphLike>;

export interface CreateMcpServerOptions {
  getGraph?: GetGraph;
}

async function executarGrafo(graph: GraphLike, question: string): Promise<string> {
  if (typeof graph.invoke === 'function') {
    const invokeOptions = withLangfuseCallbacks(undefined);
    const result = invokeOptions
      ? await graph.invoke({ question }, invokeOptions)
      : await graph.invoke({ question });
    if (typeof result === 'string') {
      return result;
    }
    return result?.answer ?? '';
  }

  if (typeof graph.stream === 'function') {
    let finalAnswer = '';
    const stream = await graph.stream(
      { question },
      withLangfuseCallbacks({ streamMode: 'updates' }),
    );
    for await (const chunk of stream) {
      if (chunk && typeof chunk === 'object' && 'answer' in chunk) {
        const answerData = chunk.answer as string | { answer?: string } | undefined;
        finalAnswer = typeof answerData === 'string' ? answerData : (answerData?.answer ?? '');
      }
    }
    return finalAnswer;
  }

  throw new Error('Grafo inválido: não implementa invoke() nem stream().');
}

/**
 * Cria o servidor MCP com uma única tool (`perguntar`).
 * Recebe `getGraph` por injeção de dependência (default: `getAgentGraph` de `@hero/agent`),
 * construindo o grafo real apenas na primeira chamada da tool e nunca na inicialização.
 */
export function createMcpServer(
  getGraphOrOptions: GetGraph | CreateMcpServerOptions = getAgentGraph,
): McpServer {
  const getGraph: GetGraph =
    typeof getGraphOrOptions === 'function'
      ? getGraphOrOptions
      : (getGraphOrOptions?.getGraph ?? getAgentGraph);

  const server = new McpServer({
    name: 'ai-researcher-mcp-server',
    version: '1.0.0',
  });

  // Permite tanto `{ pergunta: "..." }` quanto `{ question: "..." }` na validação de argumentos
  const internalServer = server as unknown as {
    validateToolInput?: (
      tool: unknown,
      args: Record<string, unknown> | undefined,
      toolName: string,
    ) => Promise<unknown>;
  };
  const origValidate = internalServer.validateToolInput?.bind(server);
  if (origValidate) {
    internalServer.validateToolInput = async (
      tool: unknown,
      args: Record<string, unknown> | undefined,
      toolName: string,
    ) => {
      if (
        toolName === PERGUNTAR_TOOL_NAME &&
        args &&
        typeof args === 'object' &&
        !('pergunta' in args) &&
        typeof args.question === 'string'
      ) {
        args = { ...args, pergunta: args.question };
      }
      return origValidate(tool, args, toolName);
    };
  }

  server.registerTool(
    PERGUNTAR_TOOL_NAME,
    {
      description: PERGUNTAR_TOOL_DESCRIPTION,
      inputSchema: {
        pergunta: z
          .string()
          .trim()
          .min(1, 'A pergunta é obrigatória')
          .describe(
            'Pergunta em texto sobre fundamentos financeiros das 20 empresas da B3 e dados da CVM.',
          ),
      },
    },
    async ({ pergunta }) => {
      try {
        const graph = await getGraph();
        const respostaFinal = await executarGrafo(graph, pergunta);

        return {
          content: [
            {
              type: 'text' as const,
              text: respostaFinal,
            },
          ],
        };
      } catch {
        // Degradação graciosa: nunca deixa a exceção crua vazar para o cliente MCP
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: GENERIC_TOOL_ERROR_MESSAGE,
            },
          ],
        };
      }
    },
  );

  return server;
}

export const criarMcpServer = createMcpServer;
export const createServer = createMcpServer;
export const criarServidorMcp = createMcpServer;
