import type { JSX } from 'react';
import { ChatMessageAnnotationUsageAggregated } from '~/routes/builds_.$id/chat-message-annotation-usage.js';
import type { MessageAnnotation } from '~/types/chat.js';

// Controller component that routes to appropriate annotation handlers
export function ChatMessageAnnotation({ annotation }: { readonly annotation: MessageAnnotation }): JSX.Element {
  switch (annotation.type) {
    case 'usage': {
      return <ChatMessageAnnotationUsageAggregated annotations={[annotation]} />;
    }

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check
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
}): JSX.Element | undefined {
  // Filter for usage annotations only
  const usageAnnotations = annotations.filter((annotation) => annotation.type === 'usage');

  if (usageAnnotations.length === 0) {
    return undefined;
  }

  return <ChatMessageAnnotationUsageAggregated annotations={usageAnnotations} />;
}
