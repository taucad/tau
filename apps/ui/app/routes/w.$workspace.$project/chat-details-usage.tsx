import { ChatDetailsUsageTable } from '#routes/w.$workspace.$project/chat-details-usage-table.js';
import { ProjectCreditsLine } from '#routes/w.$workspace.$project/chat-receipt-credits.js';

/**
 * The project's chat usage: tokens per class from the chat records, and the credits taken from the funded operations'
 * own receipts. The table is Core (`chat-details-usage-table.tsx`) and the credits line is the Cloud-only receipt leaf,
 * so an adaptive build's facade renders the same table with the line from the Cloud chunk (gate G1).
 *
 * @param props - Whether the chat records are read.
 * @returns The usage panel, or nothing when the project has no recorded usage.
 */
export function ChatDetailsUsage({ enabled = true }: { readonly enabled?: boolean } = {}):
  | React.JSX.Element
  | undefined {
  return (
    <ChatDetailsUsageTable
      isEnabled={enabled}
      credits={(operationIds) => <ProjectCreditsLine operationIds={operationIds} />}
    />
  );
}
