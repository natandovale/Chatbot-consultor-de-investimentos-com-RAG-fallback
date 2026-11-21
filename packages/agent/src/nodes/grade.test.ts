import { describe, expect, it, vi } from 'vitest';
import { createGradeNode, gradeOutputSchema } from './grade.js';
import { GRADE_SYSTEM_PROMPT } from '../prompts/grade.js';
import type { Documento } from '../db/retrieve-similar.js';

describe('createGradeNode', () => {
  const fakeDoc: Documento = {
    id: 'doc-1',
    ticker: 'VALE',
    companyName: 'Vale S.A.',
    setor: 'Mineração',
    period: '3T25',
    periodEnd: '2025-09-30',
    receitaLiquida: 50000000000,
    lucroBruto: 20000000000,
    lucroLiquido: 12000000000,
    ativoTotal: 200000000000,
    patrimonioLiquido: 100000000000,
    caixaOperacional: 15000000000,
    receitaMesmoTrimestreAnoAnterior: 45000000000,
    sourceUrl: 'https://cvm.gov.br',
    fetchedAt: new Date(),
    paragraph: 'No 3T25, a Vale reportou lucro líquido de R$ 12 bilhões.',
    embedding: null,
  };

  it('deve classificar como SUFICIENTE quando a pergunta é quantitativa e o dado está no documento', async () => {
    const generateStructuredMock = vi.fn().mockResolvedValue({
      sufficient: true,
      missingAspects: [],
    });

    const grade = createGradeNode({
      llmClient: { generateStructured: generateStructuredMock },
    });

    const resultado = await grade({
      question: 'Qual foi o lucro líquido da Vale no 3T25?',
      documents: [fakeDoc],
    });

    expect(generateStructuredMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: GRADE_SYSTEM_PROMPT,
        schema: gradeOutputSchema,
      }),
    );

    expect(resultado).toEqual({
      sufficient: true,
      missingAspects: [],
    });
  });

  it('deve classificar como INSUFICIENTE quando a pergunta é qualitativa (motivo da queda/alta)', async () => {
    const generateStructuredMock = vi.fn().mockResolvedValue({
      sufficient: false,
      missingAspects: ['motivo da queda do lucro', 'notícias sobre o preço do minério de ferro'],
    });

    const grade = createGradeNode({
      llmClient: { generateStructured: generateStructuredMock },
    });

    const resultado = await grade({
      question: 'Por que o lucro líquido da Vale caiu no 3T25?',
      documents: [fakeDoc],
    });

    expect(resultado).toEqual({
      sufficient: false,
      missingAspects: ['motivo da queda do lucro', 'notícias sobre o preço do minério de ferro'],
    });
  });

  it('deve aceitar uma função fake diretamente na factory para testes rápidos', async () => {
    const fakeClassifier = vi.fn().mockImplementation(async ({ question }) => {
      if (question.toLowerCase().includes('por que')) {
        return { sufficient: false, missingAspects: ['motivo qualitativo'] };
      }
      return { sufficient: true, missingAspects: [] };
    });

    const grade = createGradeNode(fakeClassifier);

    const res1 = await grade({ question: 'Quanto faturou a Vale?', documents: [fakeDoc] });
    expect(res1.sufficient).toBe(true);

    const res2 = await grade({ question: 'Por que as ações caíram?', documents: [fakeDoc] });
    expect(res2.sufficient).toBe(false);
    expect(res2.missingAspects).toEqual(['motivo qualitativo']);
  });

  it('deve falhar se question estiver vazia', async () => {
    const grade = createGradeNode({
      llmClient: { generateStructured: vi.fn() },
    });

    await expect(grade({ question: '' })).rejects.toThrow(
      'Pergunta não encontrada ou inválida no estado do agente.',
    );
  });
});
