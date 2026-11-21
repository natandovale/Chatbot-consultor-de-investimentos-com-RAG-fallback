import { describe, expect, it, vi } from 'vitest';
import { createRetrieveNode } from './retrieve.js';
import type { EmbeddingClient } from '../seed/embeddings.js';
import type { Documento } from '../db/retrieve-similar.js';

describe('createRetrieveNode', () => {
  it('deve gerar embedding da pergunta e retornar os documentos mais próximos usando o top-k default (5)', async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];
    const fakeDocs: Partial<Documento>[] = [
      { id: '1', ticker: 'VALE', paragraph: 'Parágrafo da Vale' } as Documento,
      { id: '2', ticker: 'PETR', paragraph: 'Parágrafo da Petrobras' } as Documento,
    ];

    const generateEmbeddingsMock = vi.fn().mockResolvedValue([fakeEmbedding]);
    const searchSimilarMock = vi.fn().mockResolvedValue(fakeDocs);

    const fakeEmbeddingClient: EmbeddingClient = {
      generateEmbeddings: generateEmbeddingsMock,
    };

    const retrieve = createRetrieveNode({
      embeddingClient: fakeEmbeddingClient,
      searchSimilar: searchSimilarMock,
    });

    const resultado = await retrieve({
      question: 'Qual foi o lucro líquido da Vale no 3T25?',
    });

    // Valida que o cliente de embeddings foi chamado com a pergunta
    expect(generateEmbeddingsMock).toHaveBeenCalledWith(['Qual foi o lucro líquido da Vale no 3T25?']);

    // Valida que a busca foi chamada com o vetor e o top-k default de 5
    expect(searchSimilarMock).toHaveBeenCalledWith(fakeEmbedding, 5);

    // Valida que o estado retornado contém os documentos
    expect(resultado).toEqual({
      documents: fakeDocs,
    });
  });

  it('deve respeitar um limit customizado se configurado na factory', async () => {
    const fakeEmbedding = [0.5, -0.2];
    const generateEmbeddingsMock = vi.fn().mockResolvedValue([fakeEmbedding]);
    const searchSimilarMock = vi.fn().mockResolvedValue([]);

    const retrieve = createRetrieveNode({
      embeddingClient: { generateEmbeddings: generateEmbeddingsMock },
      searchSimilar: searchSimilarMock,
      defaultLimit: 3,
    });

    await retrieve({ question: 'Margem líquida da Ambev' });

    expect(searchSimilarMock).toHaveBeenCalledWith(fakeEmbedding, 3);
  });

  it('deve lançar erro se a pergunta não estiver presente no estado', async () => {
    const retrieve = createRetrieveNode({
      embeddingClient: { generateEmbeddings: vi.fn() },
      searchSimilar: vi.fn(),
    });

    await expect(retrieve({ question: '' })).rejects.toThrow(
      'Pergunta não encontrada ou inválida no estado do agente.',
    );
  });
});
