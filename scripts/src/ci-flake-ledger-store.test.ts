/* eslint-disable @typescript-eslint/naming-convention -- Git data API request bodies. */
import { describe, expect, it } from 'vitest';

import { GitHubError } from '#ci-github-client.js';
import type { Client } from '#ci-github-client.js';
import { emptyState, serializeState } from '#ci-flake-ledger-state.js';
import { branchStore, statePath } from '#ci-flake-ledger-store.js';

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

/** A client that answers the Git data API from a map, and records every request. */
const fakeClient = (answers: Record<string, unknown>): { github: Client; calls: Call[] } => {
  const calls: Call[] = [];
  const answer = (method: string, path: string): unknown => {
    const key = `${method} ${path}`;
    if (!(key in answers)) {
      throw new GitHubError(key, 404);
    }
    return answers[key];
  };
  const github: Client = {
    repository: 'taucad/tau',
    budget: () => 100,
    get: async <T>(path: string): Promise<T> => {
      calls.push({ method: 'GET', path });
      return answer('GET', path) as T;
    },
    getText: async (path: string): Promise<string> => {
      calls.push({ method: 'GET', path });
      return answer('GET', path) as string;
    },
    getBytes: async (): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(),
    send: async <T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body: unknown): Promise<T> => {
      calls.push({ method, path, body });
      return answer(method, path) as T;
    },
  };
  return { github, calls };
};

const now = new Date('2026-11-25T00:00:00Z');

describe('branchStore', () => {
  it('should create the branch as an orphan commit with the state and a README when it is missing', async () => {
    const { github, calls } = fakeClient({
      'POST /repos/taucad/tau/git/blobs': { sha: 'blob' },
      'POST /repos/taucad/tau/git/trees': { sha: 'tree' },
      'POST /repos/taucad/tau/git/commits': { sha: 'commit' },
      'POST /repos/taucad/tau/git/refs': {},
    });
    const store = branchStore(github, 'flake-ledger');
    expect(await store.read()).toBeUndefined();
    expect(await store.write(emptyState(now), 'chore(flake-ledger): Ingest 0 CI runs')).toBe('commit');
    const writes = calls.filter((call) => call.method !== 'GET');
    expect(writes.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /repos/taucad/tau/git/blobs',
      'POST /repos/taucad/tau/git/blobs',
      'POST /repos/taucad/tau/git/trees',
      'POST /repos/taucad/tau/git/commits',
      'POST /repos/taucad/tau/git/refs',
    ]);
    expect(writes[0]?.body).toEqual({ content: serializeState(emptyState(now)) });
    expect(writes[2]?.body).toEqual({
      tree: [
        { path: statePath, mode: '100644', type: 'blob', sha: 'blob' },
        { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob' },
      ],
    });
    expect(writes[3]?.body).toEqual({ message: 'chore(flake-ledger): Ingest 0 CI runs', tree: 'tree', parents: [] });
    expect(writes[4]?.body).toEqual({ ref: 'refs/heads/flake-ledger', sha: 'commit' });
  });

  it('should read the state at the branch head and write a fast-forward commit on top of it', async () => {
    const { github, calls } = fakeClient({
      'GET /repos/taucad/tau/git/ref/heads/flake-ledger': { object: { sha: 'head' } },
      [`GET /repos/taucad/tau/contents/${statePath}?ref=head`]: serializeState(emptyState(now)),
      'GET /repos/taucad/tau/git/commits/head': { tree: { sha: 'head-tree' } },
      'POST /repos/taucad/tau/git/blobs': { sha: 'blob' },
      'POST /repos/taucad/tau/git/trees': { sha: 'tree' },
      'POST /repos/taucad/tau/git/commits': { sha: 'next' },
      'PATCH /repos/taucad/tau/git/refs/heads/flake-ledger': {},
    });
    const store = branchStore(github, 'flake-ledger');
    expect(await store.read()).toEqual(emptyState(now));
    await store.write(emptyState(now), 'message');
    const writes = calls.filter((call) => call.method !== 'GET');
    expect(writes.find((call) => call.path.endsWith('/git/trees'))?.body).toEqual({
      base_tree: 'head-tree',
      tree: [{ path: statePath, mode: '100644', type: 'blob', sha: 'blob' }],
    });
    expect(writes.find((call) => call.path.endsWith('/git/commits'))?.body).toMatchObject({ parents: ['head'] });
    expect(writes.at(-1)).toEqual({
      method: 'PATCH',
      path: '/repos/taucad/tau/git/refs/heads/flake-ledger',
      body: { sha: 'next', force: false },
    });
  });

  it('should fail on a state it cannot read rather than start again from nothing', async () => {
    const { github } = fakeClient({
      'GET /repos/taucad/tau/git/ref/heads/flake-ledger': { object: { sha: 'head' } },
      [`GET /repos/taucad/tau/contents/${statePath}?ref=head`]: '{"schema":9}',
    });
    await expect(branchStore(github, 'flake-ledger').read()).rejects.toThrow('unknown schema 9');
  });
});
