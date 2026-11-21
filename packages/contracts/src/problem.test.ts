import { describe, expect, it } from 'vitest';
import { problemDetailsSchema, PROBLEM_JSON_CONTENT_TYPE } from './problem.js';

describe('problemDetailsSchema (RFC 7807)', () => {
  it('valida um objeto Problem Details válido com type, title, status e detail', () => {
    const valid = {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Pergunta é obrigatória',
    };

    expect(problemDetailsSchema.parse(valid)).toEqual(valid);
    expect(PROBLEM_JSON_CONTENT_TYPE).toBe('application/problem+json');
  });

  it('rejeita payload com campos obrigatórios ausentes ou status não inteiro', () => {
    expect(() =>
      problemDetailsSchema.parse({
        type: 'about:blank',
        title: 'Bad Request',
        status: '400',
      }),
    ).toThrow();
  });
});
