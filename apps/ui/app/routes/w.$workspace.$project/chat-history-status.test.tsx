// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Chat-history-status must render the model badge from the chat-scoped
// `Chat.activeExecution` (via `useChatSelector(state => state.activeExecution)`) —
// never by reverse-scanning message metadata.
// These tests pin that contract and guard against the regression where
// a fresh chat (no messages yet) silently dropped the model badge.

const chatSelectorState: {
  activeExecution:
    | { kind: 'tau'; model: string }
    | { kind: 'paseo'; connectionId: string; agentId: string }
    | undefined;
  messages: unknown[];
} = {
  activeExecution: { kind: 'tau', model: 'manifold-model' },
  messages: [],
};

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: typeof chatSelectorState) => T): T => selector(chatSelectorState),
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [true, vi.fn()],
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    resolveModel: (id: string) => ({
      id,
      name: id.toUpperCase(),
      family: 'gpt',
      provider: { id: 'openai', name: 'OpenAI' },
      isResolved: true,
    }),
  }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: {}, projectId: 'project_test' }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: () => 'chat_test',
}));

vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    chats: [
      {
        id: 'chat_test',
        resourceId: 'project_test',
        name: 'Chat',
        messages: [],
        createdAt: 1,
        updatedAt: 999,
        recencyAt: 1,
      },
    ],
  }),
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

const { ChatHistoryStatus } = await import('#routes/w.$workspace.$project/chat-history-status.js');

describe('ChatHistoryStatus — chat-scoped model badge', () => {
  beforeEach(() => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'manifold-model' };
    chatSelectorState.messages = [];
  });

  it('renders the model badge from a Tau execution even when there are no messages yet', () => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'pinned-model' };
    chatSelectorState.messages = [];

    render(<ChatHistoryStatus />);
    expect(screen.getByText('PINNED-MODEL')).toBeTruthy();
  });

  it('omits the Tau model badge for a Paseo execution', () => {
    chatSelectorState.activeExecution = { kind: 'paseo', connectionId: 'connection-1', agentId: 'claude' };
    chatSelectorState.messages = [
      // Even with stamped messages present, the deleted message-scan loop
      // must not be reintroduced — the badge is driven exclusively by the
      // chat-scoped execution target.
      { metadata: { model: 'should-not-be-displayed' }, parts: [] },
    ];

    render(<ChatHistoryStatus />);
    expect(screen.queryByText('SHOULD-NOT-BE-DISPLAYED')).toBeNull();
  });
});
