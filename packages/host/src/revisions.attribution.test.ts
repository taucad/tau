/**
 * Attribution and the workspace watcher, on a real Node host (S30, S37, AC15).
 *
 * Two claims that only a disk host can answer. First: stock `git` on a *clone*
 * — no Tau anywhere — shows the person as the author and Tau as the committer,
 * which is what A26 promises and what a trailer alone could not deliver.
 * Second: this host observes its own writes, so a checkout that was edited
 * outside a turn knows it is dirty; without that caller every Node dirty path
 * is inert (W3c review R3).
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNativeGitRevisionPort } from '@taucad/revisions/node';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';

import { createProjectRevisions, requireRevisionToolchain } from '#revisions.js';
import { hostRevisionActor } from '#revision-actor.js';

/* The same `git` + `git lfs` probe the host refuses on (OQ-B8), so a machine
 * without `git-lfs` skips these rows instead of failing them. */
const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

const roots: string[] = [];

afterEach(async () => {
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-host-attribution-'));
  roots.push(root);
  const project = join(root, 'project');
  await mkdir(project, { recursive: true });
  return project;
};

describe.runIf(gitToolchainOnPath)('attribution on a clone of a Tau project', () => {
  it('shows the person as the author and Tau as the committer', async () => {
    const workspaceRoot = await workspace();
    const port = createNativeGitRevisionPort({
      repositoryPath: workspaceRoot,
      checkouts: { projectId: 'project-attribution', directory: join(workspaceRoot, '..', 'checkouts') },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['main.ts', new TextEncoder().encode('export const size = 1;\n')]]),
      provenance: {
        source: 'user',
        actor: { kind: 'user', id: 'user-lane', name: 'Lane Person', email: 'lane@example.com' },
        capture: 'save',
        via: 'desktop',
        createdAt: Date.UTC(2026, 8, 8, 12, 0, 0),
      },
      summary: { generated: 'First revision' },
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });

    const clone = join(workspaceRoot, '..', 'clone');
    execFileSync('git', ['clone', '--quiet', workspaceRoot, clone], { stdio: 'ignore' });

    /* Stock git, on a repository Tau never touched. */
    const line = execFileSync('git', ['log', '-1', '--format=%an|%ae|%cn|%ce'], {
      cwd: clone,
      encoding: 'utf8',
    }).trim();
    expect(line).toBe('Lane Person|lane@example.com|Tau|noreply@tau.new');

    const trailers = execFileSync('git', ['log', '-1', '--format=%B'], { cwd: clone, encoding: 'utf8' });
    expect(trailers).toContain('Tau-Actor: user Lane Person');
    expect(trailers).toContain('Tau-Trigger: save');
  }, 60_000);

  it('records an anonymous person with no address of theirs', async () => {
    const workspaceRoot = await workspace();
    const port = createNativeGitRevisionPort({
      repositoryPath: workspaceRoot,
      checkouts: { projectId: 'project-anonymous', directory: join(workspaceRoot, '..', 'checkouts') },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['main.ts', new TextEncoder().encode('export const size = 1;\n')]]),
      provenance: {
        source: 'user',
        actor: { kind: 'user', id: 'anon:1a2b3c4d', name: 'Anonymous', anonymous: true },
        capture: 'save',
        via: 'desktop',
        createdAt: Date.UTC(2026, 8, 8, 12, 0, 0),
      },
      summary: { generated: 'First revision' },
    });

    const record = await port.readRevision(revisionId(receipt.commitId));
    expect(record?.provenance.actor).toStrictEqual({
      kind: 'user',
      id: 'anon:1a2b3c4d',
      name: 'Anonymous',
      anonymous: true,
    });
    const line = execFileSync('git', ['log', '-1', '--format=%an|%ae|%cn', receipt.commitId], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim();
    /* No mailbox of the person's anywhere in the commit. */
    expect(line).toBe('Anonymous|anon:1a2b3c4d@users.noreply.tau.new|Tau');
  }, 60_000);
});

/*
 * A1: a native host records the Tau account it is handed (the session a
 * renderer sends with `setActor`, or the account a token belongs to) and, with
 * none, this device's pseudonym. This is the wiring every Node entry point uses:
 * the desktop (`apps/desktop/src/tau/services-host.impl.ts`) and `tau serve`
 * (`packages/host/src/host-daemon.ts`) through `createProjectHost`, and
 * `tau revisions save` through `openProjectRevisions`.
 */
