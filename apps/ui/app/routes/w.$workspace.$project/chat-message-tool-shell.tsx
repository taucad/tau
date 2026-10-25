import { SquareTerminal, XCircle } from 'lucide-react';
import type { ShellNotStartedCode, ShellOutput, ToolInvocation } from '@taucad/chat';
import { shellNotStartedCodes, shellOutputSchema } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { isRecord } from '@taucad/utils/schema';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { CodeBlockContent, Pre } from '#components/code/code-block.js';
import { FileLink } from '#components/files/file-link.js';

type ShellInvocation = ToolInvocation<typeof toolName.shell>;
type ShellInputValue = NonNullable<ShellInvocation['input']>;

/** The command's first line, bounded: the header names what ran, the body holds the whole text. */
const commandLine = (command: string | undefined): string => {
  const first = (command ?? '').split('\n')[0] ?? '';
  return first.length > 120 ? `${first.slice(0, 120)}…` : first;
};

const notStartedTitles: Readonly<Record<ShellNotStartedCode, string>> = {
  'shell-unavailable': 'Shell unavailable',
  'invalid-cwd': 'Folder refused',
  'checkout-unavailable': 'Project folder unavailable',
  'root-changed': 'Folder changed',
  'access-denied': 'Access denied',
  'access-unsupported': 'Access refused',
  'approval-unavailable': 'Approval unavailable',
  'launch-failed': 'Did not start',
};

/** "exit 0", "timed out after 30 s": how the command ended, in the person's words. */
const endingOf = (output: ShellOutput): string => {
  switch (output.status) {
    case 'completed': {
      return `exit ${String(output.exitCode)}`;
    }
    case 'signalled': {
      return `ended by ${output.signal}`;
    }
    case 'timed-out': {
      return `timed out after ${String(Math.round(output.timeoutMs / 1000))} s`;
    }
    case 'cancelled': {
      return 'cancelled';
    }
    case 'interrupted': {
      return 'interrupted';
    }
    case 'not-started': {
      return notStartedTitles[output.code];
    }
  }
};

/**
 * A failed call's output, read back from the error text the transcript carries: the whole result when it is one, or
 * the refusal's code and message, which the projection keeps for a coded failure.
 */
const failedOutputOf = (errorText: string): ShellOutput | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(errorText);
  } catch {
    return { status: 'interrupted', message: errorText };
  }
  const parsed = shellOutputSchema.safeParse(value).data;
  if (parsed !== undefined) {
    return parsed;
  }
  if (
    isRecord(value) &&
    typeof value['message'] === 'string' &&
    (shellNotStartedCodes as readonly unknown[]).includes(value['code'])
  ) {
    return { status: 'not-started', code: value['code'] as ShellNotStartedCode, message: value['message'] };
  }
  return undefined;
};

function StreamTail({ label, text }: { readonly label: string; readonly text: string }): React.JSX.Element | undefined {
  if (text === '') {
    return undefined;
  }
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground'>{label}</p>
      <CodeBlockContent>
        <Pre className='max-h-48 overflow-auto text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'>{text}</Pre>
      </CodeBlockContent>
    </div>
  );
}

function ShellBody({
  input,
  output,
}: {
  readonly input: ShellInputValue | undefined;
  readonly output: ShellOutput | undefined;
}): React.JSX.Element {
  const ran = output !== undefined && 'stdout' in output ? output : undefined;
  return (
    <div className='space-y-2 px-2 py-2 text-xs/5'>
      <CodeBlockContent>
        <Pre className='max-h-40 overflow-auto font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'>
          {input?.command ?? ''}
        </Pre>
      </CodeBlockContent>
      <p className='text-muted-foreground'>
        In {input?.cwd === undefined || input.cwd === '' ? 'the project folder' : input.cwd}
        {output === undefined ? '' : ` · ${endingOf(output)}`}
        {ran?.durationMs === undefined ? '' : ` · ${String(ran.durationMs)} ms`}
        {ran?.approval === undefined
          ? ''
          : ran.approval.approvedBy === 'bypass'
            ? ' · extra access granted by Bypass'
            : ' · extra access allowed by you'}
      </p>
      {input?.access === undefined ? undefined : (
        <p className='[overflow-wrap:anywhere]'>
          <span className='text-muted-foreground'>The agent asked for </span>
          {[
            ...(input.access.read ?? []).map((path) => `read ${path}`),
            ...(input.access.write ?? []).map((path) => `write ${path}`),
            ...(input.access.domains ?? []).map((domain) => `network ${domain}`),
          ].join(', ')}
          <span className='text-muted-foreground'>. The agent says: </span>
          {input.access.reason}
        </p>
      )}
      {output !== undefined && (output.status === 'not-started' || output.status === 'interrupted') ? (
        <p className='[overflow-wrap:anywhere]'>{output.message}</p>
      ) : undefined}
      {ran === undefined ? undefined : (
        <>
          <StreamTail label={ran.stdout.truncated ? 'Output (last part)' : 'Output'} text={ran.stdout.text} />
          <StreamTail label={ran.stderr.truncated ? 'Errors (last part)' : 'Errors'} text={ran.stderr.text} />
        </>
      )}
      {output !== undefined && 'log' in output && output.log !== undefined ? (
        output.log.status === 'saved' ? (
          <FileLink path={output.log.path} className='block truncate text-primary underline underline-offset-2'>
            Full output: {output.log.path}
          </FileLink>
        ) : (
          <p className='text-muted-foreground'>The full output could not be saved: {output.log.message}</p>
        )
      ) : undefined}
    </div>
  );
}

/**
 * The transcript's record of one `shell` call: the command as written, where it ran, how it ended, any extra access
 * with the agent's reason labelled as its words, and the bounded output. Folded when it exited 0.
 *
 * @param props - The tool part this message carries.
 * @param props.part - The `shell` invocation, in whatever state it is in.
 * @returns The card.
 */
export function ChatMessageToolShell({ part }: { readonly part: ShellInvocation }): React.JSX.Element {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available': {
      return (
        <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={SquareTerminal} />
            <ChatToolCardTitle>
              <ChatToolLabel verb='Running'>
                <ChatToolDescription className='font-mono'>{commandLine(part.input?.command)}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
        </ChatToolCard>
      );
    }

    case 'output-available':
    case 'output-error': {
      const output = part.state === 'output-available' ? part.output : failedOutputOf(part.errorText);
      if (output === undefined) {
        return (
          <ChatToolError
            errorText={part.state === 'output-error' ? part.errorText : ''}
            icon={XCircle}
            noun='command'
          />
        );
      }
      const succeeded = output.status === 'completed' && output.exitCode === 0;
      return (
        <ChatToolCard variant='minimal' status={succeeded ? 'ready' : 'error'} isDefaultOpen={!succeeded}>
          <ChatToolCardHeader>
            <ChatToolCardIcon icon={SquareTerminal} />
            <ChatToolCardTitle>
              <ChatToolLabel verb={output.status === 'not-started' ? notStartedTitles[output.code] : 'Ran'}>
                <ChatToolDescription className='font-mono'>{commandLine(part.input?.command)}</ChatToolDescription>
              </ChatToolLabel>
            </ChatToolCardTitle>
          </ChatToolCardHeader>
          <ChatToolCardContent>
            <ShellBody input={part.input} output={output} />
          </ChatToolCardContent>
        </ChatToolCard>
      );
    }

    case 'approval-requested':
    case 'approval-responded':
    case 'output-denied': {
      throw new Error(`Unexpected ${toolName.shell} state: ${part.state}`);
    }
  }
}
