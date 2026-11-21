import { asc, cosineDistance, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { documentos, documentosWeb } from './schema.js';
import type * as schema from './schema.js';

export type DocumentoCorpus = typeof documentos.$inferSelect;
export type DocumentoWeb = typeof documentosWeb.$inferSelect;

export type DbClient = NodePgDatabase<typeof schema> | NodePgDatabase<any>;

/**
 * Representação unificada de um documento retornado pela busca vetorial.
 * Combina dados do corpus CVM e enriquecimentos da web.
 */
export interface DocumentoSimilar {
  id: string;
  sourceType: 'corpus' | 'web';
  title: string;
  content: string;
  sourceUrl: string;
  fetchedAt: Date;
  distance: number;
  paragraph: string; // Mantido para compatibilidade total com os nós
  // Metadados opcionais do corpus CVM
  ticker?: string;
  companyName?: string;
  setor?: string;
  period?: string;
  periodEnd?: string;
  // Metadados opcionais de enriquecimento web
  query?: string;
  expiresAt?: Date;
}

// Alias para retrocompatibilidade
export type Documento = DocumentoSimilar;

export type SearchSimilarFn = (embedding: number[], limit?: number) => Promise<DocumentoSimilar[]>;

/**
 * Busca os documentos mais próximos no Postgres via pgvector:
 * Consulta TANTO os documentos do corpus CVM QUANTO os documentos da web (filtrando os expirados),
 * combina os resultados de ambos e ordena puramente pela distância de cosseno.
 *
 * @param db Instância do banco Drizzle
 * @param embedding Vetor de embedding da consulta (768 dimensões)
 * @param limit Quantidade máxima combinada de documentos a retornar (default: 5)
 */
export async function buscarDocumentosSimilares(
  db: DbClient,
  embedding: number[],
  limit: number = 5,
): Promise<DocumentoSimilar[]> {
  const agora = new Date();

  // 1. Busca documentos do corpus CVM com a distância calculada
  const distCorpus = cosineDistance(documentos.embedding, embedding);
  const docsCorpus = await db
    .select({
      id: documentos.id,
      ticker: documentos.ticker,
      companyName: documentos.companyName,
      setor: documentos.setor,
      period: documentos.period,
      periodEnd: documentos.periodEnd,
      paragraph: documentos.paragraph,
      sourceUrl: documentos.sourceUrl,
      fetchedAt: documentos.fetchedAt,
      distance: distCorpus,
    })
    .from(documentos)
    .where(sql`${documentos.embedding} IS NOT NULL`)
    .orderBy(asc(distCorpus))
    .limit(limit);

  // 2. Busca documentos da web (filtrando expirados: expires_at > agora)
  const distWeb = cosineDistance(documentosWeb.embedding, embedding);
  const docsWeb = await db
    .select({
      id: documentosWeb.id,
      query: documentosWeb.query,
      title: documentosWeb.title,
      content: documentosWeb.content,
      sourceUrl: documentosWeb.sourceUrl,
      fetchedAt: documentosWeb.fetchedAt,
      expiresAt: documentosWeb.expiresAt,
      distance: distWeb,
    })
    .from(documentosWeb)
    .where(
      sql`${documentosWeb.embedding} IS NOT NULL AND ${documentosWeb.expiresAt} > ${agora}`,
    )
    .orderBy(asc(distWeb))
    .limit(limit);

  // 3. Normaliza e combina ambos
  const combinados: DocumentoSimilar[] = [
    ...docsCorpus.map((d) => ({
      id: d.id,
      sourceType: 'corpus' as const,
      title: `${d.companyName} (${d.ticker})`,
      content: d.paragraph,
      paragraph: d.paragraph,
      sourceUrl: d.sourceUrl,
      fetchedAt: d.fetchedAt,
      distance: Number(d.distance),
      ticker: d.ticker,
      companyName: d.companyName,
      setor: d.setor,
      period: d.period,
      periodEnd: d.periodEnd,
    })),
    ...docsWeb.map((d) => ({
      id: d.id,
      sourceType: 'web' as const,
      title: d.title,
      content: d.content,
      paragraph: d.content,
      sourceUrl: d.sourceUrl,
      fetchedAt: d.fetchedAt,
      distance: Number(d.distance),
      query: d.query,
      expiresAt: d.expiresAt,
    })),
  ];

  // 4. Ordena puramente pela distância de cosseno (menor distância = maior similaridade)
  combinados.sort((a, b) => a.distance - b.distance);

  return combinados.slice(0, limit);
}

// Alias para compatibilidade com o nó retrieve
export const retrieveSimilar = buscarDocumentosSimilares;

/**
 * Cria uma função de busca vinculada à conexão do banco, facilitando injeção de dependência.
 */
export function createSearchSimilar(db: DbClient, defaultLimit: number = 5): SearchSimilarFn {
  return (embedding: number[], limit: number = defaultLimit) =>
    buscarDocumentosSimilares(db, embedding, limit);
}