describe.runIf(gitToolchainOnPath)('a Node host records the account it is handed', () => {
  /**
   * Mint one close cut and read its author and committer.
   *
   * Waits for the live checkout, not for a clock: `release()` flushes through
   * whatever checkout the root has now, and a host that has not yet spawned one
   * mints nothing. The one seam that says the spawn has happened is this host's
   * own watcher, which calls `changed` only once `liveCheckoutId` is set.
   *
   * @param workspaceRoot - The project directory.
   * @param projectId - The project id.
   * @param before - What the page sends before the write, if anything.
   * @returns `author name|author email|committer name|committer email` of `main`.
   */
  const closeCut = async (
    workspaceRoot: string,
    projectId: string,
    before?: (revisions: ReturnType<typeof createProjectRevisions>) => Promise<void>,
  ): Promise<string> => {
    /* The isomorphic leg on purpose: the claim is the attribution a host wires,
     * not the engine, and a mint made of process spawns can outlast the close
     * flush's own bound on a loaded machine. */
    const port = createIsomorphicGitRevisionPort({
      filesystem: new NodeFsProvider(workspaceRoot),
      checkouts: { projectId, root: () => new NodeFsProvider(workspaceRoot) },
    });
    const revisions = createProjectRevisions({ via: 'desktop', workspaceRoot, projectId, port });
    let liveCheckoutId: string | undefined;
    const { changed } = revisions;
    Object.assign(revisions, {
      changed: (checkoutId: string, paths: readonly string[]) => {
        liveCheckoutId ??= checkoutId;
        changed(checkoutId, paths);
      },
    });
    await before?.(revisions);
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    await expect.poll(() => liveCheckoutId, { timeout: 20_000 }).toBeDefined();
    /* The close flush: no turn, no lease, the same path a quit takes (S30 `close`). */
    await revisions.release();
    const storeDirectory = join(workspaceRoot, '.git');
    expect(execFileSync('git', ['-C', storeDirectory, 'for-each-ref'], { encoding: 'utf8' })).toContain(
      'refs/heads/main',
    );
    return execFileSync('git', ['-C', storeDirectory, 'log', '-1', '--format=%an|%ae|%cn|%ce', 'refs/heads/main'], {
      encoding: 'utf8',
    }).trim();
  };

  const configDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-host-config-'));
    roots.push(directory);
    process.env['TAU_CONFIG_DIR'] = directory;
    return directory;
  };

  it('authors a close cut after `setActor` as the session, under its no-reply address', async () => {
    const workspaceRoot = await workspace();
    await configDirectory();
    const line = await closeCut(workspaceRoot, 'project-session-actor', async (revisions) => {
      await revisions.channel.request({
        command: 'setActor',
        actor: { kind: 'user', id: 'usr_lane1', name: 'Lane Person' },
      });
    });
    expect(line).toBe('Lane Person|usr_lane1@users.noreply.tau.new|Tau|noreply@tau.new');
  }, 60_000);

  it('refuses a `setActor` that names anything but a person', async () => {
    const workspaceRoot = await workspace();
    await configDirectory();
    const revisions = createProjectRevisions({
      via: 'desktop',
      workspaceRoot,
      projectId: 'project-bad-actor',
      watchWorkspace: false,
      port: createIsomorphicGitRevisionPort({
        filesystem: new NodeFsProvider(workspaceRoot),
        checkouts: { projectId: 'project-bad-actor', root: () => new NodeFsProvider(workspaceRoot) },
      }),
    });
    try {
      await expect(
        revisions.channel.request({ command: 'setActor', actor: { kind: 'agent', id: 'agent' } }),
      ).rejects.toThrow();
    } finally {
      await revisions.release();
    }
  }, 30_000);

  it('authors a close cut with no session as this device’s pseudonym, kept outside the tree', async () => {
    const workspaceRoot = await workspace();
    const config = await configDirectory();
    const line = await closeCut(workspaceRoot, 'project-pseudonym');
    const person = hostRevisionActor()({ runId: undefined, trigger: 'close' });
    expect(person).toMatchObject({ kind: 'user', name: 'Anonymous', anonymous: true });
    const id = person?.kind === 'user' ? person.id : '';
    expect(id).toMatch(/^anon:[\da-f]{8}$/u);
    /* One device, one pseudonym: a second host on it records the same one. */
    expect(hostRevisionActor()({ runId: undefined, trigger: 'save' })).toStrictEqual(person);
    expect(line).toBe(`Anonymous|${id}@users.noreply.tau.new|Tau|noreply@tau.new`);
    /* The salt stays in this host's config, never in the tree. */
    const salt = await readFile(join(config, 'revision-salt'), 'utf8');
    expect(salt.trim()).not.toBe('');
    const tracked = execFileSync(
      'git',
      ['-C', join(workspaceRoot, '.git'), 'ls-tree', '-r', '--name-only', 'refs/heads/main'],
      { encoding: 'utf8' },
    );
    expect(tracked).not.toContain('revision-salt');
  }, 60_000);

  it('records the account it was wired with until a session replaces it', () => {
    const resolve = hostRevisionActor({ kind: 'user', id: 'usr_token1' });
    expect(resolve({ runId: undefined, trigger: 'save' })).toStrictEqual({ kind: 'user', id: 'usr_token1' });
    expect(resolve({ runId: 'run-1', trigger: 'turn' })).toStrictEqual({
      kind: 'agent',
      id: 'agent',
      runId: 'run-1',
      onBehalfOf: { kind: 'user', id: 'usr_token1' },
    });
  });
});

