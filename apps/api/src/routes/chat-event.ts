export interface ResumoDocumento {
  id?: string;
  title: string;
  sourceUrl: string;
  ticker?: string;
  period?: string;
  sourceType?: string;
}

export interface RetrieveChatEvent {
  node: 'retrieve';
  documents: ResumoDocumento[];
}

export interface GradeChatEvent {
  node: 'grade';
  sufficient: boolean;
  missingAspects: string[];
  iterations: number;
}

export interface WebSearchChatEvent {
  node: 'webSearch';
}

export interface AnswerChatEvent {
  node: 'answer';
  answer: string;
}

export interface ErrorChatEvent {
  node: 'error';
  error: string;
}

export type ChatEvent =
  | RetrieveChatEvent
  | GradeChatEvent
  | WebSearchChatEvent
  | AnswerChatEvent
  | ErrorChatEvent;

/**
 * Traduz um chunk emitido pelo graph.stream() para um ou mais eventos tipados.
 * - retrieve: documentos resumidos
 * - grade: sufficient, missingAspects, iterations
 * - webSearch: só o nome (sem campos de estado novo)
 * - answer: texto final da resposta
 */
export function translateChunks(chunk: Record<string, any>): ChatEvent[] {
  const events: ChatEvent[] = [];

  if (!chunk || typeof chunk !== 'object') {
    return events;
  }

  if ('retrieve' in chunk) {
    const rawDocs = chunk.retrieve?.documents;
    const documents: ResumoDocumento[] = Array.isArray(rawDocs)
      ? rawDocs.map((d: any) => ({
          id: d.id,
          title: d.title ?? d.companyName ?? 'Documento',
          sourceUrl: d.sourceUrl ?? '',
          ...(d.ticker ? { ticker: d.ticker } : {}),
          ...(d.period ? { period: d.period } : {}),
          ...(d.sourceType ? { sourceType: d.sourceType } : {}),
        }))
      : [];

    events.push({
      node: 'retrieve',
      documents,
    });
  }

  if ('grade' in chunk) {
    const grade = chunk.grade;
    events.push({
      node: 'grade',
      sufficient: Boolean(grade?.sufficient),
      missingAspects: Array.isArray(grade?.missingAspects) ? grade.missingAspects : [],
      iterations: typeof grade?.iterations === 'number' ? grade.iterations : 1,
    });
  }

  if ('webSearch' in chunk) {
    events.push({
      node: 'webSearch',
    });
  }

  if ('answer' in chunk) {
    const answerData = chunk.answer;
    const answer =
      typeof answerData === 'string'
        ? answerData
        : (answerData?.answer ?? '');

    events.push({
      node: 'answer',
      answer,
    });
  }

  return events;
}

/**
 * Retorna o primeiro evento traduzido de um chunk, ou null caso o chunk não corresponda a nenhum nó conhecido.
 */
export function translateChunkToEvent(chunk: Record<string, any>): ChatEvent | null {
  const list = translateChunks(chunk);
  return list.length > 0 ? list[0] : null;
}

/**
 * Formata um ChatEvent como Server-Sent Events (SSE) com evento e dados JSON.
 */
export function formatSseEvent(event: ChatEvent): string {
  return `event: ${event.node}\ndata: ${JSON.stringify(event)}\n\n`;
}
