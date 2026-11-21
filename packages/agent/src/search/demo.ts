import type { SearchProvider, SearchResult } from './types.js';

export interface CompanyFixture {
  results: SearchResult[];
  pages: Record<string, string>;
}

/**
 * Fixture para Vale (VALE / VALE3):
 * Cobre as perguntas B01 ("Por que a receita da Vale caiu do 4T25 para o 1T26?")
 * e B02 ("Qual é o guidance de produção de minério de ferro da Vale para o próximo ano?").
 */
export const VALE_FIXTURE: CompanyFixture = {
  results: [
    {
      title: 'Vale: Fatores da retração de receita no 1T26 e impactos sazonais',
      url: 'https://noticias.exemplo.com.br/vale/resultado-1t26-sazonalidade',
      snippet:
        'A Vale informou que a queda de receita e produção no 1T26 frente ao 4T25 decorreu da sazonalidade de fortes chuvas em Carajás e Minas Gerais, além de paradas programadas de manutenção.',
    },
    {
      title: 'Guidance da Vale para 2026 prevê 310-320 milhões de toneladas de minério de ferro',
      url: 'https://noticias.exemplo.com.br/vale/guidance-producao-2026',
      snippet:
        'Em comunicado oficial ao mercado, a mineradora Vale manteve a projeção (guidance) de produção de minério de ferro na faixa entre 310 Mt e 320 Mt para o próximo ano.',
    },
  ],
  pages: {
    'https://noticias.exemplo.com.br/vale/resultado-1t26-sazonalidade': `
      <html>
        <body>
          <article>
            <h1>Vale: Explicações da diretoria sobre a receita no 1T26</h1>
            <p>
              A mineradora Vale divulgou esclarecimentos detalhados sobre a dinâmica de receita no 1T26.
              A retração observada em relação ao 4T25 é amplamente explicada por fatores sazonais e climáticos recorrentes no primeiro trimestre.
              O período foi marcado pelo forte volume de chuvas nas operações de Carajás (Pará) e no Sistema Sudeste (Minas Gerais),
              o que reduziu a movimentação nas minas e o transporte pela Estrada de Ferro Carajás e Vitória a Minas.
              Adicionalmente, a empresa aproveitou a janela de menor escoamento para realizar manutenções preventivas nos terminais portuários
              de Ponta da Madeira e Tubarão, além do impacto da realização de preços de minério de ferro no mercado à vista chinês.
            </p>
          </article>
        </body>
      </html>
    `,
    'https://noticias.exemplo.com.br/vale/guidance-producao-2026': `
      <html>
        <body>
          <article>
            <h1>Vale confirma projeção anual de produção de minério de ferro</h1>
            <p>
              Em relatório de produção e vendas submetido à CVM e investidores internacionais, a Vale confirmou que o guidance
              de produção de minério de ferro para o próximo ano permanece inalterado na faixa de 310 a 320 milhões de toneladas métricas (Mt).
              A administração enfatizou a estratégia de foco em qualidade e valor sobre volume, destacando o aumento da participação de produtos
              premium de alto teor e pelotas no portfólio de fornecimento siderúrgico global.
            </p>
          </article>
        </body>
      </html>
    `,
  },
};

/**
 * Fixture para Petrobras (PETR4 / PETR3 / Petrobras):
 * Cobre a pergunta B03 ("Houve algum fato relevante recente envolvendo a Petrobras?").
 */
