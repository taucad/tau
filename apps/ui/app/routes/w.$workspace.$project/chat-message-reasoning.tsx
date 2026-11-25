import type { ReasoningUIPart } from 'ai';
import { Loader } from '@taucad/ui/components/loader';
import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getReasoningEndedAtMs, getReasoningStartedAtMs } from '@taucad/chat';
import { normalizeLatexDelimiters } from '@taucad/agent-host';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { ThoughtBubble } from '@taucad/ui-kit/icons/thought-bubble';
import { MarkdownViewerChat } from '@taucad/chat-surfaces/components/markdown/markdown-viewer-chat';
import {
  activityChevronClassName,
  activityContainerClassName,
  useActivityRowDisclosure,
} from '@taucad/chat-ui/components/chat-activity-group';
import { cn } from '@taucad/ui/utils/cn';

type ChatMessageReasoningProperties = {
  readonly parts: readonly ReasoningUIPart[];
  /** The thought is the turn's live tail: it names itself "Thinking…" and streams. */
  readonly isMessageActive: boolean;
};

/** Union valid completed reasoning intervals so overlap is never double counted. */
export const reasoningDurationMs = (parts: readonly ReasoningUIPart[]): number | undefined => {
  const intervals: Array<{ start: number; end: number }> = [];
  for (const part of parts) {
    const start = getReasoningStartedAtMs(part);
    const end = getReasoningEndedAtMs(part);
    if (start === undefined || end === undefined || end < start) {
      return undefined;
    }
    intervals.push({ start, end });
  }
  if (intervals.length === 0) {
    return undefined;
  }
  intervals.sort((left, right) => left.start - right.start);
  let total = 0;
  let currentStart = intervals[0]!.start;
  let currentEnd = intervals[0]!.end;
  for (const reasoningInterval of intervals.slice(1)) {
    if (reasoningInterval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, reasoningInterval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = reasoningInterval.start;
      currentEnd = reasoningInterval.end;
    }
  }
  return total + currentEnd - currentStart;
};

const thoughtLabel = (parts: readonly ReasoningUIPart[]): string => {
  const duration = reasoningDurationMs(parts);
  if (duration === undefined || duration < 1000) {
    return 'Thought briefly';
  }
  const seconds = Math.max(1, Math.round(duration / 1000));
  return `Thought for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
};

/**
 * One collapsible, chronological reasoning body shared by Tau and ACP agents.
 *
 * A thought rests closed whether it streams, ends a turn or was reloaded: only the reader opens it. It is a row
 * inside an activity container, and one line with its own bordered detail anywhere else.
 */
export function ChatMessageReasoning({
  parts,
  isMessageActive,
}: ChatMessageReasoningProperties): React.JSX.Element | undefined {
  'use no memo';

  const visibleParts = useMemo(() => parts.filter((part) => part.text.trim() !== ''), [parts]);
  const [isOpen, setIsOpen] = useState(false);
  const row = useActivityRowDisclosure(isOpen);
  const isContained = row?.isSole === false;
  /* A streaming thought names itself; the duration only exists once it ends (R6). */
  const isThinking = isMessageActive && visibleParts.at(-1)?.state === 'streaming';
  const label = isThinking ? 'Thinking…' : thoughtLabel(visibleParts);

  if (visibleParts.length === 0) {
    return undefined;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='group/chat-tool-trigger -ml-2 flex w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden font-normal text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent pointer-coarse:min-h-8'
        >
          {isThinking ? (
            <Loader className='size-3 shrink-0' />
          ) : (
            <ThoughtBubble aria-hidden='true' className='size-3 shrink-0' />
          )}
          <span className='min-w-0 truncate'>{label}</span>
          <ChevronRight
            aria-hidden='true'
            className={cn(activityChevronClassName, 'group-data-[state=open]/chat-tool-trigger:rotate-90')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role='region'
          aria-label={`${label} details`}
          className={cn(
            'reasoning-body relative text-sm font-normal text-muted-foreground italic [&_*]:font-normal [&_*]:italic [&_h1]:text-inherit [&_h2]:text-inherit [&_h3]:text-inherit [&_h4]:text-inherit [&_h5]:text-inherit [&_h6]:text-inherit',
            isContained ? 'pb-1.5' : cn(activityContainerClassName, 'px-2.5 py-1.5'),
          )}
        >
          {visibleParts.map((part, index) => (
            <MarkdownViewerChat
              key={`${String(getReasoningStartedAtMs(part))}:${String(index)}`}
              className='text-muted-foreground'
              isStreaming={isMessageActive && index === visibleParts.length - 1}
              isStreamingFade={isMessageActive && index === visibleParts.length - 1}
            >
              {normalizeLatexDelimiters(part.text.trim())}
            </MarkdownViewerChat>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
