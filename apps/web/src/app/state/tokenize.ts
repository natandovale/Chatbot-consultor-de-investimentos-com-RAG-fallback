/**
 * Divide um texto em tokens de palavras para revelação progressiva no chat.
 */
export function tokenize(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/\s+/);
}
