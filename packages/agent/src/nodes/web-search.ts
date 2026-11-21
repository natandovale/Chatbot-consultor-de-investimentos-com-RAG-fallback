import type { EmbeddingClient } from '../seed/embeddings.js';
import type { SearchProvider } from '../search/types.js';

export interface WebDocumentToInsert {
  query: string;
  title: string;
  content: string;
  sourceUrl: string;
  fetchedAt: Date;
  expiresAt: Date;
  embedding: number[];
}

export type InsertWebDocumentsFn = (docs: WebDocumentToInsert[]) => Promise<void>;

export interface WebSearchNodeDependencies {
  searchProvider: SearchProvider;
  embeddingClient: EmbeddingClient;
  insertWebDocuments?: InsertWebDocumentsFn;
  fetchHtml?: (url: string) => Promise<string>;
  ttlDays?: number;
  maxResultsPerQuery?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface AgentState {
  question: string;
  missingAspects?: string[];
  [key: string]: any;
}

/**
 * Remove tags HTML, scripts, estilos e decodifica entidades para extrair texto legível.
 */
export function extractReadableText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Divide o texto em chunks de ~chunkSize caracteres com sobreposição de overlap.
 */
export function chunkText(text: string, chunkSize = 1000, overlap = 100): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  const step = Math.max(1, chunkSize - overlap);

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= cleaned.length) break;
    start += step;
  }

  return chunks;
}

/**
 * Realiza fetch nativo com timeout de 10 segundos.
 */
export async function defaultFetchHtml(url: string, timeoutMs = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Researcher/1.0 (Investment Research Bot)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao acessar ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cria o nó `web_search` do grafo do agente como uma factory de dependências.
 *
 * - Recebe `question` e `missingAspects` do estado.
 * - Monta uma query por aspecto faltante (`${question} ${aspecto}`), ou só a pergunta se a lista for vazia.
 * - Para cada query, chama searchProvider.search() e pega os 3 primeiros resultados.
 * - Busca o HTML de cada URL (timeout 10s), extrai texto legível e divide em chunks de ~1000 chars com 100 de sobreposição.
 * - Gera embedding de cada chunk e insere na tabela `documentos_web` com TTL (default 7 dias).
 * - Se uma página falhar (timeout, erro HTTP), ignora o erro e segue em frente sem derrubar o nó.
 *
 * @param deps Dependências injetadas (searchProvider, embeddingClient, insertWebDocuments, fetchHtml)
 */
export function createWebSearchNode(deps: WebSearchNodeDependencies) {
  const ttlDays = deps.ttlDays ?? 7;
  const maxResults = deps.maxResultsPerQuery ?? 3;
  const chunkSize = deps.chunkSize ?? 1000;
  const chunkOverlap = deps.chunkOverlap ?? 100;
  const fetcher = deps.fetchHtml ?? defaultFetchHtml;

  return async function webSearch(state: AgentState): Promise<Partial<AgentState>> {
    const question = state.question;
    if (!question || typeof question !== 'string') {
      throw new Error('Pergunta não encontrada ou inválida no estado do agente.');
    }

    const missingAspects = state.missingAspects ?? [];

    // 1. Monta queries para cada aspecto faltante, ou a pergunta se vazia
    const queries: string[] =
      missingAspects.length > 0
        ? missingAspects.map((aspecto) => `${question} ${aspecto}`.trim())
        : [question];

    const documentsToInsert: WebDocumentToInsert[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    // 2. Itera sobre cada query
    for (const q of queries) {
      let searchResults: Array<{ title: string; url: string; snippet?: string }> = [];

      try {
        const results = await deps.searchProvider.search(q);
        searchResults = results.slice(0, maxResults);
      } catch (searchError) {
        // Se a busca falhar para esta query, continua para as próximas
        console.warn(`[web_search] Erro ao buscar por "${q}":`, (searchError as Error).message);
        continue;
      }

      // 3. Itera sobre os resultados da busca
      for (const result of searchResults) {
        if (!result.url) continue;

        let html: string;
        try {
          html = await fetcher(result.url);
        } catch (fetchError) {
          // Se a página estiver fora do ar ou der timeout, ignora e segue pros outros
          console.warn(
            `[web_search] Falha ao baixar página ${result.url}:`,
            (fetchError as Error).message,
          );
          continue;
        }

        const readableText = extractReadableText(html);
        if (!readableText) continue;

        // 4. Divide em chunks de ~1000 caracteres com sobreposição de 100
        const chunks = chunkText(readableText, chunkSize, chunkOverlap);
        if (chunks.length === 0) continue;

        try {
          // 5. Gera embeddings dos chunks
          const embeddings = await deps.embeddingClient.generateEmbeddings(chunks);

          // 6. Prepara documentos para inserção em documentos_web
          for (let i = 0; i < chunks.length; i++) {
            documentsToInsert.push({
              query: q,
              title: result.title || q,
              content: chunks[i],
              sourceUrl: result.url,
              fetchedAt: now,
              expiresAt,
              embedding: embeddings[i],
            });
          }
        } catch (embeddingError) {
          console.warn(
            `[web_search] Falha ao gerar embeddings dos chunks de ${result.url}:`,
            (embeddingError as Error).message,
          );
        }
      }
    }

    // 7. Persiste os documentos enriquecidos se houver função de inserção injetada
    if (deps.insertWebDocuments && documentsToInsert.length > 0) {
      await deps.insertWebDocuments(documentsToInsert);
    }

    return {
      webSearchResultsCount: documentsToInsert.length,
      webSearchCompleted: true,
    };
  };
}
