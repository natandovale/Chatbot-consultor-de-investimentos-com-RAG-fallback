import { TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat';

describe('ChatComponent (casca estática)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatComponent],
    }).compileComponents();
  });

  it('renderiza o header com o wordmark Investments e subtítulo Consultor de Investimentos', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const header = compiled.querySelector('header.chat-header');
    expect(header).toBeTruthy();
    expect(header?.textContent).toContain('Investments');
    expect(header?.textContent).toContain('Consultor de Investimentos');
  });

  it('renderiza a faixa permanente de disclaimer regulatório', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const disclaimer = compiled.querySelector('.disclaimer-banner');
    expect(disclaimer).toBeTruthy();
    expect(disclaimer?.textContent).toMatch(/informativo/i);
    expect(disclaimer?.textContent).toMatch(/não realiza recomendações/i);
  });

  it('renderiza a área de mensagens vazia e o composer com input e botão Enviar', () => {
    const fixture = TestBed.createComponent(ChatComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const messagesArea = compiled.querySelector('.messages-area');
    expect(messagesArea).toBeTruthy();
    expect(messagesArea?.querySelector('.messages-empty')).toBeTruthy();

    const input = compiled.querySelector('input#msg') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.placeholder).toContain('Pergunte sobre seus investimentos');

    const sendButton = compiled.querySelector('button.cs-send') as HTMLButtonElement | null;
    expect(sendButton).toBeTruthy();
    expect(sendButton?.getAttribute('aria-label')).toBe('Enviar mensagem');
    expect(sendButton?.textContent).toContain('Enviar');
  });
});
