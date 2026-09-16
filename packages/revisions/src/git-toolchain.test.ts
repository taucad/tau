/**
 * What a host is told when the binaries it records with are not there (OQ-B8).
 *
 * One message, naming exactly what is missing, from a probe that never needs a
 * repository — a host has to be able to ask this before it serves anything.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitToolchain } from '#git-toolchain.js';
import { RevisionPortError } from '#revision-port.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** A `git` that answers `--version` and `lfs version`, as a real one does. */
const gitWithLfs = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-git-toolchain-'));
  roots.push(root);
  const executable = join(root, 'git');
  await writeFile(
    executable,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "git version 2.55.0"; exit 0; fi',
      'if [ "$1" = "lfs" ] && [ "$2" = "version" ]; then echo "git-lfs/3.8.0 (GitHub; darwin arm64)"; exit 0; fi',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return executable;
};

/** A `git` that answers `--version` and refuses everything else. */
const gitWithoutLfs = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-git-toolchain-'));
  roots.push(root);
  const executable = join(root, 'git-without-lfs');
  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 2.55.0"; exit 0; fi\nexit 1\n',
    {
      mode: 0o755,
    },
  );
  return executable;
};

describe('git toolchain', () => {
  /* Stubs, not the developer's own machine: this suite has to be green in a
   * minimal container, where `git-lfs` is exactly what is missing (a1 R13). */
  it('reports both versions when both binaries answer', async () => {
    const toolchain = await resolveGitToolchain({ gitExecutable: await gitWithLfs() });
    expect(toolchain.gitVersion).toMatch(/^\d+\.\d+/u);
    expect(toolchain.gitLfsVersion).toContain('git-lfs');
  });

  it('probes git-lfs the way every real call reaches it, as git’s own subcommand (OQ3)', async () => {
    /* A `git-lfs` beside the named `git` is found; one that is only on `PATH`
     * beside a *different* `git` is not — which is the whole reason the second
     * option was deleted: it probed a binary nothing ever ran. */
    const failure = await resolveGitToolchain({ gitExecutable: await gitWithoutLfs() }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'ENGINE_UNAVAILABLE', missing: ['git-lfs'] });
  });

  it('names git-lfs, and only git-lfs, when that is the one that is missing', async () => {
    const failure = await resolveGitToolchain({ gitExecutable: await gitWithoutLfs() }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RevisionPortError);
    expect(failure).toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
    expect((failure as RevisionPortError).message).toContain('git-lfs');
    expect((failure as RevisionPortError).message).not.toContain('git and git-lfs');
    expect(failure).toMatchObject({ missing: ['git-lfs'] });
  });

  it('names both when there is no git at all', async () => {
    const failure = await resolveGitToolchain({ gitExecutable: '/nonexistent/tau-git' }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'ENGINE_UNAVAILABLE' });
    expect((failure as RevisionPortError).message).toContain('git and git-lfs');
    expect(failure).toMatchObject({ missing: ['git', 'git-lfs'] });
  });
});
