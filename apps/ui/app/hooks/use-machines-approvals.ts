import { useMemo } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { MachineJob } from '@taucad/runtime/machine';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { pendingAgentHostApprovals } from '#components/chat/chat-approval-banner.js';
import type { PendingAgentHostApproval } from '#components/chat/chat-approval-banner.js';
import { useChatSelector } from '#hooks/use-chat.js';

/**
 * The chat interrupt a Tau-hosted job request paused on, for one job.
 *
 * The tool pauses the run with `{ jobId, machineId, fileName }` in the interrupt
 * context. When the projected approval carries that context the match is exact;
 * otherwise the one pending approval whose prompt names the program is the same record.
 *
 * @param messages - The chat's live message list.
 * @param job - The job to correlate.
 * @returns The pending interrupt, or nothing when the run did not pause on this job.
 * @public
 */
export const pendingApprovalForJob = (
  messages: readonly MyUIMessage[],
  job: Pick<MachineJob, 'jobId' | 'program'>,
): PendingAgentHostApproval | undefined => {
  const pending = pendingAgentHostApprovals(messages);
  const exact = pending.find((approval) => approval.context?.jobId === job.jobId);
  if (exact) {
    return exact;
  }
  // ponytail: hosts that predate the approval context are matched by program name; drop when every host carries `context`.
  const [only] = pending;
  return pending.length === 1 &&
    only?.context?.jobId === undefined &&
    only?.context?.action === undefined &&
    only?.prompt.includes(job.program.name)
    ? only
    : undefined;
};

/** One declared action an agent asked to apply, waiting for the person's approval. @public */
export type PendingMachineAction = Readonly<{
  approval: PendingAgentHostApproval;
  machineId: string;
  componentId: string;
  action: string;
  operationId: string;
  label: string;
}>;

/**
 * The machine actions a paused Tau agent waits on for one machine. The agent tool pauses with
 * `{ machineId, componentId, action, operationId, label }`; on approval the tool applies exactly that intent.
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
  pendingAgentHostApprovals(messages).flatMap((approval): PendingMachineAction[] => {
    const { context } = approval;
    return context?.machineId === machineId &&
      context.componentId !== undefined &&
      context.action !== undefined &&
      context.operationId !== undefined
      ? [
          {
            approval,
            machineId,
            componentId: context.componentId,
            action: context.action,
            operationId: context.operationId,
            label: context.label ?? approval.prompt,
          },
        ]
      : [];
  });

/** How the Print pane answers a chat interrupt for a job or a machine action. @public */
export type MachineApprovalBridge = Readonly<{
  pendingForJob: (job: Pick<MachineJob, 'jobId' | 'program'>) => PendingAgentHostApproval | undefined;
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