export const PETROBRAS_FIXTURE: CompanyFixture = {
  results: [
    {
      title: 'Petrobras: Fato Relevante sobre distribuição de dividendos e plano de investimentos',
      url: 'https://noticias.exemplo.com.br/petrobras/fato-relevante-dividendos-2026',
      snippet:
        'A Petrobras divulgou fato relevante comunicando que o Conselho de Administração aprovou o pagamento de dividendos extraordinários no valor de R$ 12 bilhões.',
    },
    {
      title: 'Petrobras anuncia avanços regulatórios na Margem Equatorial em fato relevante',
      url: 'https://noticias.exemplo.com.br/petrobras/margem-equatorial-licenca',
      snippet:
        'A estatal emitiu fato relevante detalhando o cronograma exploratório e obtenção de licenças ambientais na Bacia da Foz do Amazonas.',
    },
  ],
  pages: {
    'https://noticias.exemplo.com.br/petrobras/fato-relevante-dividendos-2026': `
      <html>
        <body>
          <article>
            <h1>Petróleo Brasileiro S.A. - Fato Relevante</h1>
            <p>
              A Petrobras comunica aos seus acionistas e ao mercado em geral que seu Conselho de Administração aprovou,
              em reunião extraordinária, a distribuição de dividendos extraordinários no montante de R$ 12 bilhões,
              com base no fluxo de caixa livre e preservando a sustentabilidade financeira estabelecida na Política de Remuneração aos Acionistas.
              O pagamento será efetuado em duas parcelas iguais nos próximos meses aos detentores de ações ordinárias (PETR3) e preferenciais (PETR4).
            </p>
          </article>
        </body>
      </html>
    `,
    'https://noticias.exemplo.com.br/petrobras/margem-equatorial-licenca': `
      <html>
        <body>
          <article>
            <h1>Petrobras informa desdobramentos operacionais ao mercado</h1>
            <p>
              Em complemento aos relatórios anteriores, a Petrobras publicou fato relevante atestando o cumprimento
              dos requisitos técnicos para perfuração de poço pioneiro de pesquisa em águas profundas na Margem Equatorial brasileira,
              reiterando que as atividades seguirão os mais rigorosos protocolos de segurança operacional e preservação ambiental.
            </p>
          </article>
        </body>
      </html>
    `,
  },
};

/**
 * Fixture para Klabin (KLBN11 / KLBN4 / Klabin):
 * Cobre a pergunta B05 ("O que motivou o prejuízo da Klabin no 1T26?").
 */
export const KLABIN_FIXTURE: CompanyFixture = {
  results: [
    {
      title: 'Klabin: O que motivou o prejuízo líquido registrado no 1T26',
      url: 'https://noticias.exemplo.com.br/klabin/motivo-prejuizo-1t26',
      snippet:
        'A Klabin informou que o prejuízo líquido registrado no 1T26 foi motivado pela desvalorização cambial sobre a dívida em dólar, paradas de manutenção e ciclo de preços da celulose.',
    },
    {
      title: 'Análise do balanço da Klabin: Efeito contábil cambial e custos do Projeto Puma II',
      url: 'https://noticias.exemplo.com.br/klabin/balanco-detalhado-puma',
      snippet:
        'Em teleconferência de resultados, executivos da Klabin detalharam que a variação cambial negativa e despesas financeiras não-caixa pressionaram a última linha do balanço.',
    },
  ],
  pages: {
    'https://noticias.exemplo.com.br/klabin/motivo-prejuizo-1t26': `
      <html>
        <body>
          <article>
            <h1>Klabin esclarece fatores que levaram ao prejuízo no 1T26</h1>
            <p>
              A Klabin S.A. esclareceu aos analistas de mercado os três motivos determinantes para o prejuízo líquido apurado no 1T26.
              Primeiramente, o efeito contábil da desvalorização do real em relação ao dólar norte-americano gerou impacto financeiro negativo
              não-caixa substancial sobre o passivo em moeda estrangeira. Em segundo lugar, a companhia realizou paradas gerais de manutenção
              programadas na fábrica de Monte Alegre e na unidade Puma II, diminuindo o volume de expedição e elevando custos unitários.
              Por fim, as cotações internacionais de celulose de fibra curta (BHKP) permaneceram sob pressão de oferta no mercado global.
            </p>
          </article>
        </body>
      </html>
    `,
    'https://noticias.exemplo.com.br/klabin/balanco-detalhado-puma': `
      <html>
        <body>
          <article>
            <h1>Klabin: Despesas financeiras e ciclo de celulose impactam resultado</h1>
            <p>
              O balanço do 1T26 da Klabin evidenciou que a geração de caixa operacional continuou sólida, mas o resultado contábil
              foi severamente penalizado por despesas financeiras líquidas de variação cambial decorrentes da dívida atrelada ao Projeto Puma II.
              A administração enfatizou que se trata de volatilidade contábil sem drenagem imediata de liquidez.
            </p>
          </article>
        </body>
      </html>
    `,
  },
};

