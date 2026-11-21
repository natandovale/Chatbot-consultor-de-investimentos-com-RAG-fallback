import type { DocumentoSimilar } from '../db/retrieve-similar.js';

/**
 * Aviso padrão exibido pelo filtro determinístico de guardrail
 * quando o texto gerado violar a regra de recomendação de investimentos.
 */
export const GUARDRAIL_DISCLAIMER =
  'Não realizo recomendações de investimento, compra ou venda de ativos. Como assistente de IA, apresento apenas dados e fatos históricos disponíveis nos relatórios públicos para sua própria análise.';

/**
 * Expressão regular determinística para detectar linguagem recomendatória:
 * - Verbos em primeira pessoa: recomendo, sugiro, aconselho, indico e variações plurais.
 * - Construções como: "vale a pena comprar", "vale a pena investir", "deve comprar", "compre agora", etc.
 */
export const REGEX_LINGUAGEM_RECOMENDATORIA =
  /\b(recomendo|recomendei|recomendamos|sugiro|sugerimos|aconselho|aconselhamos|indico|indicamos)\b|vale\s+a\s+pena\s+comprar|vale\s+a\s+pena\s+investir|deve\s+comprar|compre\s+agora|deve\s+vender|compre\s+as\s+ações/i;

/**
 * Verifica se um texto contém linguagem recomendatória.
 */
export function contemLinguagemRecomendatoria(texto: string): boolean {
  return REGEX_LINGUAGEM_RECOMENDATORIA.test(texto);
}

/**
 * Formata o bloco de fontes ao final da resposta:
 * - Um item por documento.
 * - Deduplicado por sourceUrl.
 * - ticker + período + data-base para documentos do corpus CVM.
 * - título para documentos web.
 */
export function formatarFontes(documents: DocumentoSimilar[]): string {
  if (!documents || documents.length === 0) {
    return '';
  }

  const seenUrls = new Set<string>();
  const uniqueDocs: DocumentoSimilar[] = [];

  for (const doc of documents) {
    const url = doc.sourceUrl?.trim();
    if (url) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        uniqueDocs.push(doc);
      }
    } else {
      uniqueDocs.push(doc);
    }
  }

  if (uniqueDocs.length === 0) {
    return '';
  }

  const linhas = uniqueDocs.map((doc) => {
    const isCorpus = doc.sourceType === 'corpus' || (doc.ticker && doc.period);

    if (isCorpus) {
      // Formato CVM: ticker + período + data-base
      const ticker = doc.ticker ?? 'CVM';
      const periodo = doc.period ?? '';
      const dataBase = doc.periodEnd ? ` (data-base: ${doc.periodEnd})` : '';
      const url = doc.sourceUrl ? ` - ${doc.sourceUrl}` : '';
      return `- ${ticker} ${periodo}${dataBase}${url}`.trim();
    } else {
      // Formato Web: título
      const title = doc.title || 'Web';
      const url = doc.sourceUrl ? ` - ${doc.sourceUrl}` : '';
      return `- ${title}${url}`.trim();
    }
  });

  return `\n\nFontes:\n${linhas.join('\n')}`;
}

export interface FormatRespostaParams {
  respostaLlm: string;
  documents: DocumentoSimilar[];
}

/**
 * Aplica o filtro determinístico de guardrail e anexa o bloco de fontes deduplicado.
 * Se o texto contiver linguagem recomendatória, o corpo inteiro é substituído
 * pelo aviso fixo de guardrail, mantendo intactas as citações.
 */
export function formatarResposta(params: FormatRespostaParams): string {
  const { respostaLlm, documents } = params;
  let corpo = (respostaLlm ?? '').trim();

  // Filtro determinístico de recomendação
  if (contemLinguagemRecomendatoria(corpo)) {
    corpo = GUARDRAIL_DISCLAIMER;
  }

  const blocoFontes = formatarFontes(documents);
  return blocoFontes ? `${corpo}${blocoFontes}` : corpo;
}
