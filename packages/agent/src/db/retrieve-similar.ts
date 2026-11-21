import { asc, cosineDistance, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { documentos } from './schema.js';
import type * as schema from './schema.js';

export type Documento = typeof documentos.$inferSelect;

export type DbClient = NodePgDatabase<typeof schema> | NodePgDatabase<any>;

export type SearchSimilarFn = (embedding: number[], limit?: number) => Promise<Documento[]>;

/**
 * Busca os documentos mais próximos no Postgres via pgvector usando o operador de distância de cosseno do Drizzle.
 *
 * @param db Instância do banco Drizzle
 * @param embedding Vetor de embedding da consulta (768 dimensões)
 * @param limit Quantidade de documentos a retornar (default: 5)
 */
export async function retrieveSimilar(
  db: DbClient,
  embedding: number[],
  limit: number = 5,
): Promise<Documento[]> {
  return db
    .select()
    .from(documentos)
    .where(sql`${documentos.embedding} IS NOT NULL`)
    .orderBy(asc(cosineDistance(documentos.embedding, embedding)))
    .limit(limit);
}

/**
 * Cria uma função de busca vinculada à conexão do banco, facilitando a injeção de dependência no nó retrieve.
 */
export function createSearchSimilar(db: DbClient, defaultLimit: number = 5): SearchSimilarFn {
  return (embedding: number[], limit: number = defaultLimit) =>
    retrieveSimilar(db, embedding, limit);
}
