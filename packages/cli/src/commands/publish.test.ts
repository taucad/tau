/**
 * `tau publish` — the terminal leg of the Publish dialog (S42, AC22).
 *
 * The claim is that the CLI decides nothing: it resolves the project, reads the
 * entry path the project itself records, and hands one draft to the same verb
 * the dialog's machine answers. So the rows here are the refusals a terminal
 * needs and the draft that leaves — never a second publish path.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const publish = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn(async () => undefined));
const openProjectRevisions = vi.hoisted(() => vi.fn());

vi.mock('@taucad/host', () => ({
  openProjectRevisions,
  requireRevisionToolchain: async () => undefined,
}));

const { publishCommand } = await import('#commands/publish.js');

describe('publishCommand', () => {
  let project: string;
  let stdout: string[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    project = await mkdtemp(join(tmpdir(), 'tau-cli-publish-'));
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
    publish.mockReset();
    publish.mockResolvedValue({
      status: 'published',
      tag: 'v1',
      name: 'Shared Nov 19',
      publicationId: 'pub_1',
      url: 'https://tau.new/s/tau~shr_1',
      visibility: 'private',
    });
    openProjectRevisions.mockReset();
    openProjectRevisions.mockReturnValue({ publish, close });
    vi.stubEnv('TAU_API_URL', 'https://api.tau.new');
    vi.stubEnv('TAU_AUTH_TOKEN', 'session-token');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(project, { recursive: true, force: true });
  });

  const seedManifest = async (
    entryPath = 'main.ts',
    fields: Readonly<{ name?: string; description?: string }> = {},
  ): Promise<void> => {
    await writeFile(join(project, 'tau.json'), JSON.stringify({ ...fields, assets: { main: { entryPath } } }));
  };

  it('publishes a named version with the project’s name and description, and prints the link', async () => {
    await seedManifest('main.ts', { name: 'Bracket', description: 'A wall bracket' });

    await runCommand(publishCommand, { rawArgs: ['Ready for print', '--project', project] });

    expect(openProjectRevisions).toHaveBeenCalledWith({
      workspaceRoot: project,
      apiBaseUrl: 'https://api.tau.new',
      apiToken: 'session-token',
    });
    /* No visibility: the link keeps its setting, and a first publish is private. */
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      tag: 'Ready for print',
      projectName: 'Bracket',
      description: 'A wall bracket',
      entryPath: 'main.ts',
    });
    expect(stdout.join('')).toBe('https://tau.new/s/tau~shr_1\n');
    expect(close).toHaveBeenCalled();
  });

  it('leaves an unnamed version for the host to name, and falls back to the directory’s name', async () => {
    await seedManifest();

    await runCommand(publishCommand, { rawArgs: ['--project', project] });

    expect(publish).toHaveBeenCalledExactlyOnceWith({
      tag: '',
      isAutoNamed: true,
      projectName: basename(project),
      entryPath: 'main.ts',
    });
  });

  it.each([
    [['--public'], 'public'],
    [['--private'], 'private'],
  ])('sets who can open the link with %j', async (flags, visibility) => {
    await seedManifest('lib/body.ts');

    await runCommand(publishCommand, { rawArgs: ['v1', '--project', project, ...flags, '--note', 'first release'] });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ visibility, entryPath: 'lib/body.ts', note: 'first release' }),
    );
  });

  it('refuses --public with --private before opening anything', async () => {
    await seedManifest();

    await expect(
      runCommand(publishCommand, { rawArgs: ['--project', project, '--public', '--private'] }),
    ).rejects.toMatchObject({ code: 'CONFLICTING_VISIBILITY', exit: exitCodes.usage });
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('prefers an explicit entry path over the project manifest', async () => {
    await seedManifest();

    await runCommand(publishCommand, { rawArgs: ['v1', '--project', project, '--entry', 'other.ts'] });

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ entryPath: 'other.ts' }));
  });

  it('writes one JSON record instead of the link', async () => {
    await seedManifest();

    await runCommand(publishCommand, { rawArgs: ['v1', '--project', project, '--json'] });

    expect(JSON.parse(stdout.join(''))).toMatchObject({
      v: 1,
      kind: 'publication',
      ok: true,
      url: 'https://tau.new/s/tau~shr_1',
      name: 'Shared Nov 19',
      visibility: 'private',
    });
  });

  it('refuses an unsafe API origin before opening anything', async () => {
    vi.stubEnv('TAU_API_URL', 'http://insecure.example.test');

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'INVALID_API_URL',
      exit: exitCodes.usage,
    });
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('refuses without a session token', async () => {
    vi.stubEnv('TAU_AUTH_TOKEN', '');

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'NO_AUTH_TOKEN',
      exit: exitCodes.refused,
    });
  });

  it('publishes with --entry and no project manifest, under the directory’s name', async () => {
    await runCommand(publishCommand, { rawArgs: ['v1', '--project', project, '--entry', 'main.ts'] });

    expect(publish).toHaveBeenCalledExactlyOnceWith({
      tag: 'v1',
      projectName: basename(project),
      entryPath: 'main.ts',
    });
  });

  it('refuses a project manifest it cannot read even with --entry, before opening the project', async () => {
    /* Not absent but unreadable: it may hold the project's identity, which the host will not guess. */
    await mkdir(join(project, 'tau.json'));

    await expect(
      runCommand(publishCommand, { rawArgs: ['v1', '--project', project, '--entry', 'main.ts'] }),
    ).rejects.toMatchObject({ code: 'NO_PROJECT_MANIFEST' });
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('refuses a project whose manifest does not say what it opens with', async () => {
    await writeFile(join(project, 'tau.json'), JSON.stringify({ assets: { main: {} } }));

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'NO_ENTRY_PATH',
    });
  });

  it('refuses a directory with no project manifest', async () => {
    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'NO_PROJECT_MANIFEST',
    });
  });

  it('reports the machine’s own refusal and still closes the project', async () => {
    await seedManifest();
    const reason = 'Private links need the Pro plan.';
    publish.mockResolvedValue({ status: 'refused', reason });

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'PUBLISH_REFUSED',
      message: reason,
      exit: exitCodes.refused,
    });
    expect(close).toHaveBeenCalled();
  });
});
