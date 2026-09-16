import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dumbHttpContentType,
  gitLfsObjectKey,
  isDumbHttpPath,
  pktLine,
  postReceiveHookScript,
  preReceiveHookScript,
  projectIdFromRepository,
  serviceAdvertisementPrefix,
  storageLimitBytesByTier,
} from '#api/git/git.constants.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- a process environment variable name, not an identifier
const admittedEnvironment: Readonly<Record<string, string>> = {
  TAU_GIT_PUSH_ADMITTED: '1',
};

const runHook = async (
  ref: string | readonly string[],
  environment: Readonly<Record<string, string>> = admittedEnvironment,
): Promise<{ code: number | undefined; stderr: string }> =>
  new Promise((resolve) => {
    const child = spawn('sh', [hookPath], {
      env: environment as NodeJS.ProcessEnv,
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
    expect(postReceiveHookScript).toContain('git update-server-info');
    expect(postReceiveHookScript).not.toContain('git gc');
  });

  it('spells one LFS object path the way packages/revisions does', () => {
    const oid = `${'ab'}${'cd'}${'0'.repeat(60)}`;
    expect(gitLfsObjectKey('proj_1', oid)).toBe(`git-lfs/proj_1/lfs/objects/ab/cd/${oid}`);
  });

  it('serves only the dumb-HTTP layout', () => {
    expect(isDumbHttpPath('HEAD')).toBe(true);
    expect(isDumbHttpPath('info/refs')).toBe(true);
    expect(isDumbHttpPath('objects/info/packs')).toBe(true);
    expect(isDumbHttpPath(`objects/ab/${'c'.repeat(38)}`)).toBe(true);
    expect(isDumbHttpPath(`objects/pack/pack-${'a'.repeat(40)}.pack`)).toBe(true);
    expect(isDumbHttpPath('refs/tau/chats/chat_1')).toBe(true);

    expect(isDumbHttpPath('config')).toBe(false);
    expect(isDumbHttpPath('hooks/pre-receive')).toBe(false);
    expect(isDumbHttpPath('logs/HEAD')).toBe(false);
    expect(isDumbHttpPath('refs/../config')).toBe(false);
    expect(isDumbHttpPath('../../etc/passwd')).toBe(false);
  });

  it('types dumb-HTTP bodies the way git does', () => {
    expect(dumbHttpContentType(`objects/pack/pack-${'a'.repeat(40)}.pack`)).toBe('application/x-git-packed-objects');
    expect(dumbHttpContentType(`objects/pack/pack-${'a'.repeat(40)}.idx`)).toBe('application/x-git-packed-objects-toc');
    expect(dumbHttpContentType(`objects/ab/${'c'.repeat(38)}`)).toBe('application/x-git-loose-object');
    expect(dumbHttpContentType('HEAD')).toBe('text/plain');
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
