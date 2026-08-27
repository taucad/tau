import { describe, expect, it } from 'vitest';
import type { Chat } from '@taucad/chat';
import { pickNextFocusedChatId } from '#routes/w.$workspace.$project/chat-navigation.utils.js';

function makeChat(id: string, updatedAt: number): Chat {
  return {
    id,
    resourceId: 'project_test',
    name: id,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('pickNextFocusedChatId', () => {
  it('returns the current focused chat id unchanged when a different chat is deleted', () => {
    const chats = [makeChat('chat_a', 1000), makeChat('chat_b', 2000), makeChat('chat_c', 3000)];

    const next = pickNextFocusedChatId(chats, 'chat_a', 'chat_b');

    expect(next).toBe('chat_b');
  });

  it('falls through to the most-recently-updated remaining chat when the focused chat is deleted', () => {
    const chats = [makeChat('chat_oldest', 1000), makeChat('chat_focused', 2000), makeChat('chat_newest', 3000)];

    const next = pickNextFocusedChatId(chats, 'chat_focused', 'chat_focused');

    expect(next).toBe('chat_newest');
  });

  it('uses updatedAt (not array order) to choose the next focused chat', () => {
    const chats = [
      // Array order is not sorted — we want the algorithm to pick by timestamp.
      makeChat('chat_focused', 5000),
      makeChat('chat_oldest', 1000),
      makeChat('chat_recent', 4000),
      makeChat('chat_middle', 2500),
    ];

    const next = pickNextFocusedChatId(chats, 'chat_focused', 'chat_focused');

    expect(next).toBe('chat_recent');
  });

  it('clears focus when the last remaining chat is deleted', () => {
    const chats = [makeChat('chat_only', 1000)];

    const next = pickNextFocusedChatId(chats, 'chat_only', 'chat_only');

    expect(next).toBeUndefined();
  });

  it('returns undefined when nothing was focused and a chat is deleted', () => {
    const chats = [makeChat('chat_a', 1000), makeChat('chat_b', 2000)];

    const next = pickNextFocusedChatId(chats, 'chat_a', undefined);

    expect(next).toBeUndefined();
  });

  it('keeps focus untouched when the focused chat is not in the list', () => {
    const chats = [makeChat('chat_a', 1000), makeChat('chat_b', 2000)];

    const next = pickNextFocusedChatId(chats, 'chat_a', 'chat_unknown');

    expect(next).toBe('chat_unknown');
  });

  it('breaks ties on `updatedAt` deterministically (first-seen wins)', () => {
    // Two remaining chats share the same updatedAt — the algorithm must
    // produce a deterministic answer (first encountered, no later chat
    // strictly greater).
    const chats = [makeChat('chat_focused', 5000), makeChat('chat_first', 3000), makeChat('chat_second', 3000)];

    const next = pickNextFocusedChatId(chats, 'chat_focused', 'chat_focused');

    expect(next).toBe('chat_first');
  });
});
