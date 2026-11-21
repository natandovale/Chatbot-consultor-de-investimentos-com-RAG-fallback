import { makeSerperProvider } from './serper.js';
import { makeGoogleCustomSearchProvider } from './google.js';
import { makeDemoSearchProvider, demoFetchHtml } from './demo.js';
import { comResiliencia, type ResilienciaOptions } from './resilience.js';
import { defaultFetchHtml } from '../nodes/web-search.js';
import type { SearchProvider } from './types.js';

export * from './types.js';
export * from './serper.js';
export * from './google.js';
export * from './demo.js';
export * from './resilience.js';

/**
 * Fábrica para instanciar o SearchProvider.
 *
 * - Se `env.DEMO === 'true'`, retorna o provedor demo baseado em fixtures diretamente,
 *   sem passar pela camada de resiliência (pois não há rede externa).
 * - Para provedores reais ('serper' e 'google'), aplica automaticamente a camada
 *   de resiliência via `comResiliencia()`, provendo retry, backoff e circuit breaker.
 *
 * @param env Dicionário de variáveis de ambiente (default: process.env)
 * @param resilienciaOptions Opções customizadas de resiliência (timeout, retries, sleep/now injetáveis para testes)
 * @throws Error se as variáveis necessárias estiverem ausentes ou se o provedor for desconhecido
 */
export function criarSearchProvider(
  env: Record<string, string | undefined> = process.env,
  resilienciaOptions?: ResilienciaOptions,
): SearchProvider {
  if (env.DEMO === 'true') {
    return makeDemoSearchProvider();
  }

  const provider = (env.SEARCH_PROVIDER || 'serper').toLowerCase().trim();

  let rawProvider: SearchProvider;

  switch (provider) {
    case 'serper': {
      const apiKey = env.SERPER_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Variável de ambiente SERPER_API_KEY não foi configurada para o provedor "serper".',
        );
      }
      rawProvider = makeSerperProvider(apiKey);
      break;
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

      rawProvider = makeGoogleCustomSearchProvider(apiKey, cx);
      break;
    }

    default:
      throw new Error(
        `Provedor de busca desconhecido: "${env.SEARCH_PROVIDER}". Provedores suportados: "serper", "google".`,
      );
  }

  // Aplica o decorador de resiliência por padrão para provedores reais com rede
  return comResiliencia(rawProvider, resilienciaOptions);
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
