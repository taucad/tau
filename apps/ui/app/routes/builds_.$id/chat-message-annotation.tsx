import { ChatMessageAnnotationUsageAggregated } from '~/routes/builds_.$id/chat-message-annotation-usage.js';
import type { MessageAnnotation } from '~/types/chat.types.js';

// Controller component that routes to appropriate annotation handlers
export function ChatMessageAnnotation({ annotation }: { readonly annotation: MessageAnnotation }): React.JSX.Element {
  switch (annotation.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- supporting future types
    case 'usage': {
      return <ChatMessageAnnotationUsageAggregated annotations={[annotation]} />;
    }

    default: {
      const exhaustiveCheck: never = annotation.type;
      throw new Error(`Unknown annotation type: ${String(exhaustiveCheck)}`);
    }
  }
}

// Controller component for multiple annotations
export function ChatMessageAnnotations({
  annotations,
}: {
  readonly annotations: MessageAnnotation[];
}): React.JSX.Element | undefined {
  // Filter for usage annotations only
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- supporting future types
  const usageAnnotations = annotations.filter((annotation) => annotation.type === 'usage');

  if (usageAnnotations.length === 0) {
    return undefined;
  }

  return <ChatMessageAnnotationUsageAggregated annotations={usageAnnotations} />;
}
