/**
 * D18 on a disk host (and so on the desktop, which composes the same
 * `createProjectRevisions` with its signed-in bearer): a project connected to
 * Tau Cloud reads its owner's usage from the usage route when it opens, so the
 * Sync region can say `x of 1 GB` before any push is refused.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIsomorphicGitRevisionPort, tauRemoteName, tauRemoteUrl } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { createProjectRevisions } from '#revisions.js';
import type { ProjectRevisions } from '#revisions.js';

const apiBaseUrl = 'https://api.test';
const projectId = 'project-usage';
const roots: string[] = [];
const hosts: ProjectRevisions[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(hosts.splice(0).map(async (host) => host.release().catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** Opens the project on a disk host signed in with `authorization`, or signed out. */
const open = (workspaceRoot: string, authorization: string | undefined): ProjectRevisions => {
  const port = createIsomorphicGitRevisionPort({
    filesystem: new NodeFsProvider(workspaceRoot),
    checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
  });
  const revisions = createProjectRevisions({
    workspaceRoot,
    projectId,
    port,
    watchWorkspace: false,
    apiBaseUrl,
    tauCredential: () => (authorization === undefined ? undefined : { apiBaseUrl, authorization }),
  });
  hosts.push(revisions);
  return revisions;
};

/** A workspace whose project is already connected to Tau Cloud, as a reopen finds it. */
const connectedWorkspace = async (): Promise<string> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-usage-'));
  roots.push(workspaceRoot);
  const port = createIsomorphicGitRevisionPort({
    filesystem: new NodeFsProvider(workspaceRoot),
    checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
  });
  await port.init({ author: { name: 'Usage Test', email: 'usage@tau.test' } });
  await port.setRemote({ name: tauRemoteName, url: tauRemoteUrl(apiBaseUrl, projectId) });
  return workspaceRoot;
};

/** The API, answering the usage route and refusing everything else. */
const stubApi = (): string[] => {
  const asked: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === `${apiBaseUrl}/v1/projects/${projectId}/usage`) {
      asked.push((init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '');
      return Response.json({ storageBytes: 300 * 1024 ** 2, lfsBytes: 40 * 1024 ** 2, storageLimitBytes: 1024 ** 3 });
    }
    return new Response(undefined, { status: 404 });
  });
  return asked;
};

describe('the disk host’s remote storage (D18)', () => {
  it('should read the owner’s usage with its own bearer when a Tau Cloud project opens', async () => {
    const workspaceRoot = await connectedWorkspace();
    const asked = stubApi();

    const revisions = open(workspaceRoot, 'Bearer desk');

    await expect
      .poll(() => revisions.status().remote.storage, { timeout: 20_000 })
      .toStrictEqual({
        used: 340 * 1024 ** 2,
        quota: 1024 ** 3,
      });
    expect(asked).toContain('Bearer desk');
  }, 60_000);

  it('should draw no figure for a host that is not signed in', async () => {
    const workspaceRoot = await connectedWorkspace();
    const asked = stubApi();

    const revisions = open(workspaceRoot, undefined);

    await expect.poll(() => revisions.status().remote.phase, { timeout: 20_000 }).toBe('connected');
    expect(revisions.status().remote.storage).toBeUndefined();
    expect(asked).toStrictEqual([]);
  }, 60_000);
});
