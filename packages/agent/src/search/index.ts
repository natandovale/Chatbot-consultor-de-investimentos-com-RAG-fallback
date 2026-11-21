import { makeSerperProvider } from './serper.js';
import { makeGoogleCustomSearchProvider } from './google.js';
import { makeDemoSearchProvider, demoFetchHtml } from './demo.js';
import { defaultFetchHtml } from '../nodes/web-search.js';
import type { SearchProvider } from './types.js';

export * from './types.js';
export * from './serper.js';
export * from './google.js';
export * from './demo.js';

/**
 * Fábrica para instanciar o SearchProvider.
 *
 * Se `env.DEMO === 'true'`, retorna o provedor demo baseado em fixtures,
 * sem depender do Serper ou do Google Custom Search estarem no ar.
 *
 * Caso contrário, lê `SEARCH_PROVIDER` (default: 'serper'):
 * - 'serper': valida `SERPER_API_KEY`
 * - 'google' | 'custom_search' | 'google_custom_search': valida `GOOGLE_SEARCH_API_KEY` e `GOOGLE_SEARCH_CX`
 *
 * @param env Dicionário de variáveis de ambiente (default: process.env)
 * @throws Error se as variáveis necessárias estiverem ausentes ou se o provedor for desconhecido
 */
export function criarSearchProvider(env: Record<string, string | undefined> = process.env): SearchProvider {
  if (env.DEMO === 'true') {
    return makeDemoSearchProvider();
  }

  const provider = (env.SEARCH_PROVIDER || 'serper').toLowerCase().trim();

  switch (provider) {
    case 'serper': {
      const apiKey = env.SERPER_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Variável de ambiente SERPER_API_KEY não foi configurada para o provedor "serper".',
        );
      }
      return makeSerperProvider(apiKey);
    }

    case 'google':
    case 'custom_search':
    case 'google_custom_search': {
      const apiKey = env.GOOGLE_SEARCH_API_KEY || env.GOOGLE_API_KEY;
      const cx = env.GOOGLE_SEARCH_CX || env.GOOGLE_CX;

      if (!apiKey || !cx) {
        const faltantes: string[] = [];
        if (!apiKey) faltantes.push('GOOGLE_SEARCH_API_KEY');
        if (!cx) faltantes.push('GOOGLE_SEARCH_CX');

        throw new Error(
          `Variável(is) de ambiente ausente(s) para o provedor "google": ${faltantes.join(', ')}.`,
        );
      }

      return makeGoogleCustomSearchProvider(apiKey, cx);
    }

    default:
      throw new Error(
        `Provedor de busca desconhecido: "${env.SEARCH_PROVIDER}". Provedores suportados: "serper", "google".`,
      );
  }
}

/**
 * Fábrica para a função de fetch de página HTML.
 * Se `env.DEMO === 'true'`, retorna o fetcher fake baseado nas fixtures.
 * Caso contrário, retorna o fetcher real `defaultFetchHtml`.
 */
export function criarFetchHtml(
  env: Record<string, string | undefined> = process.env,
): (url: string) => Promise<string> {
  if (env.DEMO === 'true') {
    return demoFetchHtml;
  }
  return defaultFetchHtml;
}
