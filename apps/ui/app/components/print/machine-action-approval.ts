import type { MachineClient } from '@taucad/runtime/machine';
import { describePrintError } from '#components/print/machine-facts.js';
import { operator } from '#hooks/use-machine-control.js';
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
  /** The run the agent saw when it asked, `null` for none: the approval admits the action for this run only (R16). */
  // oxlint-disable-next-line typescript/no-restricted-types -- null is the agent's statement that it saw no run.
  expectedRunId: string | null;
  /** The agent's own words for the request, as the chat shows them. */
  prompt: string;
}>;

/**
 * The machine action one interrupt pauses on, when it pauses on one. The agent tool pauses with
 * `{ machineId, componentId, action, operationId, label, intent }`; on approval the tool applies exactly that intent.
 * An interrupt whose intent does not say which run the agent saw is not one the host can approve, so it is none.
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
    context.version === undefined ||
    context.expectedRunId === undefined
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
        expectedRunId: context.expectedRunId,
        prompt: approval.prompt,
      };
};

/**
 * Answer a deny whatever the host says. A deny needs no host record to be safe: the paused tool reports a denied
 * action without sending it and withdraws a job whose deny went unrecorded. So the record is best effort, the
 * interrupt is always answered, and what kept the record from landing is thrown only after that.
 *
 * @param record - Records the deny on the person's machines session.
 * @param respond - Answers the interrupt denied.
 * @throws After answering, when the record failed; the message says the answer was still sent.
 * @public
 */
export const answerDeny = async (record: () => Promise<void>, respond: () => Promise<void>): Promise<void> => {
  let failure: unknown;
  try {
    await record();
  } catch (error) {
    failure = error;
  }
  await respond();
  if (failure !== undefined) {
    throw new Error(`Your answer was sent, but the host did not record it: ${describePrintError(failure)}`, {
      cause: failure,
    });
  }
};

/**
 * Record the person's decision on an agent's machine action on the host, through their own machines session (R15),
 * for the exact intent and run the agent asked with (R16). Nothing answers the interrupt here.
 *
 * @param client - The person's machines client.
 * @param pending - The action the agent waits on.
 * @param approved - The person's decision.
 * @throws When the host refuses to record it.
 * @public
 */
export const recordMachineAction = async (
  client: MachineClient,
  pending: PendingMachineAction,
  approved: boolean,
): Promise<void> => {
  const { machineId, operationId, componentId, action, version, expectedRunId, parameters } = pending;
  const recorded = await client.approveAction({
    machineId,
    operationId,
    intent: { componentId, action, version, expectedRunId, parameters },
    decision: approved ? 'approve' : 'deny',
    approvedBy: operator,
  });
  if (recorded.status === 'refused') {
    throw new Error(recorded.message);
  }
};

/**
 * Answer an agent's machine action: record the person's decision on the host through their own machines session
 * first (the agent's session cannot record one, R15), for the exact intent and run the agent asked with (R16), then
 * answer the interrupt so the paused tool applies the intent
 * the host now holds an approval for, or reports the denial.
 *
 * @param answer - The person's machines client, the action the agent waits on, the person's decision and how the
 *   chat interrupt is answered.
 * @throws When the host refuses to record an approval; the interrupt is then left unanswered. A deny is always
 *   answered ({@link answerDeny}).
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
  const record = async (): Promise<void> => recordMachineAction(client, pending, approved);
  const answer = async (): Promise<void> => respond(pending.approval.approvalId, approved);
  if (!approved) {
    await answerDeny(record, answer);
    return;
  }
  await record();
  await answer();
};
