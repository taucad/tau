/**
 * `tau publish` — the terminal leg of the Publish dialog (S42, AC22).
 *
 * The claim is that the CLI decides nothing: it resolves the project, reads the
 * entry path the project itself records, and hands one draft to the same verb
 * the dialog's machine answers. So the rows here are the refusals a terminal
 * needs and the draft that leaves — never a second publish path.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
      publicationId: 'pub_1',
      url: 'https://tau.new/s/tau~pub_1',
    });
    openProjectRevisions.mockReset();
    openProjectRevisions.mockReturnValue({ publish, close });
    vi.stubEnv('TAU_API_URL', 'https://api.tau.new');
    vi.stubEnv('TAU_API_TOKEN', 'session-token');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(project, { recursive: true, force: true });
  });

  const seedManifest = async (entryPath = 'main.ts'): Promise<void> => {
    await writeFile(join(project, 'tau.json'), JSON.stringify({ assets: { main: { entryPath } } }));
  };

  it('publishes the named version and prints the link', async () => {
    await seedManifest();

    await runCommand(publishCommand, { rawArgs: ['v2', '--project', project, '--title', 'Bracket'] });

    expect(openProjectRevisions).toHaveBeenCalledWith({
      workspaceRoot: project,
      apiBaseUrl: 'https://api.tau.new',
      apiToken: 'session-token',
    });
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      tag: 'v2',
      projectName: basename(project),
      entryPath: 'main.ts',
      visibility: 'private',
      title: 'Bracket',
    });
    expect(stdout.join('')).toBe('https://tau.new/s/tau~pub_1\n');
    expect(close).toHaveBeenCalled();
  });

  it('publishes publicly only when asked, and carries the optional fields', async () => {
    await seedManifest('lib/body.ts');

    await runCommand(publishCommand, {
      rawArgs: ['v1', '--project', project, '--public', '--description', 'A bracket', '--note', 'first release'],
    });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: 'public',
        entryPath: 'lib/body.ts',
        description: 'A bracket',
        note: 'first release',
      }),
    );
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
      url: 'https://tau.new/s/tau~pub_1',
    });
  });

  it('refuses without an API to publish to, before opening anything', async () => {
    vi.stubEnv('TAU_API_URL', '');

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'NO_API_URL',
      exit: exitCodes.refused,
    });
    expect(openProjectRevisions).not.toHaveBeenCalled();
  });

  it('refuses without a session token', async () => {
    vi.stubEnv('TAU_API_TOKEN', '');

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'NO_API_TOKEN',
      exit: exitCodes.refused,
    });
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
    publish.mockResolvedValue({ status: 'refused', reason: 'Private links need the Pro plan.' });

    await expect(runCommand(publishCommand, { rawArgs: ['v1', '--project', project] })).rejects.toMatchObject({
      code: 'PUBLISH_REFUSED',
      message: 'Private links need the Pro plan.',
      exit: exitCodes.refused,
    });
    expect(close).toHaveBeenCalled();
  });
});
