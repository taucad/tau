import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { messageRole } from '@taucad/chat/constants';
import type { MyUIMessage } from '@taucad/chat';
import { ChatMessageRating } from '#routes/w.$workspace.$project/chat-message-rating.js';

type SelectorState = {
  status: 'streaming' | 'ready';
  messagesById: Map<string, MyUIMessage>;
  turnGroups: Array<{ messageIds: string[] }>;
};

const message = (id: string, role: MyUIMessage['role']): MyUIMessage =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal MyUIMessage shape for test
  ({ id, role, parts: [], metadata: { createdAt: 0 } }) as unknown as MyUIMessage;

const state: SelectorState = {
  status: 'ready',
  messagesById: new Map([
    ['user-1', message('user-1', messageRole.user)],
    ['reply-1', message('reply-1', messageRole.assistant)],
    ['reply-2', message('reply-2', messageRole.assistant)],
  ]),
  turnGroups: [{ messageIds: ['user-1', 'reply-1', 'reply-2'] }],
};

const store = {
  ratableRun: vi.fn<(chatId: string, turnId: string) => string | undefined>(),
  ratingOf: vi.fn<(chatId: string, runId: string) => 'positive' | 'negative' | undefined>(),
  rateRun: vi.fn((_chatId: string, _runId: string, value: 'positive' | 'negative') => value),
};
let allowed = true;
let refusal: string | undefined;
let canDecide = true;
const decide = vi.fn(async () => ({}));

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId: 'chat-1' }),
  useChatSelector<T>(selector: (current: SelectorState) => T): T {
    return selector(state);
  },
}));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'project-1' }) }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => store }));
vi.mock('#hooks/use-telemetry-purposes.js', () => ({
  useTelemetryPurposes: () => ({
    isAllowed: (purpose: string) => allowed && purpose === 'feedback',
    stateOf: () => ({ refusal }),
    canDecide,
    decide,
    isDeciding: false,
  }),
}));

describe('ChatMessageRating', () => {
  beforeEach(() => {
    allowed = true;
    refusal = undefined;
    canDecide = true;
    decide.mockClear();
    store.ratableRun.mockReset().mockReturnValue('run-1');
    store.ratingOf.mockReset().mockReturnValue(undefined);
    store.rateRun.mockClear();
  });

  it('rates the ended run that answered the turn once, and then shows only that choice', () => {
    render(<ChatMessageRating messageId='reply-2' />);

    fireEvent.click(screen.getByRole('button', { name: 'Bad reply' }));

    expect(store.ratableRun).toHaveBeenCalledWith('chat-1', 'user-1');
    expect(store.rateRun).toHaveBeenCalledWith('chat-1', 'run-1', 'negative');
    expect(screen.getByRole('button', { name: 'Bad reply' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Good reply' })).toHaveProperty('disabled', true);
  });

  it('asks for feedback consent by the rating itself: records the grant, then rates', async () => {
    allowed = false;
    refusal = 'no-decision';
    render(<ChatMessageRating messageId='reply-2' />);

    fireEvent.click(screen.getByRole('button', { name: 'Good reply' }));

    await waitFor(() => {
      expect(store.rateRun).toHaveBeenCalledWith('chat-1', 'run-1', 'positive');
    });
    expect(decide).toHaveBeenCalledWith([{ purpose: 'feedback', granted: true }]);
    expect(decide.mock.invocationCallOrder[0]).toBeLessThan(store.rateRun.mock.invocationCallOrder[0] ?? 0);
  });

  it('leaves the reply unrated when the feedback decision is refused', async () => {
    allowed = false;
    refusal = 'no-decision';
    decide.mockRejectedValueOnce(new Error('409'));
    render(<ChatMessageRating messageId='reply-2' />);

    fireEvent.click(screen.getByRole('button', { name: 'Good reply' }));

    await waitFor(() => {
      expect(decide).toHaveBeenCalled();
    });
    expect(store.rateRun).not.toHaveBeenCalled();
  });

  it.each([
    ['the project is not owned', 'project-not-owned', true],
    ['no recording notice is in force', 'notice-unapproved', false],
  ])('shows nothing while %s', (_case, reason, decidable) => {
    allowed = false;
    refusal = reason;
    canDecide = decidable;
    const { container } = render(<ChatMessageRating messageId='reply-2' />);

    expect(container.childElementCount).toBe(0);
  });

  it('shows nothing while ratings are not allowed, before the run ends, or on an earlier message of the turn', () => {
    allowed = false;
    refusal = 'project-fenced';
    const { container, rerender } = render(<ChatMessageRating messageId='reply-2' />);
    expect(container.childElementCount).toBe(0);

    allowed = true;
    store.ratableRun.mockReturnValue(undefined);
    rerender(<ChatMessageRating messageId='reply-2' />);
    expect(container.childElementCount).toBe(0);

    store.ratableRun.mockReturnValue('run-1');
    rerender(<ChatMessageRating messageId='reply-1' />);
    expect(container.childElementCount).toBe(0);
    expect(store.rateRun).not.toHaveBeenCalled();
  });

  it('shows a rating this page already gave', () => {
    store.ratingOf.mockReturnValue('positive');

    render(<ChatMessageRating messageId='reply-2' />);

    expect(screen.getByRole('button', { name: 'Good reply' }).getAttribute('aria-pressed')).toBe('true');
  });
});
