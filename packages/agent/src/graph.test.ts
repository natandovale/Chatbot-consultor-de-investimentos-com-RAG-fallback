import { describe, expect, it, vi } from 'vitest';
import { createAgentGraph, MAX_ITERATIONS } from './graph.js';
import type { DocumentoSimilar } from './db/retrieve-similar.js';
import type { EmbeddingClient } from './seed/embeddings.js';
import type { SearchProvider } from './search/types.js';

describe('createAgentGraph', () => {
  const fakeDoc: DocumentoSimilar = {
    id: 'doc-1',
    sourceType: 'corpus',
    title: 'Vale S.A.',
    content: 'Lucro líquido no 3T25',
    paragraph: 'Lucro líquido no 3T25',
    sourceUrl: 'https://cvm.gov.br',
    fetchedAt: new Date(),
    distance: 0.1,
  };

  const createBaseDeps = () => {
    const fakeEmbeddingClient: EmbeddingClient = {
      generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    };

    const fakeSearchSimilar = vi.fn().mockResolvedValue([fakeDoc]);

    const fakeSearchProvider: SearchProvider = {
      search: vi.fn().mockResolvedValue([
        { title: 'Notícia Web', url: 'https://noticia.com', snippet: 'resumo' },
      ]),
    };

    const fakeInsertWebDocs = vi.fn().mockResolvedValue(undefined);
    const fakeFetchHtml = vi.fn().mockResolvedValue('<p>Texto enriquecido da web</p>');

    return {
      embeddingClient: fakeEmbeddingClient,
      searchSimilar: fakeSearchSimilar,
      searchProvider: fakeSearchProvider,
      insertWebDocuments: fakeInsertWebDocs,
      fetchHtml: fakeFetchHtml,
    };
  };

  it('deve seguir o caminho direto (START -> retrieve -> grade -> END) quando suficiente na 1ª rodada', async () => {
    const baseDeps = createBaseDeps();

    const llmClient = vi.fn().mockResolvedValue({
      sufficient: true,
      missingAspects: [],
    });

    const app = createAgentGraph({
      ...baseDeps,
      llmClient,
    });

    const sequence: string[] = [];
    for await (const chunk of await app.stream(
      { question: 'Qual foi o lucro da Vale no 3T25?' },
      { streamMode: 'updates' },
    )) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
    }

    expect(sequence).toEqual(['retrieve', 'grade', 'answer']);

    // Valida estado final via invoke
    const finalState = await app.invoke({ question: 'Qual foi o lucro da Vale no 3T25?' });
    expect(finalState.sufficient).toBe(true);
    expect(finalState.iterations).toBe(1);
    expect(finalState.answer).toBeDefined();
    expect(finalState.answer.length).toBeGreaterThan(0);
  });

  it('deve realizar o loop completo (retrieve -> grade -> webSearch -> retrieve -> grade -> answer -> END) quando insuficiente na 1ª e suficiente na 2ª', async () => {
    const baseDeps = createBaseDeps();

    let chamada = 0;
    const llmClient = vi.fn().mockImplementation(async () => {
      chamada++;
      if (chamada === 1) {
        return { sufficient: false, missingAspects: ['motivo da queda'] };
      }
      return { sufficient: true, missingAspects: [] };
    });

    const app = createAgentGraph({
      ...baseDeps,
      llmClient,
    });

    const sequence: string[] = [];
    for await (const chunk of await app.stream(
      { question: 'Por que o lucro caiu?' },
      { streamMode: 'updates' },
    )) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
    }

    expect(sequence).toEqual(['retrieve', 'grade', 'webSearch', 'retrieve', 'grade', 'answer']);
    expect(chamada).toBe(2);
  });

  it('deve cortar exatamente em MAX_ITERATIONS (2) rodadas de grade e ir para answer mesmo que o LLM sempre retorne insuficiente', async () => {
    const baseDeps = createBaseDeps();

    let chamada = 0;
    const llmClient = vi.fn().mockImplementation(async () => {
      chamada++;
      return {
        sufficient: false,
        missingAspects: ['informação não encontrada'],
      };
    });

    const app = createAgentGraph({
      ...baseDeps,
      llmClient,
    });

    const sequence: string[] = [];
    for await (const chunk of await app.stream(
      { question: 'Pergunta impossível que nunca é satisfeita' },
      { streamMode: 'updates' },
    )) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
    }

    expect(sequence).toEqual(['retrieve', 'grade', 'webSearch', 'retrieve', 'grade', 'answer']);
    expect(chamada).toBe(MAX_ITERATIONS);
  });

  it('deve completar o fluxo e responder quando o searchProvider sempre falhar (Serper fora do ar ou circuit breaker aberto)', async () => {
    const baseDeps = createBaseDeps();

    // 1. SearchProvider sempre falha com erro simulando Serper fora do ar ou circuit breaker aberto
    const failingSearchProvider: SearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('CircuitBreakerOpenError: Serper fora do ar')),
    };

    // 2. Grade sempre aponta insuficiência de dados
    const llmClient = vi.fn().mockResolvedValue({
      sufficient: false,
      missingAspects: ['motivo da queda no preço do minério'],
    });

    // 3. AnswerLlmClient que gera uma resposta real alertando sobre dados incompletos
    const answerLlmClient = vi.fn().mockResolvedValue(
      'Aviso: O contexto pode estar incompleto pois a busca na web não pôde ser realizada. ' +
        'Entretanto, segundo as demonstrações financeiras da Vale arquivadas na CVM, a companhia registrou lucro no 3T25.',
    );

    const app = createAgentGraph({
      ...baseDeps,
      searchProvider: failingSearchProvider,
      llmClient,
      answerLlmClient,
    });

    // 4. Executa stream e valida a sequência: não pode quebrar no nó webSearch
    const sequence: string[] = [];
    for await (const chunk of await app.stream(
      { question: 'Por que o lucro da Vale caiu no 3T25?' },
      { streamMode: 'updates' },
    )) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
    }

    // Passou por webSearch, voltou para retrieve e terminou em answer após MAX_ITERATIONS
    expect(sequence).toEqual(['retrieve', 'grade', 'webSearch', 'retrieve', 'grade', 'answer']);

    // 5. Valida estado final via invoke
    const finalState = await app.invoke({
      question: 'Por que o lucro da Vale caiu no 3T25?',
    });

    expect(failingSearchProvider.search).toHaveBeenCalled();
    expect(finalState.sufficient).toBe(false);
    expect(finalState.iterations).toBe(MAX_ITERATIONS);
    expect(finalState.answer).toContain('Aviso: O contexto pode estar incompleto');
    expect(finalState.answer).toContain('Fontes:');
    expect(finalState.answer).toContain('https://cvm.gov.br');
  });
});
