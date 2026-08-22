import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

vi.mock('#hooks/use-settings-dialog.js', () => ({
  openSettingsDialog: vi.fn(),
}));

describe('ChatErrorCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render warning chrome with provider billing copy and resume controls', () => {
    const description =
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';

    const { container } = render(<ChatErrorCredits description={description} />);

    expect(screen.getByText('Credit Limit Reached')).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /plans & billing/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    expect(container.firstElementChild).toHaveClass('border-warning/20', 'bg-warning/10');
    expect(container.firstElementChild).not.toHaveClass('border-destructive/20');
    expect(container.firstElementChild).not.toHaveClass('bg-destructive/10');
  });

  it('should render fallback copy when no provider description is supplied', () => {
    render(<ChatErrorCredits />);

    expect(screen.getByText('Your credit balance is too low. Add credits, then resume this chat.')).toBeInTheDocument();
  });

  it('should resume the chat without regenerating when Resume is clicked', async () => {
    const user = userEvent.setup();
    render(<ChatErrorCredits />);

    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('should open billing settings when Plans & Billing is clicked', async () => {
    const user = userEvent.setup();
    render(<ChatErrorCredits />);

    await user.click(screen.getByRole('button', { name: /plans & billing/i }));

    expect(openSettingsDialog).toHaveBeenCalledTimes(1);
    expect(openSettingsDialog).toHaveBeenCalledWith('billing');
  });
});
