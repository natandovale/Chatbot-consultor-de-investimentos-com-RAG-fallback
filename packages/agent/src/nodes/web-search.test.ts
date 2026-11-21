import { describe, expect, it, vi } from 'vitest';
import {
  chunkText,
  createWebSearchNode,
  extractReadableText,
  type WebDocumentToInsert,
} from './web-search.js';
import type { SearchProvider, SearchResult } from '../search/types.js';
import type { EmbeddingClient } from '../seed/embeddings.js';

describe('web-search node', () => {
  describe('extractReadableText', () => {
    it('deve remover tags HTML, scripts e estilos', () => {
      const html = `
        <html>
          <head>
            <style>body { font-size: 14px; }</style>
            <script>console.log("ignore");</script>
          </head>
          <body>
            <h1>Notícia Financeira</h1>
            <p>A mineradora teve alta de <strong>12%</strong> no minério &amp; lucro recorde.&nbsp;</p>
          </body>
        </html>
      `;
      const text = extractReadableText(html);
      expect(text).toBe('Notícia Financeira A mineradora teve alta de 12% no minério & lucro recorde.');
    });
  });

  describe('chunkText', () => {
    it('deve retornar chunk único se texto for menor que chunkSize', () => {
      const chunks = chunkText('Texto pequeno', 1000, 100);
      expect(chunks).toEqual(['Texto pequeno']);
    });

    it('deve dividir textos longos respeitando sobreposição', () => {
      const texto = 'A'.repeat(1500);
      const chunks = chunkText(texto, 1000, 100);
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(1000);
      expect(chunks[1].length).toBe(600);
    });
  });

  describe('createWebSearchNode', () => {
    it('deve montar uma query por aspecto faltante, buscar top 3, extrair HTML, gerar chunks e inserir com TTL', async () => {
      const searchMock = vi.fn().mockImplementation(async (q: string): Promise<SearchResult[]> => {
        return [
          { title: `Notícia 1 para ${q}`, url: 'https://site1.com/noticia', snippet: 'resumo 1' },
          { title: `Notícia 2 para ${q}`, url: 'https://site2.com/noticia', snippet: 'resumo 2' },
          { title: `Notícia 3 para ${q}`, url: 'https://site3.com/noticia', snippet: 'resumo 3' },
          { title: `Notícia 4 para ${q}`, url: 'https://site4.com/noticia', snippet: 'resumo 4' }, // deve descartar além de 3
        ];
      });

      const searchProvider: SearchProvider = { search: searchMock };

      const fetchHtmlMock = vi.fn().mockImplementation(async (url: string) => {
        return `<p>Conteúdo relevante da página ${url}. A empresa teve um impacto importante.</p>`;
      });

      const fakeEmbedding = [0.1, 0.2, 0.3];
      const embeddingClient: EmbeddingClient = {
        generateEmbeddings: vi.fn().mockImplementation(async (chunks: string[]) => {
          return chunks.map(() => fakeEmbedding);
        }),
      };

      const insertedDocs: WebDocumentToInsert[] = [];
      const insertWebDocuments = vi.fn().mockImplementation(async (docs: WebDocumentToInsert[]) => {
        insertedDocs.push(...docs);
      });

      const webSearch = createWebSearchNode({
        searchProvider,
        embeddingClient,
        insertWebDocuments,
        fetchHtml: fetchHtmlMock,
        ttlDays: 7,
      });

      const result = await webSearch({
        question: 'Vale 3T25',
        missingAspects: ['motivo queda lucro', 'preço minério'],
      });

      // 1. Deve buscar 2 queries (uma por aspecto)
      expect(searchMock).toHaveBeenCalledWith('Vale 3T25 motivo queda lucro');
      expect(searchMock).toHaveBeenCalledWith('Vale 3T25 preço minério');

      // 2. Deve pegar até 3 resultados por query (2 queries x 3 = 6 buscas de HTML)
      expect(fetchHtmlMock).toHaveBeenCalledTimes(6);

      // 3. Deve inserir os documentos com TTL correto (7 dias)
      expect(insertWebDocuments).toHaveBeenCalled();
      expect(insertedDocs.length).toBeGreaterThan(0);

      const firstDoc = insertedDocs[0];
      expect(firstDoc.query).toBe('Vale 3T25 motivo queda lucro');
      expect(firstDoc.sourceUrl).toBe('https://site1.com/noticia');
      expect(firstDoc.embedding).toEqual(fakeEmbedding);

      const diffDias =
        (firstDoc.expiresAt.getTime() - firstDoc.fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDias)).toBe(7);

      expect(result.webSearchCompleted).toBe(true);
    });

    it('deve usar apenas a pergunta se missingAspects for vazio', async () => {
      const searchMock = vi.fn().mockResolvedValue([]);
      const searchProvider: SearchProvider = { search: searchMock };

      const webSearch = createWebSearchNode({
        searchProvider,
        embeddingClient: { generateEmbeddings: vi.fn() },
      });

      await webSearch({
        question: 'Notícias da Petrobras',
        missingAspects: [],
      });

      expect(searchMock).toHaveBeenCalledTimes(1);
      expect(searchMock).toHaveBeenCalledWith('Notícias da Petrobras');
    });

    it('deve ignorar páginas que falharem no fetch (timeout ou erro) sem derrubar o nó inteiro', async () => {
      const searchProvider: SearchProvider = {
        search: vi.fn().mockResolvedValue([
          { title: 'Página Quebrada', url: 'https://erro.com/404', snippet: 'resumo' },
          { title: 'Página Boa', url: 'https://sucesso.com/200', snippet: 'resumo' },
        ]),
      };

      const fetchHtmlMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('erro.com')) {
          throw new Error('Timeout 10s excedido');
        }
        return '<p>Texto da página boa com sucesso</p>';
      });

      const insertedDocs: WebDocumentToInsert[] = [];
      const webSearch = createWebSearchNode({
        searchProvider,
        embeddingClient: {
          generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
        },
        insertWebDocuments: async (docs) => {
          insertedDocs.push(...docs);
        },
        fetchHtml: fetchHtmlMock,
      });

      const result = await webSearch({
        question: 'Teste de tolerância a falhas',
      });

      // A página quebrada foi ignorada e a página boa foi processada normalmente
      expect(result.webSearchCompleted).toBe(true);
      expect(insertedDocs.length).toBe(1);
      expect(insertedDocs[0].sourceUrl).toBe('https://sucesso.com/200');
    });

    it('deve capturar erro em searchProvider.search por query e continuar sem derrubar o nó (Serper fora do ar ou circuit breaker aberto)', async () => {
      let chamadaSearch = 0;
      const searchMock = vi.fn().mockImplementation(async (q: string) => {
        chamadaSearch++;
        if (q.includes('falha')) {
          throw new Error('CircuitBreakerOpenError: Serper indisponível (circuito aberto)');
        }
        return [
          { title: 'Notícia Recuperada', url: 'https://noticia-boa.com', snippet: 'resumo' },
        ];
      });

      const searchProvider: SearchProvider = { search: searchMock };

      const fetchHtmlMock = vi.fn().mockResolvedValue('<p>Conteúdo relevante da busca que funcionou</p>');
      const insertedDocs: WebDocumentToInsert[] = [];

      const webSearch = createWebSearchNode({
        searchProvider,
        embeddingClient: {
          generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
        },
        insertWebDocuments: async (docs) => {
          insertedDocs.push(...docs);
        },
        fetchHtml: fetchHtmlMock,
      });

      // Duas queries: a primeira falha no searchProvider, a segunda sucede
      const result = await webSearch({
        question: 'Empresa XPTO',
        missingAspects: ['falha externa', 'sucesso'],
      });

      expect(searchMock).toHaveBeenCalledTimes(2);
      expect(result.webSearchCompleted).toBe(true);
      expect(result.webSearchResultsCount).toBe(1);
      expect(insertedDocs.length).toBe(1);
      expect(insertedDocs[0].query).toBe('Empresa XPTO sucesso');
    });

    it('deve finalizar sem adicionar nenhum documento quando todas as buscas do searchProvider falharem', async () => {
      const searchMock = vi.fn().mockRejectedValue(new Error('Serper 503 Service Unavailable'));
      const searchProvider: SearchProvider = { search: searchMock };

      const insertWebDocuments = vi.fn();
      const webSearch = createWebSearchNode({
        searchProvider,
        embeddingClient: { generateEmbeddings: vi.fn() },
        insertWebDocuments,
      });

      const result = await webSearch({
        question: 'Qualquer pergunta',
        missingAspects: ['aspecto 1', 'aspecto 2'],
      });

      expect(result.webSearchCompleted).toBe(true);
      expect(result.webSearchResultsCount).toBe(0);
      expect(insertWebDocuments).not.toHaveBeenCalled();
    });
  });
});
