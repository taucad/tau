/**
 * W8 TS-S8: the daemon's revision waits are answers, not timers (W4 rows B3–B6).
 *
 * Each row freezes the host's clock (`setTimeout` never fires) and races the verb against a real deadline the fake
 * clock does not touch. An answer that only a bound could give shows up as `unanswered`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as realDelay } from 'node:timers/promises';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import type { RevisionPort } from '@taucad/revisions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProjectRevisions, openProjectRevisions } from '#revisions.js';

const roots: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** The verb's answer, or `unanswered` when only a timer could have ended the wait. */
const answerOf = async <Answer>(verb: Promise<Answer>): Promise<Answer | 'unanswered'> => {
  const deadline = async (): Promise<'unanswered'> => {
    await realDelay(3000);
    return 'unanswered';
  };
  return Promise.race([verb, deadline()]);
};

/** A promise's rejection as a value, so a race can report it. */
const outcomeOf = async (work: Promise<void>): Promise<unknown> => {
  try {
    await work;
    return 'released';
  } catch (error) {
    return error;
  }
};

/** A project whose checkout registry fails, so it answers with no checkout at all. */
const unreadableRegistry = async (): Promise<Readonly<{ workspaceRoot: string; port: RevisionPort }>> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-bounds-'));
  roots.push(workspaceRoot);
  const filesystem = new NodeFsProvider(workspaceRoot);
  await filesystem.writeFile('main.ts', 'export const size = 1;\n');
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'project-1', root: () => filesystem },
  });
  return {
    workspaceRoot,
    port: {
      ...port,
      listCheckouts: async () => {
        throw new Error('the store is unreadable');
      },
    },
  };
};

describe('revision waits answered with the clock frozen (TS-S8)', () => {
  it('should answer a verb once the registry answers with no checkout (B4)', async () => {
    const { workspaceRoot, port } = await unreadableRegistry();
    const revisions = openProjectRevisions({ workspaceRoot, projectId: 'project-1', port });

    const outcome = await answerOf(revisions.switchTo('feature'));
    await revisions.close();

    expect(outcome).toMatchObject({ status: 'refused', branch: 'feature' });
  });

  it('should answer the close flush once the registry answers with no live checkout (B3)', async () => {
    const { workspaceRoot, port } = await unreadableRegistry();
    const revisions = createProjectRevisions({ workspaceRoot, projectId: 'project-1', port });

    const outcome = await answerOf(outcomeOf(revisions.release()));

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).toHaveProperty('message', 'This project has no live checkout to record at close.');
  });

  it('should answer a publish verb without waiting out a verb bound (B6)', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-bounds-'));
    roots.push(workspaceRoot);
    const filesystem = new NodeFsProvider(workspaceRoot);
    await filesystem.writeFile('main.ts', 'export const size = 1;\n');
    const port = createIsomorphicGitRevisionPort({ filesystem });
    const revisions = openProjectRevisions({ workspaceRoot, projectId: 'project-1', port });

    const outcome = await answerOf(
      revisions.publish({
        tag: 'v1',
        projectName: 'Project',
        entryPath: 'main.ts',
        visibility: 'public',
        title: 'Project',
      }),
    );
    await revisions.close();

    expect(outcome).toMatchObject({ status: 'refused' });
  });
});
