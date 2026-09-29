import { useMemo } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { PrintRequest } from '@taucad/runtime/machine';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { pendingAgentHostApprovals } from '#components/chat/chat-approval-banner.js';
import type { PendingAgentHostApproval } from '#components/chat/chat-approval-banner.js';
import { useChatSelector } from '#hooks/use-chat.js';

/**
 * The chat interrupt a Tau-hosted `request_print` paused on, for one request.
 *
 * The tool pauses the run with `{ requestId, machineId, fileName }` in the
 * interrupt context (blueprint D5). When the projected approval carries that
 * context the match is exact; otherwise the one pending approval whose prompt
 * names the request's file is the same record.
 *
 * @param messages - The chat's live message list.
 * @param request - The print request to correlate.
 * @returns The pending interrupt, or nothing when the run did not pause on this request.
 * @public
 */
export const pendingApprovalForPrintRequest = (
  messages: readonly MyUIMessage[],
  request: Pick<PrintRequest, 'requestId' | 'summary'>,
): PendingAgentHostApproval | undefined => {
  const pending = pendingAgentHostApprovals(messages);
  const exact = pending.find((approval) => approval.context?.requestId === request.requestId);
  if (exact) {
    return exact;
  }
  // ponytail: hosts that predate the approval context are matched by file name; drop when every host carries `context`.
  const [only] = pending;
  return pending.length === 1 &&
    only?.context?.requestId === undefined &&
    only?.prompt.includes(request.summary.fileName)
    ? only
    : undefined;
};

/** How the Print pane answers a chat interrupt for a print request. @public */
export type PrintApprovalBridge = Readonly<{
  pendingFor: (request: Pick<PrintRequest, 'requestId' | 'summary'>) => PendingAgentHostApproval | undefined;
  respond: (approvalId: string, approved: boolean) => Promise<void>;
}>;

/**
 * Bridge the Print pane to the chat's pending interrupt.
 *
 * Approving through the interrupt lets the paused `request_print` tool call
 * resolve the ledger record itself; the pane resolves it directly only when no
 * run is waiting (blueprint D5).
 *
 * @returns The bridge for the focused chat.
 * @public
 */
export const usePrintApprovalBridge = (): PrintApprovalBridge => {
  const messages = useChatSelector((state) => state.messages);
  const { respondToToolApproval } = useCadChatClient();
  return useMemo(
    () => ({
      pendingFor: (request) => pendingApprovalForPrintRequest(messages, request),
      respond: async (approvalId, approved) => {
        await respondToToolApproval(approvalId, approved);
      },
    }),
    [messages, respondToToolApproval],
  );
};
