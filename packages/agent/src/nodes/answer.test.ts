import { describe, expect, it, vi } from 'vitest';
import { createAnswerNode } from './answer.js';
import { ANSWER_SYSTEM_PROMPT, formatAnswerPrompt } from '../prompts/answer.js';
import { GUARDRAIL_DISCLAIMER } from '../answer/format-resposta.js';
import type { DocumentoSimilar } from '../db/retrieve-similar.js';

describe('answer node', () => {
  const mockCvmDoc1: DocumentoSimilar = {
    id: 'cvm-1',
    sourceType: 'corpus',
    title: 'Vale S.A.',
    ticker: 'VALE3',
    period: '3T25',
    periodEnd: '2025-09-30',
    paragraph: 'Lucro líquido de R$ 14,2 bilhões no 3T25.',
    content: 'Lucro líquido de R$ 14,2 bilhões no 3T25.',
    sourceUrl: 'https://cvm.gov.br/doc/vale3-3t25',
    fetchedAt: new Date('2025-10-01'),
    distance: 0.12,
  };

  const mockCvmDocDuplicateUrl: DocumentoSimilar = {
    id: 'cvm-2',
    sourceType: 'corpus',
    title: 'Vale S.A. Parte 2',
    ticker: 'VALE3',
    period: '3T25',
    periodEnd: '2025-09-30',
    paragraph: 'Receita líquida foi de R$ 52 bilhões.',
    content: 'Receita líquida foi de R$ 52 bilhões.',
    sourceUrl: 'https://cvm.gov.br/doc/vale3-3t25', // Mesma URL do doc 1 para testar deduplicação
    fetchedAt: new Date('2025-10-01'),
    distance: 0.15,
  };

  const mockWebDoc: DocumentoSimilar = {
    id: 'web-1',
    sourceType: 'web',
    title: 'Minério de ferro sobe 3% na China',
    paragraph: 'A cotação do minério de ferro avançou em Dalian.',
    content: 'A cotação do minério de ferro avançou em Dalian.',
    sourceUrl: 'https://noticias.com/minerio-alta',
    fetchedAt: new Date('2025-10-02'),
    distance: 0.22,
  };

  it('deve gerar resposta normal com citação anexada e deduplicada por sourceUrl', async () => {
    const fakeLlmClient = vi
      .fn()
      .mockResolvedValue(
        'No 3T25, a Vale registrou um lucro líquido de R$ 14,2 bilhões, impulsionada pelo minério de ferro.',
      );

    const answerNode = createAnswerNode(fakeLlmClient);

    const result = await answerNode({
      question: 'Qual foi o resultado da Vale no 3T25?',
      documents: [mockCvmDoc1, mockCvmDocDuplicateUrl, mockWebDoc],
      sufficient: true,
    });

    // Verifica corpo da resposta
    expect(result.answer).toContain(
      'No 3T25, a Vale registrou um lucro líquido de R$ 14,2 bilhões, impulsionada pelo minério de ferro.',
    );

    // Verifica que o bloco de fontes foi anexado
    expect(result.answer).toContain('Fontes:');

    // CVM doc: ticker + período + data-base
    expect(result.answer).toContain(
      'VALE3 3T25 (data-base: 2025-09-30) - https://cvm.gov.br/doc/vale3-3t25',
    );

    // Web doc: título
    expect(result.answer).toContain(
      'Minério de ferro sobe 3% na China - https://noticias.com/minerio-alta',
    );

    // Deduplicação: a URL da CVM aparece apenas uma vez no bloco de fontes
    const matchesCvmUrl = result.answer.match(/https:\/\/cvm\.gov\.br\/doc\/vale3-3t25/g);
    expect(matchesCvmUrl?.length).toBe(1);
  });

  it('deve filtrar a resposta quando o LLM tenta recomendar, substituindo por guardrail e mantendo as citações', async () => {
    const fakeLlmRecomendador = vi
      .fn()
      .mockResolvedValue(
        'Com base nos excelentes números, recomendo comprar VALE3 agora pois vale a pena comprar.',
      );

    const answerNode = createAnswerNode(fakeLlmRecomendador);

    const result = await answerNode({
      question: 'Devo comprar ações da Vale?',
      documents: [mockCvmDoc1, mockWebDoc],
      sufficient: true,
    });

    // O texto recomendatório original NÃO deve estar presente
    expect(result.answer).not.toContain('recomendo comprar');
    expect(result.answer).not.toContain('vale a pena comprar');

    // O aviso fixo de guardrail deve substituir a resposta
    expect(result.answer).toContain(GUARDRAIL_DISCLAIMER);

    // As citações continuam presentes normalmente
    expect(result.answer).toContain('Fontes:');
    expect(result.answer).toContain(
      'VALE3 3T25 (data-base: 2025-09-30) - https://cvm.gov.br/doc/vale3-3t25',
    );
    expect(result.answer).toContain(
      'Minério de ferro sobe 3% na China - https://noticias.com/minerio-alta',
    );
  });

  it('deve confirmar que o prompt em si já instrui expressamente o modelo a nunca recomendar', () => {
    // 1. Verifica no system prompt
    expect(ANSWER_SYSTEM_PROMPT).toMatch(/NUNCA RECOMENDAR/i);
    expect(ANSWER_SYSTEM_PROMPT).toMatch(
      /PROIBIDO de fazer qualquer recomendação de investimento/i,
    );
    expect(ANSWER_SYSTEM_PROMPT).toMatch(/(sem|nunca)\s+invent/i);

    // 2. Verifica no prompt formatado para a chamada
    const formattedPrompt = formatAnswerPrompt({
      question: 'Vale a pena comprar PETR4 hoje?',
      documents: [mockCvmDoc1],
      sufficient: false,
    });

    expect(formattedPrompt).toMatch(/recomendações de investimento/i);
    expect(formattedPrompt).toContain('PERGUNTA DO USUÁRIO:');
    expect(formattedPrompt).toContain('CONTEXTO RECUPERADO:');
    expect(formattedPrompt).toMatch(/INCOMPLETO/i);
  });
});
