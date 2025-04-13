import { ChatMessageAnnotationUsage } from './chat-message-annotation-usage';
import type { MessageAnnotation } from '@/types/chat';

export function ChatMessageAnnotation({ annotation }: { readonly annotation: MessageAnnotation }) {
  switch (annotation.type) {
    case 'usage': {
      return <ChatMessageAnnotationUsage annotation={annotation} />;
    }

    default: {
      const exhaustiveCheck: never = annotation.type;
      throw new Error(`Unknown annotation type: ${exhaustiveCheck}`);
    }
  }
}
