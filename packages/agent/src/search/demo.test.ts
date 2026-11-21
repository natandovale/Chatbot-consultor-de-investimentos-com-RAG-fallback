import { describe, expect, it } from 'vitest';
import {
  buscarFixturePorQuery,
  demoFetchHtml,
  makeDemoSearchProvider,
  VALE_FIXTURE,
  PETROBRAS_FIXTURE,
  KLABIN_FIXTURE,
  GENERIC_FIXTURE,
} from './demo.js';
import { criarSearchProvider, criarFetchHtml } from './index.js';
import { defaultFetchHtml } from '../nodes/web-search.js';

describe('Demo Search & Fetch Fixtures (DEMO=true)', () => {
  const provider = makeDemoSearchProvider();

  describe('Perguntas reais do Grupo B de evals/dataset.json', () => {
    it('B01: responde sobre queda de receita da Vale com a fixture da Vale', async () => {
      const query = 'Por que a receita da Vale caiu do 4T25 para o 1T26?';
      const results = await provider.search(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Vale');
      expect(results[0].snippet).toContain('sazonalidade');

      // Testa fetch da página associada
      const html = await demoFetchHtml(results[0].url);
      expect(html).toContain('Vale: Explicações da diretoria');
      expect(html).toContain('Carajás');
      expect(html).toContain('chuvas');
    });

    it('B02: responde sobre guidance de minério da Vale com a fixture da Vale', async () => {
      const query = 'Qual é o guidance de produção de minério de ferro da Vale para o próximo ano?';
      const results = await provider.search(query);

      const guidanceResult = results.find((r) => r.title.includes('Guidance'));
      expect(guidanceResult).toBeDefined();

      const html = await demoFetchHtml(guidanceResult!.url);
      expect(html).toContain('310 a 320 milhões de toneladas');
    });

    it('B03: responde sobre fato relevante da Petrobras com a fixture da Petrobras', async () => {
      const query = 'Houve algum fato relevante recente envolvendo a Petrobras?';
      const results = await provider.search(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Petrobras');
      expect(results[0].snippet).toContain('fato relevante');

      const html = await demoFetchHtml(results[0].url);
      expect(html).toContain('Petróleo Brasileiro S.A. - Fato Relevante');
      expect(html).toContain('dividendos extraordinários');
    });

    it('B05: responde sobre motivo do prejuízo da Klabin com a fixture da Klabin', async () => {
      const query = 'O que motivou o prejuízo da Klabin no 1T26?';
      const results = await provider.search(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Klabin');
      expect(results[0].snippet).toContain('prejuízo');

      const html = await demoFetchHtml(results[0].url);
      expect(html).toContain('Klabin esclarece fatores que levaram ao prejuízo');
      expect(html).toContain('desvalorização do real');
      expect(html).toContain('Puma II');
    });
  });

  describe('Casamento por substring de ticker ou nome da empresa', () => {
    it('casa por tickers (VALE3, PETR4, KLBN11)', () => {
      expect(buscarFixturePorQuery('resultado VALE3')).toBe(VALE_FIXTURE);
      expect(buscarFixturePorQuery('notícias de PETR4')).toBe(PETROBRAS_FIXTURE);
      expect(buscarFixturePorQuery('dados KLBN11')).toBe(KLABIN_FIXTURE);
    });

    it('casa por variações de nome (vale, petrobras, klabin)', () => {
      expect(buscarFixturePorQuery('produção da vale')).toBe(VALE_FIXTURE);
      expect(buscarFixturePorQuery('investimento petrobras')).toBe(PETROBRAS_FIXTURE);
      expect(buscarFixturePorQuery('fábrica klabin')).toBe(KLABIN_FIXTURE);
    });
  });

  describe('Fallback genérico e resiliência (nunca lança erro)', () => {
    it('pergunta sem fixture cadastrada cai na fixture genérica', async () => {
      const querySemCadastro = 'Como está o mercado de telecomunicações no Brasil?';
      const fixture = buscarFixturePorQuery(querySemCadastro);

      expect(fixture).toBe(GENERIC_FIXTURE);

      const results = await provider.search(querySemCadastro);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Mercado');

      const html = await demoFetchHtml(results[0].url);
      expect(html).toContain('Panorama Geral do Mercado Corporativo');
    });

    it('demoFetchHtml com URL desconhecida retorna HTML genérico sem lançar erro', async () => {
      const html = await demoFetchHtml('https://site-aleatorio-nunca-visto.com/pagina');
      expect(html).toContain('Panorama Geral do Mercado Corporativo Brasileiro');
    });
  });

  describe('Ativação via variável de ambiente DEMO=true em um único ponto', () => {
    it('criarSearchProvider com DEMO=true retorna provider demo sem exigir SERPER_API_KEY', async () => {
      // Sem SERPER_API_KEY configurada
      const providerDemo = criarSearchProvider({ DEMO: 'true' });
      const results = await providerDemo.search('Vale');

      expect(results[0].title).toContain('Vale');
    });

    it('criarFetchHtml com DEMO=true retorna demoFetchHtml', async () => {
      const fetcher = criarFetchHtml({ DEMO: 'true' });
      const html = await fetcher('https://qualquer-url.com');

      expect(html).toContain('Panorama Geral do Mercado Corporativo');
    });

    it('criarFetchHtml com DEMO=false retorna defaultFetchHtml real', () => {
      const fetcher = criarFetchHtml({ DEMO: 'false' });
      expect(fetcher).toBe(defaultFetchHtml);
    });
  });
});
