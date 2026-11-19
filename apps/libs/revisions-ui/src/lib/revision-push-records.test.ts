/**
 * The push route's answer and the join to the graph the page holds (blueprint
 * A3, client half): an entry belongs to the first push whose tip reaches it,
 * and a page keeps branch tips and member ids and names only.
 */

import { describe, expect, it } from 'vitest';

import { joinPushes, parsePushPage } from '#lib/revision-push-records.js';

/*
 * The fixture graph, oldest at the bottom:
 *
 *   m5        merge of f2 into main
 *   | \
 *   m4  f2    feature
 *   |   f1
 *   m3 /
 *   m2
 *   m1
 *
 * c1 is a chat's commit on top of m3; no branch holds it.
 */
const parents = new Map<string, readonly string[]>([
  ['m1', []],
  ['m2', ['m1']],
  ['m3', ['m2']],
  ['f1', ['m3']],
  ['f2', ['f1']],
  ['m4', ['m3']],
  ['m5', ['m4', 'f2']],
  ['c1', ['m3']],
]);

const push = (generation: number, ...tips: string[]): Readonly<{ generation: number; tips: readonly string[] }> => ({
  generation,
  tips,
});

describe('joinPushes', () => {
  it('gives every entry to the first push whose tip reaches it, through every parent', () => {
    /* Two pushes whose ancestry overlaps: m2 pushed first, then main at m5 with the feature merged in. */
    const joined = joinPushes([push(7, 'm5'), push(3, 'm2')], parents);

    expect(Object.fromEntries([...joined].map(([id, entry]) => [id, entry.generation]))).toEqual({
      m1: 3,
      m2: 3,
      m3: 7,
      m4: 7,
      f1: 7,
      f2: 7,
      m5: 7,
    });
  });

  it('keeps a branch pushed before its merge with the push that brought it', () => {
    const joined = joinPushes([push(1, 'm3'), push(2, 'f2'), push(4, 'm5')], parents);

    expect(joined.get('f1')?.generation).toBe(2);
    expect(joined.get('f2')?.generation).toBe(2);
    expect(joined.get('m4')?.generation).toBe(4);
    expect(joined.get('m5')?.generation).toBe(4);
    expect(joined.get('m1')?.generation).toBe(1);
  });

  it('assigns nothing a branch tip does not reach: a chat commit, and a tip the page never read', () => {
    const joined = joinPushes([push(1, 'm5'), push(2, 'unread')], parents);

    expect(joined.has('c1')).toBe(false);
    expect(joined.has('unread')).toBe(false);
    expect(joined.size).toBe(7);
  });

  it('leaves an entry no push reached unassigned: it is not backed up yet', () => {
    const joined = joinPushes([push(1, 'm3')], parents);

    expect(joined.has('m4')).toBe(false);
    expect(joined.has('m5')).toBe(false);
  });
});

describe('parsePushPage', () => {
  it('keeps branch tips and member ids and names, and drops chat refs and anything else a server sends', () => {
    const page = parsePushPage({
      format: 1,
      pushes: [
        {
          generation: 2,
          pushedAt: '2026-11-10T00:00:00.000Z',
          pusher: { kind: 'account', accountId: 'user-b', name: 'Bea' },
          viaDevice: true,
          tips: [
            { ref: 'refs/heads/main', tip: 'm5' },
            { ref: 'refs/tau/chats/chat-1', tip: 'c1' },
          ],
        },
        { generation: 3, pusher: { kind: 'anonymous' }, viaDevice: false, tips: [] },
      ],
      members: [{ accountId: 'user-b', name: 'Bea', role: 'owner', email: 'bea@example.com' }, { accountId: 'user-x' }],
      next: 3,
    });

    expect(page).toEqual({
      pushes: [
        { generation: 2, pusher: { kind: 'account', accountId: 'user-b', name: 'Bea' }, viaDevice: true, tips: ['m5'] },
        { generation: 3, pusher: { kind: 'anonymous' }, viaDevice: false, tips: [] },
      ],
      members: [
        { accountId: 'user-b', name: 'Bea', isMember: true },
        { accountId: 'user-x', isMember: false },
      ],
      next: 3,
    });
    expect(JSON.stringify(page)).not.toContain('@');
  });

  it('reads no format it does not know', () => {
    expect(parsePushPage({ format: 2, pushes: [], members: [] })).toBeUndefined();
  });
});
