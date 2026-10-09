import type { MachineClient } from '@taucad/runtime/machine';
import type { AgentHostApproval } from '#services/agent-host-event-projection.js';

/** A pending interrupt as the chat answers it: the approval and the id the answer names. @public */
export type ActionInterrupt = AgentHostApproval & { readonly approvalId: string };

/** One declared action an agent asked to apply, waiting for the person's approval. @public */
export type PendingMachineAction = Readonly<{
  approval: ActionInterrupt;
  machineId: string;
  componentId: string;
  action: string;
  operationId: string;
  label: string;
  /** The parameters of the exact intent, as the agent asked for them. */
  parameters: Readonly<Record<string, unknown>>;
  /** The action version of that intent, which the host's approval record names. */
  version: number;
  /** The agent's own words for the request, as the chat shows them. */
  prompt: string;
}>;

/**
 * The machine action one interrupt pauses on, when it pauses on one. The agent tool pauses with
 * `{ machineId, componentId, action, operationId, label, intent }`; on approval the tool applies exactly that intent.
 *
 * @param approval - One pending interrupt.
 * @returns The action, or nothing when the interrupt is not a machine action's.
 * @public
 */
export const pendingMachineActionOf = (approval: ActionInterrupt): PendingMachineAction | undefined => {
  const { context } = approval;
  return context?.machineId === undefined ||
    context.componentId === undefined ||
    context.action === undefined ||
    context.operationId === undefined ||
    context.version === undefined
    ? undefined
    : {
        approval,
        machineId: context.machineId,
        componentId: context.componentId,
        action: context.action,
        operationId: context.operationId,
        label: context.label ?? approval.prompt,
        parameters: context.parameters ?? {},
        version: context.version,
        prompt: approval.prompt,
      };
};

/**
 * Answer an agent's machine action: record the person's decision on the host through their own machines session
 * first (the agent's session cannot record one, R15), then answer the interrupt so the paused tool applies the intent
 * the host now holds an approval for, or reports the denial.
 *
 * @param answer - The person's machines client, the action the agent waits on, the person's decision and how the
 *   chat interrupt is answered.
 * @throws When the host refuses to record the decision; the interrupt is then left unanswered.
 * @public
 */
export const answerMachineAction = async ({
  client,
  pending,
  approved,
  respond,
}: Readonly<{
  client: MachineClient;
  pending: PendingMachineAction;
  approved: boolean;
  respond: (approvalId: string, approved: boolean) => Promise<void>;
}>): Promise<void> => {
  const { machineId, operationId, componentId, action, version, parameters } = pending;
  const recorded = await client.approveAction({
    machineId,
    operationId,
    intent: { componentId, action, version, parameters },
    decision: approved ? 'approve' : 'deny',
  });
  if (recorded.status === 'refused') {
    throw new Error(recorded.message);
  }
  await respond(pending.approval.approvalId, approved);
};
