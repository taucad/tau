import { memo } from 'react';
import { Check, CirclePause, GitBranch, RefreshCw, TriangleAlert } from 'lucide-react';
import type { AcpActivityData } from '@taucad/chat';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { useFeature } from '#flags/use-feature.js';
import { sanitizeAgentPath, sanitizeAgentText } from '#routes/w.$workspace.$project/chat-message-tool-external.js';

type Subagent = NonNullable<AcpActivityData['subagents']>[number];

const taskStatus = {
  running: 'Working',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Stopped',
  unobserved: 'No longer observed',
} satisfies Record<Subagent['status'], string>;

/** The task keeps its disclosure state while progress and the result arrive. */
const DelegatedTask = memo(function DelegatedTask({
  task,
  isDebug,
}: {
  readonly task: Subagent;
  readonly isDebug: boolean;
}): React.JSX.Element {
  const description = sanitizeAgentText(task.description ?? 'Delegated task', 500);
  const status = taskStatus[task.status];
  const isRunning = task.status === 'running';
  const metrics = [
    task.toolCalls === undefined ? undefined : `${String(task.toolCalls)} tool calls`,
    task.turns === undefined ? undefined : `${String(task.turns)} turns`,
    task.tokensUsed === undefined ? undefined : `${String(task.tokensUsed)} tokens`,
    task.duration === undefined ? undefined : `${String(task.duration / 1000)} s`,
  ].filter(Boolean);
  return (
    <div>
      <ChatToolCard variant='minimal' status={isRunning ? 'loading' : 'ready'}>
        <ChatToolCardHeader className='h-auto min-h-6'>
          <ChatToolCardIcon icon={task.status === 'completed' ? Check : GitBranch} />
          <ChatToolCardTitle>{description}</ChatToolCardTitle>
          <span
            role='status'
            aria-label={status}
            className='max-w-1/2 shrink-0 text-xs whitespace-normal'
            aria-busy={isRunning}
          >
            {status}
          </span>
        </ChatToolCardHeader>
        <ChatToolCardContent>
          <div className='space-y-2 border-l pl-4 text-xs'>
            <p className='wrap-break-word'>{sanitizeAgentPath(task.description ?? 'Delegated task')}</p>
            {task.model ? <p className='text-muted-foreground'>Model: {sanitizeAgentText(task.model, 256)}</p> : null}
            {metrics.length > 0 ? <p className='text-muted-foreground'>{metrics.join(' · ')}</p> : null}
            {task.output ? (
              <p className='max-h-64 overflow-auto wrap-break-word whitespace-pre-wrap'>
                {sanitizeAgentPath(task.output)}
              </p>
            ) : null}
            {isDebug && task.error ? (
              <pre className='max-h-40 overflow-auto wrap-break-word whitespace-pre-wrap'>
                {sanitizeAgentPath(task.error)}
              </pre>
            ) : null}
          </div>
        </ChatToolCardContent>
      </ChatToolCard>
      {task.status === 'failed' ? (
        <p role='alert' className='text-xs'>
          The delegated task failed. Ask the agent to retry it.
        </p>
      ) : null}
      {task.status === 'unobserved' ? (
        <p className='text-xs text-muted-foreground'>This turn ended before the task reported a result.</p>
      ) : null}
    </div>
  );
});

/** Provider-reported work shares the chat's compact disclosure vocabulary, without inventing tool results. */
export function ChatAcpActivity({ data }: { readonly data: AcpActivityData }): React.JSX.Element | undefined {
  const isDebug = useFeature('tauDebug');
  const { activity, subagents, servedModel } = data;
  if (activity === undefined && (subagents?.length ?? 0) === 0 && servedModel === undefined) {
    return undefined;
  }
  const ActivityIcon =
    activity?.status === 'failed'
      ? TriangleAlert
      : activity?.status === 'completed'
        ? Check
        : activity?.status === 'cancelled'
          ? CirclePause
          : RefreshCw;
  return (
    <div className='my-2 min-w-0 space-y-2'>
      {activity ? (
        <div className='space-y-1'>
          <p
            role={activity.status === 'failed' ? 'alert' : 'status'}
            aria-label='Agent activity'
            aria-busy={activity.status === 'running'}
            className='flex items-center gap-2 text-xs text-muted-foreground'
          >
            <ActivityIcon aria-hidden className='size-3 shrink-0' />
            <span className='min-w-0 wrap-break-word'>{sanitizeAgentText(activity.label, 256)}</span>
          </p>
          {isDebug && activity.detail ? (
            <ChatToolCard variant='minimal'>
              <ChatToolCardHeader>
                <ChatToolCardTitle>Activity details</ChatToolCardTitle>
              </ChatToolCardHeader>
              <ChatToolCardContent>
                <pre className='max-h-40 overflow-auto text-xs wrap-break-word whitespace-pre-wrap'>
                  {sanitizeAgentPath(activity.detail)}
                </pre>
              </ChatToolCardContent>
            </ChatToolCard>
          ) : null}
        </div>
      ) : null}
      {subagents?.map((task) => (
        <DelegatedTask key={task.id} task={task} isDebug={isDebug} />
      ))}
      {servedModel ? (
        <p className='text-xs text-muted-foreground'>Model used: {sanitizeAgentText(servedModel, 256)}</p>
      ) : null}
    </div>
  );
}
