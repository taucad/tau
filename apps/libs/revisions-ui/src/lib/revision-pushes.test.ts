/**
 * Tau Cloud's push records, joined to the graph the page holds (blueprint A3,
 * client half): the read is incremental and cached per account and project,
 * and a non-member's `404` resolves nothing. The parse and the join are
 * `./revision-push-records`' own suite.
 */

import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRevisionPushStore } from '#lib/revision-pushes.js';

/* The app's API origin, with the trailing `/` the store drops. */
const { getPushRecords, holdRevisionGraph, refreshPushRecords, resetPushRecords } = createRevisionPushStore({
  apiBaseUrl: () => 'https://api.test.local/',
});

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
