/**
 * The chat history's bottom activity indicator (chat activity indicator
 * closeout, R1–R3).
 *
 * The run state decides whether a turn is live; the trailing message's parts
 * only decide whether something else on screen already shows that. Each case
 * names the blueprint inventory row it pins.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { messageRole } from '@taucad/chat/constants';
import type { MyUIMessage } from '@taucad/chat';
import { ChatMessagePlanning } from '#routes/w.$workspace.$project/chat-message-planning.js';
import type { ChatRetrySnapshot } from '#hooks/use-chat.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarState } from '#types/chat-sidebar.types.js';

type SelectorState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: MyUIMessage[];
  messagesById: Map<string, MyUIMessage>;
};

let mockSelectorState: SelectorState = { status: 'streaming', messages: [], messagesById: new Map() };
let mockRetrySnapshot: ChatRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId: 'chat-1' }),
  useChatSelector<T>(selector: (state: SelectorState) => T): T {
    return selector(mockSelectorState);
  },
  useChatRetrySnapshot(): ChatRetrySnapshot {
    return mockRetrySnapshot;
  },
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1' }) }));
vi.mock('#hooks/use-sidebar-status.js', () => ({ useChatSidebarStatus: vi.fn() }));

const setRun = (state: ChatSidebarState | undefined): void => {
  vi.mocked(useChatSidebarStatus).mockReturnValue(
    state === undefined
      ? undefined
      : ({
          state,
          unread: false,
          toolName: undefined,
          pendingApprovalCount: 0,
          failureReason: undefined,
          branch: undefined,
          dirty: false,
        } satisfies ChatSidebarStatus),
  );
};

const setChat = (status: SelectorState['status'], messages: MyUIMessage[]): void => {
  mockSelectorState = { status, messages, messagesById: new Map(messages.map((m) => [m.id, m])) };
};

const user = (id: string): MyUIMessage =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
  ({ id, role: messageRole.user, parts: [{ type: 'text', text: 'hi' }], metadata: { createdAt: 0 } }) as MyUIMessage;

const assistant = (id: string, parts: Array<Record<string, unknown>>): MyUIMessage =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- reducer-shaped parts for test
  ({ id, role: messageRole.assistant, parts, metadata: { createdAt: 0 } }) as unknown as MyUIMessage;

const tool = (state: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'dynamic-tool',
  toolName: 'read_file',
  toolCallId: 'call-1',
  state,
  input: {},
  ...extra,
});

const indicator = () => screen.queryByRole('status');

beforeEach(() => {
  mockRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 5 };
  setRun('working');
});

describe('ChatMessagePlanning', () => {
  it('S02: shows under the trailing user message while the run is queued', () => {
    setRun('queued');
    setChat('submitted', [user('u1')]);
    render(<ChatMessagePlanning messageId='u1' />);
    expect(indicator()).toHaveTextContent('Planning next moves…');
  });

  it('shows only under the trailing message', () => {
    setChat('streaming', [user('u1'), assistant('a1', [tool('output-available')])]);
    render(<ChatMessagePlanning messageId='u1' />);
    expect(indicator()).toBeNull();
  });

  it('S10: shows between steps once every part has concluded', () => {
    setChat('streaming', [assistant('a1', [{ type: 'step-start' }, tool('output-available')])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Planning next moves…');
  });

  it('S11: shows while an ACP checkpoint leaves an earlier thought streaming behind a settled tool', () => {
    setChat('streaming', [
      assistant('a1', [
        { type: 'step-start' },
        { type: 'reasoning', text: 'Plan the housing', state: 'streaming' },
        tool('output-available'),
      ]),
    ]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Planning next moves…');
  });

  it('S05: shows while the trailing thought streams without visible text', () => {
    setChat('streaming', [assistant('a1', [{ type: 'reasoning', text: '  ', state: 'streaming' }])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Planning next moves…');
  });

  it.each([
    ['streaming text', { type: 'text', text: 'Drafting', state: 'streaming' }],
    ['a streaming thought', { type: 'reasoning', text: 'Checking', state: 'streaming' }],
    ['a tool receiving input', tool('input-streaming')],
    ['a running tool', tool('input-available')],
    ['a tool reporting progress', tool('output-available', { preliminary: true })],
    ['a pending approval', tool('approval-requested')],
  ])('stays hidden while %s shows the work itself', (_name, part) => {
    setChat('streaming', [assistant('a1', [part])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toBeNull();
  });

  it('S14: shows after an approval is answered and the paused run has not resumed', () => {
    setRun('question');
    setChat('streaming', [assistant('a1', [tool('approval-responded')])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Planning next moves…');
  });

  it('stays hidden while a paused run waits for the person', () => {
    setRun('question');
    setChat('streaming', [assistant('a1', [tool('output-available')])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toBeNull();
  });

  it('S16: says Reconnecting while a reload replays an active run', () => {
    setRun('reconnecting');
    setChat('submitted', [assistant('a1', [{ type: 'text', text: 'Hello', state: 'streaming' }])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Reconnecting…');
  });

  it('S15: counts transport retries even while parts are still open', () => {
    setRun('reconnecting');
    mockRetrySnapshot = { retryAttempt: 2, retryMaxAttempts: 5 };
    setChat('error', [assistant('a1', [tool('input-streaming')])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Reconnecting… 2/5');
  });

  it('S18: says Finishing up while the completed run saves', () => {
    setRun('finishing');
    setChat('ready', [assistant('a1', [{ type: 'text', text: 'Done', state: 'done' }])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toHaveTextContent('Finishing up…');
  });

  it.each(['done', 'failed', 'stopped', 'idle'] as const)(
    'stays hidden once the run is %s and the chat is ready',
    (run) => {
      setRun(run);
      setChat('ready', [assistant('a1', [tool('output-available')])]);
      render(<ChatMessagePlanning messageId='a1' />);
      expect(indicator()).toBeNull();
    },
  );

  it('falls back to the chat status before the run machine exists', () => {
    setRun(undefined);
    setChat('submitted', [user('u1')]);
    render(<ChatMessagePlanning messageId='u1' />);
    expect(indicator()).toHaveTextContent('Planning next moves…');
  });

  it('stays hidden on an error with no retry pending', () => {
    setRun('failed');
    setChat('error', [assistant('a1', [{ type: 'text', text: 'partial', state: 'streaming' }])]);
    render(<ChatMessagePlanning messageId='a1' />);
    expect(indicator()).toBeNull();
  });
});
