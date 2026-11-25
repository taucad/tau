// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReasoningUIPart } from 'ai';
import { ChatActivityGroup, ChatActivityRow } from '@taucad/chat-ui/components/chat-activity-group';
import { ChatMessageReasoning, reasoningDurationMs } from '#routes/w.$workspace.$project/chat-message-reasoning.js';

vi.mock('@taucad/chat-surfaces/components/markdown/markdown-viewer-chat', () => ({
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

const renderReasoning = (parts: readonly ReasoningUIPart[], options: { readonly active?: boolean } = {}) =>
  render(<ChatMessageReasoning parts={parts} isMessageActive={options.active ?? false} />);

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
  it('rests closed with a visible chevron, whether it ends the turn or not', () => {
    renderReasoning([reasoning('First summary'), reasoning('**Confirming completion**')]);

    const trigger = screen.getByRole('button', { name: 'Thought briefly' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveClass('italic');
    expect(trigger).toHaveClass('text-xs', 'gap-1.5');
    expect(trigger.querySelector('.lucide-thought-bubble')).toHaveClass('size-3', 'shrink-0');
    expect(trigger.querySelector('.lucide-chevron-right')).not.toHaveClass('opacity-0');
    expect(screen.queryByTestId('reasoning-markdown')).not.toBeInTheDocument();
  });

  it('opens one normal-weight italic body in its own bordered surface', async () => {
    const user = userEvent.setup();
    renderReasoning([reasoning('First summary'), reasoning('**Confirming completion**')]);

    await user.click(screen.getByRole('button', { name: 'Thought briefly' }));

    const body = screen.getByRole('region', { name: 'Thought briefly details' });
    expect(body).toHaveClass('reasoning-body', 'font-normal', 'italic', 'rounded-lg', 'border');
    expect(body).not.toHaveClass('overflow-y-auto');
    expect(body.className).toContain('[&_*]:font-normal');
    expect(body.querySelector('.lucide-thought-bubble')).toBeNull();
    expect(screen.getAllByTestId('reasoning-markdown')).toHaveLength(2);
    expect(screen.queryByText(/Reasoning|Thinking/u)).not.toBeInTheDocument();
  });

  it('sits in its row without a second border inside an activity container', async () => {
    const user = userEvent.setup();
    render(
      <ChatActivityGroup summary='Read files'>
        <ChatActivityRow>
          <ChatMessageReasoning parts={[reasoning('Checking')]} isMessageActive={false} />
        </ChatActivityRow>
        <ChatActivityRow>Read main.scad</ChatActivityRow>
      </ChatActivityGroup>,
    );

    await user.click(screen.getByRole('button', { name: 'Read files' }));
    await user.click(screen.getByRole('button', { name: 'Thought briefly' }));

    expect(screen.getByRole('region', { name: 'Thought briefly details' })).not.toHaveClass('border');
  });

  it('should hand the renderer dollar-delimited math for reasoning stored with LaTeX delimiters', async () => {
    const user = userEvent.setup();
    renderReasoning([reasoning(String.raw`The area is \(\pi r^2\).`)]);

    await user.click(screen.getByRole('button', { name: 'Thought briefly' }));
    expect(screen.getByTestId('reasoning-markdown')).toHaveTextContent(String.raw`The area is $\pi r^2$.`);
  });

  it('toggles only from the trigger and reports the union duration', async () => {
    const user = userEvent.setup();
    renderReasoning([reasoning('One', { start: 0, end: 1000 }), reasoning('Two', { start: 3000, end: 5000 })]);
    const trigger = screen.getByRole('button', { name: 'Thought for 3 seconds' });

    await user.click(trigger);
    await user.click(screen.getByText('One'));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('One')).not.toBeInTheDocument();

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('One')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.queryByText('One')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('uses Thought briefly when complete interval evidence is unavailable', () => {
    renderReasoning([reasoning('Legacy thought')]);

    expect(screen.getByRole('button', { name: 'Thought briefly' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('lets links inside the body work without collapsing reasoning', async () => {
    const user = userEvent.setup();
    renderReasoning([reasoning('[docs](https://example.com)')]);

    await user.click(screen.getByRole('button', { name: 'Thought briefly' }));
    await user.click(screen.getByRole('link', { name: 'docs' }));
    expect(screen.getByRole('button', { name: 'Thought briefly' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays as the reader left it while the active sequence receives another chunk', async () => {
    const user = userEvent.setup();
    const first = reasoning('First', { state: 'streaming' });
    const { rerender } = renderReasoning([first], { active: true });
    const trigger = screen.getByRole('button', { name: 'Thinking…' });

    rerender(<ChatMessageReasoning parts={[first, reasoning('Second', { state: 'streaming' })]} isMessageActive />);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Second')).not.toBeInTheDocument();

    await user.click(trigger);
    rerender(
      <ChatMessageReasoning
        parts={[first, reasoning('Second', { state: 'streaming' }), reasoning('Third', { state: 'streaming' })]}
        isMessageActive
      />,
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('says Thinking while the trailing thought streams and its duration once it ends (S04)', () => {
    const live = renderReasoning([reasoning('Checking the grid', { state: 'streaming' })], { active: true });
    expect(screen.getByRole('button', { name: 'Thinking…' })).toHaveAttribute('aria-expanded', 'false');
    live.unmount();

    const history = renderReasoning([reasoning('Checked', { state: 'streaming' })]);
    expect(screen.getByRole('button', { name: 'Thought briefly' })).toBeInTheDocument();
    history.unmount();

    renderReasoning([reasoning('Checked')], { active: true });
    expect(screen.getByRole('button', { name: 'Thought briefly' })).toBeInTheDocument();
  });

  it('streams an opened active thought, and renders no blank placeholder', async () => {
    const user = userEvent.setup();
    const active = renderReasoning([reasoning('Live', { state: 'streaming' })], { active: true });
    await user.click(screen.getByRole('button', { name: 'Thinking…' }));
    expect(screen.getByText('Live')).toHaveAttribute('data-streaming', 'true');
    active.unmount();

    const blank = renderReasoning([reasoning('  ')]);
    expect(blank.container).toBeEmptyDOMElement();
  });

  it('keeps an opened streaming reasoning body mounted across a delta so the fade frontier commits', async () => {
    const user = userEvent.setup();
    const { rerender } = renderReasoning([reasoning('Check', { start: 0, state: 'streaming' })], { active: true });
    await user.click(screen.getByRole('button', { name: 'Thinking…' }));
    const body = screen.getByTestId('reasoning-markdown');

    rerender(
      <ChatMessageReasoning parts={[reasoning('Check the grid', { start: 0, state: 'streaming' })]} isMessageActive />,
    );

    expect(screen.getByTestId('reasoning-markdown')).toBe(body);
    expect(body).toHaveTextContent('Check the grid');
  });
});
