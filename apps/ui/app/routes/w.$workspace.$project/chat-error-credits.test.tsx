import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party billing surface owns the direct billing client contract
import { entitlementsFromTier } from '@taucad/billing';
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { ChatErrorCredits as ChatErrorCreditsSelfHost } from '#routes/w.$workspace.$project/chat-error-credits.self-host.js';

const openSettingsDialog = vi.hoisted(() => vi.fn());
const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

vi.mock('#hooks/use-settings-dialog.js', () => ({
  useSettingsDialog: () => ({ isOpen: false, section: 'general', open: openSettingsDialog, close: vi.fn() }),
}));

const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: (props: { readonly children: (values: { selectedModel: { id: string } }) => React.ReactNode }) => {
    return <div data-testid='model-selector'>{props.children({ selectedModel: { id: 'cookie-model' } })}</div>;
  },
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({ resolveModel: (id: string) => ({ id, name: id === 'openai-gpt-6-astra' ? 'Astra' : id }) }),
}));

const topupModalMock = vi.hoisted(() => vi.fn((_props: { isOpen: boolean }) => undefined));
vi.mock('#components/billing/topup-modal.js', () => ({
  TopupModal: (props: { readonly isOpen: boolean }) => {
    topupModalMock(props);
    return <div data-testid='topup-modal' data-open={props.isOpen} />;
  },
}));

describe('ChatErrorCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
  });

  it('should render warning chrome with provider billing copy and resume controls', () => {
    const description =
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';

    const { container } = render(<ChatErrorCredits resumable description={description} />);

    expect(screen.getByText('You’re out of credits')).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^billing$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    expect(container.firstElementChild).not.toHaveClass('border-warning/20', 'bg-warning/10');
    expect(container.firstElementChild).not.toHaveClass('border-destructive/20');
    expect(container.firstElementChild).not.toHaveClass('bg-destructive/10');
  });

  it('should render fallback copy when no provider description is supplied', () => {
    render(<ChatErrorCredits resumable />);

    expect(
      screen.getByText('You don’t have enough credits for this turn. Add credits, then resume.'),
    ).toBeInTheDocument();
  });

  it('should resume the chat without regenerating when Resume is clicked', async () => {
    const user = userEvent.setup();
    render(<ChatErrorCredits resumable />);

    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('should keep Add credits available and ask to send the draft when no saved run exists', async () => {
    render(<ChatErrorCredits resumable={false} />);

    expect(screen.getByText('Add credits, then send your message again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add credits' }));

    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'true');
    expect(openSettingsDialog).not.toHaveBeenCalled();
    expect(continueChat).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('should explicitly restart a self-host refusal from Try again', async () => {
    render(<ChatErrorCreditsSelfHost />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(regenerate).toHaveBeenCalledOnce();
    expect(continueChat).not.toHaveBeenCalled();
  });

  it('should open the Add credits dialog in place when a payment method is on file', async () => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('pro'), hasPaymentMethod: true });
    const user = userEvent.setup();
    render(<ChatErrorCredits resumable />);

    expect(screen.queryByRole('button', { name: /^billing$/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'false');

    await user.click(screen.getByRole('button', { name: /add credits/i }));

    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'true');
    expect(openSettingsDialog).not.toHaveBeenCalled();
    expect(topupModalMock).toHaveBeenCalledWith(expect.objectContaining({ defaultAmountCents: 2500 }));
  });

  it('should name the shortfall and the model when the 402 carried one', () => {
    render(
      <ChatErrorCredits
        resumable
        description='You don’t have enough credits for this turn.'
        details={{
          requiredCreditAtoms: '3084332',
          availableCreditAtoms: '2960000',
          routeId: 'openai-gpt-6-astra',
        }}
      />,
    );

    // 3,084,332 - 2,960,000 = 124,332 atoms -> 13 whole credits (rounded up).
    expect(
      screen.getByText(
        'This turn needs 13 more credits on Astra. Add credits or switch to a cheaper model, then resume.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('You don’t have enough credits for this turn.')).not.toBeInTheDocument();
  });

  it('should keep the provider description when the refusal carried no shortfall', () => {
    render(<ChatErrorCredits resumable description='Provider copy.' details={{ routeId: 'openai-gpt-6-astra' }} />);

    expect(screen.getByText('Provider copy.')).toBeInTheDocument();
  });

  it('should ignore a malformed shortfall rather than rendering NaN', () => {
    render(
      <ChatErrorCredits
        resumable
        description='Provider copy.'
        details={{ requiredCreditAtoms: 'lots', availableCreditAtoms: '1', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.getByText('Provider copy.')).toBeInTheDocument();
  });

  it('should offer a switch to a cheaper model', () => {
    render(<ChatErrorCredits resumable />);

    expect(screen.getByRole('button', { name: /switch model/i })).toBeInTheDocument();
  });

  it('should offer Add credits without a saved card too, because the dialog takes a new card', async () => {
    const user = userEvent.setup();
    render(<ChatErrorCredits resumable />);

    expect(screen.queryByRole('button', { name: /^billing$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add credits' }));

    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'true');
    expect(openSettingsDialog).not.toHaveBeenCalled();
  });

  it('should leave the sentence about resuming out when there is no run to resume', () => {
    render(
      <ChatErrorCredits
        resumable={false}
        details={{ requiredCreditAtoms: '3084332', availableCreditAtoms: '2960000', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.getByText('This turn needs 13 more credits on Astra.')).toBeInTheDocument();
  });
});
