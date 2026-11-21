import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ChatStore, type ChatMessage } from '../state/chat-store';
import { parseAnswer, type ParsedAnswer } from '../state/citation';
import { GraphPanelComponent } from '../graph/graph-panel/graph-panel';

@Component({
  selector: 'app-chat',
  imports: [GraphPanelComponent],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chat {
  protected readonly store = inject(ChatStore);
  protected readonly draft = signal('');

  protected readonly isWaitingForResponse = computed(() => {
    if (this.store.isStreaming()) {
      return true;
    }
    const lastMessage = this.store.messages().at(-1);
    if (!lastMessage) {
      return false;
    }
    return lastMessage.role === 'user' || Boolean(lastMessage.isStreaming);
  });

  protected readonly isSendDisabled = computed(
    () => this.draft().trim().length === 0 || this.isWaitingForResponse(),
  );

  protected onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | HTMLInputElement | null;
    this.draft.set(target?.value ?? '');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    if (this.isSendDisabled()) {
      return;
    }

    const question = this.draft().trim();
    this.draft.set('');
    void this.store.send(question);
  }

  protected parseAssistantMessage(message: ChatMessage): ParsedAnswer {
    const raw = message.content ?? message.text ?? '';
    return parseAnswer(raw);
  }
}

export { Chat as ChatComponent };
