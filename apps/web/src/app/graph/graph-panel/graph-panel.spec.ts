import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { GraphStore } from '../../state/graph-store';
import { GraphPanelComponent } from './graph-panel';

describe('GraphPanelComponent', () => {
  let store: GraphStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphPanelComponent],
    }).compileComponents();

    store = TestBed.inject(GraphStore);
    store.reset();
  });

  it('renderiza as etapas de GraphStore na timeline vertical com check quando concluída, spinner enquanto running, rótulo, descrição e duração formatada', () => {
    store.start(1000);
    store.onEvent({ node: 'retrieve', documents: [] }, 1250);
    // Agora: retrieve (completed, 250ms) e grade (running)

    const fixture = TestBed.createComponent(GraphPanelComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const steps = compiled.querySelectorAll('.graph-panel__step');
    expect(steps.length).toBe(2);

    // Etapa 1: Retrieve (concluída com check e duração 250ms)
    const step1 = steps[0];
    expect(step1.classList.contains('graph-panel__step--completed')).toBe(true);
    expect(step1.querySelector('.graph-panel__check')).toBeTruthy();
    expect(step1.querySelector('.graph-panel__label')?.textContent).toContain('Retrieve');
    expect(step1.querySelector('.graph-panel__description')?.textContent).toContain('Busca vetorial');
    expect(step1.querySelector('.graph-panel__duration')?.textContent).toBe('250ms');

    // Etapa 2: Grade (em execução com spinner girando)
    const step2 = steps[1];
    expect(step2.classList.contains('graph-panel__step--running')).toBe(true);
    expect(step2.querySelector('.graph-panel__spinner')).toBeTruthy();
    expect(step2.querySelector('.graph-panel__label')?.textContent).toContain('Grade');
    expect(step2.querySelector('.graph-panel__status--running')?.textContent).toContain('Em execução');

    // Sem webSearch ainda, o banner de fallback não aparece
    expect(compiled.querySelector('.graph-panel__banner')).toBeNull();
  });

  it('mostra o banner explicando que o contexto local foi insuficiente quando alguma etapa for webSearch', () => {
    store.start(1000);
    store.onEvent({ node: 'retrieve', documents: [] }, 1100);
    store.onEvent(
      {
        node: 'grade',
        sufficient: false,
        missingAspects: ['notícia recente'],
        iterations: 1,
      },
      1300,
    );
    // Agora a próxima etapa prevista na lista é webSearch

    const fixture = TestBed.createComponent(GraphPanelComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const banner = compiled.querySelector('.graph-panel__banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toMatch(/contexto local.*insuficiente/i);
  });
});
