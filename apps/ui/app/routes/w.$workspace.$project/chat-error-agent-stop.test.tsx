import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExternalAgentStop } from '@taucad/agent-host';
import { ChatErrorAgentStop } from '#routes/w.$workspace.$project/chat-error-agent-stop.js';

const continueChat = vi.fn();
const openNewChat = vi.fn(async () => undefined);
const execution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' } as const;
const agentSelection = vi.hoisted(() => ({ isOffered: true, label: 'Codex' }));

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ execution: { execution } }),
}));
/* The composer's own picker reads placement and chat stores; this suite owns
 * only the trigger the card hands it. */
vi.mock('#components/chat/chat-execution-selector.js', () => ({
  ChatExecutionSelector: ({ children }: { readonly children: () => ReactNode }) => (
    <div data-slot='agent-picker'>{children()}</div>
  ),
  useChatAgentSelection: () => agentSelection,
}));
vi.mock('#lib/agent-host-placement.js', () => ({
  externalAgentDisplayName: (agentId: string) => (agentId === 'codex' ? 'Codex' : 'Claude Code'),
}));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat, isReady: true }),
}));

const quotaTitle =
  "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 20th, 2026 4:07 PM.";

const stopOf = (
  failure: Partial<ExternalAgentStop['failure']>,
  extra: Partial<ExternalAgentStop> = {},
): ExternalAgentStop => ({
  agentId: 'codex',
  failure: { category: 'limit', title: quotaTitle, actions: [], ...failure },
  ...extra,
});

describe('ChatErrorAgentStop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentSelection.isOffered = true;
  });

  it('should present a usage limit as a status with the provider link and only Switch agent', () => {
    render(<ChatErrorAgentStop stop={stopOf({})} />);

    const notice = screen.getByRole('status', { name: 'Codex usage limit reached' });
    expect(notice).toHaveTextContent('try again at Sep 20th, 2026 4:07 PM.');
    expect(screen.getByRole('link', { name: 'chatgpt.com/codex/settings/usage' })).toHaveAttribute(
      'href',
      'https://chatgpt.com/codex/settings/usage',
    );
    expect(screen.getByRole('button', { name: 'Switch agent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    expect(notice).not.toHaveClass('bg-destructive/10');
  });

  it('should omit Switch agent when the composer offers no other agent', () => {
    agentSelection.isOffered = false;

    render(<ChatErrorAgentStop stop={stopOf({})} />);

    expect(screen.getByRole('status', { name: 'Codex usage limit reached' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch agent' })).not.toBeInTheDocument();
  });

  it('should continue the chat from a rate limit the agent says can be retried', async () => {
    const user = userEvent.setup();
    render(
      <ChatErrorAgentStop
        stop={stopOf({ title: 'Claude is temporarily rate limited.', actions: ['retry'] }, { agentId: 'claude' })}
      />,
    );

    expect(screen.getByRole('status', { name: 'Claude Code is rate limited' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
  });

  it('should open a new chat on the same agent for a session limit', async () => {
    const user = userEvent.setup();
    render(
      <ChatErrorAgentStop
        stop={stopOf({ title: 'Codex ran out of room in its context window.', actions: ['new_session'] })}
      />,
    );

    expect(screen.getByRole('status', { name: 'Codex reached a session limit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Switch agent' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(openNewChat).toHaveBeenCalledWith({ activeExecution: execution });
  });

  it('should alert an unexpected failure and keep its diagnostics collapsed until asked', async () => {
    const user = userEvent.setup();
    render(
      <ChatErrorAgentStop
        stop={stopOf(
          { category: 'internal', title: 'Internal error', actions: ['retry'] },
          { diagnostics: '[SYSTEM_ERROR] Prompt for session s-1 failed' },
        )}
      />,
    );

    const alert = screen.getByRole('alert', { name: 'Codex stopped unexpectedly' });
    expect(alert).toHaveTextContent('Internal error');
    expect(screen.queryByText(/SYSTEM_ERROR/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByText(/SYSTEM_ERROR/u)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(continueChat).toHaveBeenCalledTimes(1);
  });

  it('should offer retry and another agent when the service is busy', () => {
    render(
      <ChatErrorAgentStop
        stop={stopOf({ category: 'service', title: 'Codex is temporarily overloaded.', actions: ['retry'] })}
      />,
    );

    expect(screen.getByRole('status', { name: 'Codex is unavailable right now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch agent' })).toBeInTheDocument();
  });
});
