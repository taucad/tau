import type { ToolUIPart } from 'ai';
import { getToolName } from 'ai';

const snakeToSentenceCase = (string_: string) => string_.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

export const transferToStartingWith = `transfer_to`;

export function ChatMessageToolTransfer({ part }: { readonly part: ToolUIPart }): React.JSX.Element {
  const toolName = getToolName(part);
  const destination = toolName.split(transferToStartingWith)[1];

  if (!destination) {
    throw new Error(`Invalid tool name ${toolName}`);
  }

  const sentenceCasedDestination = snakeToSentenceCase(destination);

  return <p className="text-sm text-muted-foreground italic">Consulting {sentenceCasedDestination}</p>;
}
