import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createRetrieveNode } from './nodes/retrieve.js';
import { createGradeNode, type GradeClassifierFn, type GradeLlmClient } from './nodes/grade.js';
import { createWebSearchNode, type InsertWebDocumentsFn } from './nodes/web-search.js';
import { createAnswerNode, type AnswerGenerateFn, type AnswerLlmClient } from './nodes/answer.js';
import { createRealEmbeddingClient, type EmbeddingClient } from './seed/embeddings.js';
import { createDb } from './db/index.js';
import {
  createSearchSimilar,
  type DocumentoSimilar,
  type SearchSimilarFn,
} from './db/retrieve-similar.js';
import { salvarDocumentosWeb } from './db/web-documents.js';
import { criarFetchHtml, criarSearchProvider } from './search/index.js';
import type { SearchProvider } from './search/types.js';
import { createVertexLlmClient } from './llm/vertex.js';

export const MAX_ITERATIONS = 2;

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

export type GraphStateType = typeof GraphState.State & {
  answer?: string;
};

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
  answerLlmClient?: AnswerLlmClient | AnswerGenerateFn;
  insertWebDocuments?: InsertWebDocumentsFn;
  fetchHtml?: (url: string) => Promise<string>;
  defaultLimit?: number;
  ttlDays?: number;
}

/**
 * Monta e compila o grafo de execução do agente Corrective RAG:
 * START -> retrieve -> grade -> (condicional)
 *   - se sufficient = true => answer -> END
 *   - se iterations >= MAX_ITERATIONS (2) => answer -> END
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

  // 4. Nó answer
  const answerNode = createAnswerNode(
    deps.answerLlmClient ?? (async () => 'Resposta analítica com base nos documentos disponíveis.'),
  );

  // 5. Montagem do fluxo do StateGraph
  const workflow = new StateGraph(GraphState)
    .addNode('retrieve', retrieveNode)
    .addNode('grade', gradeNode)
    .addNode('webSearch', webSearchNode)
    .addNode('answer', answerNode)
    .addEdge(START, 'retrieve')
    .addEdge('retrieve', 'grade')
    .addConditionalEdges('grade', (state: GraphStateType) => {
      if (state.sufficient) {
        return 'answer';
      }
      if (state.iterations >= MAX_ITERATIONS) {
        return 'answer';
      }
      return 'webSearch';
    })
    .addEdge('webSearch', 'retrieve')
    .addEdge('answer', END);

  // Registra o canal answer após a declaração do nó para permitir que a saída do nó
  // `answer` ({ answer: string }) seja propagada no stream e no invoke sem colidir com a validação interna de addNode.
  const answerChannel = Annotation<string>({
    reducer: (_prev, update) => update ?? _prev,
    default: () => '',
  });
  (workflow.channels as Record<string, unknown>)['answer'] = answerChannel;
  const workflowInternal = workflow as unknown as {
    _schemaDefinitions?: Map<unknown, Record<string, unknown>>;
    _outputDefinition?: Record<string, unknown>;
  };
  if (workflowInternal._schemaDefinitions && workflowInternal._outputDefinition) {
    const schemaDef =
      workflowInternal._schemaDefinitions.get(workflowInternal._outputDefinition) ?? {};
    workflowInternal._outputDefinition = { ...schemaDef, answer: answerChannel };
    workflowInternal._schemaDefinitions.set(
      workflowInternal._outputDefinition,
      workflowInternal._outputDefinition,
    );
  }

  return workflow.compile();
}

export type CompiledAgentGraph = ReturnType<typeof createAgentGraph>;
export type GetGraph<TGraph = CompiledAgentGraph> = () => TGraph | Promise<TGraph>;

let memoizedAgentGraph: CompiledAgentGraph | null = null;

/**
 * Constrói uma nova instância do grafo real conectando Postgres (Drizzle + pgvector),
 * SearchProvider (Serper/Google ou Demo) e Vertex AI (embeddings, grade e answer).
 */
export function createRealAgentGraph(): CompiledAgentGraph {
  const { db } = createDb();
  const embeddingClient = createRealEmbeddingClient();
  const searchSimilar = createSearchSimilar(db);
  const insertWebDocuments: InsertWebDocumentsFn = async (docs) => {
    await salvarDocumentosWeb(db, docs);
  };
  const searchProvider = criarSearchProvider();
  const fetchHtml = criarFetchHtml();
  const vertexLlm = createVertexLlmClient();

  return createAgentGraph({
    embeddingClient,
    searchSimilar,
    searchProvider,
    llmClient: vertexLlm,
    answerLlmClient: vertexLlm,
    insertWebDocuments,
    fetchHtml,
  });
}

/**
 * Retorna o grafo real memoizado por processo.
 * Constrói o grafo apenas na primeira chamada, nunca na inicialização do processo.
 */
export function getAgentGraph(
  factory: () => CompiledAgentGraph = createRealAgentGraph,
): CompiledAgentGraph {
  if (!memoizedAgentGraph) {
    memoizedAgentGraph = factory();
  }
  return memoizedAgentGraph;
}

export const getRealGraph = getAgentGraph;
export const getGraph = getAgentGraph;
export const obterGrafo = getAgentGraph;
export const criarGrafoReal = createRealAgentGraph;

/**
 * Limpa a instância memoizada do grafo (útil para testes unitários).
 */
export function resetAgentGraph(): void {
  memoizedAgentGraph = null;
}
