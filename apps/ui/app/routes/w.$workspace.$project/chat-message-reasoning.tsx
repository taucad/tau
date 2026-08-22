import type { ReasoningUIPart } from 'ai';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
// `useState` setter functions are stable across renders, so passing them as
// callback refs is safe — React only invokes them when the underlying element
// changes. Storing the elements in state (rather than refs) is what makes the
// auto-pin effect re-run the moment the scroll container actually attaches,
// even when an earlier render took a different JSX path that omitted the refs.
import { Brain, ChevronRight } from 'lucide-react';
import { getReasoningStartedAtMs, getReasoningDurationMs } from '@taucad/chat';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';
import { ChatToolCard, ChatToolCardHeader, ChatToolCardTitle } from '#components/chat/chat-tool-card.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { Button } from '#components/ui/button.js';
import { cn } from '#utils/ui.utils.js';
import { formatReasoningDuration } from '#utils/format-reasoning-duration.js';
import { useReasoningStopwatch } from '#utils/use-reasoning-stopwatch.js';

/**
 * Maximum characters rendered in preview mode.
 * Tail-truncation keeps the DOM lightweight while showing the most recent reasoning.
 * ~3000 chars fills roughly 20-30 lines of prose at text-sm, providing enough
 * context in the constrained viewport without building an oversized markdown tree.
 */
const previewTextBudget = 3000;

/**
 * Distance (px) from the bottom that still counts as "stuck to bottom".
 * Handles sub-pixel rounding and lets the user be effectively at the bottom
 * without having to land exactly on `scrollHeight - clientHeight`.
 */
const bottomTolerance = 8;

type ChatMessageReasoningProperties = {
  readonly part: ReasoningUIPart;
  /**
   * Whether the message has content parts after this reasoning part.
   * When true, reasoning auto-collapses to keep focus on the response.
   */
  readonly hasContent: boolean;
  /**
   * Whether this reasoning part belongs to the trailing message AND the chat is
   * currently streaming. Drives every "live" affordance: the present-tense
   * "Thinking for Ns" stopwatch, the auto-pin scroll effect, the streamdown
   * incomplete-token mode, and the no-text shimmer card. Callers must derive
   * this from `messageOrder.at(-1) === messageId && status === 'streaming'`;
   * a chat-wide streaming flag would re-light prior messages whenever the user
   * sends a follow-up.
   */
  readonly isMessageActive: boolean;
};

