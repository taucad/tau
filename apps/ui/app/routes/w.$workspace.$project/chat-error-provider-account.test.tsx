import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorProviderAccount as ChatErrorProviderAccountSelfHost } from '#routes/w.$workspace.$project/chat-error-provider-account.self-host.js';
import { ChatErrorProviderAccount as ChatErrorProviderAccountCloud } from '#routes/w.$workspace.$project/chat-error-provider-account.js';

const continueChat = vi.fn();
const modelSelectorMock = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat }),
}));

/* The composer's own picker reads the chat-scoped model catalogue; this suite
 * owns only the trigger the card hands it. */
vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: (props: { readonly children: () => ReactNode }) => {
    modelSelectorMock();
    return <div>{props.children()}</div>;
  },
}));

const openAiMessage =
  'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';
const openAiDetails = { providerId: 'openai', providerCode: 'credit_balance_exhausted', accountOwner: 'operator' };

/** The card's actions in the order the card renders them. */
const actionLabels = (notice: HTMLElement): string[] =>
  [...notice.querySelectorAll('[data-slot="chat-error-card-actions"] > *')].map((action) => action.textContent);

describe('ChatErrorProviderAccount (self-host)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should name the provider and lead with its billing page', () => {
    render(<ChatErrorProviderAccountSelfHost description={openAiMessage} details={openAiDetails} />);

    const notice = screen.getByRole('status', { name: 'OpenAI has no credit left' });
    expect(notice).toHaveTextContent("This server's OpenAI key is out of credit");
    expect(notice).toHaveTextContent('Add credit on platform.openai.com');
    expect(actionLabels(notice)).toEqual(['Open OpenAI billing', 'Switch model', 'Try again']);
    expect(modelSelectorMock).toHaveBeenCalled();
    expect(notice).not.toHaveClass('bg-destructive/10');
  });

  it('should open the provider billing console in a new tab', () => {
    render(<ChatErrorProviderAccountSelfHost description={openAiMessage} details={openAiDetails} />);

    const link = screen.getByRole('link', { name: 'Open OpenAI billing' });
    expect(link).toHaveAttribute('href', 'https://platform.openai.com/settings/organization/billing/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('should keep the provider sentence and code behind Details', async () => {
    const user = userEvent.setup();
    render(<ChatErrorProviderAccountSelfHost description={openAiMessage} details={openAiDetails} />);

    expect(screen.queryByText(openAiMessage)).not.toBeInTheDocument();
    expect(screen.queryByText('credit_balance_exhausted')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByText(openAiMessage)).toBeInTheDocument();
    expect(screen.getByText('credit_balance_exhausted')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.queryByText('credit_balance_exhausted')).not.toBeInTheDocument();
  });

  it('should continue the chat from Try again', async () => {
    const user = userEvent.setup();
    render(<ChatErrorProviderAccountSelfHost description={openAiMessage} details={openAiDetails} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
  });

  it('should render no billing link for a provider that has no billing console', () => {
    render(<ChatErrorProviderAccountSelfHost details={{ providerId: 'together' }} />);

    const notice = screen.getByRole('status', { name: 'Together has no credit left' });
    expect(within(notice).queryByRole('link')).not.toBeInTheDocument();
    expect(notice).toHaveTextContent('Add credit with Together');
    expect(actionLabels(notice)).toEqual(['Switch model', 'Try again']);
  });

  it('should survive details that name no provider', () => {
    render(<ChatErrorProviderAccountSelfHost details={{ providerId: 42 }} />);

    expect(screen.getByRole('status', { name: 'The model provider has no credit left' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('ChatErrorProviderAccount (Tau Cloud)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report a supplier outage without the supplier sentence, code or link', () => {
    render(<ChatErrorProviderAccountCloud description={openAiMessage} details={openAiDetails} />);

    const notice = screen.getByRole('status', { name: 'OpenAI models are unavailable right now' });
    expect(notice).toHaveTextContent('Tau could not run this turn on OpenAI. You were not charged for it.');
    expect(actionLabels(notice)).toEqual(['Switch model', 'Try again']);
    expect(within(notice).queryByRole('link')).not.toBeInTheDocument();
    expect(within(notice).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    expect(notice).not.toHaveTextContent('credit_balance_exhausted');
    expect(notice).not.toHaveTextContent('You have no credits remaining');
    expect(notice).not.toHaveClass('bg-destructive/10');
  });

  it('should continue the chat from Try again', async () => {
    const user = userEvent.setup();
    render(<ChatErrorProviderAccountCloud details={openAiDetails} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
  });
});
