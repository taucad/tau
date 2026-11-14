/**
 * K4 (B4c) on a disk host: registering a project on Tau Cloud says where it came from.
 *
 * Tau Cloud keeps the origin a project row was first created with, and admits
 * the commits Tau did not record only for a project registered as GitHub-linked.
 * So the desktop and `tau serve` (`createProjectRevisions`) and the CLI
 * (`openProjectRevisions`) must send the same `origin` the browser worker sends,
 * read from the same remotes, or a linked project first connected from them is
 * refused its untrailered commits for good.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { projectToManifest, serializeProjectManifest } from '@taucad/project-core';
import { RevisionPortError, createIsomorphicGitRevisionPort } from '@taucad/revisions';
import type { Remote, RevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { createProjectRevisions, openProjectRevisions } from '#revisions.js';

const apiBaseUrl = 'https://api.test';
const projectId = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const github: Remote = {
  name: 'github-3',
  url: 'https://github.com/octo/design.git',
  kind: 'git',
  provider: 'github',
  repositoryId: '3',
};
const roots: string[] = [];
const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(releases.splice(0).map(async (release) => release().catch(() => undefined)));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/**
 * A project directory with a manifest, and a port that answers Tau Cloud's advertisement `404` until it is registered.
 *
 * @param remotes - The remotes beside Tau Cloud's that the port lists.
 * @returns The directory, the port, and every registration body the API was sent.
 */
const fixture = async (
  remotes: readonly Remote[],
): Promise<Readonly<{ workspaceRoot: string; port: RevisionPort; bodies: string[] }>> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-register-'));
  const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-register-config-'));
  roots.push(workspaceRoot, configDirectory);
  process.env['TAU_CONFIG_DIR'] = configDirectory;
  await writeFile(
    join(workspaceRoot, 'tau.json'),
    serializeProjectManifest(
      projectToManifest({
        name: 'Alpha project',
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.ts' } },
      }),
    ),
  );
  const real = createIsomorphicGitRevisionPort({
    filesystem: new NodeFsProvider(workspaceRoot),
    checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
  });
  await real.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const bodies: string[] = [];
  const port: RevisionPort = {
    ...real,
    listRemotes: async () => [...(await real.listRemotes()), ...remotes],
    listRemoteRefs: async () => {
      if (bodies.length === 0) {
        throw new RevisionPortError('REMOTE_NOT_FOUND', 'No repository here yet.');
      }
      return [];
    },
    fetch: async () => ({ refs: [] }),
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (init?.method === 'PUT' && url === `${apiBaseUrl}/v1/projects/${projectId}`) {
      bodies.push(typeof init.body === 'string' ? init.body : '');
      return Response.json({});
    }
    return new Response(undefined, { status: 404 });
  });
  return { workspaceRoot, port, bodies };
};

describe('registering a project from a disk host (K4, B4c)', () => {
  it.each([
    ['a GitHub-linked project with the GitHub origin', [github], { name: 'Alpha project', origin: 'github' }],
    ['a project with no GitHub remote with no origin', [], { name: 'Alpha project' }],
  ] as const)(
    'should register %s from the desktop and tau serve',
    async (_name, remotes, expected) => {
      const { workspaceRoot, port, bodies } = await fixture(remotes);
      const revisions = createProjectRevisions({
        via: 'desktop',
        workspaceRoot,
        projectId,
        port,
        watchWorkspace: false,
        apiBaseUrl,
        tauCredential: () => ({ apiBaseUrl, authorization: 'Bearer desk' }),
      });
      releases.push(async () => revisions.release());

      await revisions.channel.request({ command: 'open' });
      await revisions.channel.request({ command: 'connectRemote', kind: 'tau' });

      await vi.waitFor(
        () => {
          expect(bodies).toHaveLength(1);
        },
        { timeout: 20_000 },
      );
      expect(JSON.parse(bodies[0]!)).toStrictEqual(expected);
    },
    60_000,
  );

  it.each([
    ['a GitHub-linked project with the GitHub origin', [github], { name: 'Alpha project', origin: 'github' }],
    ['a project with no GitHub remote with no origin', [], { name: 'Alpha project' }],
  ] as const)(
    'should register %s from the CLI',
    async (_name, remotes, expected) => {
      const { workspaceRoot, port, bodies } = await fixture(remotes);
      const revisions = await openProjectRevisions({
        workspaceRoot,
        projectId,
        port,
        apiBaseUrl,
        apiToken: 'tok-cli',
      });
      releases.push(async () => revisions.close());

      await revisions.openFromRemote();

      expect(bodies.map((body) => JSON.parse(body) as unknown)).toStrictEqual([expected]);
    },
    60_000,
  );
});
