// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReasoningUIPart } from 'ai';
import { ChatMessageReasoning } from '#routes/w.$workspace.$project/chat-message-reasoning.js';

// Convenience knob: most tests only care about whether the *trailing* live
// message is streaming, so they toggle this flag instead of passing
// `isMessageActive` to every render. `renderReasoning` reads it to default the
// prop. Tests that need a different value (e.g. simulating an in-flight
// follow-up turn while inspecting a prior message) pass an explicit override.
const mockChatStatus: { current: 'streaming' | 'idle' } = { current: 'streaming' };

vi.mock('#components/markdown/markdown-viewer-chat.js', () => ({
  MarkdownViewerChat({
    children,
    isStreaming,
  }: {
    readonly children: string;
    readonly isStreaming?: boolean;
  }): React.JSX.Element {
    return (
      <div data-testid='markdown-content' data-streaming={isStreaming ? 'true' : 'false'}>
        {children}
      </div>
    );
  },
}));

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({
    children,
    status,
  }: {
    readonly children: React.ReactNode;
    readonly status?: string;
  }): React.JSX.Element {
    return (
      <div data-testid='chat-tool-card' data-status={status}>
        {children}
      </div>
    );
  },
  ChatToolCardHeader({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
}));

type ResizeObserverHarness = {
  callback: ResizeObserverCallback | undefined;
  constructions: number;
  observed: Element[];
  disconnects: number;
};

const harness: ResizeObserverHarness = {
  callback: undefined,
  constructions: 0,
  observed: [],
  disconnects: 0,
};

class TestResizeObserver implements ResizeObserver {
  public constructor(callback: ResizeObserverCallback) {
    harness.callback = callback;
    harness.constructions += 1;
  }

  public observe(target: Element): void {
    harness.observed.push(target);
  }

  public unobserve(): void {
    // No-op
  }

  public disconnect(): void {
    harness.disconnects += 1;
  }
}

const installScrollMetrics = (
  element: HTMLElement,
  metrics: { scrollHeight?: number; clientHeight?: number; scrollTop?: number },
): void => {
  if (metrics.scrollHeight !== undefined) {
    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      get: () => metrics.scrollHeight,
    });
  }

  if (metrics.clientHeight !== undefined) {
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      get: () => metrics.clientHeight,
    });
  }

  if (metrics.scrollTop !== undefined) {
    let value = metrics.scrollTop;
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      get: () => value,
      set: (next: number) => {
        value = next;
      },
    });
  }
};

const updateScrollHeight = (element: HTMLElement, scrollHeight: number): void => {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
};

const flushAnimationFrames = (): void => {
  // Drain repeatedly: a callback may schedule another frame.
  let safety = 32;
  while (pendingRafCallbacks.size > 0 && safety > 0) {
    const callbacks = [...pendingRafCallbacks.entries()];
    pendingRafCallbacks.clear();
    for (const [, callback] of callbacks) {
      callback(performance.now());
    }
    safety -= 1;
  }
};

const triggerResize = (): void => {
  if (!harness.callback) {
    throw new Error('ResizeObserver callback not registered');
  }

  act(() => {
    harness.callback?.([], {
      observe() {
        // No-op
      },
      unobserve() {
        // No-op
      },
      disconnect() {
        // No-op
      },
    });
    flushAnimationFrames();
  });
};

const dispatchScroll = (element: HTMLElement): void => {
  act(() => {
    element.dispatchEvent(new Event('scroll'));
  });
};

const dispatchWheel = (element: HTMLElement): void => {
  act(() => {
    element.dispatchEvent(new Event('wheel'));
  });
};

const dispatchPointerDown = (element: HTMLElement): void => {
  act(() => {
    element.dispatchEvent(new Event('pointerdown'));
  });
};

const createReasoningPart = (text = 'Some streaming reasoning text'): ReasoningUIPart => ({
  type: 'reasoning',
  text,
  state: 'streaming',
});

