// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Chat-history-status must render the model badge from the chat-scoped
// `Chat.activeModel` (via `useChatSelector(state => state.activeModel)`) —
// never by reverse-scanning message metadata.
// These tests pin that contract and guard against the regression where
// a fresh chat (no messages yet) silently dropped the model badge.

const chatSelectorState: { activeModel: string | undefined; messages: unknown[] } = {
  activeModel: 'manifold-model',
  messages: [],
};

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: { activeModel?: string; messages: unknown[] }) => T): T =>
    selector(chatSelectorState),
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
    chats: [{ id: 'chat_test', updatedAt: 0 }],
  }),
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

const { ChatHistoryStatus } = await import('#routes/w.$workspace.$project/chat-history-status.js');

describe('ChatHistoryStatus — chat-scoped model badge', () => {
  beforeEach(() => {
    chatSelectorState.activeModel = 'manifold-model';
    chatSelectorState.messages = [];
  });

  it('renders the model badge from chat.activeModel even when there are no messages yet', () => {
    chatSelectorState.activeModel = 'pinned-model';
    chatSelectorState.messages = [];

    render(<ChatHistoryStatus />);
    expect(screen.getByText('PINNED-MODEL')).toBeTruthy();
  });

  it('omits the model badge when chat.activeModel is undefined', () => {
    chatSelectorState.activeModel = undefined;
    chatSelectorState.messages = [
      // Even with stamped messages present, the deleted message-scan loop
      // must not be reintroduced — the badge is driven exclusively by the
      // chat-scoped activeModel.
      { metadata: { model: 'should-not-be-displayed' }, parts: [] },
    ];

    render(<ChatHistoryStatus />);
    expect(screen.queryByText('SHOULD-NOT-BE-DISPLAYED')).toBeNull();
  });
});
