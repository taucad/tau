/**
 * W9 R5 on a disk host (the desktop's native project host): safe mode, known when the host is created, refuses every
 * Tau Cloud leg before any request, states it as `safeMode`, and never retries; a plain Git remote is untouched.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';
import type { Remote, RevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { createProjectRevisions } from '#revisions.js';

const apiBaseUrl = 'https://api.test';
const projectId = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const roots: string[] = [];
const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(releases.splice(0).map(async (release) => release().catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type SyncFrame = Readonly<{ reason?: string; error?: string; state?: string }>;

const open = async (remote: Remote) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-safe-mode-'));
  const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-safe-mode-config-'));
  roots.push(workspaceRoot, configDirectory);
  process.env['TAU_CONFIG_DIR'] = configDirectory;
  const real = createIsomorphicGitRevisionPort({
    filesystem: new NodeFsProvider(workspaceRoot),
    checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
  });
  await real.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const reached: string[] = [];
  const port: RevisionPort = {
    ...real,
    listRemotes: async () => [remote],
    listRemoteRefs: async () => {
      reached.push('listRemoteRefs');
      return [{ name: 'refs/heads/main', head: revisionId('0'.repeat(40)) }];
    },
    fetch: async () => {
      reached.push('fetch');
      return { refs: [] };
    },
    push: async (input) => {
      reached.push('push');
      return { refs: input.refs.map((ref) => ({ name: ref.name, status: 'updated', head: undefined })) };
    },
  };
  const requests: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    requests.push(input instanceof Request ? input.url : input.toString());
    return new Response(undefined, { status: 404 });
  });
  const revisions = createProjectRevisions({
    via: 'desktop',
    workspaceRoot,
    projectId,
    port,
    watchWorkspace: false,
    apiBaseUrl,
    safeMode: true,
    tauCredential: () => ({ apiBaseUrl, authorization: 'Bearer desk' }),
  });
  releases.push(async () => revisions.release());
  let latest: SyncFrame | undefined;
  const statusOf = (value: unknown): SyncFrame | undefined =>
    typeof value === 'object' && value !== null && 'sync' in value ? (value.sync as SyncFrame) : undefined;
  const watching = new AbortController();
  releases.push(async () => {
    watching.abort();
  });
  const collect = async (): Promise<void> => {
    try {
      for await (const event of revisions.channel.events(watching.signal)) {
        if (event.kind === 'status') {
          latest = statusOf(event.value);
        }
      }
    } catch {
      /* Aborted at the end of the row. */
    }
  };
  const collecting = collect();
  releases.push(async () => collecting);
  const opened = await revisions.channel.request({ command: 'open' });
  latest = statusOf(opened.status);
  const sync = async (): Promise<SyncFrame | undefined> => {
    await Promise.resolve();
    return latest;
  };
  return { reached, requests, sync };
};

describe('safe mode on a disk host (W9 R5)', () => {
  it('refuses a Tau Cloud remote before any request, states it and never retries', async () => {
    const { reached, requests, sync } = await open({
      name: 'tau',
      url: `${apiBaseUrl}/v1/git/${projectId}.git`,
      kind: 'tau',
    });

    await vi.waitFor(
      async () => {
        const current = await sync();
        expect(current).toMatchObject({
          state: 'failed',
          reason: 'safeMode',
          error: 'Tau Cloud is off in safe mode.',
        });
      },
      { timeout: 20_000 },
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(reached).toEqual([]);
    expect(requests).toEqual([]);
  }, 60_000);

  it('leaves a plain Git remote to sync as usual', async () => {
    const { reached, sync } = await open({ name: 'origin', url: 'https://git.example/project.git', kind: 'git' });

    await vi.waitFor(
      () => {
        expect(reached.length).toBeGreaterThan(0);
      },
      { timeout: 20_000 },
    );
    const current = await sync();
    expect(current?.reason).not.toBe('safeMode');
  }, 60_000);
});
