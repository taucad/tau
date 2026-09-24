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

type RequestPrintInvocation = ToolInvocation<typeof toolName.requestPrint>;
type PrintRequestState = Extract<RequestPrintInvocation, { state: 'output-available' }>['output']['request']['state'];

type Presentation = {
  readonly verb: string;
  /** Color belongs to the glyph alone. */
  readonly tone?: ChatToolIconTone;
  /** A noun-phrase verb ("Print declined") is set off from the file with a separator. */
  readonly separated?: true;
  readonly pending?: true;
};

/** How each ledger state reads in the transcript. */
const presentation: Record<PrintRequestState, Presentation> = {
  preparing: { verb: 'Print requested', tone: 'warning', separated: true, pending: true },
  'awaiting-approval': { verb: 'Print requested', tone: 'warning', separated: true, pending: true },
  approved: { verb: 'Starting' },
  uploading: { verb: 'Starting' },
  starting: { verb: 'Starting' },
  started: { verb: 'Printing', tone: 'success' },
  denied: { verb: 'Print declined', separated: true },
  withdrawn: { verb: 'Print withdrawn', separated: true },
  rejected: { verb: 'Print failed', tone: 'destructive', separated: true },
  failed: { verb: 'Print failed', tone: 'destructive', separated: true },
  unknown: { verb: 'Start not confirmed', tone: 'warning', separated: true },
};

/** Said when the printer never confirmed a start and the ledger names no cause. */
const unconfirmedStart = 'The printer did not confirm the start. Check it in the Print pane before trying again.';

/**
 * The transcript's record of one `request_print` call: which file, on which
 * machine, and where the request stands.
 *
 * The decision itself belongs to the approval banner above the composer, so
 * this card never offers one. A failed or unconfirmed start opens on its
 * reason, because an uncertain physical outcome must stay visible.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `request_print` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolRequestPrint({ part }: { readonly part: RequestPrintInvocation }): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      const target = part.input?.targetFile;
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={Printer} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Requesting'>
                <ChatToolDescription>
                  {target === undefined ? 'a print...' : `a print of ${target}`}
                </ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available': {
      const { request, machineName } = part.output;
      const { verb, tone, separated, pending } = presentation[request.state];
      const where = `${request.summary.fileName} on ${machineName ?? request.machineId}`;
      const detail = `${separated ? '· ' : ''}${where}${pending ? ' · waiting for approval in the Print pane' : ''}`;
      const reason = request.failure?.message ?? (request.state === 'unknown' ? unconfirmedStart : undefined);
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
      return <ChatToolError errorText={part.errorText} icon={Printer} noun='print request' />;
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.requestPrint} state: ${part.state}`);
    }
  }
}
