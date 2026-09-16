// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReasoningUIPart } from 'ai';
import { ChatMessageReasoning, reasoningDurationMs } from '#routes/w.$workspace.$project/chat-message-reasoning.js';

vi.mock('#components/markdown/markdown-viewer-chat.js', () => ({
  MarkdownViewerChat({
    children,
    isStreaming,
  }: {
    readonly children: string;
    readonly isStreaming?: boolean;
  }): React.JSX.Element {
    return children === '[docs](https://example.com)' ? (
      <a
        href='https://example.com'
        onClick={(event) => {
          event.preventDefault();
        }}
      >
        docs
      </a>
    ) : (
      <div data-testid='reasoning-markdown' data-streaming={String(Boolean(isStreaming))}>
        {children}
      </div>
    );
  },
}));

const reasoning = (
  text: string,
  options: {
    readonly end?: number;
    readonly start?: number;
    readonly state?: ReasoningUIPart['state'];
  } = {},
): ReasoningUIPart => ({
  type: 'reasoning',
  text,
  state: options.state ?? 'done',
  ...(options.start === undefined && options.end === undefined
    ? {}
    : {
        providerMetadata: {
          common: {
            ...(options.start === undefined ? {} : { reasoningStartedAtMs: options.start }),
            ...(options.end === undefined ? {} : { reasoningEndedAtMs: options.end }),
          },
        },
      }),
});

const renderReasoning = (
  parts: readonly ReasoningUIPart[],
  options: { readonly active?: boolean; readonly hasContent?: boolean } = {},
) =>
  render(
    <ChatMessageReasoning
      parts={parts}
      hasContent={options.hasContent ?? false}
      isMessageActive={options.active ?? false}
    />,
  );

class TestResizeObserver implements ResizeObserver {
  public static callback: ResizeObserverCallback | undefined;

  public constructor(callback: ResizeObserverCallback) {
    TestResizeObserver.callback = callback;
  }

  public observe(): void {
    // The disclosure test only needs construction to succeed.
  }
  public unobserve(): void {
    // The disclosure test only needs construction to succeed.
  }
  public disconnect(): void {
    // The disclosure test only needs construction to succeed.
  }
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  globalThis.ResizeObserver = TestResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe('reasoningDurationMs', () => {
  it('unions overlapping intervals and sums separated intervals', () => {
    expect(
      reasoningDurationMs([reasoning('a', { start: 0, end: 4000 }), reasoning('b', { start: 2000, end: 5000 })]),
    ).toBe(5000);
    expect(
      reasoningDurationMs([reasoning('a', { start: 0, end: 1000 }), reasoning('b', { start: 3000, end: 5000 })]),
    ).toBe(3000);
  });

  it('rejects incomplete, reversed, and malformed interval sets', () => {
    expect(reasoningDurationMs([reasoning('a', { start: 0 })])).toBeUndefined();
    expect(reasoningDurationMs([reasoning('a', { start: 100, end: 50 })])).toBeUndefined();
    expect(
      reasoningDurationMs([
        {
          ...reasoning('a'),
          providerMetadata: { common: { reasoningStartedAtMs: Number.NaN, reasoningEndedAtMs: 100 } },
        },
      ]),
    ).toBeUndefined();
  });
});

describe('ChatMessageReasoning', () => {
  it('renders adjacent chunks as one direct, normal-weight italic reasoning body', () => {
    renderReasoning([reasoning('First summary'), reasoning('**Confirming completion**')]);
    const body = screen.getByRole('group', { name: 'Collapse thought' });

    expect(screen.getAllByTestId('reasoning-markdown')).toHaveLength(2);
    const reasoningBody = body.closest('.reasoning-body');
    expect(reasoningBody).toHaveClass('reasoning-body', 'font-normal', 'italic');
    expect(reasoningBody?.className).toContain('[&_*]:font-normal');
    expect(body.querySelector('.lucide-thought-bubble')).toHaveClass('size-3', 'shrink-0');
    expect(screen.getByRole('button', { name: 'Collapse thought' })).toHaveClass('opacity-0');
    expect(screen.queryByText(/Reasoning|Thinking/u)).not.toBeInTheDocument();
  });

  it('collapses the whole body to the union duration and restores trigger focus', async () => {
    const user = userEvent.setup();
    renderReasoning([reasoning('One', { start: 0, end: 1000 }), reasoning('Two', { start: 3000, end: 5000 })]);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');

    await user.click(screen.getByRole('group', { name: 'Collapse thought' }));

    const trigger = screen.getByRole('button', { name: 'Thought for 3 seconds' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ focusVisible: false });
    expect(screen.queryByText('One')).not.toBeInTheDocument();
  });

  it('uses Thought briefly when complete interval evidence is unavailable', () => {
    renderReasoning([reasoning('Legacy thought')], { hasContent: true });

    const trigger = screen.getByRole('button', { name: 'Thought briefly' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveClass('text-xs', 'gap-1.5');
    expect(trigger).not.toHaveClass('italic');
    expect(trigger.querySelector('.lucide-thought-bubble')).toHaveClass('size-3', 'shrink-0');
    expect(trigger.querySelector('.lucide-chevron-right')).toHaveClass('opacity-0');
  });

  it('lets links and text selection work without collapsing reasoning', async () => {
    const user = userEvent.setup();
    renderReasoning([reasoning('[docs](https://example.com)')]);

    await user.click(screen.getByRole('link', { name: 'docs' }));
    expect(screen.getByRole('group', { name: 'Collapse thought' })).toBeInTheDocument();

    vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => 'selected text' } as Selection);
    await user.click(screen.getByRole('group', { name: 'Collapse thought' }));
    expect(screen.getByRole('group', { name: 'Collapse thought' })).toBeInTheDocument();
  });

  it('collapses from Enter and Space on the reasoning body', async () => {
    const user = userEvent.setup();
    const first = renderReasoning([reasoning('Keyboard')]);
    screen.getByRole('button', { name: 'Collapse thought' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Thought briefly' })).toBeInTheDocument();
    first.unmount();

    renderReasoning([reasoning('Keyboard')]);
    screen.getByRole('button', { name: 'Collapse thought' }).focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Thought briefly' })).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({ focusVisible: true });
  });

  it('preserves an explicit collapse while the active sequence receives another chunk', async () => {
    const user = userEvent.setup();
    const first = reasoning('First', { state: 'streaming' });
    const { rerender } = renderReasoning([first], { active: true });

    await user.click(screen.getByRole('group', { name: 'Collapse thought' }));
    rerender(
      <ChatMessageReasoning
        parts={[first, reasoning('Second', { state: 'streaming' })]}
        hasContent={false}
        isMessageActive
      />,
    );

    expect(screen.getByRole('button', { name: 'Thought briefly' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Second')).not.toBeInTheDocument();
  });

  it('renders active reasoning open, completed upstream reasoning closed, and no blank placeholder', () => {
    const active = renderReasoning([reasoning('Live', { state: 'streaming' })], { active: true });
    expect(screen.getByText('Live')).toHaveAttribute('data-streaming', 'true');
    active.unmount();

    const completed = renderReasoning([reasoning('Done')], { hasContent: true });
    expect(screen.getByRole('button', { name: 'Thought briefly' })).toBeInTheDocument();
    completed.unmount();

    const blank = renderReasoning([reasoning('  ')]);
    expect(blank.container).toBeEmptyDOMElement();
  });
});
