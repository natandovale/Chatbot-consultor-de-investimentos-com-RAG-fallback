import type { SearchProvider, SearchResult } from './types.js';

interface SerperOrganicItem {
  title?: string;
  snippet?: string;
  link?: string;
}

interface SerperResponse {
  organic?: SerperOrganicItem[];
}

/**
 * Cria um SearchProvider para a API do Serper (google.serper.dev).
 * Usa fetch nativo com timeout explícito de 10 segundos, sem SDK externo.
 *
 * @param apiKey Chave de autenticação da API do Serper
 * @param timeoutMs Timeout da requisição em milissegundos (default: 10000ms)
 */
export function makeSerperProvider(apiKey: string, timeoutMs: number = 10000): SearchProvider {
  if (!apiKey) {
    throw new Error('Chave de API do Serper não informada.');
  }

  return {
    async search(query: string): Promise<SearchResult[]> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: query }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Falha na busca do Serper (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as SerperResponse;
        const organic = data.organic ?? [];

        return organic.map((item) => ({
          title: item.title ?? '',
          snippet: item.snippet ?? '',
          url: item.link ?? '',
        }));
      } catch (error: any) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
          throw new Error(`Timeout de ${timeoutMs / 1000}s excedido na busca do Serper`);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
