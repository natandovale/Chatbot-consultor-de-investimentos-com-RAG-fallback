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

    // LLM fake retorna suficiente logo na 1ª avaliação
    const llmClient = vi.fn().mockResolvedValue({
      sufficient: true,
      missingAspects: [],
    });

    const app = createAgentGraph({
      ...baseDeps,
      llmClient,
    });

    const sequence: string[] = [];
    let finalState: any = null;

    for await (const chunk of await app.stream({
      question: 'Qual foi o lucro da Vale no 3T25?',
    })) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
      finalState = { ...finalState, ...chunk[nodeName] };
    }

    // Sequência de nós visitados: apenas retrieve e grade, terminando direto no END
    expect(sequence).toEqual(['retrieve', 'grade']);
    expect(finalState.sufficient).toBe(true);
    expect(finalState.iterations).toBe(1);
    expect(llmClient).toHaveBeenCalledTimes(1);
  });

  it('deve realizar o loop completo (retrieve -> grade -> webSearch -> retrieve -> grade -> END) quando insuficiente na 1ª e suficiente na 2ª', async () => {
    const baseDeps = createBaseDeps();

    let chamada = 0;
    const llmClient = vi.fn().mockImplementation(async () => {
      chamada++;
      if (chamada === 1) {
        // 1ª rodada: insuficiente
        return { sufficient: false, missingAspects: ['motivo da queda'] };
      }
      // 2ª rodada: após busca web, torna-se suficiente
      return { sufficient: true, missingAspects: [] };
    });

    const app = createAgentGraph({
      ...baseDeps,
      llmClient,
    });

    const sequence: string[] = [];
    let finalState: any = null;

    for await (const chunk of await app.stream({
      question: 'Por que o lucro caiu?',
    })) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
      finalState = { ...finalState, ...chunk[nodeName] };
    }

    // Sequência completa com enriquecimento web e reavaliação
    expect(sequence).toEqual(['retrieve', 'grade', 'webSearch', 'retrieve', 'grade']);
    expect(finalState.sufficient).toBe(true);
    expect(finalState.iterations).toBe(2);
    expect(chamada).toBe(2);
  });

  it('deve cortar exatamente em MAX_ITERATIONS (2) rodadas de grade mesmo que o LLM sempre retorne insuficiente', async () => {
    const baseDeps = createBaseDeps();

    // LLM fake SEMPRE retorna insuficiente
    const llmClient = vi.fn().mockResolvedValue({
      sufficient: false,
      missingAspects: ['informação não encontrada em lugar nenhum'],
    });

    const app = createAgentGraph({
      ...baseDeps,
      llmClient,
    });

    const sequence: string[] = [];
    let finalState: any = null;

    for await (const chunk of await app.stream({
      question: 'Pergunta impossível que nunca é satisfeita',
    })) {
      const nodeName = Object.keys(chunk)[0];
      sequence.push(nodeName);
      finalState = { ...finalState, ...chunk[nodeName] };
    }

    // Mesmo com resposta sempre insuficiente, o guard corta exatamente em 2 rodadas de grade
    expect(sequence).toEqual(['retrieve', 'grade', 'webSearch', 'retrieve', 'grade']);
    expect(finalState.sufficient).toBe(false);
    expect(finalState.iterations).toBe(MAX_ITERATIONS);
    expect(llmClient).toHaveBeenCalledTimes(MAX_ITERATIONS);
  });
});
