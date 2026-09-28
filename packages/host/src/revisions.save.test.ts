/**
 * `save` on a disk host: the pane's *Save* (C16) reached from a terminal (W15).
 *
 * The claim is the third client's: a revision a terminal records is authored by
 * the person running it, and reaches the project's remote as the browser's and
 * the desktop's do. Native Git over real directories, and a bare repository as
 * the remote — the transport is `sync.integration.test.ts`'s; this is the verb.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { RevisionPort } from '@taucad/revisions';
import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';

import { hostRevisionActor } from '#revision-actor.js';
import {
  createProjectRevisionPort,
  createProjectRevisions,
  openProjectRevisions,
  requireRevisionToolchain,
} from '#revisions.js';
import type { RevisionSaveOutcome } from '#index.js';

const roots: string[] = [];

afterEach(async () => {
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/* The same `git` + `git lfs` probe the host refuses on (OQ-B8). */
const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

const directory = async (label: string): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), `tau-host-save-${label}-`));
  roots.push(path);
  return path;
};

const git = (repository: string, args: readonly string[]): string =>
  execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();

/**
 * One project with one revision on `main`, offered to a bare remote named `tau`.
 *
 * @returns The bare remote, and the project's id on it.
 */
const remoteWithOneRevision = async (): Promise<Readonly<{ bare: string; projectId: string }>> => {
  const bare = await directory('remote');
  const first = await directory('first');
  process.env['TAU_CONFIG_DIR'] = await directory('config');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', bare], { stdio: 'ignore' });
  const projectId = 'project-save';
  const port = createProjectRevisionPort({ workspaceRoot: first, projectId });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  await port.setHead('main');
  const receipt = await port.writeRevision({
    parents: [],
    tree: new ImmutableRevisionTree([
      ['part.ts', 'export const part = 1;\n'],
      ['tau.json', `${JSON.stringify({ id: projectId, name: 'Save' })}\n`],
    ]),
    provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 26) },
    summary: { generated: 'First device' },
  });
  await port.updateRef({ name: 'refs/heads/main', expectedHead: undefined, head: revisionId(receipt.commitId) });
  await port.setRemote({ name: 'tau', url: bare });
  await port.push({ remote: 'tau', atomic: true, refs: [{ name: 'refs/heads/main' }] });
  return { bare, projectId };
};

