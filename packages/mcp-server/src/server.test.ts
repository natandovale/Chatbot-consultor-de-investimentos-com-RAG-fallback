import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallbackHandler, createAgentGraph, type DocumentoSimilar } from '@hero/agent';
import {
  createMcpServer,
  GENERIC_TOOL_ERROR_MESSAGE,
  PERGUNTAR_TOOL_NAME,
  type GetGraph,
} from './server.js';

async function setupClientAndServer(getGraph: GetGraph) {
  const server = createMcpServer(getGraph);
  const client = new Client({
    name: 'test-mcp-client',
    version: '1.0.0',
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    server,
    async close() {
      await Promise.all([client.close(), server.close()]);
    },
  };
}

describe('@hero/mcp-server com InMemoryTransport', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('expõe uma única tool (perguntar) com descrição clara do domínio (20 empresas da B3, CVM) e do guardrail (nunca recomenda) sem construir o grafo na inicialização', async () => {
    const getGraphSpy = vi.fn();
    const { client, close } = await setupClientAndServer(getGraphSpy);

    try {
      const { tools } = await client.listTools();

      // Não deve construir o grafo ao subir o servidor ou listar as tools
      expect(getGraphSpy).not.toHaveBeenCalled();

      // Única tool: perguntar
      expect(tools).toHaveLength(1);
      const tool = tools[0];
      expect(tool.name).toBe(PERGUNTAR_TOOL_NAME);

      // Descrição voltada ao cliente MCP com domínio e guardrail explícitos
      expect(tool.description).toMatch(/20 empresas/i);
      expect(tool.description).toMatch(/B3/i);
      expect(tool.description).toMatch(/CVM/i);
      expect(tool.description).toMatch(/nunca recomenda/i);
    } finally {
      await close();
    }
  });

  it('roda o grafo completo (retrieve -> grade -> webSearch -> answer) via InMemoryTransport e devolve a resposta final citada e com guardrail aplicado', async () => {
    const fakeDoc: DocumentoSimilar = {
      id: 'doc-vale-3t25',
      sourceType: 'corpus',
      title: 'Vale S.A. (VALE3)',
      ticker: 'VALE3',
      companyName: 'Vale S.A.',
      period: '3T25',
      periodEnd: '2025-09-30',
      content: 'A Vale registrou receita líquida de R$ 52 bilhões no 3T25.',
      paragraph: 'A Vale registrou receita líquida de R$ 52 bilhões no 3T25.',
      sourceUrl: 'https://rad.cvm.gov.br/vale-3t25',
      fetchedAt: new Date('2025-11-01T00:00:00Z'),
      distance: 0.08,
    };

    let gradeRound = 0;
    const realGraphWithFakes = createAgentGraph({
      embeddingClient: {
        generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      },
      searchSimilar: vi.fn().mockResolvedValue([fakeDoc]),
      searchProvider: {
        search: vi.fn().mockResolvedValue([
          {
            title: 'Produção de minério da Vale no 3T25',
            url: 'https://noticias.exemplo.com/vale-3t25',
            snippet: 'Volume de minério cresceu no trimestre.',
          },
        ]),
      },
      fetchHtml: vi
        .fn()
        .mockResolvedValue('<p>O volume de produção de minério de ferro subiu 5% no 3T25.</p>'),
      insertWebDocuments: vi.fn().mockResolvedValue(undefined),
      llmClient: vi.fn().mockImplementation(async () => {
        gradeRound++;
        if (gradeRound === 1) {
          return { sufficient: false, missingAspects: ['produção de minério'] };
        }
        return { sufficient: true, missingAspects: [] };
      }),
      answerLlmClient: vi
        .fn()
        .mockResolvedValue(
          'No 3T25, a Vale S.A. apresentou receita líquida de R$ 52 bilhões, impulsionada pelo aumento de 5% na produção de minério.',
        ),
    });

    const getGraph = vi.fn().mockReturnValue(realGraphWithFakes);
    const { client, close } = await setupClientAndServer(getGraph);

    try {
      const result = await client.callTool({
        name: 'perguntar',
        arguments: {
          pergunta: 'Qual foi a receita líquida da Vale no 3T25 e o que aconteceu com a produção?',
        },
      });

      expect(getGraph).toHaveBeenCalledTimes(1);
      expect(result.isError).toBeFalsy();

      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('text');
      expect(content[0].text).toContain('R$ 52 bilhões');
      expect(content[0].text).toContain('Fontes:');
      expect(content[0].text).toContain('VALE3');
      expect(content[0].text).toContain('https://rad.cvm.gov.br/vale-3t25');
    } finally {
      await close();
    }
  });

  it('aplica o guardrail determinístico quando o LLM tenta recomendar compra na resposta do grafo', async () => {
    const fakeDoc: DocumentoSimilar = {
      id: 'doc-petr4',
      sourceType: 'corpus',
      title: 'Petrobras (PETR4)',
      ticker: 'PETR4',
      companyName: 'Petrobras',
      period: '3T25',
      periodEnd: '2025-09-30',
      content: 'Lucro líquido de R$ 32 bilhões no 3T25.',
      paragraph: 'Lucro líquido de R$ 32 bilhões no 3T25.',
      sourceUrl: 'https://rad.cvm.gov.br/petr4-3t25',
      fetchedAt: new Date('2025-11-01T00:00:00Z'),
      distance: 0.05,
    };

    const graphWithRecommendationAttempt = createAgentGraph({
      embeddingClient: {
        generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      },
      searchSimilar: vi.fn().mockResolvedValue([fakeDoc]),
      searchProvider: { search: vi.fn().mockResolvedValue([]) },
      llmClient: vi.fn().mockResolvedValue({ sufficient: true, missingAspects: [] }),
      answerLlmClient: vi
        .fn()
        .mockResolvedValue(
          'Eu recomendo comprar ações da Petrobras agora porque o lucro foi ótimo.',
        ),
    });

    const { client, close } = await setupClientAndServer(() => graphWithRecommendationAttempt);

    try {
      const result = await client.callTool({
        name: 'perguntar',
        arguments: {
          pergunta: 'Vale a pena comprar PETR4?',
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).not.toContain('Eu recomendo comprar');
      expect(content[0].text).toMatch(/não realizo recomendações de investimento/i);
      expect(content[0].text).toContain('https://rad.cvm.gov.br/petr4-3t25');
    } finally {
      await close();
    }
  });

  it('nunca deixa exceção crua vazar se o grafo falhar — devolve isError: true com mensagem genérica', async () => {
    const failingGetGraph: GetGraph = () => ({
      async invoke() {
        throw new Error(
          'FATAL: connection to server at "10.128.0.4", port 5432 failed: password authentication failed for user "postgres_admin"',
        );
      },
    });

    const { client, close } = await setupClientAndServer(failingGetGraph);

    try {
      const result = await client.callTool({
        name: 'perguntar',
        arguments: {
          pergunta: 'Qual o lucro do Itaú?',
        },
      });

      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0].text).toBe(GENERIC_TOOL_ERROR_MESSAGE);
      expect(content[0].text).not.toContain('10.128.0.4');
      expect(content[0].text).not.toContain('postgres_admin');
      expect(content[0].text).not.toContain('FATAL');
    } finally {
      await close();
    }
  });

  it('passa um novo CallbackHandler (@langfuse/langchain) em graph.invoke() a cada chamada quando as chaves do Langfuse estão configuradas', async () => {
    const invokeCalls: Array<{ input: unknown; options: unknown }> = [];
    const fakeGraph: GetGraph = () => ({
      async invoke(input, options) {
        invokeCalls.push({ input, options });
        return { answer: 'Resposta OK' };
      },
    });

    const { client, close } = await setupClientAndServer(fakeGraph);

    try {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;

      await client.callTool({
        name: 'perguntar',
        arguments: { pergunta: 'Sem Langfuse' },
      });
      expect(invokeCalls[0]?.options).toBeUndefined();

      vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-mcp');
      vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-mcp');

      await client.callTool({
        name: 'perguntar',
        arguments: { pergunta: 'Com Langfuse 1' },
      });
      await client.callTool({
        name: 'perguntar',
        arguments: { pergunta: 'Com Langfuse 2' },
      });

      const opts1 = invokeCalls[1]?.options as { callbacks: unknown[] };
      const opts2 = invokeCalls[2]?.options as { callbacks: unknown[] };

      expect(opts1.callbacks).toHaveLength(1);
      expect(opts1.callbacks[0]).toBeInstanceOf(CallbackHandler);
      expect(opts2.callbacks).toHaveLength(1);
      expect(opts2.callbacks[0]).toBeInstanceOf(CallbackHandler);
      expect(opts1.callbacks[0]).not.toBe(opts2.callbacks[0]);
    } finally {
      await close();
    }
  });
});
