/**
 * `tau revisions` over a real project directory and a real `git`.
 *
 * The claim is headless parity (S13, AC5): what the verb prints is what the
 * port holds, not a second reading of the graph. The suite runs where `git`
 * resolves and is skipped where it does not, exactly as the port's own
 * conformance rows are.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { openProjectRevisions } from '@taucad/host';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const execute = promisify(execFile);
/* The fixture's commits must not pick up the operator's own git configuration.
 * Environment names, not identifiers: assigned rather than spelled as keys. */
const seedEnvironment: NodeJS.ProcessEnv = { ...process.env };
seedEnvironment['GIT_CONFIG_GLOBAL'] = '/dev/null';
seedEnvironment['GIT_CONFIG_SYSTEM'] = '/dev/null';
const gitOnPath = await execute('git', ['--version']).then(
  () => true,
  () => false,
);

describe.runIf(gitOnPath)('revisionsCommand', () => {
  let project: string;
  let stdout: string[];

  const captureStdout = (): void => {
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: readonly unknown[]
    ): boolean => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof process.stdout.write);
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    project = await mkdtemp(join(tmpdir(), 'tau-cli-revisions-'));
    stdout = [];
    captureStdout();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(project, { recursive: true, force: true });
  });

  /**
   * Two revisions on `main`, recorded with stock `git`.
   *
   * Deliberately not through Tau's own writer: a project a person cloned, or one
   * `jj`/`git` wrote, is the same project to these verbs, and this is the
   * cheapest place to keep that true.
   */
  const seed = async (): Promise<void> => {
    await execute('git', ['init', '--quiet', '--initial-branch=main', project]);
    for (const [index, content] of ['one', 'two'].entries()) {
      // oxlint-disable-next-line no-await-in-loop -- a chain is ordered by construction.
      await writeFile(join(project, 'part.ts'), `${content}\n`);
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await execute('git', ['-C', project, 'add', 'part.ts']);
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await execute(
        'git',
        [
          '-C',
          project,
          '-c',
          'user.name=ada',
          '-c',
          'user.email=ada@tau.invalid',
          'commit',
          '--quiet',
          '-m',
          `Revision ${String(index + 1)}`,
        ],
        { env: seedEnvironment },
      );
    }
  };

  const importCommand = async () => {
    const { revisionsCommand } = await import('#commands/revisions.js');
    return revisionsCommand;
  };

  it('lists what the port holds, numbered as the pane numbers it', async () => {
    await seed();
    await runCommand(await importCommand(), { rawArgs: ['log', '--project', project] });
    const printed = stdout.join('');
    expect(printed).toContain('Rev 2');
    expect(printed).toContain('Revision 2');
    expect(printed).toContain('main');
    expect(printed).toContain('Revision 1');

    const revisions = openProjectRevisions({ workspaceRoot: project, projectId: 'cli-project' });
    try {
      const rows = await revisions.log();
      expect(printed.trim().split('\n')).toHaveLength(rows.length);
      for (const row of rows) {
        expect(printed).toContain(row.summary);
      }
    } finally {
      await revisions.close();
    }
  }, 60_000);

  it('says where the project is in the words a person reads', async () => {
    await seed();
    await runCommand(await importCommand(), { rawArgs: ['describe', '--project', project] });
    const printed = stdout.join('');
    expect(printed).toContain('main · Rev 2');
    for (const jargon of ['checkout', 'worktree', 'lease', 'HEAD']) {
      expect(printed).not.toContain(jargon);
    }
  }, 60_000);

  it('refuses a directory that has no revision history, with the code a script reads', async () => {
    const outcome = await runCommand(await importCommand(), { rawArgs: ['log', '--project', project] }).then(
      () => undefined,
      (error: unknown) => error as { readonly code?: string; readonly exit?: number },
    );
    expect(outcome?.code).toBe('NO_REVISION_HISTORY');
    expect(outcome?.exit).toBe(exitCodes.refused);
  }, 60_000);

  /* Was red (P2): a project Tau did not write has no provenance trailer, and the
   * reader dated every one of its revisions to the Unix epoch. The commit itself
   * carries the date git shows. */
  it('dates a revision it did not write by the revision itself, not the epoch', async () => {
    await seed();
    const revisions = openProjectRevisions({ workspaceRoot: project, projectId: 'cli-project' });
    try {
      const rows = await revisions.log();
      expect(rows[0]?.createdAt).toBeGreaterThan(Date.UTC(2020, 0, 1));
    } finally {
      await revisions.close();
    }
  }, 60_000);

  it('names the files one revision changed', async () => {
    await seed();
    const revisions = openProjectRevisions({ workspaceRoot: project, projectId: 'cli-project' });
    const rows = await revisions.log();
    await revisions.close();
    await runCommand(await importCommand(), {
      rawArgs: ['diff', rows[1]!.revisionId, rows[0]!.revisionId, '--project', project],
    });
    expect(stdout.join('')).toContain('part.ts');
  }, 60_000);

  it('names the current revision and can remove that name', async () => {
    await seed();
    const command = await importCommand();

    await runCommand(command, { rawArgs: ['tag', 'v1', '--project', project] });
    const revisions = openProjectRevisions({ workspaceRoot: project, projectId: 'cli-project' });
    try {
      const rows = await revisions.log();
      expect(rows[0]?.tags).toContain('v1');
    } finally {
      await revisions.close();
    }

    await runCommand(command, { rawArgs: ['tag', 'v1', '--delete', '--project', project] });
    expect(stdout.join('')).toContain('Removed version name v1.');
  }, 60_000);
});
