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
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Tau', email: 'tau@example.com' };

type HelperFixture = Readonly<{
  url: string;
  repositoryPath: string;
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
const helperFixture = async (authenticated = true): Promise<HelperFixture> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-revisions-helper-'));
  const fixture = await startGitHttpBackend({
    root,
    ...(authenticated ? { requireAuthorization: 'Bearer the-valid-app-token' } : {}),
  });
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
    repositoryPath,
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
      execFileSync('git', ['config', 'user.name', author.name], { cwd: repositoryPath });
      execFileSync('git', ['config', 'user.email', author.email], { cwd: repositoryPath });
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

describe.runIf(gitToolchainOnPath)('native git credential helper exclusivity (ruling G1)', () => {
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

  it('should pin a push to the configured URL instead of a different pushurl', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port(() => ({
        repositoryUrl: fixture.url,
        authorization: 'Bearer the-valid-app-token',
      }));
      execFileSync(
        'git',
        ['config', 'remote.origin.pushurl', join(fixture.repositoryPath, 'not-the-approved-repository.git')],
        { cwd: fixture.repositoryPath },
      );
      execFileSync('git', ['commit', '--allow-empty', '-m', 'Local revision'], { cwd: fixture.repositoryPath });
      const result = await port.push({ remote: 'origin', refs: [{ name: 'refs/heads/main' }], atomic: true });
      expect(result.refs[0]?.status).toBe('updated');
      const remote = await port.listRemoteRefs('origin');
      expect(remote.some((ref) => ref.name === 'refs/heads/main')).toBe(true);
      expect(await fixture.helperCalls()).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 180_000);

  it('should refuse a tagged GitHub remote with no scoped credential before consulting personal helpers', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port();
      await port.setRemote({ name: 'origin', url: fixture.url, provider: 'github', repositoryId: '99' });
      await expect(port.listRemoteRefs('origin')).rejects.toMatchObject({ code: 'REMOTE_REAUTHORIZATION_REQUIRED' });
      expect(await fixture.helperCalls()).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 180_000);

  it.each(['insteadOf', 'pushInsteadOf'])(
    'should refuse a %s destination rewrite before any transfer',
    async (kind) => {
      const fixture = await helperFixture();
      try {
        const port = await fixture.port(() => ({
          repositoryUrl: fixture.url,
          authorization: 'Bearer the-valid-app-token',
        }));
        execFileSync('git', ['config', `url.https://other.example/.${kind}`, fixture.url], {
          cwd: fixture.repositoryPath,
        });
        execFileSync('git', ['commit', '--allow-empty', '-m', 'Local revision'], { cwd: fixture.repositoryPath });
        await expect(
          port.push({ remote: 'origin', repositoryUrl: fixture.url, refs: [{ name: 'refs/heads/main' }] }),
        ).rejects.toMatchObject({ code: 'INVALID_TRANSPORT' });
        expect(await fixture.helperCalls()).toEqual([]);
      } finally {
        await fixture.close();
      }
    },
    180_000,
  );

  it('should refuse a destination replaced after approval before using its helpers', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port();
      execFileSync('git', ['commit', '--allow-empty', '-m', 'Local revision'], { cwd: fixture.repositoryPath });
      await expect(
        port.push({
          remote: 'origin',
          repositoryUrl: 'https://github.com/approved/repository.git',
          refs: [{ name: 'refs/heads/main' }],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSPORT' });
      expect(await fixture.helperCalls()).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 180_000);

  it('should allow anonymous public reads without ambient credentials but refuse writes', async () => {
    const fixture = await helperFixture(false);
    try {
      const port = await fixture.port();
      await port.setRemote({ name: 'origin', url: fixture.url, provider: 'github', repositoryId: '99' });
      await expect(port.listRemoteRefs('origin')).resolves.toEqual([]);
      execFileSync('git', ['commit', '--allow-empty', '-m', 'Local revision'], { cwd: fixture.repositoryPath });
      await expect(port.push({ remote: 'origin', refs: [{ name: 'refs/heads/main' }] })).rejects.toMatchObject({
        code: 'REMOTE_REAUTHORIZATION_REQUIRED',
      });
      expect(await fixture.helperCalls()).toEqual([]);
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

describe.runIf(gitToolchainOnPath)('GitHub SSH credentials', () => {
  it('blocks an HTTPS read rewritten to ambient SSH', async () => {
    const fixture = await helperFixture();
    try {
      const port = await fixture.port();
      await port.setRemote({ name: 'origin', url: 'https://github.com/owner/project.git' });
      execFileSync('git', ['config', 'url.git@github.com:.insteadOf', 'https://github.com/'], {
        cwd: fixture.repositoryPath,
      });
      const sshLog = join(fixture.repositoryPath, 'ssh-called');
      execFileSync('git', ['config', 'core.sshCommand', `sh -c 'echo called > ${sshLog}; exit 1'`], {
        cwd: fixture.repositoryPath,
      });
      await expect(port.fetch({ remote: 'origin' })).rejects.toThrow('Native Git failed');
      await expect(readFile(sshLog)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await fixture.helperCalls()).toStrictEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it.each(['git@github.com:owner/project.git', 'ssh://git@github.com/owner/project.git'])(
    'rejects %s before native authentication',
    async (url) => {
      const fixture = await helperFixture();
      try {
        const port = await fixture.port();
        await port.setRemote({ name: 'origin', url, provider: 'github', repositoryId: '1' });
        await expect(port.fetch({ remote: 'origin' })).rejects.toThrow('using HTTPS');
        expect(await fixture.helperCalls()).toStrictEqual([]);
      } finally {
        await fixture.close();
      }
    },
  );
});
