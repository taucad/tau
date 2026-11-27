import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { ChatResidual, ChatResidualLine } from '#routes/w.$workspace.$project/chat-residual.js';
import type { ChatResidualFact } from '#routes/w.$workspace.$project/chat-residual.js';

type Facts = {
  remote?: 'R6';
  unreachable?: { hostId: string | undefined };
  own?: 'R8';
  local?: boolean;
  pinned?: { queueId: string; hostId: string | undefined };
  newerHistory?: boolean;
  /** The code of the chat's visible error card. */
  shownCode?: string;
};
const store = vi.hoisted((): { facts: Facts } => ({ facts: {} }));
const openSettings = vi.fn();
const openNewChat = vi.fn(async () => undefined);
const discard = vi.fn(async () => undefined);
const sendHere = vi.fn(async () => undefined);

const fakeStore = {
  subscribeProjection: () => () => undefined,
  getRemoteResidual: () => store.facts.remote,
  getUnreachableComputer: () => store.facts.unreachable,
  getOwnResidual: () => store.facts.own,
  readsLocally: () => store.facts.local === true,
  pinnedElsewhereOf: () => store.facts.pinned,
  getProjection: () => ({ ledger: { newerHistory: store.facts.newerHistory === true } }),
  discardQueuedMessage: discard,
  sendQueuedMessageHere: sendHere,
} as unknown as ChatSessionStore;

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId: 'chat_1' }),
  useChatSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
vi.mock('#utils/run-auto-resume-plan.js', () => ({
  selectVisibleChatErrorEntry: () =>
    store.facts.shownCode === undefined ? undefined : { error: { code: store.facts.shownCode, category: 'generic' } },
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => fakeStore,
  useOptionalChatSessionStore: () => fakeStore,
}));
/* No outbox actor: the queue's head is read only when one is mounted. */
vi.mock('#hooks/use-chat-session.js', () => ({ useChatSessionSnapshot: () => undefined }));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    execution: { execution: { kind: 'tau', model: 'openai-gpt-6-astra', hostId: 'device-a' } },
  }),
}));
vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({
    targets: [{ hostId: 'device-a', label: 'Studio Mac', rung: 2, workspaceRoot: '/w', online: false }],
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: openSettings }) }));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat, isReady: true }),
}));

afterEach(() => {
  store.facts = {};
  vi.clearAllMocks();
});

/* Every residual line, as the copy tables word it (blueprint "Residuals and their treatment", HA5 table). */
type Line = Readonly<{ name: string; residual: ChatResidualFact; text: string; actions: readonly string[] }>;
const lines: readonly Line[] = (
  [
    [
      'R1',
      { kind: 'R1', computer: 'Studio Mac' },
      'The latest turns are on Studio Mac. They’ll appear here when it’s back online.',
      [],
    ],
    [
      'R1 with a queued message',
      { kind: 'R1', computer: 'Studio Mac', queued: { reached: false, onRemove: vi.fn(), onSendHere: vi.fn() } },
      'The latest turns are on Studio Mac. They’ll appear here when it’s back online.',
      ['Remove', 'Send here instead'],
    ],
    [
      'R3 in a browser',
      { kind: 'R3' },
      'Tau can’t save chats in this browser.Use another browser or the Tau desktop app.',
      [],
    ],
    [
      'R4',
      { kind: 'R4' },
      'Part of this chat was written by a newer version of Tau.Reload to see the rest.',
      ['Reload'],
    ],
    [
      'R6',
      { kind: 'R6', computer: 'Studio Mac', readable: true, onPair: vi.fn() },
      'Pair Studio Mac to keep working with it.Reading this chat still works.',
      ['Pair'],
    ],
    [
      'R8 on the desktop',
      { kind: 'R8', desktop: true, onNewChat: vi.fn(), canOpenNewChat: true },
      'This chat’s saved turns are missing on this device.Check the project folder.',
      ['New chat'],
    ],
    [
      'R9 for code that did not load',
      { kind: 'R9', cause: 'load' },
      'Part of Tau did not finish loadingReload the page to continue.',
      ['Reload'],
    ],
    [
      'R9 for a desktop chat placed on the page',
      { kind: 'R9', cause: 'placement', onChooseThisComputer: vi.fn() },
      'In the desktop app, turns run on this computer.Choose This computer to continue.',
      ['Choose This computer'],
    ],
  ] as const satisfies ReadonlyArray<readonly [string, ChatResidualFact, string, readonly string[]]>
).map(([name, residual, text, actions]) => ({ name, residual, text, actions }));

