import { describe, expect, it } from 'vitest';
import { chatRequestSchema } from './chat.js';

describe('chatRequestSchema', () => {
  it('valida com sucesso uma pergunta válida', () => {
    const valid = { question: 'Qual foi o lucro da Vale no 3T25?' };
    const result = chatRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.question).toBe('Qual foi o lucro da Vale no 3T25?');
    }
  });

  it('rejeita quando question está vazio ou ausente', () => {
    expect(chatRequestSchema.safeParse({}).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: '' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: '   ' }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 123 }).success).toBe(false);
  });
});
