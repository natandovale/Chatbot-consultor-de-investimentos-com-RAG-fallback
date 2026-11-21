import { describe, expect, it } from 'vitest';
import {
  CONTAS,
  DESCRICOES_LUCRO_LIQUIDO,
  DESCRICOES_PATRIMONIO_LIQUIDO,
  buscarConta,
  buscarContaPorDescricao,
  candidatosTrimestres,
  demonstrativosDaEmpresa,
  escolherMaiorVersao,
  inicioTrimestreIso,
  periodEndIso,
  periodoLabel,
  subtrairValorConta,
  valorConta,
  type DemonstrativosAno,
} from './select-quarters.js';
import type { LinhaCvm, ValorConta } from '../types.js';

describe('select-quarters', () => {
  describe('Matemática de datas e trimestres', () => {
    it('calcula periodEndIso para trimestres normais e anos bissextos', () => {
      // 1T, 2T, 3T, 4T
      expect(periodEndIso(2025, 3)).toBe('2025-03-31');
      expect(periodEndIso(2025, 6)).toBe('2025-06-30');
      expect(periodEndIso(2025, 9)).toBe('2025-09-30');
      expect(periodEndIso(2025, 12)).toBe('2025-12-31');

      // Ano bissexto: 2024 teve 29 dias em fevereiro
      expect(periodEndIso(2024, 2)).toBe('2024-02-29');

      // Ano não-bissexto: 2023 teve 28 dias em fevereiro
      expect(periodEndIso(2023, 2)).toBe('2023-02-28');
    });

    it('calcula inicioTrimestreIso corretamente', () => {
      expect(inicioTrimestreIso(2025, 3)).toBe('2025-01-01');
      expect(inicioTrimestreIso(2025, 6)).toBe('2025-04-01');
      expect(inicioTrimestreIso(2025, 9)).toBe('2025-07-01');
      expect(inicioTrimestreIso(2025, 12)).toBe('2025-10-01');
    });

    it('formata o label do trimestre com periodoLabel', () => {
      expect(periodoLabel(3, 2025)).toBe('1T25');
      expect(periodoLabel(6, 2025)).toBe('2T25');
      expect(periodoLabel(9, 2025)).toBe('3T25');
      expect(periodoLabel(12, 2024)).toBe('4T24');
    });

    it('gera a lista regressiva de candidatosTrimestres a partir de uma data de referência', () => {
      // Data no 3T25 (agosto de 2025)
      const dataRef = new Date(Date.UTC(2025, 7, 15));
      const candidatos = candidatosTrimestres(dataRef, 4);

      expect(candidatos).toEqual([
        { ano: 2025, mes: 9 },
        { ano: 2025, mes: 6 },
        { ano: 2025, mes: 3 },
        { ano: 2024, mes: 12 },
      ]);
    });
  });

  describe('Seleção de versão retificada (escolherMaiorVersao)', () => {
    it('retorna undefined para lista vazia', () => {
      expect(escolherMaiorVersao([])).toBeUndefined();
    });

    it('seleciona a versão retificada mais recente (maior VERSAO numérica)', () => {
      const linhas: LinhaCvm[] = [
        { CD_CONTA: '3.01', VL_CONTA: '100', VERSAO: '1' },
        { CD_CONTA: '3.01', VL_CONTA: '120', VERSAO: '3' },
        { CD_CONTA: '3.01', VL_CONTA: '110', VERSAO: '2' },
      ];

      const selecionada = escolherMaiorVersao(linhas);
      expect(selecionada?.VERSAO).toBe('3');
      expect(selecionada?.VL_CONTA).toBe('120');
    });
  });

  describe('Fallback consolidado / individual (demonstrativosDaEmpresa)', () => {
    const criarAnoVazio = (): DemonstrativosAno => ({
      bpaCon: new Map(),
      bpaInd: new Map(),
      bppCon: new Map(),
      bppInd: new Map(),
      dreCon: new Map(),
      dreInd: new Map(),
      dfcCon: new Map(),
      dfcInd: new Map(),
    });

    it('usa demonstrativo consolidado quando dreCon está disponível', () => {
      const ano = criarAnoVazio();
      const cdCvm = '004170'; // Vale
      const dreConLinha: LinhaCvm = { CD_CONTA: '3.01', VL_CONTA: '500' };
      const bpaConLinha: LinhaCvm = { CD_CONTA: '1', VL_CONTA: '1000' };

      ano.dreCon.set(cdCvm, [dreConLinha]);
      ano.bpaCon.set(cdCvm, [bpaConLinha]);

      // Também tem ind, para provar que prioriza consolidado
      ano.dreInd.set(cdCvm, [{ CD_CONTA: '3.01', VL_CONTA: '200' }]);

      const res = demonstrativosDaEmpresa(ano, cdCvm);
      expect(res).toBeDefined();
      expect(res?.dre).toEqual([dreConLinha]);
      expect(res?.bpa).toEqual([bpaConLinha]);
    });

    it('cai para individual quando consolidado não existe (caso Sendas / Assaí)', () => {
      const ano = criarAnoVazio();
      const cdCvm = '025402'; // Sendas
      const dreIndLinha: LinhaCvm = { CD_CONTA: '3.01', VL_CONTA: '300' };
      const bppIndLinha: LinhaCvm = { CD_CONTA: '2.03', VL_CONTA: '800' };

      ano.dreInd.set(cdCvm, [dreIndLinha]);
      ano.bppInd.set(cdCvm, [bppIndLinha]);

      const res = demonstrativosDaEmpresa(ano, cdCvm);
      expect(res).toBeDefined();
      expect(res?.dre).toEqual([dreIndLinha]);
      expect(res?.bpp).toEqual([bppIndLinha]);
      // Garante que não misturou com arrays consolidados
      expect(res?.bpa).toEqual([]);
    });

    it('retorna undefined quando a empresa não possui nem consolidado nem individual', () => {
      const ano = criarAnoVazio();
      expect(demonstrativosDaEmpresa(ano, '999999')).toBeUndefined();
    });
  });

  describe('Posição de conta por setor e busca flexível', () => {
    it('buscarConta localiza por CD_CONTA e respeita versão e filtros de exercício', () => {
      const linhas: LinhaCvm[] = [
        {
          CD_CONTA: CONTAS.receitaLiquida,
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'ÚLTIMO',
          DT_INI_EXERC: '2025-07-01',
          VL_CONTA: '50000',
          VERSAO: '1',
        },
        {
          CD_CONTA: CONTAS.receitaLiquida,
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'ÚLTIMO',
          DT_INI_EXERC: '2025-07-01',
          VL_CONTA: '52000',
          VERSAO: '2', // Retificada
        },
        {
          CD_CONTA: CONTAS.receitaLiquida,
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'PENÚLTIMO',
          DT_INI_EXERC: '2024-07-01',
          VL_CONTA: '45000',
          VERSAO: '1',
        },
      ];

      const encontrada = buscarConta(
        linhas,
        CONTAS.receitaLiquida,
        '2025-09-30',
        'ÚLTIMO',
        '2025-07-01',
      );

      expect(encontrada).toBeDefined();
      expect(encontrada?.VERSAO).toBe('2');
      expect(encontrada?.VL_CONTA).toBe('52000');
    });

    it('buscarContaPorDescricao localiza lucro líquido mesmo com códigos diferentes entre bancos e indústrias', () => {
      // Simula estrutura bancária (Itaú: código 3.09 vs Industrial/Vale: código 3.11)
      const linhasBanco: LinhaCvm[] = [
        {
          CD_CONTA: '3.09',
          DS_CONTA: 'Lucro ou Prejuízo Líquido Consolidado do Período',
          ST_CONTA_FIXA: 'S',
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'ÚLTIMO',
          DT_INI_EXERC: '2025-07-01',
          VL_CONTA: '10500',
          VERSAO: '1',
        },
      ];

      const linhasIndustria: LinhaCvm[] = [
        {
          CD_CONTA: '3.11',
          DS_CONTA: 'Lucro/Prejuízo Consolidado do Período',
          ST_CONTA_FIXA: 'S',
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'ÚLTIMO',
          DT_INI_EXERC: '2025-07-01',
          VL_CONTA: '14200',
          VERSAO: '1',
        },
      ];

      const lucroBanco = buscarContaPorDescricao(
        linhasBanco,
        DESCRICOES_LUCRO_LIQUIDO,
        '2025-09-30',
        'ÚLTIMO',
        '2025-07-01',
      );
      expect(lucroBanco?.CD_CONTA).toBe('3.09');
      expect(lucroBanco?.VL_CONTA).toBe('10500');

      const lucroIndustria = buscarContaPorDescricao(
        linhasIndustria,
        DESCRICOES_LUCRO_LIQUIDO,
        '2025-09-30',
        'ÚLTIMO',
        '2025-07-01',
      );
      expect(lucroIndustria?.CD_CONTA).toBe('3.11');
      expect(lucroIndustria?.VL_CONTA).toBe('14200');
    });

    it('buscarContaPorDescricao seleciona a linha-resumo de menor profundidade em caso de empate', () => {
      // Se houver linha principal 2.03 e sub-linha 2.03.01 com a mesma descrição
      const linhas: LinhaCvm[] = [
        {
          CD_CONTA: '2.03.01',
          DS_CONTA: 'Patrimônio Líquido Consolidado',
          ST_CONTA_FIXA: 'S',
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'ÚLTIMO',
          VL_CONTA: '5000',
          VERSAO: '1',
        },
        {
          CD_CONTA: '2.03',
          DS_CONTA: 'Patrimônio Líquido Consolidado',
          ST_CONTA_FIXA: 'S',
          DT_REFER: '2025-09-30',
          ORDEM_EXERC: 'ÚLTIMO',
          VL_CONTA: '20000',
          VERSAO: '1',
        },
      ];

      const encontrada = buscarContaPorDescricao(
        linhas,
        DESCRICOES_PATRIMONIO_LIQUIDO,
        '2025-09-30',
        'ÚLTIMO',
      );

      // Deve ficar com 2.03 (profundidade 2), ignorando 2.03.01 (profundidade 3)
      expect(encontrada?.CD_CONTA).toBe('2.03');
      expect(encontrada?.VL_CONTA).toBe('20000');
    });
  });

  describe('Subtração YTD do 4° trimestre (subtrairValorConta)', () => {
    it('subtrai valores corretamente quando a escala de moeda é idêntica', () => {
      const anual: ValorConta = { valor: 100000, escalaMoeda: 'MIL' };
      const q3Ytd: ValorConta = { valor: 72000, escalaMoeda: 'MIL' };

      const q4 = subtrairValorConta(anual, q3Ytd);
      expect(q4).toEqual({
        valor: 28000,
        escalaMoeda: 'MIL',
      });
    });

    it('subtrai valores com resultado negativo (ex.: prejuízo no 4T)', () => {
      const anual: ValorConta = { valor: 50000, escalaMoeda: 'UNIDADE' };
      const q3Ytd: ValorConta = { valor: 65000, escalaMoeda: 'UNIDADE' };

      const q4 = subtrairValorConta(anual, q3Ytd);
      expect(q4).toEqual({
        valor: -15000,
        escalaMoeda: 'UNIDADE',
      });
    });

    it('lança erro se a escala de moeda entre trimestres for divergente', () => {
      const anual: ValorConta = { valor: 100000, escalaMoeda: 'MIL' };
      const q3Ytd: ValorConta = { valor: 100000000, escalaMoeda: 'UNIDADE' };

      expect(() => subtrairValorConta(anual, q3Ytd)).toThrow(
        /ESCALA_MOEDA divergente entre trimestres/,
      );
    });
  });
});
