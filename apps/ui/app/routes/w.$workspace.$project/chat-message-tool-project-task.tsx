import { GitFork, XCircle } from 'lucide-react';
import type { DynamicToolUIPart } from 'ai';
import {
  projectTaskSchema,
  projectTaskMessageSchema,
  projectTaskSnapshotSchema,
  projectTaskSpawnSchema,
  projectTaskSendSchema,
  projectTaskReadSchema,
  projectTaskWaitSchema,
  projectTaskActionSchema,
} from '@taucad/agent-host/wire';
import { toolName } from '@taucad/chat/constants';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
  ChatToolCardContent,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { sanitizeAgentText } from '#routes/w.$workspace.$project/chat-message-tool-external.js';
import { Button } from '@taucad/ui/components/button';
import { useThreadNavigation } from '#routes/w.$workspace.$project/thread-navigation-context.js';

const presentations = {
  [toolName.taskSpawn]: { pending: 'Starting', done: 'Created', noun: 'child task', input: projectTaskSpawnSchema },
  [toolName.taskRead]: { pending: 'Reading', done: 'Read', noun: 'tasks and messages', input: projectTaskReadSchema },
  [toolName.taskSend]: { pending: 'Sending', done: 'Recorded', noun: 'task message', input: projectTaskSendSchema },
  [toolName.taskWait]: { pending: 'Waiting for', done: 'Observed', noun: 'task updates', input: projectTaskWaitSchema },
  [toolName.taskCancel]: {
    pending: 'Cancelling',
    done: 'Requested cancellation of',
    noun: 'task subtree',
    input: projectTaskActionSchema,
  },
  [toolName.taskResume]: {
    pending: 'Retrying',
    done: 'Requested another attempt for',
    noun: 'task',
    input: projectTaskActionSchema,
  },
} as const;

export type ProjectTaskToolName = keyof typeof presentations;

/** Identify the canonical task tool without treating unrelated external tools as Tau calls. */
export const isProjectTaskToolName = (name: string | undefined): name is ProjectTaskToolName =>
  name !== undefined && Object.hasOwn(presentations, name);

/** Route internal calls and ACP's explicitly labelled Tau MCP calls through the same card. */
export function renderProjectTaskDynamic({
  part,
}: {
  readonly part: DynamicToolUIPart;
}): React.JSX.Element | undefined {
  const metadata = part.toolMetadata?.['tau'];
  const tau = metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : undefined;
  if (tau?.['origin'] === 'external' && tau['presentation'] !== 'tau-mcp') {
    return undefined;
  }
  const name =
    tau?.['presentation'] === 'tau-mcp' && typeof tau['nativeName'] === 'string' ? tau['nativeName'] : part.toolName;
  if (!isProjectTaskToolName(name)) {
    return undefined;
  }
  return (
    <ChatMessageToolProjectTask
      name={name}
      part={{ ...part, state: Reflect.get(part, 'preliminary') === true ? 'input-available' : part.state }}
    />
  );
}

