import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService, type ChatStreamEvent } from '../api/chat.service';
import { ChatStore, FIXED_ERROR_MESSAGE, tokenize, WORD_REVEAL_INTERVAL_MS } from './chat-store';

describe('tokenize', () => {
  it('separa texto em palavras ignorando espaços extras', () => {
    expect(tokenize('A Vale lucrou R$ 52 bi.')).toEqual(['A', 'Vale', 'lucrou', 'R$', '52', 'bi.']);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('ChatStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('adiciona mensagem do usuário e placeholder do assistente, chama ChatService.ask e revela a resposta palavra por palavra a cada 70ms', async () => {
    const fakeChatService: Pick<ChatService, 'ask'> = {
      async *ask(): AsyncGenerator<ChatStreamEvent, void, unknown> {
        yield {
          node: 'retrieve',
          documents: [
            {
              id: 'doc-1',
              title: 'Vale S.A. (VALE3)',
              sourceUrl: 'https://cvm.gov.br/doc1',
              ticker: 'VALE3',
              period: '3T25',
            },
          ],
        };
        yield {
          node: 'grade',
          sufficient: true,
          missingAspects: [],
          iterations: 1,
        };
        yield {
          node: 'answer',
          answer: 'Receita subiu forte',
        };
      },
    };

    const askSpy = vi.spyOn(fakeChatService, 'ask');

    TestBed.configureTestingModule({
      providers: [{ provide: ChatService, useValue: fakeChatService }],
    });

    const store = TestBed.inject(ChatStore);

    await store.send('Qual a receita da Vale?');

    expect(askSpy).toHaveBeenCalledWith('Qual a receita da Vale?');
    expect(store.messages()).toHaveLength(2);
    expect(store.messages()[0].role).toBe('user');
    expect(store.messages()[0].content).toBe('Qual a receita da Vale?');

    // Placeholder do assistente antes do primeiro tick de 70ms
    expect(store.messages()[1].role).toBe('assistant');
    expect(store.messages()[1].content).toBe('');
    expect(store.messages()[1].isStreaming).toBe(true);

    // Tick 1 (70ms) -> 1ª palavra
    vi.advanceTimersByTime(WORD_REVEAL_INTERVAL_MS);
    expect(store.messages()[1].content).toBe('Receita');
    expect(store.messages()[1].isStreaming).toBe(true);

    // Tick 2 (140ms) -> 2ª palavra
    vi.advanceTimersByTime(WORD_REVEAL_INTERVAL_MS);
    expect(store.messages()[1].content).toBe('Receita subiu');
    expect(store.messages()[1].isStreaming).toBe(true);

    // Tick 3 (210ms) -> 3ª palavra (concluído)
    vi.advanceTimersByTime(WORD_REVEAL_INTERVAL_MS);
    expect(store.messages()[1].content).toBe('Receita subiu forte');
    expect(store.messages()[1].isStreaming).toBe(false);
    expect(store.isStreaming()).toBe(false);
  });

  it('mostra uma mensagem de erro fixa, sem streaming, se ChatService.ask falhar', async () => {
    const failingChatService: Pick<ChatService, 'ask'> = {
      // eslint-disable-next-line require-yield
      async *ask(): AsyncGenerator<ChatStreamEvent, void, unknown> {
        throw new Error('Erro interno do servidor');
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ChatService, useValue: failingChatService }],
    });

    const store = TestBed.inject(ChatStore);

    await store.send('Pergunta com falha');

    expect(store.messages()).toHaveLength(2);
    const assistantMsg = store.messages()[1];
    // Mensagem fixa exibida imediatamente, sem depender de timers de 70ms
    expect(assistantMsg.content).toBe(FIXED_ERROR_MESSAGE);
    expect(assistantMsg.isStreaming).toBe(false);
    expect(assistantMsg.isError).toBe(true);
    expect(store.isStreaming()).toBe(false);
  });

  it('limpa qualquer timer pendente ao destruir o store', async () => {
    const fakeChatService: Pick<ChatService, 'ask'> = {
      async *ask(): AsyncGenerator<ChatStreamEvent, void, unknown> {
        yield {
          node: 'answer',
          answer: 'Um dois três quatro cinco',
        };
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ChatService, useValue: fakeChatService }],
    });

    const store = TestBed.inject(ChatStore);
    await store.send('Teste de destroy');

    // Avança 1 palavra (70ms)
    vi.advanceTimersByTime(WORD_REVEAL_INTERVAL_MS);
    expect(store.messages()[1].content).toBe('Um');

    // Destrói o ambiente / store
    TestBed.resetTestingModule();

    // Avança mais 500ms: o timer foi limpo, nenhuma nova palavra deve ser adicionada
    vi.advanceTimersByTime(500);
    expect(store.messages()[1].content).toBe('Um');
  });
});
