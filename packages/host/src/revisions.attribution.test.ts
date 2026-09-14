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
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNativeGitRevisionPort } from '@taucad/revisions/node';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';

import { createProjectRevisions } from '#revisions.js';
import { hostRevisionActor } from '#revision-actor.js';

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-host-attribution-'));
  roots.push(root);
  const project = join(root, 'project');
  await mkdir(project, { recursive: true });
  return project;
};

describe.runIf(gitOnPath)('attribution on a clone of a Tau project', () => {
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
        actorId: 'user-lane',
        actor: { kind: 'user', id: 'user-lane', name: 'Lane Person', email: 'lane@example.com' },
        trigger: 'save',
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
        actorId: 'anon:1a2b3c4d',
        actor: { kind: 'user', id: 'anon:1a2b3c4d', name: 'Anonymous', anonymous: true },
        trigger: 'save',
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
 * W6-a2 R2: AC15's Node half. `createProjectRevisions` has an `actor` seam, and
 * a host that leaves it empty authors every revision as the opaque `tau-host`.
 * This is the wiring both Node call sites use — `apps/desktop/src/tau/
 * services-host.impl.ts` and `packages/host/src/host-daemon.ts`.
 */
describe.runIf(gitOnPath)('a Node host records the person it runs for', () => {
  it('authors what it mints as this machine\u2019s user, with Tau as the committer', async () => {
    const workspaceRoot = await workspace();
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-host-config-'));
    roots.push(configDirectory);
    process.env['TAU_CONFIG_DIR'] = configDirectory;
    const person = hostRevisionActor();
    /* The isomorphic leg on purpose: the claim is the attribution a host wires,
     * not the engine (row 1 covers native git's), and a mint made of process
     * spawns can outlast the close flush's own five-second bound on a loaded
     * machine — which would make this row report a timing accident as a fact. */
    const port = createIsomorphicGitRevisionPort({
      filesystem: new NodeFsProvider(workspaceRoot),
      checkouts: { projectId: 'project-host-actor', root: () => new NodeFsProvider(workspaceRoot) },
    });
    const revisions = createProjectRevisions({
      workspaceRoot,
      projectId: 'project-host-actor',
      port,
      actor: person,
    });

    /*
     * Wait for the live checkout, not for a clock.
     *
     * `release()` flushes through whatever checkout the root has *now*, and a
     * host that has not yet spawned one — the registry answers asynchronously —
     * mints nothing at all. The one seam that says the spawn has happened is
     * this host's own watcher: it holds each observed write until
     * `liveCheckoutId` is set and only then calls `changed`, so the first call
     * through is the condition itself. (That it is the only such seam is a gap
     * in `ProjectRevisions`, recorded for W7-a2/W13 in the report.)
     */
    let liveCheckoutId: string | undefined;
    const { changed } = revisions;
    Object.assign(revisions, {
      changed: (checkoutId: string, paths: readonly string[]) => {
        liveCheckoutId ??= checkoutId;
        changed(checkoutId, paths);
      },
    });
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    await expect.poll(() => liveCheckoutId, { timeout: 20_000 }).toBeDefined();

    /* The close flush is this host's own trigger-only mint: no turn, no lease,
     * and the I5 gate decides — the same path a quit takes (S30 `close`). */
    await revisions.release();

    /* The flush's own outcome, before anything is cloned: `release()` bounds the
     * cut, so a mint that did not land is a fact about this run, not a bad clone. */
    const storeDirectory = join(workspaceRoot, '.tau', 'revisions');
    expect(execFileSync('git', ['-C', storeDirectory, 'for-each-ref'], { encoding: 'utf8' })).toContain(
      'refs/heads/main',
    );

    const clone = join(workspaceRoot, '..', 'clone-host-actor');
    execFileSync('git', ['clone', '--quiet', join(workspaceRoot, '.tau', 'revisions'), clone], { stdio: 'ignore' });
    /* The branch by name, not the clone's HEAD: Tau writes refs itself and
     * never sets the store's default branch, so which branch a fresh clone
     * checks out is `git init.defaultBranch` on the machine, not this project. */
    const line = execFileSync('git', ['log', '-1', '--format=%an|%cn|%ce', 'refs/remotes/origin/main'], {
      cwd: clone,
      encoding: 'utf8',
    }).trim();

    const expected = person({ runId: undefined, trigger: 'close' });
    if (expected?.kind !== 'user') {
      throw new Error('a Node host records a person, not an agent');
    }
    expect(line).toBe(`${expected.name ?? expected.id}|Tau|noreply@tau.new`);
    /* The falsifying half: the opaque host id is what an unwired host records. */
    expect(line.startsWith('tau-host|')).toBe(false);
  }, 60_000);
});

describe('the Node host observes its own workspace', () => {
  it('raises one content-change event for a write nothing else reported', async () => {
    const workspaceRoot = await workspace();
    const raised: Array<readonly string[]> = [];
    const revisions = createProjectRevisions({
      workspaceRoot,
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
