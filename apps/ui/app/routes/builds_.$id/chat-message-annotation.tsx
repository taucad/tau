import { ChatMessageAnnotationUsage } from './chat-message-annotation-usage.js';
import type { MessageAnnotation } from '@/types/chat.js';

export function ChatMessageAnnotation({ annotation }: { readonly annotation: MessageAnnotation }) {
  switch (annotation.type) {
    case 'usage': {
      return <ChatMessageAnnotationUsage annotation={annotation} />;
    }

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check
    default: {
      const exhaustiveCheck: never = annotation.type;
      throw new Error(`Unknown annotation type: ${String(exhaustiveCheck)}`);
    }
  }
}
