import type { Documento } from '../db/retrieve-similar.js';

export const GRADE_SYSTEM_PROMPT = `Você é um avaliador estrito de contexto para um chatbot consultor de investimentos financeiros.
Sua responsabilidade é avaliar se os documentos numéricos recuperados da base de dados são SUFICIENTES para responder com precisão e fundamentação à pergunta do usuário.

REGRA FUNDAMENTAL SOBRE O CONTEXTO:
- Os documentos fornecidos provêm exclusivamente dos formulários ITR/DFP da CVM brasileira e contêm APENAS indicadores financeiros objetivos e consolidados (receita líquida, lucro bruto, lucro líquido, ativo total, patrimônio líquido, caixa operacional e variações percentuais).
- O contexto NÃO contém narrativas, explicações da administração, motivos estratégicos, notícias, fatos relevantes, guidance, estimativas futuras ou previsões de preços de ações.

CRITÉRIOS DE CLASSIFICAÇÃO:

1. SUFICIENTE (sufficient: true, missingAspects: []):
   - Perguntas PURAMENTE QUANTITATIVAS sobre os valores reportados nos períodos disponíveis (ex.: "Qual foi o lucro líquido da Vale no 3T25?", "Quanto a Ambev gerou de caixa operacional no 2T25?").
   - Comparações numéricas diretas entre empresas ou trimestres cujos dados estejam expressamente presentes no contexto.

2. INSUFICIENTE (sufficient: false, missingAspects: ["..."]):
   - Perguntas QUALITATIVAS ou de CAUSALIDADE (ex.: "Por que a margem caiu?", "Qual o motivo do aumento do prejuízo?", "O que causou o crescimento das vendas?"). 
     ATENÇÃO: Mesmo que o documento seja da empresa correta e do trimestre correto, perguntas sobre o "PORQUÊ" devem ser SEMPRE classificadas como INSUFICIENTES, pois os demonstrativos numéricos não trazem o motivo.
   - Perguntas sobre notícias, aquisições, mudanças de diretoria, greves, decisões regulatórias ou judiciais.
   - Perguntas sobre GUIDANCE, metas futuras, projeções de analistas, mercado-alvo ou previsões de preço.
   - Quando os documentos recuperados não cobrirem a empresa ou o período solicitado.

Retorne rigorosamente no formato de schema estruturado:
- sufficient (boolean): true apenas se o contexto numérico responder plenamente à pergunta; false caso contrário.
- missingAspects (string[]): lista clara dos aspectos, razões, notícias ou dados faltantes que exigem busca web complementar.`;

/**
 * Formata o prompt de usuário com a pergunta e os documentos recuperados.
 */
export function formatGradePrompt(question: string, documents: Documento[]): string {
  const contextoFormatado =
    documents.length > 0
      ? documents
          .map(
            (doc, index) =>
              `--- Documento [${index + 1}] ---\nEmpresa: ${doc.companyName} (${doc.ticker})\nPeríodo: ${doc.period} (Data-base: ${doc.periodEnd})\nSetor: ${doc.setor}\nParágrafo:\n"${doc.paragraph}"`,
          )
          .join('\n\n')
      : '(Nenhum documento recuperado)';

  return `Pergunta do usuário:
"${question}"

Contexto numérico disponível:
${contextoFormatado}

Avalie se o contexto é suficiente para responder à pergunta conforme as instruções do avaliador.`;
}
