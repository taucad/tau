/**
 * `save` on a disk host: the pane's *Save* (C16) reached from a terminal (W15).
 *
 * The claim is the third client's: a revision a terminal records is authored by
 * the person running it, and reaches the project's remote as the browser's and
 * the desktop's do. Native Git over real directories, and a bare repository as
 * the remote — the transport is `sync.integration.test.ts`'s; this is the verb.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '@taucad/revisions/algorithms';

import { hostRevisionActor } from '#revision-actor.js';
import { createProjectRevisionPort, openProjectRevisions, requireRevisionToolchain } from '#revisions.js';
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
