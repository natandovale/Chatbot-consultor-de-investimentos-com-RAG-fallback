import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CircuitoAbertoError } from '@hero/agent';
import { problemDetailsSchema } from '@hero/contracts';
import { build } from './app.js';

describe('GET /api/health', () => {
  it('responde ok quando o banco está saudável', async () => {
    const app = build({ checkDatabase: async () => true });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('responde degraded (mas HTTP 200) quando o banco falha — falha de banco não derruba o serviço', async () => {
    const app = build({ checkDatabase: async () => false });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'degraded', database: 'error' });
  });
});

describe('Central Error Handler (RFC 7807 - application/problem+json)', () => {
  it('mapeia ZodError para 400 com application/problem+json validado pelo schema de @hero/contracts', async () => {
    const app = build();
    app.get('/api/test-zod', async () => {
      const schema = z.object({ ticker: z.string({ message: 'Ticker inválido' }).min(4) });
      return schema.parse({});
    });

    const response = await app.inject({ method: 'GET', url: '/api/test-zod' });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');

    const body = problemDetailsSchema.parse(response.json());
    expect(body.status).toBe(400);
    expect(body.title).toBe('Bad Request');
    expect(body.detail).toContain('Ticker inválido');
  });

  it('mapeia CircuitoAbertoError de @hero/agent para 503 com application/problem+json', async () => {
    const app = build();
    app.get('/api/test-circuit', async () => {
      throw new CircuitoAbertoError('Circuito aberto para o Serper (25s restantes).');
    });

    const response = await app.inject({ method: 'GET', url: '/api/test-circuit' });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');

    const body = problemDetailsSchema.parse(response.json());
    expect(body.status).toBe(503);
    expect(body.title).toBe('Service Unavailable');
    expect(body.detail).toContain('Circuito aberto para o Serper');
  });

  it('mapeia qualquer outro erro para 500 genérico sem vazar mensagem interna nem stack trace', async () => {
    const app = build({
      checkDatabase: async () => {
        throw new Error('FATAL: password authentication failed for user "postgres_secret" at 10.0.0.12:5432');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');

    const rawPayload = response.payload;
    expect(rawPayload).not.toContain('postgres_secret');
    expect(rawPayload).not.toContain('10.0.0.12');
    expect(rawPayload).not.toContain('stack');

    const body = problemDetailsSchema.parse(response.json());
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Ocorreu um erro interno inesperado.',
    });
  });
});
