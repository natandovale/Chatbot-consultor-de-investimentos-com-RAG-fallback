import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GraphStore, MAX_ITERATIONS } from './graph-store';

describe('GraphStore', () => {
  let store: GraphStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(GraphStore);
  });

  it('marca a etapa atual como concluída e prevê a próxima no caminho direto (retrieve -> grade[sufficient=true] -> answer)', () => {
    store.start(1000);
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'running' },
    ]);

    // 1. Chega retrieve -> marca retrieve como completed e prevê grade como running
    store.onEvent({ node: 'retrieve', documents: [] }, 1120);
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'completed', durationMs: 120 },
      { node: 'grade', name: 'grade', status: 'running' },
    ]);

    // 2. Chega grade suficiente -> marca grade como completed e prevê answer como running
    store.onEvent(
      {
        node: 'grade',
        sufficient: true,
        missingAspects: [],
        iterations: 1,
      },
      1450,
    );
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'completed', durationMs: 120 },
      { node: 'grade', name: 'grade', status: 'completed', durationMs: 330 },
      { node: 'answer', name: 'answer', status: 'running' },
    ]);

    // 3. Chega answer -> marca answer como completed e não prevê mais etapas
    store.onEvent({ node: 'answer', answer: 'Resposta final' }, 2100);
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'completed', durationMs: 120 },
      { node: 'grade', name: 'grade', status: 'completed', durationMs: 330 },
      { node: 'answer', name: 'answer', status: 'completed', durationMs: 650 },
    ]);
  });

  it('prevê webSearch quando grade é insuficiente na 1ª iteração, volta para retrieve após webSearch e vai para answer ao atingir MAX_ITERATIONS', () => {
    expect(MAX_ITERATIONS).toBe(2);

    // 1ª rodada: retrieve -> grade (insuficiente, iteração 1) -> prevê webSearch
    store.onEvent({ node: 'retrieve', documents: [] });
    store.onEvent({
      node: 'grade',
      sufficient: false,
      missingAspects: ['notícia recente'],
      iterations: 1,
    });
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'completed' },
      { node: 'grade', name: 'grade', status: 'completed' },
      { node: 'webSearch', name: 'webSearch', status: 'running' },
    ]);

    // webSearch conclui -> prevê retrieve
    store.onEvent({ node: 'webSearch' });
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'completed' },
      { node: 'grade', name: 'grade', status: 'completed' },
      { node: 'webSearch', name: 'webSearch', status: 'completed' },
      { node: 'retrieve', name: 'retrieve', status: 'running' },
    ]);

    // 2ª rodada: retrieve conclui -> prevê grade
    store.onEvent({ node: 'retrieve', documents: [] });
    expect(store.steps().at(-1)).toMatchObject({
      node: 'grade',
      name: 'grade',
      status: 'running',
    });

    // 2ª rodada: grade ainda insuficiente, mas atingiu MAX_ITERATIONS (2) -> vai direto para answer
    store.onEvent({
      node: 'grade',
      sufficient: false,
      missingAspects: ['ainda faltando'],
      iterations: MAX_ITERATIONS,
    });
    expect(store.steps().at(-1)).toMatchObject({
      node: 'answer',
      name: 'answer',
      status: 'running',
    });

    // answer conclui
    store.onEvent({ node: 'answer', answer: 'Resposta com contexto parcial' });
    expect(store.steps()).toMatchObject([
      { node: 'retrieve', name: 'retrieve', status: 'completed' },
      { node: 'grade', name: 'grade', status: 'completed' },
      { node: 'webSearch', name: 'webSearch', status: 'completed' },
      { node: 'retrieve', name: 'retrieve', status: 'completed' },
      { node: 'grade', name: 'grade', status: 'completed' },
      { node: 'answer', name: 'answer', status: 'completed' },
    ]);
  });
});
