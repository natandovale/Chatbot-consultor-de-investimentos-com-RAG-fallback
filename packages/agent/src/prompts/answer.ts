import type { DocumentoSimilar } from '../db/retrieve-similar.js';

export const ANSWER_SYSTEM_PROMPT = `Você é um assistente financeiro analítico e factual, especializado em análise de documentos corporativos da CVM e informações públicas sobre o mercado financeiro brasileiro.

DIRETRIZES FUNDAMENTAIS:
1. NUNCA RECOMENDAR DECISÃO DE INVESTIMENTO:
   - Você é expressamente PROIBIDO de fazer qualquer recomendação de investimento (comprar, vender, manter ou trocar ações ou ativos financeiros), mesmo se a pergunta solicitar diretamente (ex.: "devo comprar?", "o que você recomenda?", "vale a pena?").
   - Responda apenas com dados factuais, históricos e objetivos extraídos dos documentos recuperados.

2. FIDELIDADE ESTRITA AO CONTEXTO RECUPERADO:
   - Responda apenas com base nas informações factuais fornecidas no contexto.
   - NUNCA invente, presuma ou alucine números, resultados financeiros, datas ou fatos contábeis.
   - Se um dado não estiver presente nos documentos, informe claramente que o dado não consta nos relatórios recuperados.

3. CONTEXTO INCOMPLETO:
   - Se o indicador de suficiência for falso (sufficient = false) ou se o contexto não responder integralmente a todos os aspectos solicitados, você DEVE avisar claramente o usuário que as informações disponíveis são parciais ou incompletas.`;

/**
 * Formata a lista de documentos para inserção no contexto do prompt do LLM.
 */
export function formatAnswerContextDocuments(documents: DocumentoSimilar[]): string {
  if (!documents || documents.length === 0) {
    return 'Nenhum documento disponível no contexto.';
  }

  return documents
    .map((doc, idx) => {
      const isCorpus = doc.sourceType === 'corpus' || (doc.ticker && doc.period);
      const cabecalho = isCorpus
        ? `[Documento CVM ${idx + 1}] Empresa: ${doc.companyName ?? doc.title} (${doc.ticker}) | Período: ${doc.period} | Data-base: ${doc.periodEnd ?? 'N/A'}`
        : `[Documento Web ${idx + 1}] Título: ${doc.title}`;

      const url = doc.sourceUrl ? ` | URL: ${doc.sourceUrl}` : '';
      const conteudo = (doc.content || doc.paragraph || '').trim();

      return `${cabecalho}${url}\nConteúdo: ${conteudo}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Monta o prompt completo enviado ao LLM para geração da resposta final.
 */
export function formatAnswerPrompt(params: {
  question: string;
  documents: DocumentoSimilar[];
  sufficient: boolean;
}): string {
  const { question, documents, sufficient } = params;
  const contexto = formatAnswerContextDocuments(documents);

  const alertaIncompleto = !sufficient
    ? `\nATENÇÃO: O contexto recuperado foi classificado como INCOMPLETO para responder a todos os pontos da dúvida. Avise explicitamente o usuário sobre as limitações dos dados disponíveis.\n`
    : '';

  return `CONTEXTO RECUPERADO:
${contexto}
${alertaIncompleto}
PERGUNTA DO USUÁRIO:
${question}

Instruções finais: Responda à pergunta do usuário utilizando unicamente os dados do contexto acima. Não emita recomendações de investimento nem invente dados contábeis.`;
}

