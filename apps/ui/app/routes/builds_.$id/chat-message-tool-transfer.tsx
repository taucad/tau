import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import type { JSX } from 'react';

const snakeToSentenceCase = (string_: string) => string_.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

export const transferToStartingWith = `transfer_to`;

export function ChatMessageToolTransfer({ part }: { readonly part: ToolInvocationUIPart }): JSX.Element {
  const { toolName } = part.toolInvocation;
  const destination = toolName.split(transferToStartingWith)[1];
  const sentenceCasedDestination = snakeToSentenceCase(destination);

  return <p className="text-sm text-muted-foreground italic">Consulting {sentenceCasedDestination}</p>;
}
