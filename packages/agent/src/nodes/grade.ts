import { z } from 'zod';
import { GRADE_SYSTEM_PROMPT, formatGradePrompt } from '../prompts/grade.js';
import type { Documento } from '../db/retrieve-similar.js';

export const gradeOutputSchema = z.object({
  sufficient: z
    .boolean()
    .describe(
      'true se o contexto numérico fornecido responde plenamente à pergunta, false caso contrário',
    ),
  missingAspects: z
    .array(z.string())
    .default([])
    .describe('Lista de aspectos, motivos, notícias ou dados faltantes que exigem busca externa'),
});

export type GradeOutput = z.infer<typeof gradeOutputSchema>;

export interface GradeLlmClient {
  generateStructured<T>(params: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T>;
}

export type GradeClassifierFn = (params: {
  question: string;
  documents: Documento[];
}) => Promise<GradeOutput>;

export interface GradeNodeDependencies {
  llmClient: GradeLlmClient | GradeClassifierFn;
}

export interface AgentState {
  question: string;
  documents?: Documento[];
  sufficient?: boolean;
  missingAspects?: string[];
  [key: string]: unknown;
}

/**
 * Cria o nó `grade` do grafo como uma factory de dependências.
 *
 * Convenção do projeto: o nó não importa nenhum cliente global.
 * Ele recebe o cliente de LLM estruturado por parâmetro, permitindo
 * testes rápidos com fakes determinísticos sem chamada real a APIs de rede.
 *
 * @param depsOrClient Objeto de dependências ou cliente direto de LLM / função classificadora
 * @returns Função assíncrona do nó para o LangGraph
 */
export function createGradeNode(
  depsOrClient: GradeNodeDependencies | GradeLlmClient | GradeClassifierFn,
) {
  const client =
    typeof depsOrClient === 'object' && 'llmClient' in depsOrClient
      ? depsOrClient.llmClient
      : depsOrClient;

  return async function grade(state: AgentState): Promise<Partial<AgentState>> {
    const question = state.question;
    const documents = state.documents ?? [];

    if (!question || typeof question !== 'string') {
      throw new Error('Pergunta não encontrada ou inválida no estado do agente.');
    }

    let gradeResult: GradeOutput;

    if (typeof client === 'function') {
      // Usado diretamente em fakes ou testes rápidos
      gradeResult = await client({ question, documents });
    } else {
      // Chamada estruturada ao cliente de LLM
      const userPrompt = formatGradePrompt(question, documents);
      gradeResult = await client.generateStructured({
        system: GRADE_SYSTEM_PROMPT,
        prompt: userPrompt,
        schema: gradeOutputSchema,
      });
    }

    // Valida com o schema Zod para garantir aderência ao formato
    const validResult = gradeOutputSchema.parse(gradeResult);

    return {
      sufficient: validResult.sufficient,
      missingAspects: validResult.missingAspects,
    };
  };
}
