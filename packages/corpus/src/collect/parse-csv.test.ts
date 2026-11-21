import { describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseCsvCvm } from './parse-csv.js';

describe('parseCsvCvm', () => {
  it('decodifica corretamente acentuação a partir de uma fixture de bytes latin1 (ISO-8859-1) reais', () => {
    // Monta um CSV contendo termos reais da CVM com caracteres acentuados típicos:
    // ó, ô, í, ú, ç, ã, é, Ú, Ó
    const csvTextoOriginal = [
      'CNPJ_CIA;DT_REFER;VERSAO;DENOM_CIA;CD_CVM;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA',
      '33.000.167/0001-01;2025-09-30;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF Consolidado - Balanço Patrimonial Passivo;REAL;MIL;ÚLTIMO;2025-01-01;2025-09-30;2.03;Patrimônio Líquido Consolidado;411287000;S',
      '33.000.167/0001-01;2025-09-30;1;PETRÓLEO BRASILEIRO S.A. - PETROBRAS;009512;DF Consolidado - Demonstração do Resultado;REAL;MIL;ÚLTIMO;2025-07-01;2025-09-30;3.11;Lucro ou Prejuízo Líquido Consolidado do Período;32560000;S',
      '00.000.000/0001-00;2025-09-30;2;COMPANHIA DE DISTRIBUIÇÃO & MINERAÇÃO;001234;DF Individual - DRE;REAL;UNIDADE;ÚLTIMO;2025-07-01;2025-09-30;3.01;Receita de Venda de Bens e/ou Serviços;150000;S',
    ].join('\r\n');

    // Converte a string em um Buffer explicitamente codificado em latin1 (ISO-8859-1)
    const latin1Buffer = Buffer.from(csvTextoOriginal, 'latin1');

    // Validação estrita: em Latin-1, 'Ó' é o byte 0xD3 (211), 'ô' é 0xF4 (244), 'í' é 0xED (237)
    // Se fosse UTF-8, cada um desses caracteres ocuparia 2 bytes (ex.: 0xC3 0x93 para 'Ó')
    expect(latin1Buffer.includes(0xd3)).toBe(true); // 'Ó' em PETRÓLEO
    expect(latin1Buffer.includes(0xf4)).toBe(true); // 'ô' em Patrimônio
    expect(latin1Buffer.includes(0xed)).toBe(true); // 'í' em Líquido

    const tempFilePath = path.join(
      os.tmpdir(),
      `cvm-latin1-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
    );

    try {
      // Escreve os bytes brutos latin1 em disco
      writeFileSync(tempFilePath, latin1Buffer);

      // Executa o parser do coletor
      const registros = parseCsvCvm(tempFilePath);

      expect(registros).toHaveLength(3);

      // 1. Registro da Petrobras: Balanço Passivo
      const petroPassivo = registros[0];
      expect(petroPassivo.DENOM_CIA).toBe('PETRÓLEO BRASILEIRO S.A. - PETROBRAS');
      expect(petroPassivo.GRUPO_DFP).toBe('DF Consolidado - Balanço Patrimonial Passivo');
      expect(petroPassivo.ORDEM_EXERC).toBe('ÚLTIMO');
      expect(petroPassivo.DS_CONTA).toBe('Patrimônio Líquido Consolidado');
      expect(petroPassivo.VL_CONTA).toBe('411287000');
      expect(petroPassivo.ST_CONTA_FIXA).toBe('S');

      // 2. Registro da Petrobras: DRE
      const petroDre = registros[1];
      expect(petroDre.DS_CONTA).toBe('Lucro ou Prejuízo Líquido Consolidado do Período');
      expect(petroDre.VL_CONTA).toBe('32560000');

      // 3. Registro com Distribuição & Mineração
      const distMin = registros[2];
      expect(distMin.DENOM_CIA).toBe('COMPANHIA DE DISTRIBUIÇÃO & MINERAÇÃO');
      expect(distMin.VERSAO).toBe('2');
      expect(distMin.ESCALA_MOEDA).toBe('UNIDADE');
      expect(distMin.DS_CONTA).toBe('Receita de Venda de Bens e/ou Serviços');
    } finally {
      try {
        unlinkSync(tempFilePath);
      } catch {
        // Ignora erro de limpeza temporária
      }
    }
  });

  it('suporta arquivos com quebra de linha Unix (LF) e linhas em branco no final', () => {
    const csvUnix = Buffer.from(
      'CD_CVM;DS_CONTA;VL_CONTA\n001000;Lucro/Prejuízo do Período;500\n001000;Patrimônio Líquido;1200\n\n',
      'latin1',
    );

    const tempFilePath = path.join(
      os.tmpdir(),
      `cvm-unix-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
    );

    try {
      writeFileSync(tempFilePath, csvUnix);
      const registros = parseCsvCvm(tempFilePath);

      expect(registros).toHaveLength(2);
      expect(registros[0]).toEqual({
        CD_CVM: '001000',
        DS_CONTA: 'Lucro/Prejuízo do Período',
        VL_CONTA: '500',
      });
      expect(registros[1]).toEqual({
        CD_CVM: '001000',
        DS_CONTA: 'Patrimônio Líquido',
        VL_CONTA: '1200',
      });
    } finally {
      try {
        unlinkSync(tempFilePath);
      } catch {}
    }
  });
});
