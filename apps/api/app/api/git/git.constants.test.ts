import { spawn } from 'node:child_process';
import process from 'node:process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ceilingRefusalMarker,
  gitLfsObjectKey,
  pktLine,
  preReceiveHookScript,
  projectIdFromRepository,
  serviceAdvertisementPrefix,
  storageLimitBytesByTier,
} from '#api/git/git.constants.js';
import * as constants from '#api/git/git.constants.js';

/* eslint-disable @typescript-eslint/naming-convention -- process environment variable names, not identifiers */
const admittedEnvironment: Readonly<Record<string, string>> = {
  TAU_GIT_PUSH_ADMITTED: '1',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

const runHook = async (
  ref: string | readonly string[],
  environment: Readonly<Record<string, string>> = admittedEnvironment,
  cwd?: string,
): Promise<{ code: number | undefined; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn('sh', [hookPath], {
      env: environment as NodeJS.ProcessEnv,
      ...(cwd === undefined ? {} : { cwd }),
    });
    const stderr: Array<Uint8Array<ArrayBuffer>> = [];
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
    child.stdin.end(
      (typeof ref === 'string' ? [ref] : ref)
        /* A bare name is a ref *creation*; a caller that needs a particular
           old/new pair (a deletion, a rewind) writes the whole hook line. */
        .map((name) => (name.includes(' ') ? `${name}\n` : `${'0'.repeat(40)} ${'1'.repeat(40)} ${name}\n`))
        .join(''),
    );
    child.on('close', (code) => {
      resolve({
        code: code ?? undefined,
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });

let hookDirectory: string;
let hookPath: string;

describe('Tau Hosted Remote constants', () => {
  beforeAll(async () => {
    hookDirectory = await mkdtemp(path.join(tmpdir(), 'tau-git-hook-'));
    hookPath = path.join(hookDirectory, 'pre-receive');
    await writeFile(hookPath, preReceiveHookScript, 'utf8');
    await chmod(hookPath, 0o755);
  });

  afterAll(async () => {
    await rm(hookDirectory, { recursive: true, force: true });
  });

  it('accepts only the pushable ref namespaces (A39), as the installed hook itself', async () => {
    for (const ref of [
      'refs/heads/main',
      'refs/tags/v1',
      'refs/tau/chats/chat_1',
      'refs/tau/evidence/e1',
      'refs/tau/artifacts/a1',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const accepted = await runHook(ref);
      expect(accepted.code, `${ref}: ${accepted.stderr}`).toBe(0);
    }

    for (const ref of [
      'refs/tau/owners/o1',
      'refs/tau/workspaces/w1',
      'refs/tau/revisions/r1',
      'refs/tau/transactions/t1',
      'refs/tau/retention/records/r1',
      'refs/tau/head',
      'refs/remotes/origin/main',
      'refs/heads/sync/tau/main',
      'refs/heads/',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const refused = await runHook(ref);
      expect(refused.code, ref).toBe(1);
      expect(refused.stderr).toContain(ref === 'refs/heads/' ? 'host-local' : ref);
    }
  });

  /**
   * Ruling OQ4: no ref family is deletable, and the hook is the only place that
   * can say so. `receive.denyDeletes` is set on the spawn as well, but git
   * applies it to `refs/heads/*` alone — measured against git 2.55, a tag and a
   * `refs/tau/chats/*` ref were both deletable with it on (review C25).
   */
  it('refuses a deletion of every pushable ref family', async () => {
    for (const ref of ['refs/heads/main', 'refs/tags/v1', 'refs/tau/chats/chat_1', 'refs/tau/artifacts/a1']) {
      // oxlint-disable-next-line no-await-in-loop -- one hook run per ref, by design
      const refused = await runHook(`${'1'.repeat(40)} ${'0'.repeat(40)} ${ref}`);
      expect(refused.code, `${ref} was deletable: ${refused.stderr}`).toBe(1);
      expect(refused.stderr).toContain('never deletes a ref');
    }
  });

  it('refuses a push that did not come through the API admission check', async () => {
    const refused = await runHook('refs/heads/main', {});
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('only through the Tau API');
  });

  it('rejects a mixed push atomically when one ref is host-local', async () => {
    const refused = await runHook(['refs/heads/main', 'refs/heads/sync/tau/main']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('refs/heads/sync/tau/main');
  });

  it('installs the same allow-list into the pre-receive hook', () => {
    for (const prefix of ['refs/heads/*', 'refs/tags/*', 'refs/tau/chats/*']) {
      expect(preReceiveHookScript).toContain(prefix);
    }
    expect(preReceiveHookScript).toContain('TAU_GIT_PUSH_ADMITTED');
    expect(preReceiveHookScript).toContain('GIT_QUARANTINE_PATH');
    expect(preReceiveHookScript.startsWith('#!/bin/sh\n')).toBe(true);
  });

  /**
   * D12: dumb HTTP is gone, and so is the hook that kept its layout current.
   * There is no `post-receive` at all — materialization is derived from the
   * committed ref-map difference (D9/D19), never spooled by a hook.
   */
  it('installs no post-receive hook and never runs update-server-info', () => {
    expect(preReceiveHookScript).not.toContain('update-server-info');
    expect(Object.keys(constants)).not.toContain('postReceiveHookScript');
    expect(Object.keys(constants)).not.toContain('publishedTagSpoolFile');
    expect(Object.keys(constants)).not.toContain('isDumbHttpPath');
    expect(Object.keys(constants)).not.toContain('dumbHttpContentType');
  });

  /**
   * D20, measured through the hook rather than reasoned about: a push that
   * would take the repository past its ceiling is refused *with the files it
   * brings*, because "your repository is too large" is not something a person
   * can act on and "remove these three" is.
   *
   * The ceiling is the lease's remaining headroom, which the service computes
   * from the manifest's live pack bytes and passes in; the hook only compares
   * it against the quarantine `receive-pack` has already written.
   */
  it('refuses a push past the D20 ceiling and names the largest files it adds', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'tau-git-ceiling-'));
    const quarantine = await mkdtemp(path.join(tmpdir(), 'tau-git-quarantine-'));
    try {
      /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
      const fixtureEnvironment = {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        HOME: fixture,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      } as unknown as NodeJS.ProcessEnv;
      /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
      const git = async (...args: readonly string[]): Promise<void> =>
        new Promise((resolve, reject) => {
          const child = spawn('git', [...args], {
            cwd: fixture,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: fixtureEnvironment,
          });
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
              return;
            }
            reject(new Error(`git ${args.join(' ')}`));
          });
        });
      const read = async (...args: readonly string[]): Promise<string> =>
        new Promise((resolve) => {
          const child = spawn('git', [...args], {
            cwd: fixture,
            stdio: ['ignore', 'pipe', 'ignore'],
            env: fixtureEnvironment,
          });
          const out: Array<Uint8Array<ArrayBuffer>> = [];
          child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => out.push(chunk));
          child.on('close', () => {
            resolve(Buffer.concat(out).toString('utf8').trim());
          });
        });

      await git('init', '--quiet', '--initial-branch=main', '.');
      await git('config', 'user.email', 'w4@tau.test');
      await git('config', 'user.name', 'W4');
      await writeFile(path.join(fixture, 'huge.bin'), Buffer.alloc(64 * 1024, 7));
      await writeFile(path.join(fixture, 'part.ts'), 'export const width = 10;\n', 'utf8');
      await git('add', '.');
      await git('commit', '--quiet', '-m', 'over the ceiling');
      const head = await read('rev-parse', 'HEAD');
      /* The refs a push carries are not reachable from the repository's own
         refs yet, which is what `--not --all` means; dropping the branch is how
         a fixture stands in for the quarantine's unreferenced objects. */
      await git('update-ref', '-d', 'refs/heads/main');
      await writeFile(path.join(quarantine, 'pack'), Buffer.alloc(4096, 1));

      const refused = await runHook(
        `${'0'.repeat(40)} ${head} refs/heads/main`,
        {
          /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
          PATH: process.env['PATH'] ?? '/usr/bin:/bin',
          TAU_GIT_PUSH_ADMITTED: '1',
          TAU_GIT_CEILING_REMAINING_BYTES: '16',
          GIT_QUARANTINE_PATH: quarantine,
          /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
        },
        fixture,
      );

      expect(refused.code, refused.stderr).toBe(1);
      /* The refusal *opens* with the marker, which is what lets the client
         classify a status-less `pre-receive` refusal as the D20 ceiling
         (`packages/revisions/src/remotes.ts`) while showing these same words. */
      expect(refused.stderr.startsWith(ceilingRefusalMarker), refused.stderr).toBe(true);
      expect(refused.stderr).toContain('huge.bin');
      expect(refused.stderr).toContain('part.ts');
      expect(refused.stderr).toContain('nothing was written');
      /* Largest first, so the first name in the list is the one worth removing. */
      expect(refused.stderr.indexOf('huge.bin')).toBeLessThan(refused.stderr.indexOf('part.ts'));
    } finally {
      await rm(fixture, { recursive: true, force: true });
      await rm(quarantine, { recursive: true, force: true });
    }
  });

  /**
   * Review F6: a bound that cannot measure what is arriving has not been
   * satisfied. The admission flag above it already fails closed; these two now
   * do too, so a git without object quarantine refuses rather than waving a
   * push past both the plan and D20.
   */
  it('refuses a bounded push it cannot measure, rather than passing it', async () => {
    const refused = await runHook('refs/heads/main', {
      /* eslint-disable @typescript-eslint/naming-convention -- process environment names */
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      TAU_GIT_PUSH_ADMITTED: '1',
      TAU_GIT_QUOTA_REMAINING_BYTES: '4096',
      /* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */
    });

    expect(refused.code, refused.stderr).toBe(1);
    expect(refused.stderr).toContain('cannot be measured');
    expect(refused.stderr).toContain('nothing was written');
  });

  /** An unbounded push — no plan figure, no ceiling — is not measured and not refused. */
  it('passes a push no bound was set for', async () => {
    const accepted = await runHook('refs/heads/main');

    expect(accepted.code, accepted.stderr).toBe(0);
  });

  it('spells one LFS object path the way packages/revisions does', () => {
    const oid = `${'ab'}${'cd'}${'0'.repeat(60)}`;
    expect(gitLfsObjectKey('proj_1', oid)).toBe(`git-lfs/proj_1/lfs/objects/ab/cd/${oid}`);
  });

  it('reads a repository name with or without the .git suffix, and refuses a traversal', () => {
    expect(projectIdFromRepository('proj_abc.git')).toBe('proj_abc');
    expect(projectIdFromRepository('proj_abc')).toBe('proj_abc');
    expect(projectIdFromRepository('../../etc/passwd')).toBeUndefined();
    expect(projectIdFromRepository('a/b.git')).toBeUndefined();
    expect(projectIdFromRepository('')).toBeUndefined();
  });

  it('frames the service advertisement as git does', () => {
    expect(pktLine('a\n')).toBe('0006a\n');
    expect(serviceAdvertisementPrefix('git-upload-pack')).toBe('001e# service=git-upload-pack\n0000');
    expect(serviceAdvertisementPrefix('git-receive-pack')).toBe('001f# service=git-receive-pack\n0000');
  });

  it('gives the free tier no allowance, so the entitlement refusal is the only one it can see', () => {
    expect(storageLimitBytesByTier.free).toBe(0);
    expect(storageLimitBytesByTier.pro).toBe(10 * 1024 ** 3);
    expect(storageLimitBytesByTier.enterprise).toBeGreaterThan(storageLimitBytesByTier.pro);
  });
});
