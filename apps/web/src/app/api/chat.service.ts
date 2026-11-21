import { Injectable } from '@angular/core';
import type {
  AnswerChatEvent,
  ChatEvent,
  ChatStreamEvent,
  ErrorChatEvent,
  GradeChatEvent,
  ResumoDocumento,
  RetrieveChatEvent,
  WebSearchChatEvent,
} from '@hero/contracts';

export type {
  AnswerChatEvent,
  ChatEvent,
  ChatStreamEvent,
  ErrorChatEvent,
  GradeChatEvent,
  ResumoDocumento,
  RetrieveChatEvent,
  WebSearchChatEvent,
};

export interface AskOptions {
  signal?: AbortSignal;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  /**
   * Envia uma pergunta para `POST /api/chat`, lê o `ReadableStream` de Server-Sent Events (SSE)
   * e produz um `AsyncGenerator` dos eventos do grafo (`retrieve`, `grade`, `webSearch`, `answer`).
   * Caso um frame de evento `error` seja recebido, lança uma exceção com a mensagem do erro.
   */
  async *ask(
    question: string,
    options?: AskOptions,
  ): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ question }),
      ...(options?.signal ? { signal: options.signal } : {}),
    };

    const response = await fetch('/api/chat', requestInit);

    if (!response.ok) {
      let errorDetail = `Erro HTTP ${response.status}`;
      try {
        const errorBody = (await response.json()) as {
          detail?: string;
          message?: string;
          error?: string;
        };
        errorDetail = errorBody.detail ?? errorBody.message ?? errorBody.error ?? errorDetail;
      } catch {
        // Ignora erro de parse caso a resposta não seja JSON
      }
      throw new Error(errorDetail);
    }

    if (!response.body) {
      throw new Error('Corpo da resposta SSE (ReadableStream) não está disponível.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const event = this.parseSseFrame(frame);
          if (event) {
            yield event;
          }
        }

        if (done) {
          buffer += decoder.decode();
          if (buffer.trim().length > 0) {
            const finalFrames = buffer.split(/\r?\n\r?\n/);
            for (const frame of finalFrames) {
              const event = this.parseSseFrame(frame);
              if (event) {
                yield event;
              }
            }
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseSseFrame(rawFrame: string): ChatStreamEvent | null {
    const trimmed = rawFrame.trim();
    if (!trimmed) {
      return null;
    }

    let eventHeader: string | undefined;
    const dataLines: string[] = [];

    for (const line of trimmed.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventHeader = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    const rawJson = dataLines.join('\n');
    const parsed = JSON.parse(rawJson) as {
      node?: string;
      type?: string;
      error?: string;
      message?: string;
      detail?: string;
    };

    const nodeType = parsed?.node ?? parsed?.type ?? eventHeader;

    if (nodeType === 'error' || eventHeader === 'error') {
      const errorMessage =
        typeof parsed?.error === 'string'
          ? parsed.error
          : typeof parsed?.message === 'string'
            ? parsed.message
            : typeof parsed?.detail === 'string'
              ? parsed.detail
              : 'Erro durante a execução do grafo';
      throw new Error(errorMessage);
    }

    return parsed as ChatStreamEvent;
  }
}
