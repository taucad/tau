import type { ReasoningUIPart } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getReasoningEndedAtMs, getReasoningStartedAtMs } from '@taucad/chat';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { Button } from '@taucad/ui/components/button';
import { ThoughtBubble } from '#components/icons/thought-bubble.js';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

const bottomTolerance = 8;

type ChatMessageReasoningProperties = {
  readonly parts: readonly ReasoningUIPart[];
  readonly hasContent: boolean;
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

/** One collapsible, chronological reasoning body shared by Tau and ACP agents. */
export function ChatMessageReasoning({
  parts,
  hasContent,
  isMessageActive,
}: ChatMessageReasoningProperties): React.JSX.Element | undefined {
  'use no memo';

  const visibleParts = useMemo(() => parts.filter((part) => part.text.trim() !== ''), [parts]);
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | undefined>(undefined);
  const [content, setContent] = useState<HTMLDivElement | undefined>(undefined);
  const stickToBottomRef = useRef(true);
  const isOpen = userOpen ?? (isMessageActive || !hasContent);
  const label = thoughtLabel(visibleParts);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React callback refs receive null on detach.
  const handleScrollContainerRef = useCallback((element: HTMLDivElement | null): void => {
    setScrollContainer(element ?? undefined);
  }, []);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React callback refs receive null on detach.
  const handleContentRef = useCallback((element: HTMLDivElement | null): void => {
    setContent(element ?? undefined);
  }, []);

  useEffect(() => {
    if (!isMessageActive || !isOpen || !scrollContainer || !content || typeof ResizeObserver === 'undefined') {
      return;
    }
    let userInteracting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const markUserInteraction = (): void => {
      userInteracting = true;
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => {
        userInteracting = false;
      }, 150);
    };
    const updateStickiness = (): void => {
      if (!userInteracting) {
        return;
      }
      const distance = scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
      stickToBottomRef.current = distance <= bottomTolerance;
    };
    const pin = (): void => {
      if (stickToBottomRef.current) {
        // oxlint-disable-next-line react/immutability -- keeping a live transcript pinned is an imperative DOM operation.
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    };
    pin();
    const observer = new ResizeObserver(pin);
    observer.observe(content);
    scrollContainer.addEventListener('wheel', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('touchstart', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('pointerdown', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('scroll', updateStickiness, { passive: true });
    return () => {
      observer.disconnect();
      globalThis.clearTimeout(timer);
      scrollContainer.removeEventListener('wheel', markUserInteraction);
      scrollContainer.removeEventListener('touchstart', markUserInteraction);
      scrollContainer.removeEventListener('pointerdown', markUserInteraction);
      scrollContainer.removeEventListener('scroll', updateStickiness);
    };
  }, [content, isMessageActive, isOpen, scrollContainer]);

  if (visibleParts.length === 0) {
    return undefined;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setUserOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant='ghost'
          size='xs'
          className='group/chat-tool-trigger -ml-2 flex w-full min-w-0 items-center justify-start gap-1.5 overflow-hidden font-normal text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent'
        >
          <ThoughtBubble aria-hidden='true' className='size-3 shrink-0' />
          <span className='min-w-0 truncate'>{label}</span>
          <ChevronRight
            aria-hidden='true'
            className='size-3 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover/chat-tool-trigger:opacity-100 group-focus-visible/chat-tool-trigger:opacity-100 group-data-[state=open]/chat-tool-trigger:rotate-90'
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          ref={handleScrollContainerRef}
          role='region'
          aria-label={`${label} details`}
          className='reasoning-body relative max-h-[min(30rem,60svh)] scroll-shadows-y overflow-y-auto overscroll-contain pl-5 text-sm font-normal text-muted-foreground italic [&_*]:font-normal [&_*]:italic [&_h1]:text-inherit [&_h2]:text-inherit [&_h3]:text-inherit [&_h4]:text-inherit [&_h5]:text-inherit [&_h6]:text-inherit'
        >
          <div ref={handleContentRef}>
            {visibleParts.map((part, index) => (
              <MarkdownViewerChat
                key={`${String(getReasoningStartedAtMs(part))}:${String(getReasoningEndedAtMs(part))}:${part.text}:${String(index)}`}
                className='text-muted-foreground'
                isStreaming={isMessageActive && index === visibleParts.length - 1}
                isStreamingFade={isMessageActive && index === visibleParts.length - 1}
              >
                {part.text.trim()}
              </MarkdownViewerChat>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
