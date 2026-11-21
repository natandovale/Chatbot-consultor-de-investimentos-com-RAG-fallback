import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  criarSearchProvider,
  makeGoogleCustomSearchProvider,
  makeSerperProvider,
} from './index.js';

describe('SearchProviders', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('makeSerperProvider', () => {
    it('deve chamar POST https://google.serper.dev/search com X-API-KEY e { q: query }, mapeando organic[]', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          organic: [
            {
              title: 'Vale reporta lucro no 3T25',
              snippet: 'A mineradora Vale divulgou nesta quinta-feira...',
              link: 'https://exemplo.com/noticia-vale',
            },
            {
              title: 'Análise de resultados Vale 3T25',
              snippet: 'Receita líquida e geração de caixa...',
              link: 'https://exemplo.com/analise-vale',
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = makeSerperProvider('fake-serper-key');
      const results = await provider.search('lucro vale 3t25');

      expect(mockFetch).toHaveBeenCalledWith('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': 'fake-serper-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: 'lucro vale 3t25' }),
      });

      expect(results).toEqual([
        {
          title: 'Vale reporta lucro no 3T25',
          snippet: 'A mineradora Vale divulgou nesta quinta-feira...',
          url: 'https://exemplo.com/noticia-vale',
        },
        {
          title: 'Análise de resultados Vale 3T25',
          snippet: 'Receita líquida e geração de caixa...',
          url: 'https://exemplo.com/analise-vale',
        },
      ]);
    });

    it('deve lançar erro se o Serper retornar status HTTP diferente de 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = makeSerperProvider('chave-invalida');
      await expect(provider.search('teste')).rejects.toThrow('Falha na busca do Serper (401)');
    });
  });

  describe('makeGoogleCustomSearchProvider', () => {
    it('deve chamar GET https://www.googleapis.com/customsearch/v1 com query params e mapear items[]', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              title: 'Petrobras anuncia dividendos',
              snippet: 'Conselho de administração da Petrobras aprova dividendos...',
              link: 'https://exemplo.com/dividendos-petr',
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = makeGoogleCustomSearchProvider('fake-google-key', 'fake-cx-123');
      const results = await provider.search('dividendos petrobras');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(calledUrl.origin + calledUrl.pathname).toBe(
        'https://www.googleapis.com/customsearch/v1',
      );
      expect(calledUrl.searchParams.get('key')).toBe('fake-google-key');
      expect(calledUrl.searchParams.get('cx')).toBe('fake-cx-123');
      expect(calledUrl.searchParams.get('q')).toBe('dividendos petrobras');

      expect(results).toEqual([
        {
          title: 'Petrobras anuncia dividendos',
          snippet: 'Conselho de administração da Petrobras aprova dividendos...',
          url: 'https://exemplo.com/dividendos-petr',
        },
      ]);
    });

    it('deve lançar erro se o Google Custom Search retornar status não-ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Quota exceeded',
      });

      vi.stubGlobal('fetch', mockFetch);

      const provider = makeGoogleCustomSearchProvider('key', 'cx');
      await expect(provider.search('teste')).rejects.toThrow(
        'Falha na busca do Google Custom Search (403)',
      );
    });
  });

  describe('criarSearchProvider (fábrica)', () => {
    it('deve usar o provedor "serper" por padrão e validar a chave', () => {
      const provider = criarSearchProvider({
        SERPER_API_KEY: 'minha-chave-serper',
      });

      expect(provider).toBeDefined();
      expect(typeof provider.search).toBe('function');
    });

    it('deve lançar erro claro se a chave do Serper não for fornecida', () => {
      expect(() => criarSearchProvider({})).toThrow(
        'Variável de ambiente SERPER_API_KEY não foi configurada para o provedor "serper".',
      );
    });

    it('deve criar o provedor "google" quando SEARCH_PROVIDER for google', () => {
      const provider = criarSearchProvider({
        SEARCH_PROVIDER: 'google',
        GOOGLE_SEARCH_API_KEY: 'google-key',
        GOOGLE_SEARCH_CX: 'cx-id',
      });

      expect(provider).toBeDefined();
      expect(typeof provider.search).toBe('function');
    });

    it('deve lançar erro claro se faltarem credenciais do Google', () => {
      expect(() =>
        criarSearchProvider({
          SEARCH_PROVIDER: 'google',
          GOOGLE_SEARCH_API_KEY: 'google-key',
        }),
      ).toThrow('Variável(is) de ambiente ausente(s) para o provedor "google": GOOGLE_SEARCH_CX.');
    });

    it('deve lançar erro claro para provedores desconhecidos', () => {
      expect(() =>
        criarSearchProvider({
          SEARCH_PROVIDER: 'bing',
        }),
      ).toThrow('Provedor de busca desconhecido: "bing". Provedores suportados: "serper", "google".');
    });
  });
});
