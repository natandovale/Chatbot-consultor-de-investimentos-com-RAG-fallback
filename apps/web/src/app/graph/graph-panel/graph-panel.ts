import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  GraphStore,
  type GraphNodeName,
  type GraphStep,
} from '../../state/graph-store';

export interface StepMeta {
  label: string;
  description: string;
}

export const GRAPH_NODE_META: Record<GraphNodeName, StepMeta> = {
  retrieve: {
    label: 'Retrieve',
    description: 'Busca vetorial no corpus CVM e documentos enriquecidos',
  },
  grade: {
    label: 'Grade',
    description: 'Avalia se o contexto recuperado responde à pergunta',
  },
  webSearch: {
    label: 'Web Search',
    description: 'Busca complementar na web para cobrir aspectos faltantes',
  },
  answer: {
    label: 'Answer',
    description: 'Sintetiza a resposta citada aplicando o guardrail regulatório',
  },
};

export function formatStepDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number' || Number.isNaN(durationMs)) {
    return '0ms';
  }
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(durationMs)}ms`;
}

@Component({
  selector: 'app-graph-panel',
  imports: [],
  templateUrl: './graph-panel.html',
  styleUrl: './graph-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraphPanelComponent {
  protected readonly store = inject(GraphStore);

  protected readonly hasWebSearch = computed(() =>
    this.store.steps().some((step) => step.node === 'webSearch'),
  );

  protected getMeta(step: GraphStep): StepMeta {
    return GRAPH_NODE_META[step.node];
  }

  protected formatDuration(step: GraphStep): string {
    return formatStepDuration(step.durationMs);
  }
}

export { GraphPanelComponent as GraphPanel };
