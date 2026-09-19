import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorPausedTurn } from '#routes/w.$workspace.$project/chat-error-paused-turn.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

/* The composer's own picker reads chat-scoped model state; this suite owns only
 * the trigger the card hands it. */
vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: ({ children }: { readonly children: () => ReactNode }) => <div>{children()}</div>,
}));

vi.mock('#components/code/code-viewer.js', () => ({
  CodeViewer: ({ text }: { readonly text: string }) => <pre data-testid='code-viewer'>{text}</pre>,
}));

describe('ChatErrorPausedTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should name the failure in the provider words and promise the turn is saved', () => {
    const { container } = render(
      <ChatErrorPausedTurn resumable reason='server_error: The server had an error while processing your request.' />,
    );

    expect(screen.getByText('Tau paused this turn')).toBeInTheDocument();
    // The consequence is its own paragraph after the provider's sentence and
    // ahead of the action, never folded into a disclosure (DESIGN).
    const paragraphs = [...container.querySelectorAll('p')].map((node) => node.textContent);
    expect(paragraphs).toEqual([
      'Tau paused this turn',
      'server_error: The server had an error while processing your request.',
      'Everything up to here is saved.',
    ]);
  });

  it('should resume the paused turn instead of offering to try again', async () => {
    const user = userEvent.setup();
    render(<ChatErrorPausedTurn resumable reason='The model provider is unavailable right now.' />);

    expect(screen.queryByRole('button', { name: /try again/iu })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  /* F5: the card may only promise what the host will do. A failure the host
     rules unrecoverable gets the gesture it will actually receive. */
  it('should promise nothing and keep Try again when the host will not resume the run', async () => {
    const user = userEvent.setup();
    render(<ChatErrorPausedTurn resumable={false} reason='The agent host worker crashed.' />);

    expect(screen.queryByText('Everything up to here is saved.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/iu })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
  });

  it('should offer a model switch ahead of Resume when the request itself was refused', () => {
    render(
      <ChatErrorPausedTurn
        resumable
        title='The model refused this request'
        reason='Vertex does not support xhigh reasoning effort.'
        guidance='Change the model or its settings, then resume.'
        canSwitchModel
      />,
    );

    expect(screen.getByText('The model refused this request')).toBeInTheDocument();
    expect(
      screen.getByText('Everything up to here is saved. Change the model or its settings, then resume.'),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Switch model', 'Resume']);
  });

  it('should keep the raw failure behind a disclosure, outside the consequence and the action', async () => {
    const user = userEvent.setup();
    render(
      <ChatErrorPausedTurn resumable reason='Tau could not read the reply.' raw='{"code":"MALFORMED_RESPONSE"}' />,
    );

    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByTestId('code-viewer')).toHaveTextContent('MALFORMED_RESPONSE');
  });
});
