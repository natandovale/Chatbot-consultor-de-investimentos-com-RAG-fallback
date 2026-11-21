import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createRetrieveNode } from './nodes/retrieve.js';
import { createGradeNode, type GradeClassifierFn, type GradeLlmClient } from './nodes/grade.js';
import {
  createWebSearchNode,
  type InsertWebDocumentsFn,
} from './nodes/web-search.js';
import type { EmbeddingClient } from './seed/embeddings.js';
import type { DocumentoSimilar, SearchSimilarFn } from './db/retrieve-similar.js';
import type { SearchProvider } from './search/types.js';

export const MAX_ITERATIONS = 3;

/**
 * Estado do Grafo do Agente definido via LangGraph Annotations.
 *
 * iterations possui um reducer que soma os incrementos retornados pelo nó `grade`
 * a cada passagem, sem necessidade de contador externo.
 */
export const GraphState = Annotation.Root({
  question: Annotation<string>,
  documents: Annotation<DocumentoSimilar[]>({
    reducer: (_prev, update) => update ?? _prev,
    default: () => [],
  }),
  missingAspects: Annotation<string[]>({
    reducer: (_prev, update) => update ?? _prev,
    default: () => [],
  }),
  sufficient: Annotation<boolean>({
    reducer: (_prev, update) => update ?? _prev,
    default: () => false,
  }),
  iterations: Annotation<number>({
    reducer: (prev, update) => prev + (update ?? 0),
    default: () => 0,
  }),
});

export type GraphStateType = typeof GraphState.State;

/**
 * Dependências injetadas para construção do grafo.
 * Recebe dependências por função/interface, nunca instâncias de banco direto,
 * permitindo que o grafo inteiro seja 100% testável com fakes.
 */
export interface GraphDeps {
  embeddingClient: EmbeddingClient;
  searchSimilar: SearchSimilarFn;
  searchProvider: SearchProvider;
  llmClient: GradeLlmClient | GradeClassifierFn;
  insertWebDocuments?: InsertWebDocumentsFn;
  fetchHtml?: (url: string) => Promise<string>;
  defaultLimit?: number;
  ttlDays?: number;
}

/**
 * Monta e compila o grafo de execução do agente Corrective RAG:
 * START -> retrieve -> grade -> (condicional)
 *   - se sufficient = true => END
 *   - se iterations >= MAX_ITERATIONS (2) => END
 *   - caso contrário => webSearch -> retrieve
 *
 * @param deps Dependências injetadas do grafo
 */
export function createAgentGraph(deps: GraphDeps) {
  // 1. Nó retrieve
  const retrieveNode = createRetrieveNode({
    embeddingClient: deps.embeddingClient,
    searchSimilar: deps.searchSimilar,
    defaultLimit: deps.defaultLimit,
  });

  // 2. Nó grade (retorna iterations: 1 para o reducer somar 1 a cada passagem)
  const baseGradeNode = createGradeNode(deps.llmClient);
  const gradeNode = async (state: GraphStateType) => {
    const result = await baseGradeNode(state);
    return {
      sufficient: result.sufficient,
      missingAspects: result.missingAspects,
      iterations: 1,
    };
  };

  // 3. Nó webSearch
  const webSearchNode = createWebSearchNode({
    searchProvider: deps.searchProvider,
    embeddingClient: deps.embeddingClient,
    insertWebDocuments: deps.insertWebDocuments,
    fetchHtml: deps.fetchHtml,
    ttlDays: deps.ttlDays,
  });

  // 4. Montagem do fluxo do StateGraph
  const workflow = new StateGraph(GraphState)
    .addNode('retrieve', retrieveNode)
    .addNode('grade', gradeNode)
    .addNode('webSearch', webSearchNode)
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'grade')
    .addConditionalEdges('grade', (state: GraphStateType) => {
      console.log('[DEBUG conditional edge] iterations:', state.iterations, 'sufficient:', state.sufficient);
      if (state.sufficient) {
        return END;
      }
      if (state.iterations >= MAX_ITERATIONS) {
        return END;
      }
      return 'webSearch';
    })
    .addEdge('webSearch', 'retrieve');

  return workflow.compile();
}
