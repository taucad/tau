import { Printer } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import type { ChatToolIconTone } from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';

type RequestJobInvocation = ToolInvocation<typeof toolName.requestJob>;
type JobRecord = Extract<RequestJobInvocation, { state: 'output-available' }>['output']['job'];

type Presentation = {
  readonly verb: string;
  /** Color belongs to the glyph alone. */
  readonly tone?: ChatToolIconTone;
  /** A noun-phrase verb ("Job declined") is set off from the program with a separator. */
  readonly separated?: true;
  readonly pending?: true;
};

/** How each job state reads in the transcript; a started job reads by what the machine does. */
const presentation = (job: JobRecord): Presentation => {
  switch (job.state) {
    case 'preparing':
    case 'awaiting-approval': {
      return { verb: 'Job requested', tone: 'warning', separated: true, pending: true };
    }
    case 'awaiting-start': {
      return { verb: 'Waiting for the start at the machine', tone: 'warning', separated: true };
    }
    case 'approved':
    case 'transferring':
    case 'starting':
    case 'confirming': {
      return { verb: 'Starting' };
    }
    case 'started': {
      return { verb: job.program.facts?.process === 'fff' ? 'Printing' : 'Running', tone: 'success' };
    }
    case 'denied': {
      return { verb: 'Job declined', separated: true };
    }
    case 'withdrawn': {
      return { verb: 'Job withdrawn', separated: true };
    }
    case 'rejected':
    case 'failed': {
      return { verb: 'Job failed', tone: 'error', separated: true };
    }
    case 'unknown': {
      return { verb: 'Start not confirmed', tone: 'warning', separated: true };
    }
  }
};

/** Said when the printer has not confirmed a start for minutes: whether it prints is unknown, so nothing invites a retry. */
const unconfirmedStart =
  "The machine hasn't confirmed the start. Check the machine; Tau updates this when the machine reports the run.";

/**
 * Why a job settled as it did, in the provider's own words, as the agent's
 * `nextStep` and the Print pane give them. A failure message that is one bare token, such as
 * `MACHINE_BUSY` or `provider-rejected`, says nothing to a person, so it
 * follows the outcome instead of standing in for it.
 *
 * @param job - The settled job.
 * @returns The reason, or `undefined` when there is nothing to explain.
 */
const reasonOf = ({ state, failure }: JobRecord): string | undefined => {
  if (state === 'unknown') {
    return unconfirmedStart;
  }
  if (failure === undefined) {
    return undefined;
  }
  const described = failure.message.trim();
  if (/\s/u.test(described)) {
    return described;
  }
  return `${state === 'rejected' ? 'The machine rejected the start' : 'The job failed'} (${described}).`;
};

/**
 * The transcript's record of one `request_job` call: which program, on which
 * machine, and where the job stands.
 *
 * The decision itself belongs to the approval banner above the composer, so
 * this card never offers one. A failed or unconfirmed start opens on its
 * reason, because an uncertain physical outcome must stay visible.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `request_job` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolRequestJob({ part }: { readonly part: RequestJobInvocation }): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const target = part.input?.targetFile ?? part.input?.artifact;
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Printer} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Requesting'>
                <ChatToolDescription>{target === undefined ? 'a job…' : `a job for ${target}`}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { job, machineName } = part.output;
      const { verb, tone, separated, pending } = presentation(job);
      const where = `${job.program.name} on ${machineName ?? job.machineId}`;
      const detail = `${separated ? '· ' : ''}${where}${pending ? ' · waiting for approval in the Print pane' : ''}`;
      const reason = reasonOf(job);
      return (
        <ChatToolCard
          variant='minimal'
          status='ready'
          isCollapsible={reason !== undefined}
          isDefaultOpen={reason !== undefined}
        >
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Printer} {...(tone === undefined ? {} : { tone })} />
            <ChatToolCardTitle>
              <ChatToolLabel verb={verb}>
                <ChatToolDescription>{detail}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          {reason === undefined ? undefined : (
            <ChatToolCardContent>
              <p className='text-xs text-muted-foreground'>{reason}</p>
            </ChatToolCardContent>
          )}
        </ChatToolCard>
      );
    }

    case 'output-error': {
      return <ChatToolError errorText={part.errorText} icon={Printer} noun='job request' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.requestJob} state: ${part.state}`);
    }
  }
}
