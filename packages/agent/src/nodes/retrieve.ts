import type { EmbeddingClient } from '../seed/embeddings.js';
import type { Documento, SearchSimilarFn } from '../db/retrieve-similar.js';

export interface RetrieveNodeDependencies {
  embeddingClient: EmbeddingClient;
  searchSimilar: SearchSimilarFn;
  defaultLimit?: number;
}

export interface AgentState {
  question: string;
  documents?: Documento[];
  [key: string]: unknown;
}

/**
 * Cria o nó `retrieve` do grafo como uma factory de dependências.
 *
 * Convenção do projeto: o nó não importa nenhum cliente global.
 * Ele recebe o cliente de embeddings e a função de busca por parâmetro,
 * tornando o nó 100% testável com fakes sem chamadas reais de rede ou banco.
 *
 * @param deps Dependências do nó (cliente de embedding e função de busca)
 * @returns Função do nó para o LangGraph que recebe o estado e atualiza os documentos
 */
export function createRetrieveNode(deps: RetrieveNodeDependencies) {
  const defaultLimit = deps.defaultLimit ?? 5;

  return async function retrieve(state: AgentState): Promise<Partial<AgentState>> {
    const question = state.question;
    if (!question || typeof question !== 'string') {
      throw new Error('Pergunta não encontrada ou inválida no estado do agente.');
    }

    // 1. Gera o embedding da pergunta
    const [embedding] = await deps.embeddingClient.generateEmbeddings([question]);
    if (!embedding) {
      throw new Error(`Falha ao gerar embedding para a pergunta: "${question}"`);
    }

    // 2. Busca os documentos mais próximos no Postgres (top-k com default 5)
    const documents = await deps.searchSimilar(embedding, defaultLimit);

    // 3. Retorna a atualização do estado
    return {
      documents,
    };
  };
}
