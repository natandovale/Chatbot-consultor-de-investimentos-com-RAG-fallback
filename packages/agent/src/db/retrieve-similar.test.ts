import { describe, expect, it, vi } from 'vitest';
import { buscarDocumentosSimilares, type DbClient } from './retrieve-similar.js';

describe('buscarDocumentosSimilares', () => {
  it('deve consultar documentos do corpus e documentos_web (filtrando expirados) e combinar ordenado por distância', async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];

    // Simula retorno do corpus CVM
    const mockCorpusDocs = [
      {
        id: 'corpus-1',
        ticker: 'VALE',
        companyName: 'Vale S.A.',
        setor: 'Mineração',
        period: '3T25',
        periodEnd: '2025-09-30',
        paragraph: 'Lucro da Vale 3T25',
        sourceUrl: 'https://cvm.gov.br/doc1',
        fetchedAt: new Date(),
        distance: 0.15, // Mais próximo que o web-1, mas mais distante que o web-2
      },
    ];

    // Simula retorno dos documentos_web (já filtrados por expires_at > now no SQL)
    const mockWebDocs = [
      {
        id: 'web-1',
        query: 'Vale minério',
        title: 'Notícia Minério',
        content: 'Preço do minério subiu na China',
        sourceUrl: 'https://noticias.com/minerio',
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        distance: 0.35, // Distância maior
      },
      {
        id: 'web-2',
        query: 'Vale dividendos',
        title: 'Dividendos Vale',
        content: 'Vale aprova pagamento de dividendos',
        sourceUrl: 'https://noticias.com/dividendos',
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        distance: 0.05, // Menor distância de todos (mais relevante)
      },
    ];

    let callIndex = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return Promise.resolve(mockCorpusDocs);
        }
        return Promise.resolve(mockWebDocs);
      }),
    } as unknown as DbClient;

    const resultados = await buscarDocumentosSimilares(mockDb, fakeEmbedding, 5);

    // Deve retornar os 3 documentos combinados e ordenados por distância crescente:
    // 1º: web-2 (distância 0.05)
    // 2º: corpus-1 (distância 0.15)
    // 3º: web-1 (distância 0.35)
    expect(resultados.length).toBe(3);

    expect(resultados[0].id).toBe('web-2');
    expect(resultados[0].sourceType).toBe('web');
    expect(resultados[0].distance).toBe(0.05);

    expect(resultados[1].id).toBe('corpus-1');
    expect(resultados[1].sourceType).toBe('corpus');
    expect(resultados[1].distance).toBe(0.15);

    expect(resultados[2].id).toBe('web-1');
    expect(resultados[2].sourceType).toBe('web');
    expect(resultados[2].distance).toBe(0.35);
  });

  it('deve respeitar o limit solicitado na lista combinada', async () => {
    let callIndex = 0;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          return Promise.resolve([
            { id: 'c1', paragraph: 'p1', distance: 0.1, fetchedAt: new Date() },
            { id: 'c2', paragraph: 'p2', distance: 0.4, fetchedAt: new Date() },
          ]);
        }
        return Promise.resolve([
          { id: 'w1', content: 'w1', distance: 0.2, fetchedAt: new Date() },
          { id: 'w2', content: 'w2', distance: 0.3, fetchedAt: new Date() },
        ]);
      }),
    } as unknown as DbClient;

    // Pede apenas top 2
    const resultados = await buscarDocumentosSimilares(mockDb, [0.1], 2);

    expect(resultados.length).toBe(2);
    expect(resultados[0].distance).toBe(0.1);
    expect(resultados[1].distance).toBe(0.2);
  });
});
