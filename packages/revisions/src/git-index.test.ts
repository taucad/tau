import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { encodeGitIndex } from '#git-index.js';
import type { GitIndexEntry } from '#git-index.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

// Environment names, not identifiers: assigned rather than spelled as keys.
const gitEnvironment: NodeJS.ProcessEnv = { ...process.env };
gitEnvironment['GIT_CONFIG_GLOBAL'] = '/dev/null';
gitEnvironment['GIT_CONFIG_NOSYSTEM'] = '1';

const git = (cwd: string, args: readonly string[], input?: string): string =>
  execFileSync('git', args, { cwd, input, env: gitEnvironment }).toString('utf8').trim();

describe.runIf(gitToolchainOnPath)('encodeGitIndex', () => {
  it('writes the bytes git itself writes for the same entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-git-index-'));
    roots.push(root);
    git(root, ['init', '--quiet', '--initial-branch=main']);
    const files: ReadonlyArray<readonly [string, string, string]> = [
      ['b.txt', '100644', 'b\n'],
      // `/` (0x2f) sorts after `.` (0x2e): `a.txt` precedes `a/c.txt`.
      ['a/c.txt', '100644', 'c\n'],
      ['a.txt', '100644', 'a\n'],
      ['run.sh', '100755', '#!/bin/sh\n'],
      ['ü.txt', '100644', 'u\n'],
    ];
    const entries: GitIndexEntry[] = files.map(([path, mode, content]) => ({
      path,
      mode,
      oid: git(root, ['hash-object', '--stdin'], content),
    }));
    for (const { path, mode, oid } of entries) {
      git(root, ['update-index', '--add', '--info-only', '--cacheinfo', `${mode},${oid},${path}`]);
    }

    const written = new Uint8Array(await readFile(join(root, '.git', 'index')));

    expect(encodeGitIndex(entries)).toStrictEqual(written);
  });

  it('writes an index git reads as naming no paths when there are no entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-git-index-empty-'));
    roots.push(root);
    git(root, ['init', '--quiet', '--initial-branch=main']);
    // Not compared with `read-tree --empty`: that appends a cache-tree extension.
    await writeFile(join(root, '.git', 'index'), encodeGitIndex([]));

    expect(git(root, ['ls-files', '--stage'])).toBe('');
  });
});
