import type { z } from 'zod';
import type { DocumentoSimilar, SearchSimilarFn } from '../db/retrieve-similar.js';
import type { GradeClassifierFn, GradeLlmClient, GradeOutput } from '../nodes/grade.js';
import type { AnswerGenerateFn, AnswerLlmClient } from '../nodes/answer.js';

/**
 * Documento real da Vale 3T25 congelado a partir de `packages/corpus/data/documentos/VALE.json`.
 */
export const VALE_3T25_DEMO_DOCUMENT: Readonly<DocumentoSimilar> = Object.freeze({
  id: 'demo-vale-3t25',
  sourceType: 'corpus',
  title: 'Vale S.A. (VALE)',
  ticker: 'VALE',
  companyName: 'Vale S.A.',
  setor: 'Extração Mineral',
  period: '3T25',
  periodEnd: '2025-09-30',
  content:
    'No 3T25, a Vale S.A. reportou receita líquida de R$ 56,7 bilhões, alta de 7,0% frente ao 3T24 e alta de 13,8% frente ao 2T25. O lucro líquido foi de R$ 14,7 bilhões, com margem líquida de 25,9%. O caixa gerado nas operações somou R$ 13,7 bilhões.',
  paragraph:
    'No 3T25, a Vale S.A. reportou receita líquida de R$ 56,7 bilhões, alta de 7,0% frente ao 3T24 e alta de 13,8% frente ao 2T25. O lucro líquido foi de R$ 14,7 bilhões, com margem líquida de 25,9%. O caixa gerado nas operações somou R$ 13,7 bilhões.',
  sourceUrl: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2025.zip',
  fetchedAt: new Date('2026-08-08T02:19:40.760Z'),
  distance: 0.05,
});

export const DEMO_FIXED_ANSWER =
  'No 3T25, a Vale S.A. reportou receita líquida de R$ 56,7 bilhões (alta de 7,0% frente ao 3T24 e de 13,8% frente ao 2T25) e lucro líquido de R$ 14,7 bilhões, com margem líquida de 25,9% e caixa operacional de R$ 13,7 bilhões.';

/**
 * Cria a função de busca por similaridade para modo DEMO:
 * sempre devolve o mesmo documento real da Vale 3T25 congelado do corpus.
 */
export function criarBuscarDemo(): SearchSimilarFn {
  return async () => [VALE_3T25_DEMO_DOCUMENT];
}

/**
 * Cria o cliente do nó `grade` para modo DEMO:
 * sempre considera o contexto recuperado suficiente (`sufficient: true, missingAspects: []`).
 */
export function criarGradeLlmDemo(): GradeLlmClient & GradeClassifierFn {
  const result: GradeOutput = Object.freeze({
    sufficient: true,
    missingAspects: [],
  });

  const fn: GradeClassifierFn = async () => result;

  return Object.assign(fn, {
    async generateStructured<T>({
      schema,
    }: {
      system: string;
      prompt: string;
      schema: z.ZodType<T>;
    }) {
      return schema.parse(result);
    },
  });
}

/**
 * Cria o cliente do nó `answer` para modo DEMO:
 * devolve uma resposta analítica fixa baseada no documento da Vale 3T25.
 */
export function criarAnswerLlmDemo(): AnswerLlmClient & AnswerGenerateFn {
  const fn: AnswerGenerateFn = async () => DEMO_FIXED_ANSWER;

  return Object.assign(fn, {
    async generate() {
      return DEMO_FIXED_ANSWER;
    },
  });
}
