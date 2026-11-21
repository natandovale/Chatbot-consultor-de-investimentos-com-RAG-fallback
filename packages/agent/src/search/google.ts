import type { SearchProvider, SearchResult } from './types.js';

interface GoogleCustomSearchItem {
  title?: string;
  snippet?: string;
  link?: string;
}

interface GoogleCustomSearchResponse {
  items?: GoogleCustomSearchItem[];
}

/**
 * Cria um SearchProvider para a API do Google Custom Search.
 * Usa fetch nativo com timeout explícito de 10 segundos, sem SDK externo.
 *
 * @param apiKey Chave de API do Google Cloud
 * @param cx Identificador do mecanismo de busca programável (Search Engine ID)
 * @param timeoutMs Timeout da requisição em milissegundos (default: 10000ms)
 */
export function makeGoogleCustomSearchProvider(
  apiKey: string,
  cx: string,
  timeoutMs: number = 10000,
): SearchProvider {
  if (!apiKey || !cx) {
    throw new Error('Chave de API e CX do Google Custom Search são obrigatórios.');
  }

  return {
    async search(query: string): Promise<SearchResult[]> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const url = new URL('https://www.googleapis.com/customsearch/v1');
        url.searchParams.set('key', apiKey);
        url.searchParams.set('cx', cx);
        url.searchParams.set('q', query);

        const response = await fetch(url.toString(), {
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Falha na busca do Google Custom Search (${response.status}): ${errorText}`,
          );
        }

        const data = (await response.json()) as GoogleCustomSearchResponse;
        const items = data.items ?? [];

        return items.map((item) => ({
          title: item.title ?? '',
          snippet: item.snippet ?? '',
          url: item.link ?? '',
        }));
      } catch (error: any) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
          throw new Error(
            `Timeout de ${timeoutMs / 1000}s excedido na busca do Google Custom Search`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
