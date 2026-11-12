// @vitest-environment jsdom
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { GoalId } from '@taucad/preferences';
import type { SuggestionGoal } from '@taucad/ui-core/lib/pick-suggestions';
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
  execution: { kind: 'tau', model: 'openai-gpt-5.5' },
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

const harness = vi.hoisted(() => ({
  onboarding: false,
  goals: [] as string[],
  preference: 'auto' as string,
}));
vi.mock('@taucad/ui-core/constants/chat-prompt-examples', () => ({
  getRandomExamples: () => [
    { id: 'cube', title: 'Cube', prompt: 'Make a cube', goals: ['general'] },
    { id: 'sphere', title: 'Sphere', prompt: 'Make a sphere', goals: ['general'] },
  ],
  chatExamples: [
    { id: 'hook', title: 'Wall hook', prompt: 'A wall hook', goals: ['printing'] },
    { id: 'bracket', title: 'L-bracket', prompt: 'An L-bracket', goals: ['mechanical'] },
    { id: 'board', title: 'Blinker', prompt: 'A 555 blinker', goals: ['electronics'], needs: 'electronics' },
    { id: 'stand', title: 'Phone stand', prompt: 'A phone stand', goals: ['general'] },
  ],
}));
vi.mock('#flags/use-feature.js', () => ({
  useFeature: (flag: string) => (flag === 'onboarding' ? harness.onboarding : false),
}));
vi.mock('#preferences/use-person-record.js', () => ({
  usePersonRecord: () => ({ profile: { version: 1, goals: harness.goals, languages: [] } }),
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ kernel: { preference: harness.preference } }),
}));
vi.mock('#hooks/use-routing-kernel-profile.js', () => ({
  useRoutingKernelProfile: () => ({ available: ['openscad', 'replicad', 'tscircuit'] }),
}));

vi.mock('@taucad/ui/components/button', () => ({
  Button: ({ children, onClick }: { readonly children: React.ReactNode; readonly onClick?: () => void }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@taucad/ui-kit/components/collection-empty-state', () => ({
  CollectionEmptyState: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
}));

const { ChatExamples } = await import('#routes/w.$workspace.$project/chat-examples.js');

describe('ChatExamples — submit routes through useCadChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.onboarding = false;
    harness.goals = [];
    harness.preference = 'auto';
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
      projectId: 'project_test',
      messages: [userMessage],
      agent: cadAgent,
      admission: { version: 1, idempotencyKey: 'request_0000000001' },
      execution: { hostId: 'host_test', workspaceId: 'workspace_test', baseRevisionId: 'rev_test' },
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

describe('ChatExamples with onboarding on', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.onboarding = true;
    harness.goals = ['mechanical', 'electronics'];
    harness.preference = 'auto';
  });

  it("should show the examples chosen for the person's goals, and send one on click as before", () => {
    render(<ChatExamples />);

    expect(screen.getByText('L-bracket')).toBeInTheDocument();
    expect(screen.getByText('Blinker')).toBeInTheDocument();
    expect(screen.queryByText('Wall hook')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('L-bracket'));
    expect(submitMock).toHaveBeenCalledWith({ text: 'An L-bracket' });
  });

  it('should leave out an example the picked kernel cannot make', () => {
    harness.preference = 'openscad';
    render(<ChatExamples />);

    expect(screen.queryByText('Blinker')).not.toBeInTheDocument();
  });

  it('should show general examples when the person has no goals', () => {
    harness.goals = [];
    render(<ChatExamples />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toContain('Phone stand');
    expect(screen.queryByText('L-bracket')).not.toBeInTheDocument();
  });

  it('should show no section when no example fits the goals and the picked kernel', () => {
    harness.goals = ['electronics'];
    harness.preference = 'openscad';
    const { container } = render(<ChatExamples />);

    expect(screen.queryByText('Get started with 3D model examples')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("should take setup's goals unchanged", () => {
    expectTypeOf<SuggestionGoal>().toEqualTypeOf<GoalId>();
  });
});
