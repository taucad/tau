import { describe, expect, it } from 'vitest';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { compareChatsByRecency, getChatRecencyAt } from '#utils/chat-recency.utils.js';

const message = (role: MyUIMessage['role'], createdAt: number): MyUIMessage => ({
  id: `${role}-${createdAt}`,
  role,
  metadata: { createdAt },
  parts: [],
});

const chat = (overrides: Partial<Chat> & { id: string }): Chat => ({
  resourceId: 'project',
  name: overrides.id,
  messages: [],
  createdAt: 10,
  updatedAt: 10,
  ...overrides,
  id: overrides.id,
});

describe('getChatRecencyAt', () => {
  it('prefers persisted user activity over newer row and message timestamps', () => {
    expect(
      getChatRecencyAt(
        chat({
          id: 'persisted',
          recencyAt: 20,
          updatedAt: 100,
          messages: [message('user', 30), message('assistant', 40)],
        }),
      ),
    ).toBe(20);
  });

  it('falls back to the newest legacy user message and ignores assistant activity', () => {
    expect(
      getChatRecencyAt(
        chat({
          id: 'legacy',
          updatedAt: 100,
          messages: [message('user', 25), message('assistant', 90), message('user', 35)],
        }),
      ),
    ).toBe(35);
  });

  it('reads the legacy persisted activity field before message fallback', () => {
    const legacy = chat({ id: 'legacy-field', messages: [message('user', 25)] });
    Reflect.set(legacy, 'lastUserActivityAt', 40);

    expect(getChatRecencyAt(legacy)).toBe(40);
  });

  it('falls back to creation time when a legacy chat has no stamped user message', () => {
    expect(getChatRecencyAt(chat({ id: 'empty', createdAt: 12, updatedAt: 100 }))).toBe(12);
  });
});

describe('compareChatsByRecency', () => {
  it('ignores updatedAt and uses deterministic creation/id tie-breaks', () => {
    const chats = [
      chat({ id: 'b', createdAt: 20, updatedAt: 999, recencyAt: 30 }),
      chat({ id: 'a', createdAt: 20, updatedAt: 1, recencyAt: 30 }),
      chat({ id: 'newest', createdAt: 10, updatedAt: 1, recencyAt: 40 }),
    ];

    expect(chats.sort(compareChatsByRecency).map(({ id }) => id)).toEqual(['newest', 'a', 'b']);
  });
});