/** Transcript history only: task controls and live permission decisions belong to their existing panes. */
export function ChatMessageToolProjectTask({
  part,
  name,
}: {
  readonly part: Pick<DynamicToolUIPart, 'state' | 'input' | 'output' | 'errorText'>;
  readonly name: ProjectTaskToolName;
}): React.JSX.Element {
  const threadNavigation = useThreadNavigation({ enableNoContext: true });
  const presentation = presentations[name];
  if (part.state === 'output-error') {
    return (
      <ChatToolError
        errorText={part.errorText ?? 'The task operation failed.'}
        icon={XCircle}
        noun={presentation.noun}
      />
    );
  }
  if (part.state === 'output-denied') {
    return <ChatToolError errorText='The task operation was denied.' icon={XCircle} noun={presentation.noun} />;
  }
  const ready = part.state === 'output-available';
  const input = presentation.input.safeParse(part.input);
  const task =
    ready && name !== toolName.taskRead && name !== toolName.taskWait && name !== toolName.taskSend
      ? projectTaskSchema.safeParse(part.output)
      : undefined;
  const message = ready && name === toolName.taskSend ? projectTaskMessageSchema.safeParse(part.output) : undefined;
  const snapshot =
    ready && (name === toolName.taskRead || name === toolName.taskWait)
      ? projectTaskSnapshotSchema.safeParse(part.output)
      : undefined;
  const validOutput = task?.success ?? message?.success ?? snapshot?.success ?? false;
  const title = task?.success
    ? sanitizeAgentText(task.data.title)
    : input.success && 'title' in input.data
      ? sanitizeAgentText(input.data.title)
      : presentation.noun;
  return (
    <div className='min-w-0'>
      <ChatToolCard
        variant='minimal'
        status={ready ? (validOutput ? 'ready' : 'warning') : 'loading'}
        isDefaultOpen={false}
      >
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={GitFork} />
          <ChatToolCardTitle>
            <ChatToolLabel verb={ready ? (validOutput ? presentation.done : 'Could not verify') : presentation.pending}>
              <ChatToolDescription>{title}</ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
        <ChatToolCardContent>
          <div className='space-y-2 px-2 py-2 text-xs'>
            {input.success && 'prompt' in input.data ? (
              <p className='max-h-40 overflow-auto whitespace-pre-wrap'>{input.data.prompt}</p>
            ) : undefined}
            {input.success && 'provider' in input.data ? (
              <p>
                Agent: {sanitizeAgentText(input.data.provider.id)}
                {input.data.provider.model ? ` · ${sanitizeAgentText(input.data.provider.model)}` : ''}
              </p>
            ) : undefined}
            {input.success && 'taskId' in input.data && input.data.taskId ? (
              <p>Task: {input.data.taskId}</p>
            ) : undefined}
            {input.success && 'text' in input.data && typeof input.data.text === 'string' ? (
              <p className='max-h-40 overflow-auto whitespace-pre-wrap'>{input.data.text}</p>
            ) : undefined}
            {task?.success ? (
              <>
                <p>
                  Task: {task.data.id} · {task.data.provider.id}
                </p>
                <p>
                  Attempt {task.data.attempts.at(-1)?.number}: {task.data.attempts.at(-1)?.status}
                </p>
                {task.data.attempts.at(-1)?.detail ? (
                  <p className='whitespace-pre-wrap'>{task.data.attempts.at(-1)?.detail}</p>
                ) : undefined}
              </>
            ) : undefined}
            {message?.success ? (
              <>
                <p>
                  {message.data.senderTaskId
                    ? `Returned from ${message.data.senderTaskId} to ${message.data.recipientTaskId}.`
                    : `Message recorded for ${message.data.recipientTaskId}.`}
                </p>
                <p className='max-h-40 overflow-auto whitespace-pre-wrap'>{message.data.text}</p>
                <p className='text-muted-foreground'>
                  Recording a message does not confirm delivery or task completion.
                </p>
              </>
            ) : undefined}
            {snapshot?.success ? (
              <>
                <p>
                  {snapshot.data.tasks.length} tasks · {snapshot.data.messages.length} messages
                  {snapshot.data.hasMore ? ' · More messages available' : ''}
                </p>
                <ul className='max-h-48 space-y-1 overflow-auto'>
                  {snapshot.data.tasks.map((item) => (
                    <li key={item.id}>
                      {sanitizeAgentText(item.title)} · {item.attempts.at(-1)?.status}
                    </li>
                  ))}
                  {snapshot.data.messages.map((item) => (
                    <li key={item.id} className='whitespace-pre-wrap'>
                      {item.senderTaskId
                        ? `Returned from ${item.senderTaskId} to ${item.recipientTaskId}`
                        : `Message to ${item.recipientTaskId}`}
                      : {item.text}
                    </li>
                  ))}
                </ul>
                {snapshot.data.tasks.length === 0 && snapshot.data.messages.length === 0 ? (
                  <p>No task or message updates in this response.</p>
                ) : undefined}
              </>
            ) : undefined}
            {ready && !validOutput ? (
              <p>
                The recorded response does not match the task result format. Check the task in Threads before retrying.
              </p>
            ) : undefined}
            {!ready && (part.state === 'approval-requested' || part.state === 'approval-responded') ? (
              <p>Awaiting the existing permission decision.</p>
            ) : undefined}
          </div>
        </ChatToolCardContent>
      </ChatToolCard>
      {task?.success && name === toolName.taskSpawn && threadNavigation ? (
        <Button
          size='sm'
          variant='ghost'
          className='mt-1 ml-5'
          onClick={() => {
            threadNavigation.openThreads(task.data.id);
          }}
        >
          <GitFork aria-hidden className='size-3.5' />
          {sanitizeAgentText(task.data.title)}
        </Button>
      ) : null}
    </div>
  );
}
