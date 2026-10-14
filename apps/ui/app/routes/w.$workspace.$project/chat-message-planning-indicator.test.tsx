import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { messageRole } from '@taucad/chat/constants';
import type { MyUIMessage } from '@taucad/chat';
import { ChatMessagePlanning } from '#routes/w.$workspace.$project/chat-message-planning.js';
import { useChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarState } from '#types/chat-sidebar.types.js';

type SelectorState = {
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: MyUIMessage[];
  messagesById: Map<string, MyUIMessage>;
};

let mockSelectorState: SelectorState = { status: 'streaming', messages: [], messagesById: new Map() };

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId: 'chat-1' }),
  useChatSelector<T>(selector: (state: SelectorState) => T): T {
    return selector(mockSelectorState);
  },
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1' }) }));
vi.mock('#hooks/use-sidebar-status.js', () => ({ useChatSidebarStatus: vi.fn() }));
/* The row warms and lazily loads the liquid-metal spinner, whose renderer imports the graphics backend. Left
 * real, that dynamic import can still be resolving when the environment tears down; this suite pins whether
 * the indicator shows, not how the spinner paints, so the row's spinner is replaced before any lazy boundary. */
vi.mock('#components/chat/chat-activity-spinner.js', () => ({
  ChatActivitySpinner: () => null,
  warmChatActivitySpinner: async () => undefined,
}));

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
  setRun('working');
});

describe('ChatMessagePlanning', () => {
  it('should stay visible while response text streams', () => {
    setChat('streaming', [user('u1'), assistant('a1', [{ type: 'text', text: 'Drafting', state: 'streaming' }])]);
    render(<ChatMessagePlanning />);
    expect(indicator()).toHaveTextContent('Writing response…');
  });

  it('should keep elapsed time across activity changes and remounts, then clean up on completion', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(50_000);
      setChat('submitted', [user('u1')]);
      const view = render(<ChatMessagePlanning />);
      expect(screen.getByRole('timer')).toHaveTextContent('50s');
      act(() => {
        vi.advanceTimersByTime(11_000);
      });
      setChat('streaming', [user('u1'), assistant('a1', [{ type: 'text', text: 'Draft', state: 'streaming' }])]);
      view.rerender(<ChatMessagePlanning />);
      expect(screen.getByRole('timer')).toHaveTextContent('1m 1s');
      expect(indicator()).not.toContainElement(screen.getByRole('timer'));
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
      const restored = render(<ChatMessagePlanning />);
      expect(screen.getByRole('timer')).toHaveTextContent('1m 1s');
      setRun('done');
      restored.rerender(<ChatMessagePlanning />);
      expect(indicator()).toBeNull();
      expect(screen.queryByRole('timer')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should reset for a new request and omit unknown timestamps', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(3_661_000);
      setChat('streaming', [user('u1')]);
      const view = render(<ChatMessagePlanning />);
      expect(screen.getByRole('timer')).toHaveTextContent('1h 1m 1s');
      setChat('submitted', [{ ...user('u2'), metadata: { createdAt: Date.now() } }]);
      view.rerender(<ChatMessagePlanning />);
      expect(screen.getByRole('timer')).toHaveTextContent('0s');
      setChat('streaming', [{ id: 'legacy', role: messageRole.user, parts: [] }]);
      view.rerender(<ChatMessagePlanning />);
      expect(screen.queryByRole('timer')).toBeNull();
      expect(indicator()).toBeVisible();
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should keep the timer visible during approval and reconnect waits', () => {
    setChat('streaming', [user('u1'), assistant('a1', [tool('approval-requested')])]);
    setRun('approval');
    const view = render(<ChatMessagePlanning />);
    expect(indicator()).toHaveTextContent('Waiting for approval');
    expect(screen.getByRole('timer')).toBeVisible();
    setRun('reconnecting');
    view.rerender(<ChatMessagePlanning />);
    expect(indicator()).toHaveTextContent('Reconnecting…');
  });
});

it('should show explicitly tagged progress, then clear it for a new request and terminal run', () => {
  const text = 'Checking the mounting holes and wall thickness.';
  setChat('streaming', [
    user('u1'),
    assistant('a1', [
      {
        type: 'text',
        text,
        state: 'streaming',
        providerMetadata: { common: { messagePhase: 'commentary', streamState: 'checkpoint' } },
      },
    ]),
  ]);
  const view = render(<ChatMessagePlanning />);
  expect(screen.getByRole('status', { name: 'Current activity' })).toHaveTextContent(text);
  setChat('submitted', [...mockSelectorState.messages, user('u2')]);
  view.rerender(<ChatMessagePlanning />);
  expect(screen.getByRole('status', { name: 'Current activity' })).toHaveTextContent('Planning next moves…');
  setRun('stopped');
  setChat('ready', mockSelectorState.messages);
  view.rerender(<ChatMessagePlanning />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('timer')).not.toBeInTheDocument();
});
