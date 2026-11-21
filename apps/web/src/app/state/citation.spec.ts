import { describe, expect, it } from 'vitest';
import { parseAnswer } from './citation';

describe('parseAnswer', () => {
  it('retorna apenas o corpo e lista vazia de citações quando não há bloco Fontes:', () => {
    const text = 'A Vale registrou receita líquida de R$ 52 bilhões no 3T25.';
    expect(parseAnswer(text)).toEqual({
      body: 'A Vale registrou receita líquida de R$ 52 bilhões no 3T25.',
      citations: [],
    });
  });

  it('separa o corpo do bloco Fontes: e extrai período e origem Base local (CVM) para o formato TICKER · período (data-base X)', () => {
    const answerText = [
      'No 3T25, a Vale teve lucro líquido de R$ 14,2 bilhões, com alta no volume de minério.',
      '',
      'Fontes:',
      '- VALE3 · 3T25 (data-base 2025-09-30) — https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/itr_2025.zip',
      '- KLBN11 · 4T24 (data-base 2024-12-31) - https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/dfp_2024.zip',
    ].join('\n');

    const result = parseAnswer(answerText);

    expect(result.body).toBe(
      'No 3T25, a Vale teve lucro líquido de R$ 14,2 bilhões, com alta no volume de minério.',
    );
    expect(result.citations).toEqual([
      {
        label: 'VALE3 · 3T25 (data-base 2025-09-30)',
        url: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/itr_2025.zip',
        period: '3T25 (data-base 2025-09-30)',
        origin: 'Base local (CVM)',
      },
      {
        label: 'KLBN11 · 4T24 (data-base 2024-12-31)',
        url: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/dfp_2024.zip',
        period: '4T24 (data-base 2024-12-31)',
        origin: 'Base local (CVM)',
      },
    ]);
  });

  it('usa o hostname da URL como origem quando o rótulo não tem o formato CVM', () => {
    const answerText = [
      'A queda do lucro foi explicada pela retração do minério de ferro na China.',
      '',
      'Fontes:',
      '- VALE3 · 3T25 (data-base 2025-09-30) — https://dados.cvm.gov.br/itr/vale3',
      '- Minério de ferro recua em Dalian — https://valor.globo.com/empresas/noticia/2025/10/vale.ghtml',
    ].join('\n');

    const result = parseAnswer(answerText);

    expect(result.body).toBe(
      'A queda do lucro foi explicada pela retração do minério de ferro na China.',
    );
    expect(result.citations).toEqual([
      {
        label: 'VALE3 · 3T25 (data-base 2025-09-30)',
        url: 'https://dados.cvm.gov.br/itr/vale3',
        period: '3T25 (data-base 2025-09-30)',
        origin: 'Base local (CVM)',
      },
      {
        label: 'Minério de ferro recua em Dalian',
        url: 'https://valor.globo.com/empresas/noticia/2025/10/vale.ghtml',
        origin: 'valor.globo.com',
      },
    ]);
  });
});
