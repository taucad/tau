import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

describe('ChatErrorCard', () => {
  it('should size its actions by the card, stacking them until the card reaches 20 rem', () => {
    const { container } = render(
      <ChatErrorCard
        tone='warning'
        icon={Clock}
        title='Rate limit exceeded'
        description='Wait a moment.'
        actions={<button type='button'>Try again</button>}
      />,
    );

    const card = container.querySelector('[data-slot="chat-error-card"]');
    const actions = container.querySelector('[data-slot="chat-error-card-actions"]');
    expect(card).toHaveClass('@container', 'border-warning/20', 'bg-warning/10');
    // No viewport breakpoint: the chat panel is far narrower than the window.
    expect(actions?.className).not.toMatch(/(^|\s)(sm|md|lg):/u);
    expect(actions).toHaveClass('flex-col', '@xs:flex-row', '@xs:*:flex-1', '*:whitespace-normal');
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
    expect(screen.getByText('Wait a moment.')).toBeInTheDocument();
  });

  it('should keep three actions stacked until the card reaches 24 rem', () => {
    const { container } = render(
      <ChatErrorCard
        tone='neutral'
        title='Credit limit reached'
        actionsRowFrom='sm'
        actions={
          <>
            <button type='button'>Billing</button>
            <button type='button'>Switch model</button>
            <button type='button'>Resume</button>
          </>
        }
      />,
    );

    const actions = container.querySelector('[data-slot="chat-error-card-actions"]');
    expect(actions).toHaveClass('@sm:flex-row', '@sm:*:flex-1');
    expect(actions).not.toHaveClass('@xs:flex-row');
  });

  it('should pass landmark props through and omit the action group without actions', () => {
    render(
      <ChatErrorCard role='status' aria-label='Codex is rate limited' tone='notice' title='Codex is rate limited'>
        <p>Details</p>
      </ChatErrorCard>,
    );

    const card = screen.getByRole('status', { name: 'Codex is rate limited' });
    expect(card.querySelector('[data-slot="chat-error-card-actions"]')).toBeNull();
    expect(card).toHaveTextContent('Details');
  });
});