describe('ChatResidualLine', () => {
  it.each(lines)('should word $name with its one action', ({ residual, text, actions }) => {
    const { container } = render(<ChatResidualLine residual={residual} />);

    expect(container).toHaveTextContent(text);
    expect(screen.queryAllByRole('button').map((button) => button.textContent)).toEqual(actions);
  });

  /* AR3-9: only a message that was already sent may have reached the other computer. */
  it('should say a sent message may already have reached the computer', () => {
    render(
      <ChatResidualLine
        residual={{
          kind: 'R1',
          computer: 'Studio Mac',
          queued: { reached: true, onRemove: vi.fn(), onSendHere: vi.fn() },
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Your message may already have reached Studio Mac.');
  });

  /* HA-I8: copy never names how the page reaches the computer. */
  it.each(lines)('should keep $name free of engineering words', ({ residual }) => {
    const { container } = render(<ChatResidualLine residual={residual} />);

    expect(container.textContent).not.toMatch(/\bhosts?\b|\battach|connection failed/iu);
  });
});

describe('ChatResidual', () => {
  it('should show nothing for a healthy chat', () => {
    const { container } = render(<ChatResidual />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should offer Remove and Send here instead for a message pinned to a computer it cannot reach', async () => {
    const user = userEvent.setup();
    store.facts = { pinned: { queueId: 'queued_1', hostId: 'device-a' } };

    render(<ChatResidual />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'The latest turns are on Studio Mac. They’ll appear here when it’s back online.Your message may already have reached Studio Mac.',
    );
    await user.click(screen.getByRole('button', { name: 'Send here instead' }));
    expect(sendHere).toHaveBeenCalledWith('chat_1', 'queued_1', { kind: 'tau', model: 'openai-gpt-6-astra' });
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(discard).toHaveBeenCalledWith('chat_1', 'queued_1');
  });

  it('should show R1 alone for a remote computer it cannot read, with nothing queued', () => {
    store.facts = { unreachable: { hostId: 'device-a' } };

    render(<ChatResidual />);

    expect(screen.getByRole('status')).toHaveTextContent('The latest turns are on Studio Mac.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should send the person to pair a revoked computer (R6)', async () => {
    const user = userEvent.setup();
    store.facts = { remote: 'R6' };

    render(<ChatResidual />);

    /* N4: a status, so a chat switch does not announce it again. */
    expect(screen.getByRole('status')).toHaveTextContent('Pair Studio Mac to keep working with it.');
    expect(screen.queryByText('Reading this chat still works.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pair' }));
    expect(openSettings).toHaveBeenCalledWith('compute');
  });

  it('should offer a new chat for a saved log that went missing (R8)', async () => {
    const user = userEvent.setup();
    store.facts = { own: 'R8', local: true };

    render(<ChatResidual />);

    expect(screen.getByRole('status')).toHaveTextContent('This chat’s saved turns are missing on this device.');
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(openNewChat).toHaveBeenCalledOnce();
  });

  /* I5: the ledger read rows a newer Tau wrote: the prefix shows, and Reload reads the rest. */
  it('should ask for a reload when a newer Tau wrote part of the chat (R4)', () => {
    store.facts = { newerHistory: true, local: true };

    render(<ChatResidual />);

    expect(screen.getByRole('alert')).toHaveTextContent('Part of this chat was written by a newer version of Tau.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  /* N1: one Pair, the card's, when the chat's error already asks for pairing. */
  it('should leave R6 to the chat’s Pair card when that card shows', () => {
    store.facts = { remote: 'R6', shownCode: 'HOST_NOT_PAIRED' };

    const { container } = render(<ChatResidual />);

    expect(container).toBeEmptyDOMElement();
  });
});
