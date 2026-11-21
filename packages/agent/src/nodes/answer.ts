import { ANSWER_SYSTEM_PROMPT, formatAnswerPrompt } from '../prompts/answer.js';
import { formatarResposta } from '../answer/format-resposta.js';
import type { DocumentoSimilar } from '../db/retrieve-similar.js';

export interface AnswerLlmClient {
  generate(params: { system: string; prompt: string }): Promise<string>;
}

export type AnswerGenerateFn = (params: {
  prompt: string;
  system: string;
  question: string;
  documents: DocumentoSimilar[];
  sufficient: boolean;
}) => Promise<string>;

export interface AnswerNodeDependencies {
  llmClient: AnswerLlmClient | AnswerGenerateFn;
}

export interface AnswerState {
  question: string;
  documents?: DocumentoSimilar[];
  sufficient?: boolean;
  [key: string]: unknown;
}

/**
 * Cria o nó answer do grafo como uma factory de dependências.
 *
 * Convenção do projeto: o nó não importa nenhum cliente global.
 * Ele recebe o cliente de LLM por parâmetro, permitindo testes
 * determinísticos com fakes sem chamadas reais de rede.
 */
export function createAnswerNode(
  depsOrClient: AnswerNodeDependencies | AnswerLlmClient | AnswerGenerateFn,
) {
  const client =
    typeof depsOrClient === 'object' && 'llmClient' in depsOrClient
      ? depsOrClient.llmClient
      : depsOrClient;

  return async function answer(state: AnswerState): Promise<{ answer: string }> {
    const question = state.question;
    const documents = state.documents ?? [];
    const sufficient = state.sufficient ?? false;

    if (!question || typeof question !== 'string') {
      throw new Error('Pergunta não encontrada ou inválida no estado do agente.');
    }

    const prompt = formatAnswerPrompt({ question, documents, sufficient });

    let respostaBruta: string;

    if (typeof client === 'function') {
      respostaBruta = await client({
        prompt,
        system: ANSWER_SYSTEM_PROMPT,
        question,
        documents,
        sufficient,
      });
    } else {
      respostaBruta = await client.generate({
        system: ANSWER_SYSTEM_PROMPT,
        prompt,
      });
    }

    const respostaFinal = formatarResposta({
      respostaLlm: respostaBruta,
      documents,
    });

    return {
      answer: respostaFinal,
    };
  };
}
