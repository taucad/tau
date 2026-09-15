import { describe, expect, it } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import { buildTurnGroups } from '#routes/w.$workspace.$project/chat-turn-groups.js';

const message = (id: string, role: MyUIMessage['role']): MyUIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text: id }],
});

const idsByGroup = (groups: ReadonlyArray<{ readonly messageIds: readonly string[] }>) =>
  groups.map((g) => [...g.messageIds]);

describe('buildTurnGroups', () => {
  describe('grouping rules', () => {
    it('should return an empty array when messages is empty', () => {
      expect(buildTurnGroups([])).toEqual([]);
    });

    it('should put a lone assistant message into a single group', () => {
      const groups = buildTurnGroups([message('a1', 'assistant')]);
      expect(idsByGroup(groups)).toEqual([['a1']]);
    });

    it('should pair a user message with the following assistant message', () => {
      const groups = buildTurnGroups([message('u1', 'user'), message('a1', 'assistant')]);
      expect(idsByGroup(groups)).toEqual([['u1', 'a1']]);
    });

    it('should attach all consecutive non-user messages to the preceding user group', () => {
      const groups = buildTurnGroups([
        message('u1', 'user'),
        message('a1', 'assistant'),
        message('a2', 'assistant'),
        message('s1', 'system'),
      ]);
      expect(idsByGroup(groups)).toEqual([['u1', 'a1', 'a2', 's1']]);
    });

    it('should start a new group on each consecutive user message', () => {
      const groups = buildTurnGroups([message('u1', 'user'), message('u2', 'user')]);
      expect(idsByGroup(groups)).toEqual([['u1'], ['u2']]);
    });

    it('should put a leading assistant before the first user into its own group', () => {
      const groups = buildTurnGroups([message('a0', 'assistant'), message('u1', 'user'), message('a1', 'assistant')]);
      expect(idsByGroup(groups)).toEqual([['a0'], ['u1', 'a1']]);
    });

    it('should put each user message into its own group when interleaved', () => {
      const groups = buildTurnGroups([
        message('u1', 'user'),
        message('a1', 'assistant'),
        message('u2', 'user'),
        message('a2', 'assistant'),
        message('a3', 'assistant'),
      ]);
      expect(idsByGroup(groups)).toEqual([
        ['u1', 'a1'],
        ['u2', 'a2', 'a3'],
      ]);
    });
  });

  describe('referential stability', () => {
    it('should return the same reference for the same messages array', () => {
      const messages: readonly MyUIMessage[] = [message('u1', 'user'), message('a1', 'assistant')];
      const first = buildTurnGroups(messages);
      const second = buildTurnGroups(messages);
      expect(second).toBe(first);
    });

    it('should return a new reference when the messages array reference changes', () => {
      const first = buildTurnGroups([message('u1', 'user')]);
      const second = buildTurnGroups([message('u1', 'user')]);
      expect(second).not.toBe(first);
      expect(idsByGroup(second)).toEqual(idsByGroup(first));
    });

    it('should preserve groups when only the active assistant object changes', () => {
      const user = message('u1', 'user');
      const first = buildTurnGroups([user, message('a1', 'assistant')]);
      const second = buildTurnGroups([user, message('a1', 'assistant')]);

      expect(second).toBe(first);
    });

    it('should invalidate when a middle message id or role changes', () => {
      const firstMessage = message('u1', 'user');
      const first = buildTurnGroups([firstMessage, message('a1', 'assistant'), message('a2', 'assistant')]);
      const changedId = buildTurnGroups([firstMessage, message('a-changed', 'assistant'), message('a2', 'assistant')]);
      const changedRole = buildTurnGroups([firstMessage, message('a-changed', 'user'), message('a2', 'assistant')]);

      expect(changedId).not.toBe(first);
      expect(changedRole).not.toBe(changedId);
      expect(idsByGroup(changedRole)).toEqual([['u1'], ['a-changed', 'a2']]);
    });
  });
});
