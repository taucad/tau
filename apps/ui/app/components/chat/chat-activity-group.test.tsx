// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BookOpen } from 'lucide-react';
import { ChatActivityGroup } from '#components/chat/chat-activity-group.js';

const renderGroup = (options: { readonly active?: boolean; readonly summary?: string } = {}) =>
  render(
    <ChatActivityGroup
      summary={options.summary ?? 'Read files, ran commands'}
      icon={BookOpen}
      isActive={options.active}
    >
      <div data-testid='first-row'>Read main.scad</div>
      <div data-testid='second-row'>Run numerical verification</div>
    </ChatActivityGroup>,
  );

describe('ChatActivityGroup', () => {
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
