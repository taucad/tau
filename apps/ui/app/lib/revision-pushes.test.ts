/**
 * Tau Cloud's push records, joined to the graph the page holds (blueprint A3,
 * client half): an entry belongs to the first push whose tip reaches it, the
 * read is incremental and cached per account and project, and a non-member's
 * `404` resolves nothing.
 */

import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPushRecords,
  holdRevisionGraph,
  joinPushes,
  parsePushPage,
  refreshPushRecords,
  resetPushRecords,
} from '#lib/revision-pushes.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- ENV/TAU_API_URL mirror the SCREAMING_SNAKE_CASE keys exported by the real environment.config module
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test.local/' } }));

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

describe('the push store', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const answer = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const members = [{ accountId: 'user-a', name: 'Ada', role: 'owner' }];
  const urls = (): string[] =>
    fetchMock.mock.calls.map(([url]) => (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url));

  beforeEach(() => {
    resetPushRecords();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads from the start, then only what follows the generation it holds', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({
        format: 1,
        pushes: [
          {
            generation: 4,
            pusher: { kind: 'account', accountId: 'user-a' },
            viaDevice: false,
            tips: [{ ref: 'refs/heads/main', tip: 'm2' }],
          },
        ],
        members,
      }),
    );
    holdRevisionGraph(
      'prj_1',
      [...parents].map(([revisionId, of]) => ({ revisionId, parents: of })),
    );
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-a', token: undefined });
    await waitFor(() => {
      expect(getPushRecords('prj_1', 'user-a')).toBeDefined();
    });
    expect(getPushRecords('prj_1', 'user-a')?.pushOf('m1')?.generation).toBe(4);
    expect(getPushRecords('prj_1', 'user-a')?.pushOf('m3')).toBeUndefined();
    expect(getPushRecords('prj_1', 'user-a')?.memberCount).toBe(1);

    /* A second open asks for nothing; a settled backup reads what follows generation 4. */
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-a', token: undefined });
    fetchMock.mockResolvedValueOnce(
      answer({
        format: 1,
        pushes: [
          {
            generation: 5,
            pusher: { kind: 'account', accountId: 'user-a' },
            viaDevice: false,
            tips: [{ ref: 'refs/heads/main', tip: 'm5' }],
          },
        ],
        members,
      }),
    );
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-a', token: 'backedUp:m5' });
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-a', token: 'backedUp:m5' });
    await waitFor(() => {
      expect(getPushRecords('prj_1', 'user-a')?.pushOf('m5')?.generation).toBe(5);
    });
    expect(urls()).toEqual([
      'https://api.test.local/v1/projects/prj_1/git/pushes?after=0',
      'https://api.test.local/v1/projects/prj_1/git/pushes?after=4',
    ]);
  });

  it('follows next until the last page', async () => {
    const page = (generation: number, next?: number): Response =>
      answer({
        format: 1,
        pushes: [{ generation, pusher: { kind: 'account', accountId: 'user-a' }, viaDevice: false, tips: [] }],
        members,
        ...(next === undefined ? {} : { next }),
      });
    fetchMock.mockResolvedValueOnce(page(1, 1)).mockResolvedValueOnce(page(2));
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-a', token: undefined });
    await waitFor(() => {
      expect(getPushRecords('prj_1', 'user-a')).toBeDefined();
    });
    expect(urls()).toEqual([
      'https://api.test.local/v1/projects/prj_1/git/pushes?after=0',
      'https://api.test.local/v1/projects/prj_1/git/pushes?after=1',
    ]);
  });

  it('resolves nothing for an account that is not a member, and asks no more', async () => {
    fetchMock.mockResolvedValue(answer({ statusCode: 404 }, 404));
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-z', token: undefined });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-z', token: 'backedUp:m5' });
    expect(getPushRecords('prj_1', 'user-z')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps each account its own answer for the same project', async () => {
    fetchMock.mockResolvedValueOnce(answer({ format: 1, pushes: [], members }));
    refreshPushRecords({ projectId: 'prj_1', accountId: 'user-a', token: undefined });
    await waitFor(() => {
      expect(getPushRecords('prj_1', 'user-a')).toBeDefined();
    });
    expect(getPushRecords('prj_1', 'user-b')).toBeUndefined();
    expect(getPushRecords(undefined, 'user-a')).toBeUndefined();
  });
});
