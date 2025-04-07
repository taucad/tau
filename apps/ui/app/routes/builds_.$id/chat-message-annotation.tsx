import { MessageAnnotation } from '@/types/chat';
import { ChatMessageAnnotationUsage } from './chat-message-annotation-usage';

export function ChatMessageAnnotation({ annotation }: { annotation: MessageAnnotation }) {
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