export function ChatMessageReasoning({
  part,
  hasContent,
  isMessageActive,
}: ChatMessageReasoningProperties): React.JSX.Element {
  const [userToggleState, setUserToggleState] = useState<'expanded' | 'collapsed' | undefined>(undefined);
  const [scrollContainer, setScrollContainerState] = useState<HTMLDivElement | undefined>(undefined);
  const [content, setContentState] = useState<HTMLDivElement | undefined>(undefined);

  // Callback refs receive `null` from React on unmount; normalize to `undefined`
  // so the state matches our `null`-free convention while still letting the
  // effect re-run on attach/detach.
  // oxlint-disable @typescript-eslint/no-restricted-types -- React's callback ref contract passes `null` on unmount.
  const setScrollContainer = useCallback((element: HTMLDivElement | null): void => {
    setScrollContainerState(element ?? undefined);
  }, []);
  const setContent = useCallback((element: HTMLDivElement | null): void => {
    setContentState(element ?? undefined);
  }, []);
  // oxlint-enable @typescript-eslint/no-restricted-types
  // Tracks whether auto-pinning is active. Defaults to true so the initial mount
  // and any open-during-streaming transition snap to the latest reasoning. Flips
  // to false only when the user scrolls away from the bottom; flips back to true
  // when the user returns to within `bottomTolerance` of the bottom.
  const stickToBottomRef = useRef(true);

  const trimmedText = useMemo(() => part.text.trim(), [part.text]);
  const hasReasoningText = trimmedText !== '';

  // Three-state header label: idle / live stopwatch / completed duration.
  // Computed early because `isReasoningStreaming` also gates `isContentVisible`
  // below: while reasoning is actively streaming the chevron must never fully
  // hide the scrolling preview — it can only toggle preview ↔ expanded so the
  // user always retains a multi-line view of the live thoughts.
  //
  // We deliberately ignore `part.state` for the live gate. The AI SDK reducer
  // (`processUIMessageStream`) only flips `parts[i].state` to `'done'` inside
  // the `case "reasoning-end"` branch; on `case "finish-step"` it merely clears
  // the `activeReasoningParts` lookup map, leaving any unmatched part stuck at
  // `'streaming'` for the lifetime of the message. Trusting `isMessageActive`
  // instead is the canonical "is *this* message still arriving?" signal and
  // stops the live counter the instant the stream closes — and never relights
  // it on prior messages when a follow-up turn begins.
  const reasoningStartedAtMs = getReasoningStartedAtMs(part);
  const finalReasoningDurationMs = getReasoningDurationMs(part);
  const isReasoningStreaming = isMessageActive && finalReasoningDurationMs === undefined;

  // Three visual states:
  //   preview  — during streaming (or `hasContent === false`): half-height, auto-scroll
  //   collapsed — after completion (hasContent): header only
  //   expanded  — user explicitly toggled open: full height
  //
  // While reasoning is still streaming we force preview-or-expanded, never
  // fully hidden — the chevron toggles between the two. This keeps the live
  // thoughts visible at the scrolling-area height even after the user clicks
  // to "collapse", since losing all visibility on an in-flight reasoning
  // block was disorienting.
  const isContentVisible = isReasoningStreaming
    ? true
    : hasContent
      ? userToggleState === 'expanded'
      : userToggleState !== 'collapsed';

  const isExpanded = userToggleState === 'expanded';

  // Outside streaming the chevron mirrors visibility (rotated when open) so
  // done-collapsed flips back to a right-pointing chevron. While streaming,
  // visibility is pinned to true so we instead rotate only on the full
  // expansion — preview keeps the chevron pointing right to invite "click to
  // see more".
  const isChevronRotated = isReasoningStreaming ? isExpanded : isContentVisible;

  const displayText = useMemo(() => {
    if (!isContentVisible) {
      return '';
    }

    if (isExpanded || trimmedText.length <= previewTextBudget) {
      return trimmedText;
    }

    const tail = trimmedText.slice(-previewTextBudget);
    const paragraphBreak = tail.indexOf('\n\n');
    return paragraphBreak > 0 ? tail.slice(paragraphBreak + 2) : tail;
  }, [trimmedText, isExpanded, isContentVisible]);

  useEffect(() => {
    if (!isMessageActive || !isContentVisible || isExpanded) {
      return;
    }

    if (!scrollContainer || !content) {
      return;
    }

    // The browser dispatches scroll events as deferred tasks after a scrollTop
    // write, with the *final* scrollTop reflecting any clamps. Under continuous
    // streaming, scrollHeight grows between the pin write and the deferred
    // scroll event, which would make a naive distance-from-bottom calculation
    // see a stale (small) scrollTop against a fresh (large) scrollHeight and
    // wrongly conclude the user moved away. We sidestep this by only mutating
    // stickiness when an actual user-input event preceded the scroll event.
    let userInteracting = false;
    let interactionTimer: ReturnType<typeof setTimeout> | undefined;
    let pinFrame = 0;

    const pinNow = (): void => {
      if (!stickToBottomRef.current) {
        return;
      }
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    // ResizeObserver callbacks that synchronously mutate layout can trip the
    // browser's "ResizeObserver loop limit exceeded" guard. Defer the write to
    // the next animation frame; multiple resize bursts within one frame
    // coalesce into a single pin.
    const schedulePin = (): void => {
      if (pinFrame !== 0) {
        return;
      }
      pinFrame = globalThis.requestAnimationFrame(() => {
        pinFrame = 0;
        pinNow();
      });
    };

    // 150ms covers the next-task delivery window for the queued scroll event
    // following a user input burst, while staying short enough that subsequent
    // programmatic pin scrolls fall outside it.
    const markUserInteraction = (): void => {
      userInteracting = true;
      globalThis.clearTimeout(interactionTimer);
      interactionTimer = globalThis.setTimeout(() => {
        userInteracting = false;
      }, 150);
    };

    const handleScroll = (): void => {
      if (!userInteracting) {
        return;
      }
      const distanceFromBottom =
        scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
      stickToBottomRef.current = distanceFromBottom <= bottomTolerance;
    };

    pinNow();

    // `pointerdown` catches scrollbar-thumb drags (no wheel/touch precursor).
    scrollContainer.addEventListener('wheel', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('touchstart', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('keydown', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('pointerdown', markUserInteraction, { passive: true });
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    // ResizeObserver fires post-layout, so reads of scrollHeight are accurate
    // even when Streamdown / KaTeX / Shiki reflow asynchronously.
    const observer = new ResizeObserver(schedulePin);
    observer.observe(content);

    return () => {
      observer.disconnect();
      if (pinFrame !== 0) {
        globalThis.cancelAnimationFrame(pinFrame);
      }
      globalThis.clearTimeout(interactionTimer);
      scrollContainer.removeEventListener('wheel', markUserInteraction);
      scrollContainer.removeEventListener('touchstart', markUserInteraction);
      scrollContainer.removeEventListener('keydown', markUserInteraction);
      scrollContainer.removeEventListener('pointerdown', markUserInteraction);
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [isMessageActive, isContentVisible, isExpanded, scrollContainer, content]);

  const handleToggle = useCallback((): void => {
    setUserToggleState((previous) => {
      if (previous === 'expanded') {
        return 'collapsed';
      }

      return 'expanded';
    });
  }, []);

  // Header label state machine:
  //   1. Live      — this is the trailing message, the chat is still streaming,
  //                  and we have not yet observed a server-derived final
  //                  duration → "Thinking for Ns" ticks.
  //   2. Final     — server stamped both endpoints → "Thought for Ns".
  //   3. Fallback  — orphaned (chat ended without `reasoning-end`) or legacy /
  //                  uninstrumented part → "Thought briefly".
  // (`isReasoningStreaming` is computed above so it can also gate visibility.)
  const liveReasoningElapsed = useReasoningStopwatch(reasoningStartedAtMs, isReasoningStreaming);

  const reasoningLabel = isReasoningStreaming
    ? formatReasoningDuration(liveReasoningElapsed, { verb: 'Thinking' })
    : finalReasoningDurationMs === undefined
      ? 'Thought briefly'
      : formatReasoningDuration(finalReasoningDurationMs);

  // Two-tone presentation: leading verb ("Thought" / "Thinking") in the
  // foreground, the trailing duration suffix in muted color so the most
  // important word reads first while the suffix recedes. Spacing between the
  // verb and suffix is owned by `ChatToolLabel` (literal inline space), so the
  // suffix string here is the raw remainder with no leading-space padding.
  const [reasoningLabelVerb = reasoningLabel, ...reasoningLabelRest] = reasoningLabel.split(' ');
  const reasoningLabelSuffix = reasoningLabelRest.join(' ');

  if (!hasReasoningText) {
    return (
      <ChatToolCard variant='minimal' status={isMessageActive ? 'loading' : 'ready'} isDefaultOpen={false}>
        <ChatToolCardHeader>
          <Brain className='size-3 shrink-0' />
          <ChatToolCardTitle>{isMessageActive ? 'Thinking...' : 'Thought briefly'}</ChatToolCardTitle>
        </ChatToolCardHeader>
      </ChatToolCard>
    );
  }

  return (
    <div>
      <Button
        variant='ghost'
        size='xs'
        className='group/chat-tool-trigger -ml-2 flex h-6 w-full min-w-0 justify-start gap-1.5 overflow-hidden font-medium text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent'
        onClick={handleToggle}
      >
        <Brain className='size-3 shrink-0' />
        <ChatToolLabel verb={reasoningLabelVerb}>
          {reasoningLabelSuffix && <ChatToolDescription>{reasoningLabelSuffix}</ChatToolDescription>}
        </ChatToolLabel>
        <ChevronRight
          className={cn('size-3 shrink-0 transition-transform duration-200', isChevronRotated && 'rotate-90')}
        />
      </Button>

      {isContentVisible ? (
        <div className='pl-1.5'>
          <div
            ref={setScrollContainer}
            className={cn(
              'border-l border-foreground/20 pl-4 text-sm italic',
              !isExpanded && 'max-h-48 overflow-y-auto',
            )}
          >
            <div ref={setContent}>
              <MarkdownViewerChat className='text-muted-foreground' isStreaming={isMessageActive}>
                {displayText}
              </MarkdownViewerChat>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
