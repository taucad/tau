import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party billing surface owns the direct billing client contract
import { entitlementsFromTier } from '@taucad/billing';
import type { CreditStanding as Standing } from '#hooks/use-credit-standing.js';
import { ChatErrorCredits } from '#routes/w.$workspace.$project/chat-error-credits.js';
import { ChatErrorCredits as ChatErrorCreditsSelfHost } from '#routes/w.$workspace.$project/chat-error-credits.unfunded.js';

/* A funded deployment with the Cloud chunk loaded (adaptive app deployment mode W12). */
vi.mock('#cloud/use-deployment-mode.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.fundedModeModule();
});
vi.mock('#cloud/cloud-entries.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.loadedCloudEntries();
});

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

const standing = vi.hoisted(() => ({ value: undefined as Standing | undefined }));
vi.mock('#hooks/use-credit-standing.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCreditStanding: () => standing.value,
}));

const submitComposer = vi.hoisted(() => ({ value: undefined as (() => Promise<void>) | undefined }));
vi.mock('#hooks/chat-composer-submit.js', () => ({ useChatComposerSubmit: () => submitComposer.value }));

const standingOf = (available: bigint, coversAnyRoute: boolean): Standing => ({
  availableAtoms: available,
  isEmpty: available === 0n,
  covers: () => coversAnyRoute,
  coversAnyRoute,
  creditsPerUsd: 100,
});

const topupModalMock = vi.hoisted(() => vi.fn((_props: { isOpen: boolean }) => undefined));
vi.mock('@taucad/billing-ui/components/billing/topup-modal', () => ({
  TopupModal: (props: { readonly isOpen: boolean }) => {
    topupModalMock(props);
    return <div data-testid='topup-modal' data-open={props.isOpen} />;
  },
}));

describe('ChatErrorCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));
    standing.value = undefined;
    submitComposer.value = undefined;
  });

  /* N-4: a new account's first send. The price replaces a shortfall no purchase is that small, and no model runs on
   * nothing, so Add credits is the one action. */
  it('should give a zero balance the price, one action and no model switch', () => {
    standing.value = standingOf(0n, false);
    render(
      <ChatErrorCredits
        resumable={false}
        details={{ requiredCreditAtoms: '5000', availableCreditAtoms: '0', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.getByText('Add credits to send this')).toBeInTheDocument();
    expect(
      screen.getByText('Your message is ready. Credits pay for each AI turn and never expire.'),
    ).toBeInTheDocument();
    expect(screen.getByText('$10 adds 1,000 credits.')).toBeInTheDocument();
    expect(screen.queryByText(/needs/u)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch model/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('should keep Switch model on a refused send when a cheaper model fits the balance', () => {
    standing.value = standingOf(2_960_000n, true);
    render(
      <ChatErrorCredits
        resumable={false}
        details={{ requiredCreditAtoms: '3084332', availableCreditAtoms: '2960000', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.getByRole('button', { name: /switch model/i })).toBeInTheDocument();
  });

  /* Back from payment: the balance grew past the model's floor, so the kept draft can go with one click. */
  it('should turn into Credits added and send the kept draft once the balance covers the model', async () => {
    standing.value = standingOf(10_000_000n, true);
    const submit = vi.fn(async () => undefined);
    submitComposer.value = submit;
    render(
      <ChatErrorCredits
        resumable={false}
        details={{ requiredCreditAtoms: '5000', availableCreditAtoms: '0', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.getByText('Credits added')).toBeInTheDocument();
    expect(screen.getByText('1,000 credits are in your balance. Your message is ready to send.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add credits' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it('should ask for the composer’s Send where the card cannot send the draft itself', () => {
    standing.value = standingOf(10_000_000n, true);
    render(
      <ChatErrorCredits
        resumable={false}
        details={{ requiredCreditAtoms: '5000', availableCreditAtoms: '0', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.getByText('1,000 credits are in your balance. Send your message to start.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
  });

  it('should not claim credits were added when the balance did not grow', () => {
    standing.value = standingOf(2_960_000n, true);
    render(
      <ChatErrorCredits
        resumable={false}
        details={{ requiredCreditAtoms: '3084332', availableCreditAtoms: '2960000', routeId: 'openai-gpt-6-astra' }}
      />,
    );

    expect(screen.queryByText('Credits added')).not.toBeInTheDocument();
  });

  it('should tell the dialog the message waits while payment happens elsewhere', async () => {
    render(<ChatErrorCredits resumable={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add credits' }));

    expect(topupModalMock).toHaveBeenCalledWith(
      expect.objectContaining({ defaultAmountCents: 2500, returnNote: 'Your message will be here when you’re back.' }),
    );
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

    expect(screen.getByText('Add credits to send this')).toBeInTheDocument();
    expect(screen.getByText('Your message is ready. Add credits, then send it.')).toBeInTheDocument();
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

    expect(screen.getByText('This message needs 13 more credits on Astra.')).toBeInTheDocument();
  });
});
