export interface Citation {
  label: string;
  url: string;
  origin: string;
  period?: string;
}

export interface ParsedAnswer {
  body: string;
  citations: Citation[];
}

const FONTES_BLOCK_REGEX = /(?:^|\r?\n)\s*Fontes:\s*\r?\n([\s\S]*)$/i;
const LINE_BULLET_REGEX = /^(?:[-*•]|\[\d+\]|\d+\.)\s*/;
const LABEL_URL_SEPARATOR_REGEX = /^(.*?)\s*(?:[—–-]|:)\s*(https?:\/\/\S+)\s*$/;
const LABEL_URL_FALLBACK_REGEX = /^(.*?)\s+(https?:\/\/\S+)\s*$/;
const CVM_LABEL_REGEX = /^[A-Z]{4}\d{0,2}\s*(?:·|\s)\s*(.+?\(data-base:?\s*[^)]+\))$/i;

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function parseCitationLine(rawLine: string): Citation | null {
  const cleaned = rawLine.trim().replace(LINE_BULLET_REGEX, '').trim();
  if (!cleaned) {
    return null;
  }

  const match = LABEL_URL_SEPARATOR_REGEX.exec(cleaned) ?? LABEL_URL_FALLBACK_REGEX.exec(cleaned);
  if (!match) {
    return null;
  }

  const label = match[1].trim();
  const url = match[2].trim();
  if (!label || !url) {
    return null;
  }

  const cvmMatch = CVM_LABEL_REGEX.exec(label);
  if (cvmMatch) {
    return {
      label,
      url,
      period: cvmMatch[1].trim(),
      origin: 'Base local (CVM)',
    };
  }

  return {
    label,
    url,
    origin: extractHostname(url),
  };
}

/**
 * Separa o corpo da resposta do bloco `Fontes:` ao final e extrai uma `Citation` por linha.
 * - Se o rótulo seguir o padrão `TICKER · período (data-base X)`, extrai o período e define
 *   a origem como `'Base local (CVM)'`.
 * - Caso contrário, define a origem como o `hostname` da URL.
 */
export function parseAnswer(answerText: string): ParsedAnswer {
  if (!answerText || typeof answerText !== 'string') {
    return { body: '', citations: [] };
  }

  const match = FONTES_BLOCK_REGEX.exec(answerText);
  if (!match) {
    return {
      body: answerText.trim(),
      citations: [],
    };
  }

  const body = answerText.slice(0, match.index).trim();
  const rawBlock = match[1] ?? '';
  const citations: Citation[] = [];

  for (const line of rawBlock.split(/\r?\n/)) {
    const citation = parseCitationLine(line);
    if (citation) {
      citations.push(citation);
    }
  }

  return {
    body,
    citations,
  };
}
