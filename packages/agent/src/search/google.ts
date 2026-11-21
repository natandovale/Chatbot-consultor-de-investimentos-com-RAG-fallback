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
 * Usa fetch nativo, sem SDK externo.
 *
 * @param apiKey Chave de API do Google Cloud
 * @param cx Identificador do mecanismo de busca programável (Search Engine ID)
 */
export function makeGoogleCustomSearchProvider(apiKey: string, cx: string): SearchProvider {
  if (!apiKey || !cx) {
    throw new Error('Chave de API e CX do Google Custom Search são obrigatórios.');
  }

  return {
    async search(query: string): Promise<SearchResult[]> {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('cx', cx);
      url.searchParams.set('q', query);

      const response = await fetch(url.toString(), {
        method: 'GET',
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
    },
  };
}
