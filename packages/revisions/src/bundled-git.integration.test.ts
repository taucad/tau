/**
 * The git and git-lfs a desktop build ships record, back up and restore a project with a large file on their own.
 *
 * Runs only when `TAU_BUNDLED_GIT_EXECUTABLE` names a prepared payload's `git` (the desktop's `prepare-git` output, or
 * a packaged app's `resources/git/<target>/bin/git[.exe]`), which is how the Windows packaging leg runs it against
 * the MinGit payload (Windows desktop readiness R3). Every command of both ports runs with only the operating
 * system's own folders on `PATH`, as an app launched from the Start menu or Finder may have, and the row first proves
 * that no `git` or `git-lfs` is reachable there: every clean, upload, download and smudge ran through the payload.
 * The server side is the test's own `git http-backend`, which keeps the environment it was loaded with.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, win32 } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { resolveGitToolchain } from '#git-toolchain.js';
import { lfsPointerFor } from '#lfs.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import type { GitHttpBackendFixture } from '#test/git-http-backend.js';
import { recordedBy } from '#test/identity.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  largeObjectThresholdBytes,
} from '#workspace-config.js';

const bundledGit = process.env['TAU_BUNDLED_GIT_EXECUTABLE'] ?? '';
const author = { name: 'Bundled git', email: 'bundled-git@example.com' };
const tauAttributes = [generatedGitattributesPath, generatedGitattributesContent(undefined)] as const;

/** The operating system's own folders: what a Start menu or Finder launch can count on, and no git of the machine's. */
const systemPath = (): string => {
  if (process.platform === 'win32') {
    const systemRoot = process.env['SystemRoot'] ?? String.raw`C:\Windows`;
    return [win32.join(systemRoot, 'System32'), systemRoot].join(delimiter);
  }
  return ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
};

/** Whether a program answers on the current `PATH`, looked up as a child process looks it up. */
const reachable = (program: string): boolean =>
  spawnSync(program, ['--version'], { stdio: 'ignore' }).error === undefined;

describe.runIf(bundledGit !== '')('the bundled git and git-lfs, with nothing else on PATH', () => {
  let root = '';
  let server: GitHttpBackendFixture | undefined;
  let inheritedPath: string | undefined;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-bundled-git-'));
    /* Started before PATH narrows: the server's git keeps the environment its module was loaded with. */
    server = await startGitHttpBackend({ root: join(root, 'tau') });
    inheritedPath = process.env['PATH'];
    process.env['PATH'] = systemPath();
  }, 120_000);

  afterAll(async () => {
    process.env['PATH'] = inheritedPath;
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });

  it('finds no git or git-lfs of the machine’s, and the payload answers for both', async () => {
    /* A stock macOS `/usr/bin/git` is a shim that may answer; git-lfs never ships with an operating system. */
    expect(reachable('git-lfs')).toBe(false);
    if (process.platform === 'win32') {
      expect(reachable('git')).toBe(false);
    }
    const toolchain = await resolveGitToolchain({
      gitExecutable: bundledGit,
    });
    expect(toolchain.git).toBe(bundledGit);
    expect(toolchain.gitLfsVersion).toMatch(/^git-lfs\/\d/u);
    console.log(`bundled ${toolchain.gitVersion}; ${toolchain.gitLfsVersion}`);
  });

  it('records a large file, backs it up to a Tau remote and restores its exact bytes in a second project', async () => {
    const tau = server!;
    const tauCredential = () => ({
      apiBaseUrl: tau.url,
      authorization: 'Bearer session-token',
    });
    const bytes = new Uint8Array(largeObjectThresholdBytes + 4096);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index * 31) % 251;
    }

    const sourcePath = join(root, 'source');
    await mkdir(sourcePath);
    const source = createNativeGitRevisionPort({
      repositoryPath: sourcePath,
      gitExecutable: bundledGit,
      tauCredential,
    });
    await source.init({ author });
    const receipt = await source.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([tauAttributes, ['models/bracket.step', bytes], ['part.ts', 'export {};\n']]),
      provenance: {
        source: 'user',
        ...recordedBy('bundled-git'),
        createdAt: 1,
      },
      summary: { generated: 'A revision with a large file' },
    });
    const head = revisionId(receipt.commitId);
    await source.updateRef({ name: 'main', expectedHead: undefined, head });
    await source.setRemote({ name: 'tau', url: tau.url });
    const pushed = await source.push({
      remote: 'tau',
      refs: [{ name: 'refs/heads/main' }],
    });

    expect(pushed.refs).toMatchObject([{ status: 'updated', head }]);
    const { oid } = lfsPointerFor(bytes).pointer;
    expect(tau.uploadCount()).toBe(1);
    expect(
      createHash('sha256')
        .update(tau.objects.get(oid) ?? new Uint8Array())
        .digest('hex'),
    ).toBe(oid);

    const clonePath = join(root, 'clone');
    await mkdir(clonePath);
    const clone = createNativeGitRevisionPort({
      repositoryPath: clonePath,
      gitExecutable: bundledGit,
      tauCredential,
    });
    await clone.init({ author });
    await clone.setRemote({ name: 'tau', url: tau.url });
    await clone.fetch({ remote: 'tau', refs: ['refs/heads/main'] });
    const restored = await clone.readTree(head);

    expect(restored?.get('models/bracket.step')).toEqual(bytes);
    expect(new TextDecoder().decode(restored?.get('part.ts'))).toBe('export {};\n');
    expect(tau.batches().filter(({ operation }) => operation === 'download')).toHaveLength(1);
  }, 180_000);
});
