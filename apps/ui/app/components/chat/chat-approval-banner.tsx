import { ShieldQuestion } from 'lucide-react';
import { getToolPartName, isAnyToolPart } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { Button } from '@taucad/ui/components/button';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { agentApprovalToolName, parseAgentHostApproval } from '#services/agent-host-event-projection.js';
import type { AgentHostApproval, AgentHostApprovalOption } from '#services/agent-host-event-projection.js';
import { toast } from '#components/ui/sonner.js';
import { ChatLoginAffordance } from '#components/chat/chat-login-affordance.js';

/** One unresolved interrupt, located in the transcript that projected it. @public */
export type PendingAgentHostApproval = AgentHostApproval & {
  /** Assistant message whose part carries the request. */
  readonly messageId: string;
  /** Id the chat client resolves — the SDK approval id, which is the interrupt id for a host-projected part. */
  readonly approvalId: string;
};

/**
 * The message the newest run wrote, which is the only run still answerable.
 *
 * Every run projects exactly one assistant message (`run.lifecycle: admitted`
 * mints it with the run id), so an interrupt in any earlier message belongs to a
 * run that already reached a terminal state: nothing will ever resolve it, and
 * leaving it in the pending list hides every later interrupt behind it.
 */
const currentRunMessage = (messages: readonly MyUIMessage[]): MyUIMessage | undefined =>
  messages.findLast((message) => message.role === 'assistant');

/**
 * Every interrupt the chat is currently paused on.
 *
 * Reads the transcript, not a side channel: a host-projected interrupt becomes
 * a `tau_agent_approval` part carrying the prompt and the options the host
 * recorded, and a Tau tool gated by the API becomes an ordinary tool part in
 * the same `approval-requested` state. Both are pending here, and both
 * leave it only when the durable resolution settles the part — never on a click.
 *
 * @param messages - The chat's live message list.
 * @returns The pending interrupts, in transcript order.
 * @public
 */
export const pendingAgentHostApprovals = (messages: readonly MyUIMessage[]): readonly PendingAgentHostApproval[] => {
  const pending: PendingAgentHostApproval[] = [];
  const message = currentRunMessage(messages);
  if (!message) {
    return pending;
  }
  for (const part of message.parts) {
    if (!isAnyToolPart(part) || part.state !== 'approval-requested') {
      continue;
    }
    const projected =
      part.type === 'dynamic-tool' && part.toolName === agentApprovalToolName
        ? parseAgentHostApproval(part.input)
        : undefined;
    pending.push({
      messageId: message.id,
      approvalId: part.approval.id,
      interruptId: projected?.interruptId ?? part.approval.id,
      kind: projected?.kind ?? 'approval',
      prompt: projected?.prompt ?? getToolPartName(part),
      options: projected?.options ?? [],
      ...(projected?.agentId === undefined ? {} : { agentId: projected.agentId }),
      ...(projected?.login === undefined ? {} : { login: projected.login }),
    });
  }
  return pending;
};

/**
 * The login the current run is stuck on, resolved record and all.
 *
 * A login is never *answered* in Tau (X6/VI4): the refusal settles its own
 * record so the run does not stay flagged "approval required", and an
 * elicitation login is settled by the agent when the user finishes the flow
 * elsewhere. So the affordance cannot be read off the pending list — it is read
 * off the run's own record, and stands down only once that record says the
 * login was actually completed.
 *
 * @param messages - The chat's live message list.
 * @returns The login to present, or nothing.
 */
const currentRunLogin = (messages: readonly MyUIMessage[]): AgentHostApproval['login'] => {
  let login: AgentHostApproval['login'];
  for (const part of currentRunMessage(messages)?.parts ?? []) {
    if (!isAnyToolPart(part) || part.type !== 'dynamic-tool' || part.toolName !== agentApprovalToolName) {
      continue;
    }
    const projected = parseAgentHostApproval(part.input)?.login;
    const outcome = isRecord(part.output) ? part.output['outcome'] : undefined;
    if (projected && (part.state === 'approval-requested' || outcome === 'cancelled')) {
      login = projected;
    }
  }
  return login;
};

/**
 * Who is actually waiting, from the record first and the selection last.
 *
 * The durable interrupt names its own requester (V6), and that is the only
 * source that survives a reload — or a composer the user has already switched
 * to another agent while this run stays paused. `activeExecution` is the
 * fallback for an interrupt written before the marker existed.
 *
 * @param agentId - Agent id the durable interrupt recorded, when it has one.
 * @param execution - What the composer is currently selected on.
 * @returns The requester's product name.
 */
