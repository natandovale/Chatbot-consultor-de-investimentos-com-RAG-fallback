import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../db/index.js';
import { documentos } from '../db/schema.js';
import {
  createFakeEmbeddingClient,
  createRealEmbeddingClient,
  getEmbeddingClient,
  type EmbeddingClient,
} from './embeddings.js';

// Schema zod para validação dos documentos do corpus
export const documentoCorpusSchema = z.object({
  ticker: z.string().min(1),
  companyName: z.string().min(1),
  setor: z.string().min(1),
  period: z.string().min(1),
  periodEnd: z.string().min(1),
  receitaLiquida: z.number(),
  lucroBruto: z.number(),
  lucroLiquido: z.number(),
  ativoTotal: z.number(),
  patrimonioLiquido: z.number(),
  caixaOperacional: z.number(),
  receitaMesmoTrimestreAnoAnterior: z.number().optional().nullable(),
  sourceUrl: z.string().url(),
  fetchedAt: z.string().min(1),
  paragraph: z.string().min(1),
});

export type DocumentoCorpus = z.infer<typeof documentoCorpusSchema>;

export interface SeedOptions {
  embeddingClient?: EmbeddingClient;
  dataDir?: string;
  connectionString?: string;
}

export async function runSeed(options: SeedOptions = {}) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = options.dataDir || path.resolve(__dirname, '../../../corpus/data/documentos');

  console.log(`[seed] Lendo documentos de: ${dataDir}`);
  const files = (await fs.readdir(dataDir)).filter((file) => file.endsWith('.json'));

  const todosDocumentos: DocumentoCorpus[] = [];

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const docs = Array.isArray(parsed) ? parsed : [parsed];

    for (const doc of docs) {
      todosDocumentos.push(documentoCorpusSchema.parse(doc));
    }
  }

  console.log(`[seed] ${todosDocumentos.length} documentos validados com sucesso.`);

  const embeddingClient = options.embeddingClient || getEmbeddingClient();
  const { db, pool } = createDb(options.connectionString);

  const BATCH_SIZE = 10;
  let totalProcessado = 0;

  try {
    for (let i = 0; i < todosDocumentos.length; i += BATCH_SIZE) {
      const lote = todosDocumentos.slice(i, i + BATCH_SIZE);
      const paragrafos = lote.map((d) => d.paragraph);

      console.log(
        `[seed] Gerando embeddings para lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(todosDocumentos.length / BATCH_SIZE)} (${lote.length} docs)...`,
      );

      const embeddings = await embeddingClient.generateEmbeddings(paragrafos);

      const registros = lote.map((doc, idx) => ({
        ticker: doc.ticker,
        companyName: doc.companyName,
        setor: doc.setor,
        period: doc.period,
        periodEnd: doc.periodEnd,
        receitaLiquida: doc.receitaLiquida,
        lucroBruto: doc.lucroBruto,
        lucroLiquido: doc.lucroLiquido,
        ativoTotal: doc.ativoTotal,
        patrimonioLiquido: doc.patrimonioLiquido,
        caixaOperacional: doc.caixaOperacional,
        receitaMesmoTrimestreAnoAnterior: doc.receitaMesmoTrimestreAnoAnterior ?? null,
        sourceUrl: doc.sourceUrl,
        fetchedAt: new Date(doc.fetchedAt),
        paragraph: doc.paragraph,
        embedding: embeddings[idx],
      }));

      // Inserção no Postgres via Drizzle com upsert em (ticker, period)
      await db
        .insert(documentos)
        .values(registros)
        .onConflictDoUpdate({
          target: [documentos.ticker, documentos.period],
          set: {
            companyName: sql`excluded.company_name`,
            setor: sql`excluded.setor`,
            periodEnd: sql`excluded.period_end`,
            receitaLiquida: sql`excluded.receita_liquida`,
            lucroBruto: sql`excluded.lucro_bruto`,
            lucroLiquido: sql`excluded.lucro_liquido`,
            ativoTotal: sql`excluded.ativo_total`,
            patrimonioLiquido: sql`excluded.patrimonio_liquido`,
            caixaOperacional: sql`excluded.caixa_operacional`,
            receitaMesmoTrimestreAnoAnterior: sql`excluded.receita_mesmo_trimestre_ano_anterior`,
            sourceUrl: sql`excluded.source_url`,
            fetchedAt: sql`excluded.fetched_at`,
            paragraph: sql`excluded.paragraph`,
            embedding: sql`excluded.embedding`,
          },
        });

      totalProcessado += lote.length;
    }

    console.log(`[seed] Concluído com sucesso! Total de documentos upserted: ${totalProcessado}`);
  } finally {
    await pool.end();
  }
}

// Executa diretamente quando chamado via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runSeed().catch((error) => {
    console.error('[seed] Erro durante o seed:', error);
    process.exit(1);
  });
}

// Exporta as funções para reutilização e testes futuros (modo DEMO)
export { createRealEmbeddingClient, createFakeEmbeddingClient };