describe.runIf(gitToolchainOnPath)('save on a disk host', () => {
  it('records the files as a revision by the person running it, and pushes it to the remote', async () => {
    const { bare, projectId } = await remoteWithOneRevision();
    const second = await directory('second');
    const opener = openProjectRevisions({ workspaceRoot: second, projectId, remoteUrl: () => bare });
    try {
      expect(await opener.openFromRemote()).toMatchObject({ status: 'opened' });
    } finally {
      await opener.close();
    }

    /* A fresh process's verbs, as `tau revisions save` opens them. */
    await writeFile(join(second, 'bracket.ts'), 'export const bracket = 2;\n');
    const revisions = openProjectRevisions({ workspaceRoot: second, projectId });
    let outcome: RevisionSaveOutcome;
    try {
      outcome = await revisions.save();
    } finally {
      await revisions.close();
    }

    expect(outcome).toMatchObject({ status: 'saved', line: 'main · Rev 2', backup: 'backedUp' });
    const saved = outcome.status === 'saved' ? outcome.revisionId : '';
    /* The remote holds exactly the revision the verb reported, with the new file in it. */
    expect(git(bare, ['rev-parse', 'refs/heads/main'])).toBe(saved);
    expect(git(bare, ['show', `${saved}:bracket.ts`])).toBe('export const bracket = 2;');
    /* AC15: the person, not the opaque `tau-host` an unwired host records. */
    const person = hostRevisionActor()({ runId: undefined, trigger: 'save' });
    expect(person?.kind).toBe('user');
    expect(git(bare, ['log', '-1', '--format=%an', saved])).toBe(
      person?.kind === 'user' ? (person.name ?? person.id) : '',
    );
  }, 120_000);

  it('saves nothing when the files already are the head’s revision', async () => {
    const { bare, projectId } = await remoteWithOneRevision();
    const second = await directory('unchanged');
    const revisions = openProjectRevisions({ workspaceRoot: second, projectId, remoteUrl: () => bare });
    try {
      expect(await revisions.openFromRemote()).toMatchObject({ status: 'opened' });
      const before = git(bare, ['rev-parse', 'refs/heads/main']);

      expect(await revisions.save()).toEqual({ status: 'unchanged', line: 'main · Rev 1' });
      expect(git(bare, ['rev-parse', 'refs/heads/main'])).toBe(before);
    } finally {
      await revisions.close();
    }
  }, 120_000);

  it('names the project by its tau.json id, not by the directory it was opened in (W15 F2)', async () => {
    const { bare, projectId } = await remoteWithOneRevision();
    const second = await directory('named-otherwise');
    const opener = openProjectRevisions({ workspaceRoot: second, projectId, remoteUrl: () => bare });
    try {
      expect(await opener.openFromRemote()).toMatchObject({ status: 'opened' });
    } finally {
      await opener.close();
    }

    /* A later terminal in the same directory passes no id, as the CLI does. */
    const asked: string[] = [];
    const revisions = openProjectRevisions({
      workspaceRoot: second,
      remoteUrl: (id) => {
        asked.push(id);
        return bare;
      },
    });
    try {
      expect(await revisions.openFromRemote()).toMatchObject({ status: 'opened' });
    } finally {
      await revisions.close();
    }
    expect(asked).toEqual([projectId]);
  }, 120_000);

  it('resolves one id for `tau serve` and `tau revisions save`, and the directory name for a malformed tau.json id (RV-W15)', async () => {
    process.env['TAU_CONFIG_DIR'] = await directory('config');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    /**
     * The id each entry resolves in a directory named otherwise, with no id passed, as the CLI and the daemon do.
     *
     * @param manifestId - What `tau.json` says.
     * @returns The directory's name, the id `save`'s verbs ask a remote for, and the id `serve`'s connect wrote.
     */
    const resolved = async (manifestId: string) => {
      const workspaceRoot = await directory('named-otherwise');
      await writeFile(join(workspaceRoot, 'tau.json'), `${JSON.stringify({ id: manifestId })}\n`);
      const asked: string[] = [];
      const verbs = openProjectRevisions({
        workspaceRoot,
        remoteUrl: (id) => {
          asked.push(id);
          return undefined;
        },
      });
      try {
        await verbs.openFromRemote();
      } finally {
        await verbs.close();
      }
      const served = createProjectRevisions({ workspaceRoot, apiBaseUrl: 'http://127.0.0.1:9' });
      /* Read as soon as it is written: the connect that follows fails against
       * no API, and git's remotes list is the record only until then. */
      const connectedId = async (): Promise<string | undefined> =>
        /\/v1\/git\/(?<id>[^\s/]+)\.git/u.exec(
          await readFile(join(workspaceRoot, '.git', 'config'), 'utf8').catch(() => ''),
        )?.groups?.['id'];
      let serve: string | undefined;
      try {
        await served.channel.request({ command: 'connectRemote', kind: 'tau' });
        await vi.waitFor(
          async () => {
            serve = await connectedId();
            expect(serve).toBeDefined();
          },
          { timeout: 10_000, interval: 5 },
        );
      } finally {
        await served.release();
      }
      return { directory: basename(workspaceRoot), save: asked, serve };
    };

    const named = await resolved('proj-manifest');
    expect(named.save).toEqual(['proj-manifest']);
    expect(named.serve).toBe('proj-manifest');

    const malformed = await resolved('../x');
    expect(malformed.save).toEqual([malformed.directory]);
    expect(malformed.serve).toBe(malformed.directory);
    /* Said once for the directory, though both entries resolved it. */
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  }, 120_000);

  /**
   * Run one `save` whose port never answers `stalled`, with the verb's own bound brought forward.
   *
   * Only the timer of exactly `bound` ms is shortened, and it fires once the
   * stall is reached, so everything else (git's own deadlines, the machines'
   * windows) keeps real time.
   *
   * @param project - The project directory and its id.
   * @param stall - The port method that never settles, and the verb's wait for
   *   its answer: 30 s for the cut, publish's 60 s + 30 s for the push.
   * @returns What `save` reported.
   */
  const saveStalled = async (
    project: Readonly<{ workspaceRoot: string; projectId: string }>,
    stall: Readonly<{ method: 'writeRevision' | 'push'; boundMilliseconds: number }>,
  ): Promise<RevisionSaveOutcome> => {
    const { workspaceRoot, projectId } = project;
    const real = createProjectRevisionPort({ workspaceRoot, projectId });
    let reached = false;
    /* Held until the verb has answered, then released so `close` can settle. */
    const held = Promise.withResolvers<never>();
    const never = async (): Promise<never> => {
      reached = true;
      return held.promise;
    };
    const port: RevisionPort = stall.method === 'push' ? { ...real, push: never } : { ...real, writeRevision: never };
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: () => void,
      delayMilliseconds?: number,
      ...rest: unknown[]
    ) => {
      if (delayMilliseconds !== stall.boundMilliseconds) {
        return realSetTimeout(handler, delayMilliseconds, ...rest);
      }
      const once = (): void => {
        if (reached) {
          handler();
        } else {
          realSetTimeout(once, 5);
        }
      };
      return realSetTimeout(once, 0);
    }) as typeof setTimeout);
    const revisions = openProjectRevisions({ workspaceRoot, projectId, port });
    try {
      return await revisions.save();
    } finally {
      vi.mocked(globalThis.setTimeout).mockRestore();
      held.reject(new Error('The stalled port call is released.'));
      await revisions.close();
    }
  };

  /* Geospec's RV-W15 "a cut that did not answer in time is unknown" has no counterpart here: a save's cut is answered
   * by its request id with no host bound (B3, B8), so a slow write is answered when it is recorded. */
  it('says a push that did not answer in time is unknown, not failed (RV-W15)', async () => {
    const { bare, projectId } = await remoteWithOneRevision();
    const second = await directory('push-timeout');
    const opener = openProjectRevisions({ workspaceRoot: second, projectId, remoteUrl: () => bare });
    try {
      expect(await opener.openFromRemote()).toMatchObject({ status: 'opened' });
    } finally {
      await opener.close();
    }
    await writeFile(join(second, 'bracket.ts'), 'export const bracket = 2;\n');

    /* The scheduler's own push deadline answers a hung push (A12, RM-R11); the save has no bound of its own. */
    const outcome = await saveStalled(
      { workspaceRoot: second, projectId },
      { method: 'push', boundMilliseconds: 60_000 },
    );

    expect(outcome).toMatchObject({ status: 'saved' });
    expect(outcome.status === 'saved' && outcome.backup).not.toBe('backedUp');
    expect(outcome).toHaveProperty('reason');
    /* No outcome says "timed out": the cut and the push are each answered (B3, A12; GM.r1 L2). */
    expectTypeOf<RevisionSaveOutcome['status']>().toEqualTypeOf<'saved' | 'unchanged' | 'refused'>();
    expectTypeOf<'timedOut'>().not.toExtend<Extract<RevisionSaveOutcome, { status: 'saved' }>['backup']>();
  }, 120_000);

  it('says a project with no remote is saved on this device, not that its backup failed', async () => {
    const workspaceRoot = await directory('local');
    process.env['TAU_CONFIG_DIR'] = await directory('config');
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', workspaceRoot]);
    await writeFile(join(workspaceRoot, 'part.ts'), 'export const part = 1;\n');
    const revisions = openProjectRevisions({ workspaceRoot, projectId: 'project-local' });
    try {
      const outcome = await revisions.save();

      expect(outcome).toMatchObject({ status: 'saved', backup: 'noRemote' });
      expect(outcome).not.toHaveProperty('reason');
      expect(git(workspaceRoot, ['rev-parse', 'refs/heads/main'])).toBe(
        outcome.status === 'saved' ? outcome.revisionId : '',
      );
    } finally {
      await revisions.close();
    }
  }, 120_000);
});