const requesterName = (agentId: string | undefined, execution: CadAgentExecution | undefined): string => {
  if (agentId !== undefined) {
    return externalAgentDisplayName(agentId);
  }
  switch (execution?.kind) {
    case 'acp': {
      return externalAgentDisplayName(execution.agentId);
    }
    case 'tau': {
      return 'Tau';
    }
    default: {
      return 'The agent';
    }
  }
};

/**
 * The option a keyboard lands on, and the one a bare Approve would have meant.
 *
 * `allow_once` is one turn's consent; `allow_always` is a standing grant the
 * user has to *choose* rather than fall onto (EQ5). The host already resolves a
 * bare approval the same way, so this is the presentation half of one ruling,
 * not a second default.
 *
 * @param options - Options the agent offered, in its own order.
 * @returns The option focus lands on, or `undefined` when none is an allowance.
 */
const defaultOption = (options: readonly AgentHostApprovalOption[]): AgentHostApprovalOption | undefined =>
  options.find((option) => option.kind === 'allow_once') ?? options.find((option) => option.kind?.startsWith('allow'));

/**
 * What approving actually buys, per placement.
 *
 * SP-4 Result 3 bounds both halves: an external agent inherits its own CLI's
 * approval policy, so Tau gates nothing inside the run and the only real
 * boundary is the materialized branch. A Tau turn has no branch of its own
 * unless the user chose one, so it must not claim one.
 */
const continuationNote = (execution: CadAgentExecution | undefined, name: string): string =>
  execution?.kind === 'acp'
    ? `Approving lets ${name} keep working in this chat's tree; Tau does not gate each action it takes there.`
    : `Approving lets ${name} continue this turn; Tau does not ask again for each action it takes.`;

/**
 * The one presenter for a paused run's interrupt, wherever the run is placed.
 *
 * Mounted above the composer (`chat-textarea.tsx`), because a run that is
 * waiting cannot be advanced from the transcript — the next thing the user does
 * is answer it. The copy is bounded by SP-4 Result 3: approving lets the agent
 * keep working inside this chat's tree, and Tau does **not** gate each action
 * it takes there.
 *
 * @returns The banner, or nothing while the chat has no pending interrupt.
 * @public
 */
export function ChatApprovalBanner(): React.JSX.Element | undefined {
  const { respondToToolApproval } = useCadChatClient();
  const activeExecution = useChatSelector((state) => state.activeExecution);
  const messages = useChatSelector((state) => state.messages);
  const login = currentRunLogin(messages);
  if (login) {
    /* Not a decision: nothing here is approved or denied, so the banner hands
     * over to the affordance that says what the *user* has to do (V11). */
    return <ChatLoginAffordance login={login} />;
  }
  // A paused run has exactly one unresolved interrupt: it stopped on it.
  const approval = pendingAgentHostApprovals(messages)[0];
  if (!approval) {
    return undefined;
  }

  const name = requesterName(approval.agentId, activeExecution);
  const focused = defaultOption(approval.options);
  const respond = (approved: boolean, optionId?: string): void => {
    const resolve = async (): Promise<void> => {
      try {
        await respondToToolApproval(approval.approvalId, approved, { optionId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The host did not accept that decision.');
      }
    };
    // async-iife: the banner clears when the durable resolution arrives, not here.
    void resolve();
  };

  return (
    <section
      aria-label='Approval required'
      className='mb-2 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <ShieldQuestion className='size-4 shrink-0 text-warning' />
        <p className='min-w-0 truncate font-medium'>{`${name} is waiting for approval`}</p>
      </div>
      <p className='min-w-0 break-words text-foreground/90'>{approval.prompt}</p>
      <p className='text-xs text-muted-foreground'>{continuationNote(activeExecution, name)}</p>
      {approval.options.some((option) => option.kind === 'allow_always') ? (
        <p className='text-xs text-muted-foreground'>
          Standing-grant persistence is controlled by the connected agent or MCP server; Tau only forwards this exact
          choice.
        </p>
      ) : undefined}
      <div className='flex flex-row flex-wrap gap-2'>
        {approval.options.length > 0 ? (
          /* The agent's own options, in its own order and its own words (EQ5).
           * A binary Approve/Deny cannot say "allow once" from "allow always",
           * so answering with one substituted a guess for the user's choice. */
          approval.options.map((option) => (
            <Button
              key={option.optionId}
              size='sm'
              variant={option.kind?.startsWith('allow') === true ? 'default' : 'outline'}
              autoFocus={option.optionId === focused?.optionId}
              onClick={() => {
                respond(option.kind?.startsWith('allow') ?? true, option.optionId);
              }}
            >
              {option.name}
            </Button>
          ))
        ) : (
          <>
            <Button
              size='sm'
              autoFocus
              onClick={() => {
                respond(true);
              }}
            >
              Approve
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                respond(false);
              }}
            >
              Deny
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