const createReasoningPartWithTiming = (
  options: {
    readonly text?: string;
    readonly state?: 'streaming' | 'done';
    readonly reasoningStartedAtMs?: number;
    readonly reasoningEndedAtMs?: number;
  } = {},
): ReasoningUIPart => {
  const { text = 'Some reasoning text', state = 'done', reasoningStartedAtMs, reasoningEndedAtMs } = options;
  const common: Record<string, number> = {};
  if (reasoningStartedAtMs !== undefined) {
    common['reasoningStartedAtMs'] = reasoningStartedAtMs;
  }
  if (reasoningEndedAtMs !== undefined) {
    common['reasoningEndedAtMs'] = reasoningEndedAtMs;
  }
  const providerMetadata =
    Object.keys(common).length > 0 ? ({ common } satisfies Record<string, Record<string, number>>) : undefined;
  return { type: 'reasoning', text, state, providerMetadata };
};

const getElements = (): { scrollContainer: HTMLElement; content: HTMLElement } => {
  const markdown = screen.getByTestId('markdown-content');
  const content = markdown.parentElement;
  const scrollContainer = content?.parentElement;

  if (!content || !scrollContainer) {
    throw new Error('Could not locate scroll container or content element');
  }

  return { scrollContainer, content };
};

type ReasoningRenderOptions = {
  readonly part: ReasoningUIPart;
  readonly hasContent?: boolean;
  readonly isMessageActive?: boolean;
};

const buildElement = ({ part, hasContent = false, isMessageActive }: ReasoningRenderOptions): React.JSX.Element => (
  <ChatMessageReasoning
    part={part}
    hasContent={hasContent}
    isMessageActive={isMessageActive ?? mockChatStatus.current === 'streaming'}
  />
);

const renderReasoning = (
  options: ReasoningRenderOptions,
): {
  readonly rerender: (next: ReasoningRenderOptions) => void;
  readonly unmount: () => void;
} => {
  const result = render(buildElement(options));
  return {
    rerender: (next) => {
      result.rerender(buildElement(next));
    },
    unmount: result.unmount,
  };
};

const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

let pendingRafCallbacks: Map<number, FrameRequestCallback>;
let nextRafHandle = 0;

beforeEach(() => {
  harness.callback = undefined;
  harness.constructions = 0;
  harness.observed = [];
  harness.disconnects = 0;
  mockChatStatus.current = 'streaming';
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

  // Queue RAF callbacks; tests flush them via triggerResize() so the observer-
  // driven pin is assertable. We can't run them synchronously inside
  // requestAnimationFrame() because the implementation assigns the returned
  // handle to a `pinFrame` cursor *after* the call — a synchronous callback
  // would set pinFrame = 0 then immediately be overwritten by the handle,
  // leaving subsequent schedulePin() calls short-circuiting forever.
  pendingRafCallbacks = new Map();
  nextRafHandle = 0;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    nextRafHandle += 1;
    const handle = nextRafHandle;
    pendingRafCallbacks.set(handle, callback);
    return handle;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number): void => {
    pendingRafCallbacks.delete(handle);
  }) as typeof cancelAnimationFrame;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

