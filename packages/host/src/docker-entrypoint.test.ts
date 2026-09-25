/* eslint-disable @typescript-eslint/naming-convention -- process environment names, as the image sets them */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/*
 * The cloud host image's entrypoint (D21), run as the image runs it but with a
 * stand-in `node` on PATH that records how it would have started the daemon.
 * The Hosted Remote is a bare repository on disk at the path the API serves,
 * so the clone is real git and nothing needs a network or Docker.
 */

const entrypoint = fileURLToPath(new URL('../docker-entrypoint.sh', import.meta.url));
const projectId = 'proj-bound';
const pushCredential = 'taugit_push-credential-for-the-bound-project';

const hasGit = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tau-host-entrypoint-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();

/** A Hosted Remote holding one revision on `main`, where `TAU_API_URL` says the project lives. */
const hostedRemote = async (): Promise<string> => {
  const apiUrl = `file://${join(root, 'api')}`;
  const bare = join(root, 'api', 'v1', 'git', `${projectId}.git`);
  await mkdir(bare, { recursive: true });
  git(bare, 'init', '--quiet', '--bare', '--initial-branch=main');
  const author = join(root, 'author');
  await mkdir(author);
  git(author, 'init', '--quiet', '--initial-branch=main');
  await writeFile(join(author, 'part.ts'), 'export const part = 1;\n');
  git(author, 'add', 'part.ts');
  git(author, '-c', 'user.name=Owner', '-c', 'user.email=owner@tau.test', 'commit', '--quiet', '-m', 'Rev 1');
  git(author, 'push', '--quiet', bare, 'main');
  return apiUrl;
};

/** Run the entrypoint; the stand-in `node` writes `TAU_API_TOKEN` and its argv to `daemon.txt`, a line each. */
const runEntrypoint = async (environment: Record<string, string>) => {
  const bin = join(root, 'bin');
  await mkdir(bin, { recursive: true });
  const stand = join(bin, 'node');
  await writeFile(stand, `#!/bin/sh\nprintf '%s\\n' "$TAU_API_TOKEN" "$@" > "${join(root, 'daemon.txt')}"\n`);
  await chmod(stand, 0o755);
  return spawnSync('sh', [entrypoint], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      HOME: root,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      TAU_CONFIG_DIR: join(root, 'config'),
      TAU_HOST_WORKSPACE: join(root, 'workspace'),
      TAU_HOST_DEVICE_ID: 'agent_cloud',
      TAU_HOST_CREDENTIAL: 'device-credential',
      ...environment,
    },
  });
};

describe('docker-entrypoint.sh', () => {
  it.runIf(hasGit)(
    'should clone the bound project under the tau remote and serve it with the push credential',
    async () => {
      const apiUrl = await hostedRemote();

      const run = await runEntrypoint({
        TAU_API_URL: apiUrl,
        TAU_HOST_PROJECT_ID: projectId,
        TAU_HOST_GIT_CREDENTIAL: pushCredential,
      });

      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      const clone = join(root, 'workspace', projectId);
      await expect(readFile(join(clone, 'part.ts'), 'utf8')).resolves.toBe('export const part = 1;\n');
      expect(git(clone, 'remote', 'get-url', 'tau')).toBe(`${apiUrl}/v1/git/${projectId}.git`);
      expect(git(clone, 'branch', '--show-current')).toBe('main');
      /* P40: the credential is never written under the project. */
      await expect(readFile(join(clone, '.git', 'config'), 'utf8')).resolves.not.toContain(pushCredential);
      const daemonLines = await readFile(join(root, 'daemon.txt'), 'utf8');
      const [token, ...argv] = daemonLines.trimEnd().split('\n');
      expect(token).toBe(pushCredential);
      expect(argv).toEqual(expect.arrayContaining(['serve', `--workspace=${clone}`, `--relay=${apiUrl}`]));
    },
    30_000,
  );

  it.runIf(hasGit)(
    'should keep the clone and its work across a container restart',
    async () => {
      const apiUrl = await hostedRemote();
      const environment = {
        TAU_API_URL: apiUrl,
        TAU_HOST_PROJECT_ID: projectId,
        TAU_HOST_GIT_CREDENTIAL: pushCredential,
      };
      await runEntrypoint(environment);
      const clone = join(root, 'workspace', projectId);
      await writeFile(join(clone, 'unsaved.ts'), 'export const unsaved = true;\n');

      const restart = await runEntrypoint(environment);

      expect(restart.status).toBe(0);
      await expect(readFile(join(clone, 'unsaved.ts'), 'utf8')).resolves.toBe('export const unsaved = true;\n');
    },
    30_000,
  );

  /*
   * RV-W10 F3: registration is a row, so a project nobody pushed yet clones
   * empty — and over protocol v0, which is what the Hosted Remote speaks, an
   * empty advertisement names no HEAD. The clone must still land on `main`.
   */
  it.runIf(hasGit)(
    'should put an empty project on main even over protocol v0',
    async () => {
      const bare = join(root, 'api', 'v1', 'git', `${projectId}.git`);
      await mkdir(bare, { recursive: true });
      git(bare, 'init', '--quiet', '--bare', '--initial-branch=main');

      const run = await runEntrypoint({
        TAU_API_URL: `file://${join(root, 'api')}`,
        TAU_HOST_PROJECT_ID: projectId,
        TAU_HOST_GIT_CREDENTIAL: pushCredential,
        /* `git -c protocol.version=0`, carried through the environment. */
        GIT_CONFIG_PARAMETERS: "'protocol.version=0'",
      });

      expect(run.status).toBe(0);
      const clone = join(root, 'workspace', projectId);
      expect(git(clone, 'symbolic-ref', 'HEAD')).toBe('refs/heads/main');
    },
    30_000,
  );

  it('should refuse to start without the bound project', async () => {
    const run = await runEntrypoint({ TAU_API_URL: 'file:///nowhere', TAU_HOST_GIT_CREDENTIAL: pushCredential });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('TAU_HOST_PROJECT_ID is required');
  });
});
