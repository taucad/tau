import { useMemo } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { MachineJob } from '@taucad/runtime/machine';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { pendingAgentHostApprovals } from '#components/chat/chat-approval-banner.js';
import type { PendingAgentHostApproval } from '#components/chat/chat-approval-banner.js';
import { pendingMachineActionOf } from '#components/print/machine-action-approval.js';
import type { PendingMachineAction } from '#components/print/machine-action-approval.js';
import { useChatSelector } from '#hooks/use-chat.js';

/**
 * The chat interrupt a Tau-hosted job request paused on, for one job: the one whose context names the job.
 *
 * @param messages - The chat's live message list.
 * @param job - The job to correlate.
 * @returns The pending interrupt, or nothing when the run did not pause on this job.
 * @public
 */
export const pendingApprovalForJob = (
  messages: readonly MyUIMessage[],
  job: Pick<MachineJob, 'jobId'>,
): PendingAgentHostApproval | undefined =>
  pendingAgentHostApprovals(messages).find((approval) => approval.context?.jobId === job.jobId);

/**
 * The machine actions a paused Tau agent waits on for one machine.
 *
 * @param messages - The chat's live message list.
 * @param machineId - The machine the pane shows.
 * @returns The pending actions, oldest first.
 * @public
 */
export const pendingMachineActions = (
  messages: readonly MyUIMessage[],
  machineId: string,
): readonly PendingMachineAction[] =>
  pendingAgentHostApprovals(messages).flatMap((approval) => {
    const pending = pendingMachineActionOf(approval);
    return pending?.machineId === machineId ? [pending] : [];
  });

/** How the Print pane answers a chat interrupt for a job or a machine action. @public */
export type MachineApprovalBridge = Readonly<{
  pendingForJob: (job: Pick<MachineJob, 'jobId'>) => PendingAgentHostApproval | undefined;
  pendingActions: (machineId: string) => readonly PendingMachineAction[];
  respond: (approvalId: string, approved: boolean) => Promise<void>;
}>;

/**
 * Bridge the Print pane to the chat's pending interrupts.
 *
 * Approving through the interrupt lets the paused tool call resolve the job or apply the action itself, naming the
 * person's approval; the pane resolves a job directly only when no run is waiting.
 *
 * @returns The bridge for the focused chat.
 * @public
 */
export const useMachineApprovalBridge = (): MachineApprovalBridge => {
  const messages = useChatSelector((state) => state.messages);
  const { respondToToolApproval } = useCadChatClient();
  return useMemo(
    () => ({
      pendingForJob: (job) => pendingApprovalForJob(messages, job),
      pendingActions: (machineId) => pendingMachineActions(messages, machineId),
      respond: async (approvalId, approved) => {
        await respondToToolApproval(approvalId, approved);
      },
    }),
    [messages, respondToToolApproval],
  );
};
