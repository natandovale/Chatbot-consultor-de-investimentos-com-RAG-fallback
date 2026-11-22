import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService, type ChatStreamEvent } from '../api/chat.service';
import { ChatStore, WORD_REVEAL_INTERVAL_MS } from '../state/chat-store';
import { Chat } from './chat';

describe('Chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renderiza o header com wordmark, faixa de disclaimer e botão .chat__send inicialmente desabilitado enquanto textarea estiver vazia', async () => {
    await TestBed.configureTestingModule({
      imports: [Chat],
    }).compileComponents();

    const fixture = TestBed.createComponent(Chat);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('header.chat-header')?.textContent).toContain('Investments');
    expect(compiled.querySelector('.disclaimer-banner')?.textContent).toMatch(/informativo/i);

    const textarea = compiled.querySelector('textarea#msg') as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();

    const sendButton = compiled.querySelector('button.chat__send') as HTMLButtonElement | null;
    expect(sendButton).toBeTruthy();
    expect(sendButton?.disabled).toBe(true);
  });

  it('envia a pergunta com Enter (sem Shift), desabilita o botão enquanto a resposta está em andamento e permite quebra de linha com Shift+Enter', async () => {
    const fakeChatService: Pick<ChatService, 'ask'> = {
      async *ask(): AsyncGenerator<ChatStreamEvent, void, unknown> {
        yield {
          node: 'answer',
          answer: 'Lucro cresceu',
        };
      },
    };

    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [{ provide: ChatService, useValue: fakeChatService }],
    }).compileComponents();

    const fixture = TestBed.createComponent(Chat);
    const store = TestBed.inject(ChatStore);
    const sendSpy = vi.spyOn(store, 'send');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const textarea = compiled.querySelector('textarea') as HTMLTextAreaElement;
    const sendButton = compiled.querySelector('button.chat__send') as HTMLButtonElement;

    // Digita texto na textarea
    textarea.value = 'Qual o lucro da Vale?';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(sendButton.disabled).toBe(false);

    // Shift+Enter NÃO envia
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(sendSpy).not.toHaveBeenCalled();

    // Enter sem Shift envia e limpa a textarea
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, cancelable: true }),
    );
    await Promise.resolve();
    fixture.detectChanges();

    expect(sendSpy).toHaveBeenCalledWith('Qual o lucro da Vale?');
    expect(textarea.value).toBe('');
    // Enquanto o streaming palavra por palavra não terminou, mesmo digitando novo texto o botão continua desabilitado
    textarea.value = 'Nova pergunta';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(sendButton.disabled).toBe(true);

    // Conclui os 2 ticks de 70ms ("Lucro", "cresceu")
    await vi.advanceTimersByTimeAsync(WORD_REVEAL_INTERVAL_MS * 2);
    fixture.detectChanges();
    expect(sendButton.disabled).toBe(false);
  });

  it('renderiza store.messages() em .chat__messages separando o corpo e a lista de citações (link + data-base) via parseAnswer', async () => {
    const fakeChatService: Pick<ChatService, 'ask'> = {
      async *ask(): AsyncGenerator<ChatStreamEvent, void, unknown> {
        yield {
          node: 'answer',
          answer: [
            'A Vale lucrou R$ 14 bi.',
            '',
            'Fontes:',
            '- VALE3 · 3T25 (data-base 2025-09-30) — https://dados.cvm.gov.br/itr/vale3',
          ].join('\n'),
        };
      },
    };

    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [{ provide: ChatService, useValue: fakeChatService }],
    }).compileComponents();

    const fixture = TestBed.createComponent(Chat);
    const store = TestBed.inject(ChatStore);
    fixture.detectChanges();

    await store.send('Qual o lucro da Vale no 3T25?');
    // Avança o timer para revelar todas as palavras da resposta
    vi.advanceTimersByTime(WORD_REVEAL_INTERVAL_MS * 20);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const messagesContainer = compiled.querySelector('.chat__messages');
    expect(messagesContainer).toBeTruthy();

    const userBubble = messagesContainer?.querySelector('.chat__message--user');
    expect(userBubble?.textContent).toContain('Qual o lucro da Vale no 3T25?');

    const assistantMsg = messagesContainer?.querySelector('.chat__message--assistant');
    expect(assistantMsg?.querySelector('.chat__body')?.textContent).toBe('A Vale lucrou R$ 14 bi.');

    const citationLink = assistantMsg?.querySelector(
      'a.chat__citation',
    ) as HTMLAnchorElement | null;
    expect(citationLink).toBeTruthy();
    expect(citationLink?.href).toContain('https://dados.cvm.gov.br/itr/vale3');
    expect(citationLink?.textContent).toContain('3T25 (data-base 2025-09-30)');
    expect(citationLink?.textContent).toContain('Base local (CVM)');

    // Ao clicar na citação, abre o painel de detalhe da fonte com data-base, origem e link original
    citationLink?.click();
    fixture.detectChanges();

    const sourcePanel = compiled.querySelector('.chat__source-panel');
    expect(sourcePanel).toBeTruthy();
    expect(sourcePanel?.querySelector('.source-panel__period')?.textContent).toContain(
      '2025-09-30',
    );
    expect(sourcePanel?.querySelector('.source-panel__origin')?.textContent).toContain(
      'Base local (CVM)',
    );
    const sourceLink = sourcePanel?.querySelector(
      'a.source-panel__link',
    ) as HTMLAnchorElement | null;
    expect(sourceLink?.href).toContain('https://dados.cvm.gov.br/itr/vale3');
  });
});
