import type { ToolUIPart } from 'ai';
import { getToolName } from 'ai';

const snakeToSentenceCase = (string_: string) => string_.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());

export const transferToStartingWith = `transfer_to_`;
export const transferBackStartingWith = `transfer_back_to_`;

export function ChatMessageToolTransfer({ part }: { readonly part: ToolUIPart }): React.JSX.Element {
  const toolName = getToolName(part);

  let destination: string | undefined;
  let isTransferBack = false;

  if (toolName.startsWith(transferBackStartingWith)) {
    destination = toolName.slice(transferBackStartingWith.length);
    isTransferBack = true;
  } else if (toolName.startsWith(transferToStartingWith)) {
    destination = toolName.slice(transferToStartingWith.length);
  }

  if (!destination) {
    throw new Error(`Invalid tool name ${toolName}`);
  }

  const sentenceCasedDestination = snakeToSentenceCase(destination);

  return (
    <p className="text-sm text-muted-foreground italic">
      {isTransferBack ? 'Returning to' : 'Consulting'} {sentenceCasedDestination}
    </p>
  );
}
