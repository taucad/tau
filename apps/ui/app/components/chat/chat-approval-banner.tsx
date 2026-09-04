import { ShieldQuestion } from 'lucide-react';
import { getToolPartName, isAnyToolPart } from '@taucad/chat';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { Button } from '@taucad/ui/components/button';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { agentApprovalToolName, parseAgentHostApproval } from '#services/agent-host-event-projection.js';
import type { AgentHostApproval } from '#services/agent-host-event-projection.js';
import { toast } from '#components/ui/sonner.js';

/** One unresolved interrupt, located in the transcript that projected it. @public */
export type PendingAgentHostApproval = AgentHostApproval & {
  /** Assistant message whose part carries the request. */
  readonly messageId: string;
  /** Id the chat client resolves — the SDK approval id, which is the interrupt id for a host-projected part. */
  readonly approvalId: string;
};

/**
 * Every interrupt the chat is currently paused on.
 *
 * Reads the transcript, not a side channel: a host-projected interrupt becomes
 * a `tau_agent_approval` part carrying the prompt and the options the host
 * recorded, and a Paseo or Tau tool gated by the API becomes an ordinary tool
 * part in the same `approval-requested` state. Both are pending here, and both
 * leave it only when the durable resolution settles the part — never on a click.
 *
 * @param messages - The chat's live message list.
 * @returns The pending interrupts, in transcript order.
 * @public
 */
export const pendingAgentHostApprovals = (messages: readonly MyUIMessage[]): readonly PendingAgentHostApproval[] => {
  const pending: PendingAgentHostApproval[] = [];
  for (const message of messages) {
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
      });
    }
  }
  return pending;
};

/*
 * Product names for the registry agent ids a daemon advertises, duplicated from
 * `chat-execution-selector.tsx` — that file owns the selector rows and belongs
 * to another lane, so it cannot export them yet.
 * ponytail: fold both copies into one exported helper when it is next open.
 */
const externalAgentNames: Readonly<Record<string, string>> = { claude: 'Claude Code', codex: 'Codex' };

const requesterName = (execution: CadAgentExecution | undefined): string => {
  switch (execution?.kind) {
    case 'acp': {
      return externalAgentNames[execution.agentId] ?? execution.agentId;
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
 * What approving actually buys, per placement.
 *
 * SP-4 Result 3 bounds both halves: an external agent inherits its own CLI's
 * approval policy, so Tau gates nothing inside the run and the only real
 * boundary is the materialized branch. A Tau or Paseo turn has no branch of its
 * own unless the user chose one, so it must not claim one.
 */
const continuationNote = (execution: CadAgentExecution | undefined, name: string): string =>
  execution?.kind === 'acp'
    ? `Approving lets ${name} keep working in its isolated branch; Tau does not gate each action it takes there.`
    : `Approving lets ${name} continue this turn; Tau does not ask again for each action it takes.`;

/**
 * The one presenter for a paused run's interrupt, wherever the run is placed.
 *
 * Mounted above the composer (`chat-textarea.tsx`), because a run that is
 * waiting cannot be advanced from the transcript — the next thing the user does
 * is answer it. The copy is bounded by SP-4 Result 3: approving lets the agent
 * keep working inside its isolated branch, and Tau does **not** gate each action
 * it takes there.
 *
 * @returns The banner, or nothing while the chat has no pending interrupt.
 * @public
 */
export function ChatApprovalBanner(): React.JSX.Element | undefined {
  const { respondToToolApproval } = useCadChatClient();
  const activeExecution = useChatSelector((state) => state.activeExecution);
  const messages = useChatSelector((state) => state.messages);
  // A paused run has exactly one unresolved interrupt: it stopped on it.
  const approval = pendingAgentHostApprovals(messages)[0];
  if (!approval) {
    return undefined;
  }

  const name = requesterName(activeExecution);
  const respond = (approved: boolean): void => {
    const resolve = async (): Promise<void> => {
      try {
        await respondToToolApproval(approval.approvalId, approved);
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
      className='border-amber-500/40 bg-amber-500/10 mb-2 flex flex-col gap-2 rounded-md border p-3 text-sm'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <ShieldQuestion className='text-amber-600 size-4 shrink-0' />
        <p className='min-w-0 truncate font-medium'>{`${name} is waiting for approval`}</p>
      </div>
      <p className='min-w-0 break-words text-foreground/90'>{approval.prompt}</p>
      {approval.options.length > 0 ? (
        <p className='text-xs text-muted-foreground'>
          {`Options it offered: ${approval.options.map((option) => option.name).join(' · ')}`}
        </p>
      ) : undefined}
      <p className='text-xs text-muted-foreground'>{continuationNote(activeExecution, name)}</p>
      <div className='flex flex-row gap-2'>
        <Button
          size='sm'
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
      </div>
    </section>
  );
}
