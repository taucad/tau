// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BookOpen } from 'lucide-react';
import { ChatActivityGroup } from '#components/chat/chat-activity-group.js';

const renderGroup = (
  options: { readonly active?: boolean; readonly summary?: string; readonly running?: boolean } = {},
) =>
  render(
    <ChatActivityGroup
      summary={options.summary ?? 'Read files, ran commands'}
      icon={BookOpen}
      isActive={options.active}
      hasActiveRows={options.running}
    >
      <div data-testid='first-row'>Read main.scad</div>
      <div data-testid='second-row'>Run numerical verification</div>
    </ChatActivityGroup>,
  );

class TestResizeObserver implements ResizeObserver {
  public static callback: ResizeObserverCallback | undefined;

  public constructor(callback: ResizeObserverCallback) {
    TestResizeObserver.callback = callback;
  }

  public observe(): void {
    // Only construction and manual callback invocation are needed.
  }
  public unobserve(): void {
    // Only construction and manual callback invocation are needed.
  }
  public disconnect(): void {
    // Only construction and manual callback invocation are needed.
  }
}

const observerStub = new TestResizeObserver(() => undefined);

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  globalThis.ResizeObserver = TestResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  TestResizeObserver.callback = undefined;
});

/** Jsdom never lays out, so the overflow the pin reacts to has to be declared. */
const measure = (element: HTMLElement, scrollHeight: number, clientHeight: number): void => {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
};

describe('ChatActivityGroup', () => {
  it('pins a streaming group to its newest row until the reader scrolls away', () => {
    renderGroup({ active: true, running: true, summary: 'Reading files' });
    const details = screen.getByRole('region', { name: 'Reading files details' });
    measure(details, 800, 320);

    act(() => {
      TestResizeObserver.callback?.([], observerStub);
    });
    expect(details.scrollTop).toBe(800);

    details.dispatchEvent(new WheelEvent('wheel'));
    details.scrollTop = 100;
    details.dispatchEvent(new Event('scroll'));
    measure(details, 1200, 320);
    act(() => {
      TestResizeObserver.callback?.([], observerStub);
    });
    expect(details.scrollTop).toBe(100);
  });

  it('spins a collapsed header while a row runs and keeps the family icon when open or settled (S08, S12)', async () => {
    const user = userEvent.setup();
    const { container, rerender } = renderGroup({ active: true, running: true, summary: 'Reading files' });
    const trigger = screen.getByRole('button', { name: 'Reading files' });
    const spinner = () => container.querySelector('[data-slot="activity-group-spinner"]');

    expect(spinner()).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.lucide-book-open')).not.toBeNull();

    await user.click(trigger);
    expect(spinner()).toHaveClass('animate-spin', 'motion-reduce:animate-none');
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.lucide-book-open')).toBeNull();

    rerender(
      <ChatActivityGroup summary='Read files' icon={BookOpen} isActive hasActiveRows={false}>
        <div />
      </ChatActivityGroup>,
    );
    expect(spinner()).toBeNull();
    expect(screen.getByRole('button', { name: 'Read files' })).not.toHaveAttribute('aria-busy');
  });

  it('spins a never-opened group whose row is still running', () => {
    const { container } = renderGroup({ running: true });
    expect(container.querySelector('[data-slot="activity-group-spinner"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Read files, ran commands' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows a semantic trigger while an active group is open', () => {
    const { container } = renderGroup({ active: true });
    const trigger = screen.getByRole('button', { name: 'Read files, ran commands' });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('first-row')).toBeInTheDocument();
    expect(container.querySelector('.lucide-book-open')).toHaveClass('size-3', 'shrink-0');
    expect(trigger).toHaveClass('items-center', 'gap-1.5', 'text-xs', 'font-normal');
    expect(trigger.querySelector('.lucide-chevron-right')).toHaveClass('opacity-0');
  });

  it('defaults completed activity closed and reveals flat bounded rows', async () => {
    const user = userEvent.setup();
    renderGroup();
    const trigger = screen.getByRole('button', { name: 'Read files, ran commands' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('first-row')).not.toBeInTheDocument();

    await user.click(trigger);

    const details = screen.getByRole('region', { name: 'Read files, ran commands details' });
    expect(details).toHaveClass('max-h-80', 'scroll-shadows-y', 'overflow-y-auto', 'overscroll-contain');
    expect(details).not.toHaveClass('ml-4');
    expect(screen.getByTestId('second-row')).toBeInTheDocument();
  });

  it('persists an explicit collapse through live summary updates and completion', async () => {
    const user = userEvent.setup();
    const { rerender } = renderGroup({ active: true, summary: 'Reading files' });

    await user.click(screen.getByRole('button', { name: 'Reading files' }));
    rerender(
      <ChatActivityGroup summary='Reading files, running commands' icon={BookOpen} isActive>
        <div data-testid='first-row'>Read main.scad</div>
      </ChatActivityGroup>,
    );
    expect(screen.getByRole('button', { name: 'Reading files, running commands' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(
      <ChatActivityGroup summary='Read files, ran commands' icon={BookOpen} isActive={false}>
        <div data-testid='first-row'>Read main.scad</div>
      </ChatActivityGroup>,
    );
    expect(screen.getByRole('button', { name: 'Read files, ran commands' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports keyboard disclosure through the native trigger', async () => {
    const user = userEvent.setup();
    renderGroup();
    const trigger = screen.getByRole('button', { name: 'Read files, ran commands' });
    trigger.focus();

    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
