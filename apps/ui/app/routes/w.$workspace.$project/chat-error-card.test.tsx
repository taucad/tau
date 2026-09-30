import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditCard } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

describe('ChatErrorCard', () => {
  it('should keep the summary visible and recovery controls operable in their given order', async () => {
    const user = userEvent.setup();
    const resume = vi.fn();
    render(
      <ChatErrorCard
        tone='warning'
        icon={CreditCard}
        title='Credit limit reached'
        description='Add credits, then resume this chat.'
        actions={
          <>
            <Button size='xs' variant='outline'>
              Billing
            </Button>
            <Button size='xs' variant='outline'>
              Switch model
            </Button>
            <Button size='xs' variant='outline' onClick={resume}>
              Resume
            </Button>
          </>
        }
      />,
    );

    expect(screen.getByText('Credit limit reached')).toBeInTheDocument();
    expect(screen.getByText('Add credits, then resume this chat.')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Billing' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Switch model' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(resume).toHaveBeenCalledOnce();
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