/**
 * Fixture genérica de fallback para qualquer query sem fixture específica cadastrada.
 * Garante que nenhuma busca jamais lance erro em modo demonstração.
 */
export const GENERIC_FIXTURE: CompanyFixture = {
  results: [
    {
      title: 'Portal Corporativo: Análise de Mercado e Fatos Relevantes',
      url: 'https://noticias.exemplo.com.br/mercado/analise-geral',
      snippet:
        'Panorama de mercado corporativo sobre empresas de capital aberto no Brasil, cobrindo aspectos qualitativos, fatos relevantes e desdobramentos operacionais.',
    },
  ],
  pages: {
    'https://noticias.exemplo.com.br/mercado/analise-geral': `
      <html>
        <body>
          <article>
            <h1>Panorama Geral do Mercado Corporativo Brasileiro</h1>
            <p>
              As companhias abertas listadas na B3 reportam periodicamente dados contábeis regulatórios à CVM.
              Para além dos números financeiros consolidados, aspectos qualitativos como direcionamentos estratégicos,
              condições de demanda macroeconômica, custos logísticos e fatores climáticos explicam oscilações nas margens operacionais e na receita.
            </p>
          </article>
        </body>
      </html>
    `,
  },
};

/**
 * Mapeia todas as páginas registradas para busca rápida por URL.
 */
const TODAS_AS_PAGINAS: Record<string, string> = {
  ...VALE_FIXTURE.pages,
  ...PETROBRAS_FIXTURE.pages,
  ...KLABIN_FIXTURE.pages,
  ...GENERIC_FIXTURE.pages,
};

/**
 * Casa a query por substring de ticker ou nome da empresa, caindo na genérica se não encontrar.
 */
export function buscarFixturePorQuery(query: string): CompanyFixture {
  const q = (query || '').toLowerCase();

  // Vale
  if (q.includes('vale') || q.includes('vale3')) {
    return VALE_FIXTURE;
  }

  // Petrobras
  if (
    q.includes('petrobras') ||
    q.includes('petr4') ||
    q.includes('petr3') ||
    q.includes('petroleo brasileiro')
  ) {
    return PETROBRAS_FIXTURE;
  }

  // Klabin
  if (q.includes('klabin') || q.includes('klbn11') || q.includes('klbn4')) {
    return KLABIN_FIXTURE;
  }

  // Fallback genérico (nunca lança erro)
  return GENERIC_FIXTURE;
}

/**
 * Cria a implementação fake do SearchProvider baseada em fixtures determinísticas para o modo DEMO.
 * Não depende do Serper ou Google Custom Search estarem no ar.
 */
export function makeDemoSearchProvider(): SearchProvider {
  return {
    async search(query: string): Promise<SearchResult[]> {
      const fixture = buscarFixturePorQuery(query);
      return fixture.results;
    },
  };
}

/**
 * Implementação fake de busca de página HTML para o modo DEMO.
 * Retorna o conteúdo HTML correspondente à URL ou a página genérica de fallback se não cadastrada.
 * Nunca lança erro ou faz requisição real de rede.
 */
export async function demoFetchHtml(url: string): Promise<string> {
  const html = TODAS_AS_PAGINAS[url];
  if (html) {
    return html;
  }

  // Fallback genérico
  return GENERIC_FIXTURE.pages['https://noticias.exemplo.com.br/mercado/analise-geral'];
}
