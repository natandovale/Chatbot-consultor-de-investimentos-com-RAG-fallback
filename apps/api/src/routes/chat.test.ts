import { describe, expect, it, vi } from 'vitest';
import { problemDetailsSchema } from '@hero/contracts';
import { build } from '../app.js';
import type { GraphLike } from './chat.js';

describe('POST /api/chat', () => {
  it('delega ZodError ao error handler central e retorna 400 (RFC 7807) sem chamar getChatGraph se question estiver ausente ou vazio', async () => {
    const getChatGraph = vi.fn();
    const app = build({ getChatGraph });

    const semCorpo = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {},
    });
    expect(semCorpo.statusCode).toBe(400);
    expect(semCorpo.headers['content-type']).toContain('application/problem+json');
    const problemSemCorpo = problemDetailsSchema.parse(semCorpo.json());
    expect(problemSemCorpo.status).toBe(400);
    expect(problemSemCorpo.detail).toContain('Pergunta é obrigatória');

    const vazio = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: '   ' },
    });
    expect(vazio.statusCode).toBe(400);
    expect(vazio.headers['content-type']).toContain('application/problem+json');
    const problemVazio = problemDetailsSchema.parse(vazio.json());
    expect(problemVazio.status).toBe(400);
    expect(problemVazio.detail).toContain('Pergunta é obrigatória');

    expect(getChatGraph).not.toHaveBeenCalled();
  });

  it('delega erro ao error handler central (500 RFC 7807 sem vazar detalhe interno) se getChatGraph não estiver configurado', async () => {
    const app = build();

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Qual foi o lucro da Vale?' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const problem = problemDetailsSchema.parse(response.json());
    expect(problem.status).toBe(500);
    expect(problem.title).toBe('Internal Server Error');
  });

  it('resolve getChatGraph sob demanda com await getGraph() dentro do handler e escreve headers SSE manuais', async () => {
    const fakeGraph: GraphLike = {
      async *stream() {
        yield { answer: { answer: 'ok' } };
      },
    };
    const getChatGraph = vi.fn().mockResolvedValue(fakeGraph);

    const app = build({ getChatGraph });
    expect(getChatGraph).not.toHaveBeenCalled();

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Qual foi o lucro da Vale?' },
    });

    expect(getChatGraph).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache, no-transform');
    expect(response.headers['connection']).toBe('keep-alive');
  });

  it('transmite a execução do grafo como Server-Sent Events com um evento tipado por nó concluído', async () => {
    const fakeGraph: GraphLike = {
      async *stream() {
        // 1. retrieve
        yield {
          retrieve: {
            documents: [
              {
                id: 'doc-1',
                title: 'Vale S.A. (VALE3)',
                ticker: 'VALE3',
                period: '3T25',
                sourceUrl: 'https://cvm.gov.br/doc1',
                sourceType: 'corpus',
                content: 'Texto muito longo...',
              },
            ],
          },
        };

        // 2. grade (insuficiente na 1a rodada)
        yield {
          grade: {
            sufficient: false,
            missingAspects: ['motivo da queda'],
            iterations: 1,
          },
        };

        // 3. webSearch (sem campo de estado novo)
        yield {
          webSearch: {},
        };

        // 4. answer (texto final)
        yield {
          answer: {
            answer: 'No 3T25 a Vale lucrou R$ 14 bi.\n\nFontes:\n- VALE3 3T25',
          },
        };
      },
    };

    const app = build({ getChatGraph: () => fakeGraph });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Qual o lucro da Vale no 3T25 e por que caiu?' },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.payload;

    // Verifica que cada nó foi emitido com seu formato SSE correspondente
    expect(payload).toContain('event: retrieve');
    expect(payload).toContain('"node":"retrieve"');
    expect(payload).toContain('"title":"Vale S.A. (VALE3)"');
    expect(payload).toContain('"ticker":"VALE3"');
    expect(payload).toContain('"period":"3T25"');
    expect(payload).toContain('"sourceUrl":"https://cvm.gov.br/doc1"');
    // Confirma que é resumido (não vazou o content gigante)
    expect(payload).not.toContain('Texto muito longo...');

    expect(payload).toContain('event: grade');
    expect(payload).toContain('"node":"grade"');
    expect(payload).toContain('"sufficient":false');
    expect(payload).toContain('"missingAspects":["motivo da queda"]');
    expect(payload).toContain('"iterations":1');

    expect(payload).toContain('event: webSearch');
    expect(payload).toContain('{"node":"webSearch"}');

    expect(payload).toContain('event: answer');
    expect(payload).toContain('"node":"answer"');
    expect(payload).toContain('No 3T25 a Vale lucrou R$ 14 bi');
  });

  it('escreve evento SSE de erro e encerra a conexão se o grafo lançar erro no meio do stream sem derrubar o processo', async () => {
    const fakeGraphWithCrash: GraphLike = {
      async *stream() {
        yield {
          retrieve: {
            documents: [{ title: 'Doc 1', sourceUrl: 'https://exemplo.com' }],
          },
        };
        // Simula falha catastrófica no meio do stream
        throw new Error('Falha simulada na API do LLM/Banco durante o stream');
      },
    };

    const app = build({ getChatGraph: () => fakeGraphWithCrash });

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { question: 'Pergunta que causará erro' },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.payload;
    // O primeiro nó foi emitido antes do erro
    expect(payload).toContain('event: retrieve');

    // O erro foi capturado e emitido como SSE de erro
    expect(payload).toContain('event: error');
    expect(payload).toContain('"node":"error"');
    expect(payload).toContain('Falha simulada na API do LLM/Banco durante o stream');
  });
});
