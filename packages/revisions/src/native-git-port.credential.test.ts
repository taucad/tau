/**
 * Ruling G1 (D4): a remote Tau credits is Tau's alone.
 *
 * Native git used to fall back to the person's own credential helper when
 * Tau's App token was missing or refused, and push as their personal identity.
 * Here the person's helpers — generic and URL-scoped, the shape
 * `gh auth setup-git` writes — log every call, and the wrapper hides the
 * machine's global and system config so only this repository's helpers can
 * answer.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import type { NativeGitRemoteCredential } from '#native-git-port.js';
import type { RevisionPort } from '#revision-port.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { gitOnPath } from '#test/native-git-harness.js';

const author = { name: 'Tau', email: 'tau@example.com' };

type HelperFixture = Readonly<{
  url: string;
  /** Every helper call, one line each: `generic` or `scoped`. */
  helperCalls: () => Promise<readonly string[]>;
  close: () => Promise<void>;
  port: (credential?: () => NativeGitRemoteCredential | undefined) => Promise<RevisionPort>;
}>;

/**
 * A remote that refuses every credential but one, and a project whose own
 * credential helpers record that they ran.
 *
 * @returns The fixture.
 */
const helperFixture = async (): Promise<HelperFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-revisions-helper-'));
  const fixture = await startGitHttpBackend({ root, requireAuthorization: 'Bearer the-valid-app-token' });
  const repositoryPath = join(root, 'project');
  const helperLog = join(root, 'helper.log');
  const wrapper = join(root, 'git-isolated');
  await mkdir(repositoryPath, { recursive: true });
  await writeFile(
    wrapper,
    ['#!/bin/sh', 'GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 exec git "$@"', ''].join('\n'),
    { mode: 0o755 },
  );
  return {
    url: fixture.url,
    helperCalls: async () => {
      try {
        const log = await readFile(helperLog, 'utf8');
        return log.split('\n').filter((line) => line !== '');
      } catch {
        return [];
      }
    },
    close: async () => {
      await fixture.close();
      await rm(root, { force: true, recursive: true });
    },
    port: async (credential) => {
      const port = createNativeGitRevisionPort({
        repositoryPath,
        gitExecutable: wrapper,
        ...(credential === undefined ? {} : { remoteCredential: credential }),
      });
      await port.init({ author });
      await port.setRemote({ name: 'origin', url: fixture.url });
      execFileSync('git', ['config', 'credential.helper', `!f() { echo generic >> ${helperLog}; }; f`], {
        cwd: repositoryPath,
      });
      execFileSync('git', ['config', `credential.${fixture.url}.helper`, `!f() { echo scoped >> ${helperLog}; }; f`], {
        cwd: repositoryPath,
      });
      return port;
    },
  };
};

describe.runIf(gitOnPath)('native git credential helper exclusivity (ruling G1)', () => {
  it('should never run the user credential helpers when Tau supplied the credential', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port(() => ({ repositoryUrl: fixture.url, authorization: 'Bearer expired-token' }));

      await expect(port.listRemoteRefs('origin')).rejects.toMatchObject({
        name: 'RevisionPortError',
        code: 'REMOTE_REAUTHORIZATION_REQUIRED',
      });
      await expect(fixture.helperCalls()).resolves.toStrictEqual([]);
    } finally {
      await fixture.close();
    }
  }, 180_000);

  it('should refuse a remote Tau marked unavailable before git runs', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port(() => ({
        repositoryUrl: fixture.url,
        unavailable: 'Your GitHub connection needs to be renewed.',
      }));

      await expect(port.listRemoteRefs('origin')).rejects.toMatchObject({
        name: 'RevisionPortError',
        code: 'REMOTE_REAUTHORIZATION_REQUIRED',
        message: 'Your GitHub connection needs to be renewed.',
      });
      await expect(fixture.helperCalls()).resolves.toStrictEqual([]);
    } finally {
      await fixture.close();
    }
  }, 180_000);

  it('should keep the user credential helpers for a remote Tau holds no credential for', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port();

      await expect(port.listRemoteRefs('origin')).rejects.toMatchObject({ name: 'RevisionPortError' });
      await expect(fixture.helperCalls()).resolves.toEqual(expect.arrayContaining(['generic', 'scoped']));
    } finally {
      await fixture.close();
    }
  }, 180_000);
});
