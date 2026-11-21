import { computed, DestroyRef, inject, Injectable, type OnDestroy, signal } from '@angular/core';
import { ChatService, type ChatStreamEvent, type ResumoDocumento } from '../api/chat.service';
import { GraphStore, type GraphStep } from './graph-store';
import { tokenize } from './tokenize';

export { tokenize, type GraphStep };

export const WORD_REVEAL_INTERVAL_MS = 70;
export const FIXED_ERROR_MESSAGE =
  'Não foi possível processar sua pergunta no momento. Tente novamente em instantes.';
export const CHAT_ERROR_MESSAGE = FIXED_ERROR_MESSAGE;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  text: string;
  isStreaming: boolean;
  isError?: boolean;
  sources?: ResumoDocumento[];
}

@Injectable({ providedIn: 'root' })
export class ChatStore implements OnDestroy {
  private readonly chatService = inject(ChatService);
  private readonly graphStore = inject(GraphStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _sources = signal<ResumoDocumento[]>([]);
  private readonly _selectedSource = signal<ResumoDocumento | null>(null);
  private readonly _isStreaming = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly messages = this._messages.asReadonly();
  readonly steps = this.graphStore.steps;
  readonly sources = this._sources.asReadonly();
  readonly selectedSource = this._selectedSource.asReadonly();
  readonly isStreaming = this._isStreaming.asReadonly();
  readonly error = this._error.asReadonly();

  readonly currentStep = computed(() => this.steps().at(-1)?.node ?? null);

  private revealTimer: ReturnType<typeof setInterval> | null = null;
  private messageCounter = 0;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearTimer();
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  async send(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }

    this.clearTimer();
    this._error.set(null);
    this.graphStore.start();
    this._sources.set([]);
    this._selectedSource.set(null);
    this._isStreaming.set(true);

    const userMsgId = `user-${++this.messageCounter}`;
    const assistantMsgId = `assistant-${++this.messageCounter}`;

    this._messages.update((current) => [
      ...current,
      {
        id: userMsgId,
        role: 'user',
        content: trimmed,
        text: trimmed,
        isStreaming: false,
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        text: '',
        isStreaming: true,
        isError: false,
        sources: [],
      },
    ]);

    let collectedSources: ResumoDocumento[] = [];
    let answerStarted = false;

    try {
      for await (const event of this.chatService.ask(trimmed)) {
        this.handleStreamEvent(event, assistantMsgId, (docs) => {
          collectedSources = docs;
        });
        if (event.node === 'answer') {
          answerStarted = true;
          this.startWordByWordReveal(assistantMsgId, event.answer, collectedSources);
        }
      }

      if (!answerStarted) {
        this.finishAssistantMessage(assistantMsgId, collectedSources);
      }
    } catch {
      this.clearTimer();
      this._error.set(FIXED_ERROR_MESSAGE);
      this._isStreaming.set(false);
      this._messages.update((current) =>
        current.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: FIXED_ERROR_MESSAGE,
                text: FIXED_ERROR_MESSAGE,
                isStreaming: false,
                isError: true,
              }
            : msg,
        ),
      );
    }
  }

  selectSource(source: ResumoDocumento | null): void {
    this._selectedSource.set(source);
  }

  reset(): void {
    this.clearTimer();
    this._messages.set([]);
    this.graphStore.reset();
    this._sources.set([]);
    this._selectedSource.set(null);
    this._isStreaming.set(false);
    this._error.set(null);
  }

  private handleStreamEvent(
    event: ChatStreamEvent,
    assistantMsgId: string,
    onSourcesUpdated: (docs: ResumoDocumento[]) => void,
  ): void {
    this.graphStore.onEvent(event);

    if (event.node === 'retrieve') {
      this._sources.set(event.documents);
      onSourcesUpdated(event.documents);
      this._messages.update((current) =>
        current.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, sources: event.documents } : msg,
        ),
      );
    }
  }

  private startWordByWordReveal(
    assistantMsgId: string,
    fullAnswer: string,
    sources: ResumoDocumento[],
  ): void {
    this.clearTimer();
    const words = tokenize(fullAnswer);
    const separators = fullAnswer.trim().match(/\s+/g) ?? [];

    if (words.length === 0) {
      this.finishAssistantMessage(assistantMsgId, sources);
      return;
    }

    let revealedCount = 0;

    this.revealTimer = setInterval(() => {
      revealedCount++;
      const isComplete = revealedCount >= words.length;
      const partialText = words
        .slice(0, revealedCount)
        .map((word, idx) => (idx < revealedCount - 1 ? word + (separators[idx] ?? ' ') : word))
        .join('');

      this._messages.update((current) =>
        current.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: partialText,
                text: partialText,
                isStreaming: !isComplete,
                sources,
              }
            : msg,
        ),
      );

      if (isComplete) {
        this.clearTimer();
        this._isStreaming.set(false);
      }
    }, WORD_REVEAL_INTERVAL_MS);
  }

  private finishAssistantMessage(assistantMsgId: string, sources: ResumoDocumento[]): void {
    this._isStreaming.set(false);
    this._messages.update((current) =>
      current.map((msg) =>
        msg.id === assistantMsgId
          ? {
              ...msg,
              isStreaming: false,
              sources,
            }
          : msg,
      ),
    );
  }

  private clearTimer(): void {
    if (this.revealTimer !== null) {
      clearInterval(this.revealTimer);
      this.revealTimer = null;
    }
  }
}
