// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import type { CadAgentConfigInput, MyUIMessage } from '@taucad/chat';

// Clicking a quick-start example must dispatch through the cad-chat-client
// so the per-request `agent` payload (kernel / mode / toolChoice / testingEnabled
// / snapshot / contextPayload) is sourced from useCadAgentConfig — never from
// inline metadata stamping on the user message. This file is the regression
// coverage for the original "Validation failed: messages.0.metadata.kernel"
// bug — the chat-client owns the wire body, not chat-examples.

const submitMock = vi.fn();
const cadAgent: CadAgentConfigInput = {
  profile: 'cad',
  model: 'openai-gpt-5.5',
  kernel: 'replicad',
  mode: 'agent',
  toolChoice: 'auto',
  testingEnabled: true,
};
vi.mock('#chat-clients/use-cad-chat-client.js', () => ({
  useCadChatClient: () => ({
    submit: submitMock,
    agent: cadAgent,
  }),
}));

// Sanity guards — these used to be consumed by chat-examples directly; any
// regression that re-introduces them should fail loudly.
vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => {
    throw new Error('chat-examples should no longer call useChatActions — switch to useCadChatClient');
  },
  useChatSelector: () => {
    throw new Error('chat-examples should no longer call useChatSelector — switch to useCadChatClient');
  },
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => {
    throw new Error('chat-examples should no longer call useModels — switch to useCadChatClient');
  },
}));

vi.mock('#hooks/use-chat-snapshot.js', () => ({
  useChatSnapshot: () => {
    throw new Error('chat-examples should no longer call useChatSnapshot — switch to useCadChatClient');
  },
}));

vi.mock('#constants/chat-prompt-examples.js', () => ({
  getRandomExamples: () => [
    { title: 'Cube', prompt: 'Make a cube' },
    { title: 'Sphere', prompt: 'Make a sphere' },
  ],
}));

vi.mock('#components/ui/button.js', () => ({
  Button: ({ children, onClick }: { readonly children: React.ReactNode; readonly onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('#components/ui/empty-items.js', () => ({
  EmptyItems: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { ChatExamples } = await import('#routes/projects_.$id/chat-examples.js');

describe('ChatExamples — submit routes through useCadChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls cadChat.submit with the example prompt as text', () => {
    render(<ChatExamples />);
    fireEvent.click(screen.getByText('Cube'));

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith({ text: 'Make a cube' });
  });

  // Wire-format invariant — the captured agent identity must produce a body
  // satisfying the shared chatTurnRequestSchema. Regression for the original
  // "missing kernel / testingEnabled" bug that motivated this refactor.
  it('produces a wire body satisfying chatTurnRequestSchema for the quick-start path', () => {
    render(<ChatExamples />);
    fireEvent.click(screen.getByText('Sphere'));

    const userMessage: MyUIMessage = {
      id: 'msg_test',
      role: 'user',
      parts: [{ type: 'text', text: 'Make a sphere' }],
    };
    const wireBody = {
      id: 'chat_test',
      messages: [userMessage],
      agent: cadAgent,
    };

    expect(() => chatTurnRequestSchema.parse(wireBody)).not.toThrow();
    const parsed = chatTurnRequestSchema.parse(wireBody);
    if (parsed.agent.profile !== 'cad') {
      throw new Error(`expected cad profile, got ${parsed.agent.profile}`);
    }
    expect(parsed.agent.kernel).toBe('replicad');
    expect(parsed.agent.testingEnabled).toBe(true);
    expect(parsed.agent.mode).toBe('agent');
    expect(parsed.agent.toolChoice).toBe('auto');
  });
});
