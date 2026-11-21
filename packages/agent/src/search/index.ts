import { makeSerperProvider } from './serper.js';
import { makeGoogleCustomSearchProvider } from './google.js';
import type { SearchProvider } from './types.js';

export * from './types.js';
export * from './serper.js';
export * from './google.js';

/**
 * Fábrica para instanciar o SearchProvider configurado por variável de ambiente.
 *
 * Lê `SEARCH_PROVIDER` (default: 'serper'):
 * - 'serper': valida `SERPER_API_KEY`
 * - 'google' | 'custom_search' | 'google_custom_search': valida `GOOGLE_SEARCH_API_KEY` (ou `GOOGLE_API_KEY`) e `GOOGLE_SEARCH_CX` (ou `GOOGLE_CX`)
 *
 * @param env Dicionário de variáveis de ambiente (default: process.env)
 * @throws Error se as variáveis necessárias estiverem ausentes ou se o provedor for desconhecido
 */
export function criarSearchProvider(env: Record<string, string | undefined> = process.env): SearchProvider {
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
