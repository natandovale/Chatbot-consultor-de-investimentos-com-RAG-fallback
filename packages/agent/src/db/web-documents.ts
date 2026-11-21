import { lte } from 'drizzle-orm';
import type { DbClient } from './retrieve-similar.js';
import { documentosWeb } from './schema.js';

export const DEFAULT_TTL_DAYS = 7;

export interface WebChunkInput {
  query: string;
  title: string;
  content: string;
  sourceUrl: string;
  embedding: number[];
  fetchedAt?: Date;
  ttlDays?: number;
}

/**
 * Insere documentos da busca web aplicando o cálculo do TTL (padrão: 7 dias).
 *
 * @param db Instância Drizzle do banco de dados
 * @param chunks Lista de chunks com conteúdo e embeddings
 * @param defaultTtlDays Tempo de vida em dias antes da expiração (default: 7)
 * @returns Quantidade de registros persistidos
 */
export async function salvarDocumentosWeb(
  db: DbClient,
  chunks: WebChunkInput[],
  defaultTtlDays: number = DEFAULT_TTL_DAYS,
): Promise<number> {
  if (chunks.length === 0) return 0;

  const now = new Date();

  const records = chunks.map((chunk) => {
    const fetchedAt = chunk.fetchedAt ?? now;
    const ttlDays = chunk.ttlDays ?? defaultTtlDays;
    const expiresAt = new Date(fetchedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    return {
      query: chunk.query,
      title: chunk.title,
      content: chunk.content,
      sourceUrl: chunk.sourceUrl,
      fetchedAt,
      expiresAt,
      embedding: chunk.embedding,
    };
  });

  await db.insert(documentosWeb).values(records);
  return records.length;
}

/**
 * Expurga do banco todos os documentos da web cuja data de expiração (expires_at) já foi ultrapassada.
 * Evita degradação de relevância nas buscas e mantém a tabela documentos_web enxuta.
 *
 * @param db Instância Drizzle do banco de dados
 * @param dataReferencia Data base de corte (default: new Date())
 * @returns Quantidade de registros expirados removidos
 */
export async function limparDocumentosWebExpirados(
  db: DbClient,
  dataReferencia: Date = new Date(),
): Promise<number> {
  const result = await db
    .delete(documentosWeb)
    .where(lte(documentosWeb.expiresAt, dataReferencia))
    .returning({ id: documentosWeb.id });

  return result.length;
}
