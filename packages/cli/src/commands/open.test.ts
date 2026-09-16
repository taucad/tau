/**
 * `tau open` — the terminal's second device (W18 DEF-2, AC17/AC21).
 *
 * The claim is the same one `tau publish` makes: the CLI decides nothing. It
 * names the project from `GET /v1/projects`, makes a directory, and hands the
 * whole of "connect and pull" to `openFromRemote` — the verb that drives
 * `remote.machine` and lets W13's scheduler materialize the checkout. So the
 * rows here are the refusals a terminal needs, the listing, and the one call
 * that leaves.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const openFromRemote = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn(async () => undefined));
const openProjectRevisions = vi.hoisted(() => vi.fn());

vi.mock('@taucad/host', () => ({
  openProjectRevisions,
  requireRevisionToolchain: async () => undefined,
}));

const { openCommand } = await import('#commands/open.js');

const cloudProjects = [
  { id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox Alpha', updatedAt: '2026-09-13T02:00:00.000Z' },
  { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket Beta', updatedAt: '2026-09-13T01:00:00.000Z' },
];

describe('openCommand', () => {
  let workdir: string;
  let stdout: string[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    workdir = await mkdtemp(join(tmpdir(), 'tau-cli-open-'));
    stdout = [];
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
    openFromRemote.mockReset();
    openFromRemote.mockResolvedValue({ status: 'opened', branch: 'main', revisionId: 'rev-1' });
    openProjectRevisions.mockReset();
    openProjectRevisions.mockReturnValue({ openFromRemote, close });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => cloudProjects })),
    );
    vi.stubEnv('TAU_API_URL', 'https://api.tau.new');
    vi.stubEnv('TAU_API_TOKEN', 'session-token');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await rm(workdir, { recursive: true, force: true });
  });

  it('lists this account’s projects when no project is named', async () => {
    await runCommand(openCommand, { rawArgs: [] });

    expect(stdout.join('')).toBe(
      'proj_aaaaaaaaaaaaaaaaaaaaa  Gearbox Alpha\nproj_bbbbbbbbbbbbbbbbbbbbb  Bracket Beta\n',
    );
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('opens a named project into a directory and prints where it is', async () => {
    const into = join(workdir, 'bracket');

    await runCommand(openCommand, { rawArgs: ['proj_bbbbbbbbbbbbbbbbbbbbb', '--into', into] });

    /* The remote's id, not the directory's name: the id is the repository path
       on the Tau Hosted Remote (`basename` would name the directory). */
    expect(openProjectRevisions).toHaveBeenCalledWith({
      workspaceRoot: into,
      projectId: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      apiBaseUrl: 'https://api.tau.new',
      apiToken: 'session-token',
    });
    expect(openFromRemote).toHaveBeenCalledOnce();
    expect(stdout.join('')).toBe(`${into}\n`);
    expect(close).toHaveBeenCalled();
  });

  it('refuses a project this account does not have, before making a directory', async () => {
    await expect(
      runCommand(openCommand, { rawArgs: ['proj_ccccccccccccccccccccc', '--into', join(workdir, 'nope')] }),
    ).rejects.toMatchObject({ code: 'NO_SUCH_PROJECT', exit: exitCodes.refused });
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('refuses a directory that already holds something', async () => {
    await writeFile(join(workdir, 'keep.txt'), 'mine\n');

    await expect(
      runCommand(openCommand, { rawArgs: ['proj_bbbbbbbbbbbbbbbbbbbbb', '--into', workdir] }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_NOT_EMPTY', exit: exitCodes.refused });
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('refuses without an API to open from, before listing anything', async () => {
    vi.stubEnv('TAU_API_TOKEN', '');

    await expect(runCommand(openCommand, { rawArgs: [] })).rejects.toMatchObject({
      code: 'NO_API_TOKEN',
      exit: exitCodes.refused,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports the machine’s own refusal rather than pretending it opened', async () => {
    openFromRemote.mockResolvedValue({ status: 'refused', reason: 'The remote did not answer in time.' });

    await expect(
      runCommand(openCommand, { rawArgs: ['proj_bbbbbbbbbbbbbbbbbbbbb', '--into', join(workdir, 'late')] }),
    ).rejects.toMatchObject({ code: 'OPEN_REFUSED', exit: exitCodes.refused });
    expect(close).toHaveBeenCalled();
  });
});
