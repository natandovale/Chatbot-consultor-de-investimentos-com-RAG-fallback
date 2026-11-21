import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService, type ChatStreamEvent } from './chat.service';

function createSseReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ChatService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('faz POST /api/chat, lê o ReadableStream em chunks fragmentados e produz os eventos retrieve, grade, webSearch e answer', async () => {
    const sseChunks = [
      'event: retrieve\ndata: {"node":"retrieve","documents":[{"id":"doc-1","title":"Vale S.A. (VALE3)","sourceUrl":"https://cvm.gov.br/doc1","ticker":"VALE3","period":"3T25"}]}\n\n',
      // Simula um frame quebrado no meio entre dois chunks do stream
      'event: grade\ndata: {"node":"grade","sufficient":false,',
      '"missingAspects":["preço do minério"],"iterations":1}\n\nevent: webSearch\ndata: {"node":"webSearch"}\n\n',
      'event: answer\ndata: {"node":"answer","answer":"A receita líquida da Vale no 3T25 foi de R$ 52 bi."}\n\n',
    ];

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(createSseReadableStream(sseChunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const events: ChatStreamEvent[] = [];
    for await (const event of service.ask('Qual a receita da Vale no 3T25?')) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ question: 'Qual a receita da Vale no 3T25?' });

    expect(events).toEqual([
      {
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
      },
      {
        node: 'grade',
        sufficient: false,
        missingAspects: ['preço do minério'],
        iterations: 1,
      },
      {
        node: 'webSearch',
      },
      {
        node: 'answer',
        answer: 'A receita líquida da Vale no 3T25 foi de R$ 52 bi.',
      },
    ]);
  });

  it('lança uma exceção com a mensagem quando recebe um evento error no stream', async () => {
    const sseChunks = [
      'event: retrieve\ndata: {"node":"retrieve","documents":[]}\n\n',
      'event: error\ndata: {"node":"error","error":"Falha na consulta ao Vertex AI"}\n\n',
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(createSseReadableStream(sseChunks), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        }),
      ),
    );

    const received: ChatStreamEvent[] = [];
    const consume = async () => {
      for await (const event of service.ask('Pergunta que falha no meio')) {
        received.push(event);
      }
    };

    await expect(consume()).rejects.toThrow('Falha na consulta ao Vertex AI');
    expect(received).toHaveLength(1);
    expect(received[0].node).toBe('retrieve');
  });
});