describe('ChatMessageReasoning', () => {
  describe('preview auto-pin', () => {
    it('should pin scrollTop to scrollHeight on attach during streaming', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 0 });

      // The synchronous attach pin runs before metrics were installed; replay via the observer.
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(500);
    });

    it('should pin to the new scrollHeight when the ResizeObserver fires while sticky', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 308 });

      triggerResize();
      expect(scrollContainer.scrollTop).toBe(500);

      updateScrollHeight(scrollContainer, 800);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(800);
    });

    it('should ignore programmatic scroll events that are not preceded by a user-input event', () => {
      // Regression: previously, the scroll event from a programmatic pin could fire
      // AFTER more content arrived, computing a large distance-from-bottom and
      // erroneously releasing stickiness, leaving the user stuck near the top.
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 300, clientHeight: 192, scrollTop: 0 });

      triggerResize();
      expect(scrollContainer.scrollTop).toBe(300);

      // Simulate "deferred scroll task fires AFTER content has grown beyond the
      // value pin() set scrollTop to" — distance-from-bottom is now huge.
      updateScrollHeight(scrollContainer, 600);
      dispatchScroll(scrollContainer);

      // Without a user-input precursor, the scroll listener must not release.
      updateScrollHeight(scrollContainer, 700);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(700);
    });

    it('should pause auto-pinning after a user wheel scroll moves away from the bottom', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 308 });

      triggerResize();
      expect(scrollContainer.scrollTop).toBe(500);

      dispatchWheel(scrollContainer);
      scrollContainer.scrollTop = 100;
      dispatchScroll(scrollContainer);

      updateScrollHeight(scrollContainer, 800);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(100);
    });

    it('should resume auto-pinning when the user scrolls back to the bottom', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 308 });

      triggerResize();

      dispatchWheel(scrollContainer);
      scrollContainer.scrollTop = 100;
      dispatchScroll(scrollContainer);

      updateScrollHeight(scrollContainer, 800);
      triggerResize();
      expect(scrollContainer.scrollTop).toBe(100);

      dispatchWheel(scrollContainer);
      scrollContainer.scrollTop = 608;
      dispatchScroll(scrollContainer);

      updateScrollHeight(scrollContainer, 1000);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(1000);
    });

    it('should detect scrollbar drag via pointerdown and release stickiness', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 308 });

      triggerResize();

      dispatchPointerDown(scrollContainer);
      scrollContainer.scrollTop = 50;
      dispatchScroll(scrollContainer);

      updateScrollHeight(scrollContainer, 900);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(50);
    });

    it('should treat distance-from-bottom equal to the 8px tolerance as still sticky', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 308 });

      triggerResize();

      dispatchWheel(scrollContainer);
      scrollContainer.scrollTop = 300;
      dispatchScroll(scrollContainer);

      updateScrollHeight(scrollContainer, 800);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(800);
    });

    it('should release stickiness when distance-from-bottom exceeds the 8px tolerance', () => {
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 308 });

      triggerResize();

      dispatchWheel(scrollContainer);
      scrollContainer.scrollTop = 299;
      dispatchScroll(scrollContainer);

      updateScrollHeight(scrollContainer, 800);
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(299);
    });
  });

  describe('gating', () => {
    it('should not construct a ResizeObserver when not streaming', () => {
      mockChatStatus.current = 'idle';

      renderReasoning({ part: createReasoningPart() });

      expect(harness.constructions).toBe(0);
    });

    it('should not construct a ResizeObserver when reasoning is collapsed (hasContent, reasoning done)', () => {
      // Once `isReasoningStreaming` flips to false (server stamped both
      // endpoints, OR the chat is no longer active), `hasContent` reasserts
      // its default-collapse behavior. This test pins that path; the
      // streaming-window override is covered by `streaming collapse floor`.
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          state: 'done',
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_002_000,
        }),
        hasContent: true,
      });

      expect(harness.constructions).toBe(0);
    });
  });

  describe('streaming collapse floor', () => {
    /**
     * Locate the Brain toggle button. Mirrors the lookup used by
     * `readLabelSpans` but standalone so the streaming-collapse tests can
     * also synthesize click events.
     */
    const getToggleButton = (): HTMLButtonElement => {
      const buttons = screen.getAllByRole('button');
      const button = buttons.find((b): b is HTMLButtonElement => b.querySelector('svg.lucide-brain') !== null);
      if (!button) {
        throw new Error('could not locate the Brain toggle button');
      }
      return button;
    };

    const clickToggle = (): void => {
      act(() => {
        getToggleButton().click();
      });
    };

    const getChevron = (): SVGElement => {
      const chevron = getToggleButton().querySelector('svg.lucide-chevron-right');
      if (!(chevron instanceof SVGElement)) {
        throw new Error('could not locate the chevron');
      }
      return chevron;
    };

    it('should keep the scrolling preview visible after the user collapses while reasoning is still streaming', () => {
      // Preview (default) → expanded (1st click) → would-be-collapsed (2nd click).
      // Under the new behavior, the 2nd click lands on `userToggleState === 'collapsed'`
      // but `isReasoningStreaming === true` forces the scroll container to remain
      // mounted at the same `max-h-48` preview height — never fully hidden.
      renderReasoning({ part: createReasoningPart() });

      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();

      clickToggle();
      clickToggle();

      const markdown = screen.getByTestId('markdown-content');
      expect(markdown).toBeInTheDocument();
      const scrollContainer = markdown.parentElement?.parentElement;
      expect(scrollContainer?.className).toContain('max-h-48');
      expect(scrollContainer?.className).toContain('overflow-y-auto');
    });

    it('should still hide the content on the second click when reasoning has completed (hasContent path)', () => {
      // Regression guard for the unchanged path: once `isReasoningStreaming`
      // is false, the `hasContent` collapse contract reasserts and a click
      // can fully hide the reasoning block.
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          text: 'Some reasoning text',
          state: 'done',
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_002_000,
        }),
        hasContent: true,
      });

      expect(screen.queryByTestId('markdown-content')).toBeNull();

      clickToggle();
      expect(screen.getByTestId('markdown-content')).toBeInTheDocument();

      clickToggle();
      expect(screen.queryByTestId('markdown-content')).toBeNull();
    });

    it('should keep the auto-pin observer attached after the user collapses during streaming', () => {
      // Because the scroll container remains mounted in the would-be-collapsed
      // state, the ResizeObserver never tears down and continued streaming
      // tokens still snap the preview to the latest content.
      renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 0 });
      triggerResize();
      expect(scrollContainer.scrollTop).toBe(500);

      clickToggle();
      clickToggle();

      // Same DOM nodes, observer still attached — new tokens still pin.
      const stillStreaming = getElements().scrollContainer;
      expect(stillStreaming).toBe(scrollContainer);
      updateScrollHeight(scrollContainer, 900);
      triggerResize();
      expect(scrollContainer.scrollTop).toBe(900);
    });

    it('should rotate the chevron only when fully expanded while reasoning streams (preview keeps it pointing right)', () => {
      renderReasoning({ part: createReasoningPart() });

      // Preview state: chevron points right.
      expect(getChevron().getAttribute('class')).not.toContain('rotate-90');

      clickToggle();
      expect(getChevron().getAttribute('class')).toContain('rotate-90');

      clickToggle();
      expect(getChevron().getAttribute('class')).not.toContain('rotate-90');
    });
  });

  describe('ref attachment lifecycle', () => {
    it('should attach the observer once reasoning text arrives after an empty initial render', () => {
      const { rerender } = renderReasoning({ part: createReasoningPart('') });

      expect(harness.constructions).toBe(0);
      expect(screen.queryByTestId('markdown-content')).toBeNull();

      rerender({ part: createReasoningPart('first token') });

      expect(harness.constructions).toBe(1);

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 0 });
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(500);
    });

    it('should disconnect and reconstruct the observer when text drops and then returns', () => {
      const { rerender } = renderReasoning({ part: createReasoningPart('initial text') });

      expect(harness.constructions).toBe(1);
      expect(harness.disconnects).toBe(0);

      rerender({ part: createReasoningPart('') });

      expect(harness.disconnects).toBe(1);
      expect(screen.queryByTestId('markdown-content')).toBeNull();

      rerender({ part: createReasoningPart('text again') });

      expect(harness.constructions).toBe(2);

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 600, clientHeight: 192, scrollTop: 0 });
      triggerResize();

      expect(scrollContainer.scrollTop).toBe(600);
    });
  });

  describe('cleanup', () => {
    it('should disconnect the ResizeObserver on unmount', () => {
      const { unmount } = renderReasoning({ part: createReasoningPart() });

      expect(harness.constructions).toBe(1);
      expect(harness.disconnects).toBe(0);

      unmount();

      expect(harness.disconnects).toBe(1);
    });

    it('should remove all interaction listeners on unmount', () => {
      const { unmount } = renderReasoning({ part: createReasoningPart() });

      const { scrollContainer } = getElements();
      installScrollMetrics(scrollContainer, { scrollHeight: 500, clientHeight: 192, scrollTop: 0 });
      const removeSpy = vi.spyOn(scrollContainer, 'removeEventListener');

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    });
  });

  describe('duration label', () => {
    const verbMutedClass = 'text-foreground/60';
    const detailMutedClass = 'text-foreground/50';

    type LabelSpans = {
      readonly button: HTMLButtonElement;
      readonly verbText: string;
      readonly suffixText?: string;
      readonly verbSpan: HTMLSpanElement;
      readonly suffixSpan?: HTMLSpanElement;
    };

    /**
     * Resolve the toggle button's two-tone label spans by walking the DOM
     * directly. testing-library's `getByText` normalizes whitespace and does
     * not match text spread across child elements, both of which interact
     * badly with the `<verb> <muted suffix>` two-tone structure under test.
     *
     * The Brain button now renders the label via the shared `ChatToolLabel`
     * component (`<span class="inline min-w-0 truncate">`) — the only direct
     * span child of the button — wrapping a verb span and an optional
     * `ChatToolDescription` span separated by a literal space text node.
     */
    const readLabelSpans = (): LabelSpans => {
      const buttons = screen.getAllByRole('button');
      const button = buttons.find((b): b is HTMLButtonElement => b.querySelector('svg.lucide-brain') !== null);
      if (!button) {
        throw new Error('could not locate the toggle button');
      }
      const labelWrapper = button.querySelector(':scope > span');
      if (!labelWrapper) {
        throw new Error('could not locate the label wrapper span');
      }
      const innerSpans = labelWrapper.querySelectorAll(':scope > span');
      const verbSpan = innerSpans[0];
      const suffixSpan = innerSpans[1];
      if (!(verbSpan instanceof HTMLSpanElement)) {
        throw new Error('expected a verb span');
      }
      return {
        button,
        verbText: verbSpan.textContent,
        suffixText:
          suffixSpan instanceof HTMLSpanElement && suffixSpan.textContent ? suffixSpan.textContent : undefined,
        verbSpan,
        suffixSpan: suffixSpan instanceof HTMLSpanElement ? suffixSpan : undefined,
      };
    };

    it('should render "Thought briefly" fallback for done parts with no providerMetadata.common', () => {
      mockChatStatus.current = 'idle';
      renderReasoning({ part: createReasoningPartWithTiming({ state: 'done' }) });

      const spans = readLabelSpans();
      expect(spans.verbText).toBe('Thought');
      expect(spans.suffixText?.trim()).toBe('briefly');
      // The fallback uses the shared `ChatToolLabel` two-tone treatment: verb
      // at /60 (medium weight), suffix at /50 via `ChatToolDescription`.
      expect(spans.verbSpan.className).toContain(verbMutedClass);
      expect(spans.suffixSpan?.className).toContain(detailMutedClass);
    });

    it('should declare the shared chat-tool trigger named group on the Brain button so labels lift on hover', () => {
      mockChatStatus.current = 'idle';
      renderReasoning({ part: createReasoningPartWithTiming({ state: 'done' }) });

      const spans = readLabelSpans();
      expect(spans.button.className).toContain('group/chat-tool-trigger');
      expect(spans.verbSpan.className).toContain('group-hover/chat-tool-trigger:text-foreground');
      expect(spans.suffixSpan?.className).toContain('group-hover/chat-tool-trigger:text-foreground/80');
    });

    it('should render "Thinking…" while streaming with reasoningStartedAtMs but no reasoningEndedAtMs (sub-second)', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        renderReasoning({
          part: createReasoningPartWithTiming({
            state: 'streaming',
            reasoningStartedAtMs: Date.now(),
          }),
        });

        const spans = readLabelSpans();
        expect(spans.verbText).toBe('Thinking…');
        expect(spans.suffixText).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should advance the live counter to "Thinking for 3s" after 3000ms while streaming', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        const startedAtMs = Date.now();

        renderReasoning({
          part: createReasoningPartWithTiming({ state: 'streaming', reasoningStartedAtMs: startedAtMs }),
        });

        act(() => {
          vi.advanceTimersByTime(3000);
        });

        const spans = readLabelSpans();
        expect(spans.verbText).toBe('Thinking');
        expect(spans.suffixText?.trim()).toBe('for 3s');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should render "Thought briefly" for state=done with sub-second timing', () => {
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          state: 'done',
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_000_500,
        }),
      });

      const spans = readLabelSpans();
      expect(spans.verbText).toBe('Thought');
      expect(spans.suffixText?.trim()).toBe('briefly');
    });

    it('should render "Thought for 2s" for state=done with a 2-second elapsed timing', () => {
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          state: 'done',
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_002_000,
        }),
      });

      const spans = readLabelSpans();
      expect(spans.verbText).toBe('Thought');
      expect(spans.suffixText?.trim()).toBe('for 2s');
    });

    it('should render "Thought for 1m 12s" for state=done with a 72-second elapsed timing', () => {
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          state: 'done',
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_072_000,
        }),
      });

      const spans = readLabelSpans();
      expect(spans.verbText).toBe('Thought');
      expect(spans.suffixText?.trim()).toBe('for 1m 12s');
    });

    it('should render the verb in the foreground tone and the suffix in the muted tone', () => {
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          state: 'done',
          reasoningStartedAtMs: 1_700_000_000_000,
          reasoningEndedAtMs: 1_700_000_002_000,
        }),
      });

      const spans = readLabelSpans();
      expect(spans.verbSpan.className).toContain(verbMutedClass);
      expect(spans.suffixSpan?.className).toContain(detailMutedClass);
    });

    it('should not render an empty muted suffix span for a single-word label like "Thinking…"', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        renderReasoning({
          part: createReasoningPartWithTiming({
            state: 'streaming',
            reasoningStartedAtMs: Date.now(),
          }),
        });

        const spans = readLabelSpans();
        expect(spans.verbText).toBe('Thinking…');
        expect(spans.suffixSpan).toBeUndefined();
        // No `ChatToolDescription` (detail-tier) span should be emitted when
        // there is no suffix text — only the verb span itself, which is at /60.
        const detailSpans = spans.button.querySelectorAll(`span.${detailMutedClass.replace('/', String.raw`\/`)}`);
        expect(detailSpans.length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should anchor the live counter on the server-stamped time without client-arrival skew compensation', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:05Z'));
        const startedAtMs = Date.now() - 5000;

        renderReasoning({
          part: createReasoningPartWithTiming({ state: 'streaming', reasoningStartedAtMs: startedAtMs }),
        });

        const spans = readLabelSpans();
        expect(spans.verbText).toBe('Thinking');
        expect(spans.suffixText?.trim()).toBe('for 5s');
      } finally {
        vi.useRealTimers();
      }
    });

    // Orphan handling: a reasoning-start without a matching reasoning-end on the same
    // turn is treated as completed when the message is no longer the active streaming
    // turn — prevents "Thinking..." from being stuck on stale messages.
    // The AI SDK reducer leaves `parts[i].state === 'streaming'` when the
    // upstream stream finishes (`finish-step`) without a matching `reasoning-end`.
    // The component must trust `isMessageActive` instead, otherwise the live
    // counter ticks forever after the chat completes / aborts / errors
    // mid-reasoning, and (critically) re-lights on prior messages whenever the
    // user sends a follow-up turn.

    it('should freeze the live counter and render "Thought briefly" when chat status flips to ready while part.state stays streaming (orphan)', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        const startedAtMs = Date.now();
        mockChatStatus.current = 'streaming';

        const part = createReasoningPartWithTiming({ state: 'streaming', reasoningStartedAtMs: startedAtMs });
        const { rerender } = renderReasoning({ part });

        act(() => {
          vi.advanceTimersByTime(3000);
        });

        const liveSpans = readLabelSpans();
        expect(liveSpans.verbText).toBe('Thinking');
        expect(liveSpans.suffixText?.trim()).toBe('for 3s');

        // Chat-level stream concludes (finish-step arrives) but the orphan
        // reasoning part still has state: 'streaming' since no reasoning-end fired.
        mockChatStatus.current = 'idle';
        rerender({ part });

        act(() => {
          vi.advanceTimersByTime(5000);
        });

        const finalSpans = readLabelSpans();
        expect(finalSpans.verbText).toBe('Thought');
        expect(finalSpans.suffixText?.trim()).toBe('briefly');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should render "Thought briefly" for parts loaded from history with state streaming but chat is idle', () => {
      // Persisted-history orphan: chat status is idle from the first render, so
      // the gate is false from mount and we never compute Date.now() - persistedStartedAtMs
      // (which would otherwise show as a multi-day "Thought for ..." nonsense).
      mockChatStatus.current = 'idle';
      renderReasoning({
        part: createReasoningPartWithTiming({
          state: 'streaming',
          reasoningStartedAtMs: 1_700_000_000_000,
        }),
      });

      const spans = readLabelSpans();
      expect(spans.verbText).toBe('Thought');
      expect(spans.suffixText?.trim()).toBe('briefly');
    });

    it('should clear the stopwatch interval when chat-level streaming flips off mid-reasoning', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        const startedAtMs = Date.now();
        mockChatStatus.current = 'streaming';

        const part = createReasoningPartWithTiming({ state: 'streaming', reasoningStartedAtMs: startedAtMs });
        const { rerender } = renderReasoning({ part });

        // Confirm the interval is active by advancing 2 ticks.
        act(() => {
          vi.advanceTimersByTime(2000);
        });
        expect(readLabelSpans().suffixText?.trim()).toBe('for 2s');

        mockChatStatus.current = 'idle';
        rerender({ part });

        // After the gate flips, the label is the orphan fallback. Further
        // timer advances must not reawaken the live counter or change the label.
        act(() => {
          vi.advanceTimersByTime(60_000);
        });

        const spans = readLabelSpans();
        expect(spans.verbText).toBe('Thought');
        expect(spans.suffixText?.trim()).toBe('briefly');
      } finally {
        vi.useRealTimers();
      }
    });

    // Trailing-message gating — the chat status alone is not enough; only the
    // live, trailing message should display present-tense affordances. Prior
    // messages must remain past-tense even while the chat keeps streaming.

    it('should render past-tense fallback on a prior reasoning part while a follow-up turn streams (isMessageActive=false, chat=streaming)', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        // Prior message's reasoning was never closed by `reasoning-end`, so
        // `finalReasoningDurationMs === undefined`. With the chat-wide flag we
        // would re-light the stopwatch on this prior message; the per-message
        // gate must keep it past-tense.
        mockChatStatus.current = 'streaming';
        renderReasoning({
          part: createReasoningPartWithTiming({
            state: 'streaming',
            reasoningStartedAtMs: 1_700_000_000_000,
          }),
          isMessageActive: false,
        });

        act(() => {
          vi.advanceTimersByTime(10_000);
        });

        const spans = readLabelSpans();
        expect(spans.verbText).toBe('Thought');
        expect(spans.suffixText?.trim()).toBe('briefly');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should render the no-text card without shimmer on a prior reasoning part while a follow-up turn streams', () => {
      // No-text branch: an empty reasoning part on a prior message should not
      // shimmer just because the chat is streaming a different message.
      mockChatStatus.current = 'streaming';
      renderReasoning({ part: createReasoningPart(''), isMessageActive: false });

      const card = screen.getByTestId('chat-tool-card');
      expect(card.dataset['status']).toBe('ready');
      expect(card.textContent).toContain('Thought briefly');
    });

    it('should render the no-text card with the loading shimmer when isMessageActive=true', () => {
      mockChatStatus.current = 'streaming';
      renderReasoning({ part: createReasoningPart('') });

      const card = screen.getByTestId('chat-tool-card');
      expect(card.dataset['status']).toBe('loading');
      expect(card.textContent).toContain('Thinking...');
    });

    it('should render the Brain icon in the no-text card for visual parity before reasoning deltas arrive', () => {
      mockChatStatus.current = 'streaming';
      const { unmount } = renderReasoning({ part: createReasoningPart('') });
      expect(document.querySelector('svg.lucide-brain')).not.toBeNull();

      unmount();
      mockChatStatus.current = 'streaming';
      renderReasoning({ part: createReasoningPart(''), isMessageActive: false });
      expect(document.querySelector('svg.lucide-brain')).not.toBeNull();
    });

    it('should pass isStreaming=false to MarkdownViewerChat when the message is not active', () => {
      mockChatStatus.current = 'streaming';
      renderReasoning({
        part: createReasoningPart('some prior reasoning text'),
        isMessageActive: false,
      });

      const markdown = screen.getByTestId('markdown-content');
      expect(markdown.dataset['streaming']).toBe('false');
    });
  });
});
