import { computed, Injectable, signal } from '@angular/core';
import type { ChatStreamEvent } from '../api/chat.service';

/**
 * Espelha `MAX_ITERATIONS` de `packages/agent/src/graph.ts`.
 * Declarado localmente para nunca importar `@hero/agent` (que carrega LangGraph,
 * Vertex AI e driver Postgres) no bundle do navegador.
 */
export const MAX_ITERATIONS = 2;

export type GraphNodeName = 'retrieve' | 'grade' | 'webSearch' | 'answer';
export type GraphStepStatus = 'running' | 'completed';

export interface GraphStep {
  node: GraphNodeName;
  name: GraphNodeName;
  status: GraphStepStatus;
  startedAt?: number;
  durationMs?: number;
}

/**
 * Prevê o próximo nó do grafo a partir do evento recém-concluído:
 * - Depois de `retrieve` vem sempre `grade`.
 * - Depois de `webSearch` vem sempre `retrieve`.
 * - Depois de `grade`: se `sufficient` for `true` ou se `iterations >= MAX_ITERATIONS`,
 *   vai para `answer`; caso contrário, vai para `webSearch`.
 * - Depois de `answer`, o fluxo termina (`null`).
 */
export function predictNextNode(
  event: ChatStreamEvent,
  completedGradeIterations?: number,
): GraphNodeName | null {
  switch (event.node) {
    case 'retrieve':
      return 'grade';

    case 'webSearch':
      return 'retrieve';

    case 'grade': {
      const iterations =
        typeof event.iterations === 'number'
          ? event.iterations
          : (completedGradeIterations ?? 1);
      if (event.sufficient || iterations >= MAX_ITERATIONS) {
        return 'answer';
      }
      return 'webSearch';
    }

    case 'answer':
      return null;
  }
}

@Injectable({ providedIn: 'root' })
export class GraphStore {
  private readonly _steps = signal<GraphStep[]>([]);

  readonly steps = this._steps.asReadonly();
  readonly currentStep = computed(() => this._steps().at(-1)?.node ?? null);

  /**
   * Inicia uma nova execução do pipeline marcando `retrieve` como a primeira etapa em execução.
   */
  start(now: number = Date.now()): void {
    this._steps.set([
      {
        node: 'retrieve',
        name: 'retrieve',
        status: 'running',
        startedAt: now,
      },
    ]);
  }

  /**
   * A cada evento do stream:
   * 1. Marca a última etapa da lista como concluída (calculando `durationMs`)
   *    ou adiciona como concluída caso a lista esteja vazia.
   * 2. Prevê a próxima etapa do grafo e a adiciona com `status: 'running'`.
   */
  onEvent(event: ChatStreamEvent, now: number = Date.now()): void {
    this._steps.update((current) => {
      const updated = [...current];

      if (updated.length > 0 && updated[updated.length - 1].node === event.node) {
        const last = updated[updated.length - 1];
        const durationMs =
          typeof last.startedAt === 'number' ? Math.max(0, now - last.startedAt) : 0;
        updated[updated.length - 1] = {
          ...last,
          status: 'completed',
          durationMs,
        };
      } else if (updated.length > 0 && updated[updated.length - 1].status === 'running') {
        const last = updated[updated.length - 1];
        const durationMs =
          typeof last.startedAt === 'number' ? Math.max(0, now - last.startedAt) : 0;
        updated[updated.length - 1] = {
          node: event.node,
          name: event.node,
          status: 'completed',
          startedAt: last.startedAt,
          durationMs,
        };
      } else {
        updated.push({
          node: event.node,
          name: event.node,
          status: 'completed',
          startedAt: now,
          durationMs: 0,
        });
      }

      const completedGrades = updated.filter(
        (step) => step.node === 'grade' && step.status === 'completed',
      ).length;

      const nextNode = predictNextNode(event, completedGrades);
      if (nextNode) {
        updated.push({
          node: nextNode,
          name: nextNode,
          status: 'running',
          startedAt: now,
        });
      }

      return updated;
    });
  }

  handleEvent(event: ChatStreamEvent, now?: number): void {
    this.onEvent(event, now);
  }

  applyEvent(event: ChatStreamEvent, now?: number): void {
    this.onEvent(event, now);
  }

  reset(): void {
    this._steps.set([]);
  }
}
