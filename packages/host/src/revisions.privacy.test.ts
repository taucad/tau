/**
 * No machine identity enters a commit (blueprint A1, I1, I3, Q11).
 *
 * The OS login name and the environment's mail and author variables are set to
 * sentinels, then every native entry point mints through native Git: the
 * desktop and `tau serve` composition (`createProjectRevisions` with
 * `hostRevisionActor`, before and after the renderer's `setActor`, and wired
 * with a token's account) and `tau revisions save` (`openProjectRevisions`,
 * with and without an account). Every object in the store is then read back
 * and searched for the sentinels.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type * as Os from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hostRevisionActor } from '#revision-actor.js';
import { createProjectRevisions, hostDeviceId, openProjectRevisions, requireRevisionToolchain } from '#revisions.js';

const sentinel = vi.hoisted(() => ({
  login: 'sentinel-os-login-q7x',
  email: 'sentinel-env-email-q7x@example.invalid',
  authorEmail: 'sentinel-git-author-q7x@example.invalid',
  authorName: 'Sentinel Git Author Q7x',
  committerEmail: 'sentinel-git-committer-q7x@example.invalid',
}));

/* The machine's login name, as `os.userInfo()` answers it to every module this host loads. */
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof Os>();
  const userInfo = (() => ({ ...os.userInfo(), username: sentinel.login })) as typeof os.userInfo;
  return { ...os, default: { ...os, userInfo }, userInfo };
});

const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

/* eslint-disable @typescript-eslint/naming-convention -- process environment names, as a shell sets them. */
const environment = {
  EMAIL: sentinel.email,
  GIT_AUTHOR_EMAIL: sentinel.authorEmail,
  GIT_AUTHOR_NAME: sentinel.authorName,
  GIT_COMMITTER_EMAIL: sentinel.committerEmail,
} as const;
/* eslint-enable @typescript-eslint/naming-convention -- the environment names end here. */

const roots: string[] = [];

beforeAll(() => {
  Object.assign(process.env, environment);
});

afterAll(async () => {
  delete process.env['EMAIL'];
  delete process.env['GIT_AUTHOR_EMAIL'];
  delete process.env['GIT_AUTHOR_NAME'];
  delete process.env['GIT_COMMITTER_EMAIL'];
  delete process.env['TAU_CONFIG_DIR'];
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { force: true, recursive: true })));
});

const projectId = 'proj_PPPPPPPPPPPPPPPPPPPPP';

/**
 * Record the files through one long-lived host's channel, as the renderer's *Save* does.
 *
 * @param revisions - The host.
 * @param workspaceRoot - Its project directory.
 * @param content - What `main.ts` becomes before the save.
 */
const saveOverChannel = async (
  revisions: ReturnType<typeof createProjectRevisions>,
  workspaceRoot: string,
  content: string,
): Promise<void> => {
  await vi.waitFor(() => {
    expect(revisions.status().checkoutId).toBeDefined();
  });
  const before = revisions.status().headRevisionId;
  await writeFile(join(workspaceRoot, 'main.ts'), content);
  await revisions.channel.request({ command: 'saveRevision' });
  await vi.waitFor(
    () => {
      expect(revisions.status().headRevisionId).not.toBe(before);
    },
    { timeout: 30_000 },
  );
};

describe.runIf(gitToolchainOnPath)('no machine identity enters a commit', () => {
  it('keeps the OS login name and environment addresses out of every object a native host writes', async () => {
    /* The sentinel reached the host: its own device id, which never leaves it, is built from the login name. */
    expect(hostDeviceId).toContain(sentinel.login);
    const root = await mkdtemp(join(tmpdir(), 'tau-host-privacy-'));
    roots.push(root);
    process.env['TAU_CONFIG_DIR'] = join(root, 'config');
    const workspaceRoot = join(root, 'project');
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', workspaceRoot]);

    /* The desktop: no session yet (pseudonym), then the renderer's `setActor`. */
    const desktop = createProjectRevisions({ via: 'desktop', workspaceRoot, projectId });
    try {
      await saveOverChannel(desktop, workspaceRoot, 'export const size = 1;\n');
      await desktop.channel.request({
        command: 'setActor',
        actor: { kind: 'user', id: 'usr_desktop1', name: 'Desk Person' },
      });
      await saveOverChannel(desktop, workspaceRoot, 'export const size = 2;\n');
    } finally {
      await desktop.release();
    }

    /* `tau serve` with a token: wired with that token's account. */
    const served = createProjectRevisions({
      via: 'desktop',
      workspaceRoot,
      projectId,
      actor: hostRevisionActor({ kind: 'user', id: 'usr_serve1' }),
    });
    try {
      await saveOverChannel(served, workspaceRoot, 'export const size = 3;\n');
    } finally {
      await served.release();
    }

    /* `tau revisions save`, with a token's account and without one. */
    for (const [content, actor] of [
      ['export const size = 4;\n', { kind: 'user', id: 'usr_cli1' }],
      ['export const size = 5;\n', undefined],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- each save is its own terminal process, in order.
      await writeFile(join(workspaceRoot, 'main.ts'), content);
      // oxlint-disable-next-line no-await-in-loop -- each save is its own terminal process, in order.
      const revisions = await openProjectRevisions({
        workspaceRoot,
        projectId,
        ...(actor === undefined ? {} : { actor }),
      });
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential saves.
        expect(await revisions.save()).toMatchObject({ status: 'saved' });
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- sequential saves.
        await revisions.close();
      }
    }

    /* Every object byte, and every ref name, searched for each sentinel. */
    const store = join(workspaceRoot, '.git');
    const objects = execFileSync('git', ['-C', store, 'cat-file', '--batch-all-objects', '--batch'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const references = execFileSync('git', ['-C', store, 'for-each-ref', '--format=%(refname)'], {
      encoding: 'utf8',
    });
    expect(objects.length).toBeGreaterThan(0);
    for (const value of Object.values(sentinel)) {
      expect(objects.includes(Buffer.from(value)), value).toBe(false);
      expect(references, value).not.toContain(value);
    }

    /* And each leg recorded who it was handed. */
    const authors = execFileSync('git', ['-C', store, 'log', '--all', '--format=%an|%ae'], {
      encoding: 'utf8',
    });
    const pseudonym = hostRevisionActor()({ runId: undefined, trigger: 'save' });
    const anonymousId = pseudonym?.kind === 'user' ? pseudonym.id : '';
    expect(anonymousId).toMatch(/^anon:/u);
    expect(authors).toContain(`Anonymous|${anonymousId}@users.noreply.tau.new`);
    expect(authors).toContain('Desk Person|usr_desktop1@users.noreply.tau.new');
    expect(authors).toContain('usr_serve1|usr_serve1@users.noreply.tau.new');
    expect(authors).toContain('usr_cli1|usr_cli1@users.noreply.tau.new');
  }, 180_000);
});
