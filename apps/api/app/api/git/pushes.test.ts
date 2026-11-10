import { describe, expect, it } from 'vitest';
import type { PushRecord } from '@taucad/api-git-core/store/manifest';
import { buildPushPage, parsePushAfter, pushersOf, visiblePushes } from '#api/git/pushes.js';

/**
 * A3: what a member reads of the push log. Chats are left out, a record that
 * moved no branch is left out, and a push that brought an anonymous commit
 * names its account to the owner only (Q3).
 */

const main1 = 'a'.repeat(40);
const main2 = 'b'.repeat(40);
const chat = 'c'.repeat(40);

const records: readonly PushRecord[] = [
  {
    generation: 1,
    committedAt: '2026-11-10T10:00:00.000Z',
    committedBy: 'user_owner',
    refs: [
      { ref: 'refs/heads/main', tip: main1 },
      { ref: 'refs/tau/chats/chat_1', tip: chat },
    ],
  },
  /* A compaction moves nothing, and a chat-only push changes no row. */
  { generation: 2, committedAt: '2026-11-10T10:01:00.000Z', committedBy: 'compaction', refs: [] },
  {
    generation: 3,
    committedAt: '2026-11-10T10:02:00.000Z',
    committedBy: 'user_writer',
    refs: [{ ref: 'refs/tau/chats/chat_2', tip: chat }],
  },
  {
    generation: 4,
    committedAt: '2026-11-10T10:03:00.000Z',
    committedBy: 'user_writer',
    viaDevice: 'hostdev_1',
    refs: [{ ref: 'refs/heads/feature', tip: main2 }, { ref: 'refs/heads/gone' }, { ref: 'refs/tags/v1', tip: main2 }],
    omitted: 3,
    anonymous: true,
  },
];

describe('push page (A3)', () => {
  it('should list branch tips only, leaving out chats, tags, deletions and records that moved no branch', () => {
    const entries = visiblePushes(records, { owner: false });

    expect(entries.map((entry) => entry.generation)).toStrictEqual([1, 4]);
    expect(entries[0]).toStrictEqual({
      generation: 1,
      pushedAt: '2026-11-10T10:00:00.000Z',
      pusher: { kind: 'account', accountId: 'user_owner' },
      viaDevice: false,
      tips: [{ ref: 'refs/heads/main', tip: main1 }],
    });
  });

  it('should hide the account behind an anonymous push from a member', () => {
    const [, anonymous] = visiblePushes(records, { owner: false });

    expect(anonymous).toStrictEqual({
      generation: 4,
      pushedAt: '2026-11-10T10:03:00.000Z',
      pusher: { kind: 'anonymous' },
      viaDevice: true,
      tips: [{ ref: 'refs/heads/feature', tip: main2 }],
      truncated: true,
    });
    expect(JSON.stringify(anonymous)).not.toContain('user_writer');
    expect(pushersOf(visiblePushes(records, { owner: false }))).toStrictEqual(['user_owner']);
  });

  it('should show the owner the account behind an anonymous push, marked anonymous', () => {
    const [, anonymous] = visiblePushes(records, { owner: true });

    expect(anonymous).toMatchObject({ pusher: { kind: 'account', accountId: 'user_writer' }, anonymous: true });
    expect(pushersOf(visiblePushes(records, { owner: true }))).toStrictEqual(['user_owner', 'user_writer']);
  });

  it('should name each pusher from the directory and carry the continuation', () => {
    const page = buildPushPage({
      entries: visiblePushes(records, { owner: true }),
      members: [
        { accountId: 'user_owner', name: 'Olive', role: 'owner' },
        { accountId: 'user_writer', role: 'write' },
      ],
      next: 4,
    });

    expect(page.format).toBe(1);
    expect(page.next).toBe(4);
    expect(page.pushes.map((entry) => entry.pusher)).toStrictEqual([
      { kind: 'account', accountId: 'user_owner', name: 'Olive' },
      { kind: 'account', accountId: 'user_writer' },
    ]);
  });

  it.each([
    [undefined, 0],
    ['', 0],
    ['0', 0],
    ['42', 42],
    ['-1', undefined],
    ['1.5', undefined],
    ['01', undefined],
    ['abc', undefined],
    [['1', '2'], undefined],
  ])('should read after=%j as %j', (query, expected) => {
    expect(parsePushAfter(query)).toBe(expected);
  });
});