/*
 * FX7 D2: a cloud host runs as the container's user, but it acts for the
 * project's owner, whose identity the provisioner hands it (rule 15). An agent
 * turn records the agent on behalf of that owner — the browser's shape — and
 * stock `git log` names the owner under the no-reply address, never a machine
 * account and never the account email.
 */
describe.runIf(gitToolchainOnPath)('a cloud host records the owner it runs for', () => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment names, as the provisioner sets them
  const ownerEnvironment = { TAU_HOST_OWNER_ID: 'usr_owner1', TAU_HOST_OWNER_NAME: 'Ada Owner' } as const;

  afterEach(() => {
    delete process.env['TAU_HOST_OWNER_ID'];
    delete process.env['TAU_HOST_OWNER_NAME'];
  });

  it('authors an agent turn as the owner, with the agent run in the actor trailer', async () => {
    Object.assign(process.env, ownerEnvironment);
    const person = hostRevisionActor();
    const turnActor = person({ runId: 'run-1', trigger: 'turn' });
    const owner = { kind: 'user', id: 'usr_owner1', name: 'Ada Owner' } as const;
    expect(turnActor).toStrictEqual({ kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: owner });
    /* A save outside any run is the owner's own. */
    expect(person({ runId: undefined, trigger: 'save' })).toStrictEqual(owner);

    const workspaceRoot = await workspace();
    const port = createNativeGitRevisionPort({
      repositoryPath: workspaceRoot,
      checkouts: { projectId: 'project-cloud-owner', directory: join(workspaceRoot, '..', 'checkouts') },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['main.ts', new TextEncoder().encode('export const size = 1;\n')]]),
      provenance: {
        source: 'agent',
        actor: turnActor,
        capture: 'turn',
        via: 'cloud',
        runId: 'run-1',
        createdAt: Date.UTC(2026, 8, 27, 12, 0, 0),
      },
      summary: { generated: 'Agent turn' },
    });

    const line = execFileSync('git', ['log', '-1', '--format=%an|%ae|%cn|%ce', receipt.commitId], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim();
    expect(line).toBe('Ada Owner|usr_owner1@users.noreply.tau.new|Tau|noreply@tau.new');
    const body = execFileSync('git', ['log', '-1', '--format=%B', receipt.commitId], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    expect(body).toContain('Tau-Actor: agent agent run run-1 for Ada Owner');
  }, 60_000);
});

describe('the Node host observes its own workspace', () => {
  it('raises one content-change event for a write nothing else reported', async () => {
    const workspaceRoot = await workspace();
    const raised: Array<readonly string[]> = [];
    const revisions = createProjectRevisions({
      via: 'desktop',
      workspaceRoot,
      projectId: 'project-watch',
      port: createNativeGitRevisionPort({
        repositoryPath: workspaceRoot,
        checkouts: { projectId: 'project-watch', directory: join(workspaceRoot, '..', 'checkouts') },
      }),
    });
    /* The seam the watcher drives; asserting the call rather than the machine
     * keeps the claim to "this host has a change source at all". */
    const { changed } = revisions;
    Object.assign(revisions, {
      changed: (checkoutId: string, paths: readonly string[]) => {
        raised.push(paths);
        changed(checkoutId, paths);
      },
    });

    try {
      await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
      /* Derived content can never start an idle window, so it must not arrive. */
      await mkdir(join(workspaceRoot, '.tau', 'cache'), { recursive: true });
      await writeFile(join(workspaceRoot, '.tau', 'cache', 'x.bin'), 'noise');

      await expect.poll(() => raised.flat(), { timeout: 10_000 }).toContain('main.ts');
      expect(raised.flat()).not.toContain('.gitignore');
      expect(raised.flat()).not.toContain('.gitattributes');
      expect(raised.flat().filter((path) => path.startsWith('.tau/cache'))).toEqual([]);
    } finally {
      await revisions.release();
    }
  }, 30_000);
});
