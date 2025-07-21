import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';

const snakeToSentenceCase = (string_: string) => string_.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

export const transferToStartingWith = `transfer_to`;

export function ChatMessageToolTransfer({ part }: { readonly part: ToolInvocationUIPart }): React.JSX.Element {
  const { toolName } = part.toolInvocation;
  const destination = toolName.split(transferToStartingWith)[1];

  if (!destination) {
    throw new Error(`Invalid tool name ${toolName}`);
  }

  const sentenceCasedDestination = snakeToSentenceCase(destination);

  return <p className="text-sm text-muted-foreground italic">Consulting {sentenceCasedDestination}</p>;
}
