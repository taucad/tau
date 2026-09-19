import { fork } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';

const roots: string[] = [];
const writers: NodeAuthorityWriter[] = [];

const root = async (suffix = ''): Promise<string> => {
  const created = await mkdtemp(join(tmpdir(), `tau-writer-${suffix}`));
  roots.push(created);
  return created;
};

afterEach(async () => {
  await Promise.all(writers.splice(0).map(async (writer) => writer.release()));
  await Promise.all(roots.splice(0).map(async (directory) => rm(directory, { force: true, recursive: true })));
});

const nextMessage = async (child: ReturnType<typeof fork>): Promise<unknown> =>
  new Promise((resolve, reject) => {
    child.once('message', (message) => {
      resolve(message);
    });
    child.once('error', (error) => {
      reject(error);
    });
    child.once('exit', (code, signal) => {
      reject(new Error(`fixture exited early: ${String(code)} ${String(signal)}`));
    });
  });

const acquireEventually = async (authorityRoot: string): Promise<NodeAuthorityWriter> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each probe must observe the prior kernel-lock result.
      return await acquireNodeAuthorityWriter({ authorityRoot });
    } catch (error) {
      lastError = error;
      // oxlint-disable-next-line eslint/no-await-in-loop -- bounded wait for orphaned holder pipe teardown.
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 20);
      });
    }
  }
  throw lastError;
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('Node authority writer', () => {
  it('should refuse a competing owner and accept a pre-existing inert file', async () => {
    const authorityRoot = await root();
    await writeFile(join(authorityRoot, 'authority.writer.lock'), 'stale pid-like text');
    const first = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(first);

    await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
      name: 'NodeAuthorityWriterError',
      code: 'AUTHORITY_ALREADY_OWNED',
    });
  });

  it('should own distinct roots containing spaces and shell metacharacters independently', async () => {
    const parent = await root('space ');
    const firstRoot = join(parent, 'one ; $(false)');
    const secondRoot = join(parent, 'two & still-data');
    await mkdir(firstRoot);
    await mkdir(secondRoot);
    const first = await acquireNodeAuthorityWriter({ authorityRoot: firstRoot });
    const second = await acquireNodeAuthorityWriter({ authorityRoot: secondRoot });
    writers.push(first, second);

    expect(first.lockPath).toContain('one ; $(false)');
    expect(second.lockPath).toContain('two & still-data');
  });

  it('should release the parent-owned descriptor idempotently', async () => {
    const authorityRoot = await root();
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });
    await writer.release();
    await writer.release();
    await expect(writer.assertCurrent()).rejects.toMatchObject({ code: 'AUTHORITY_LOCK_UNAVAILABLE' });

    const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(replacement);
  });

  it('should release the native owner after its parent is killed', async () => {
    const authorityRoot = await root();
    const fixture = join(import.meta.dirname, 'authority-writer-lock.fixture.ts');
    const owner = fork(fixture, [authorityRoot], {
      execArgv: ['--import', 'tsx'],
      stdio: ['pipe', 'ignore', 'inherit', 'ipc'],
    });
    try {
      expect(await nextMessage(owner)).toBe('ready');
      expect(owner.kill('SIGKILL')).toBe(true);
      await new Promise<void>((resolve) => {
        owner.once('close', () => {
          resolve();
        });
      });

      const replacement = await acquireEventually(authorityRoot);
      writers.push(replacement);
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) {
        owner.kill('SIGKILL');
      }
    }
  });

  it('should abort startup before spawning an owner', async () => {
    const authorityRoot = await root();
    const controller = new AbortController();
    controller.abort(new Error('test abort'));

    await expect(acquireNodeAuthorityWriter({ authorityRoot, signal: controller.signal })).rejects.toThrow(
      'test abort',
    );
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(writer);
  });

  it('should observe an abort immediately after acquisition starts', async () => {
    const authorityRoot = await root();
    const controller = new AbortController();
    const acquisition = acquireNodeAuthorityWriter({ authorityRoot, signal: controller.signal });
    controller.abort(new Error('immediate abort'));

    await expect(acquisition).rejects.toThrow('immediate abort');
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(writer);
  });

  it('should map root aliases to the same physical authority owner', async () => {
    const parent = await root('alias-');
    const authorityRoot = join(parent, 'physical');
    const alias = join(parent, 'alias');
    await mkdir(authorityRoot);
    await symlink(authorityRoot, alias);
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(writer);

    await expect(acquireNodeAuthorityWriter({ authorityRoot: alias })).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
  });

  it('should refuse a symbolic-link final lock component', async () => {
    const authorityRoot = await root();
    const outside = await root('outside-file-');
    const outsideFile = join(outside, 'shared.lock');
    await writeFile(outsideFile, 'outside');
    await symlink(outsideFile, join(authorityRoot, 'authority.writer.lock'));

    await expect(acquireNodeAuthorityWriter({ authorityRoot })).rejects.toMatchObject({
      code: 'AUTHORITY_LOCK_UNAVAILABLE',
    });
  });

  it('should refuse missing or non-directory authority roots without creating them', async () => {
    const parent = await root('invalid-');
    const missing = join(parent, 'missing');
    const file = join(parent, 'file');
    await writeFile(file, 'not a directory');

    await expect(acquireNodeAuthorityWriter({ authorityRoot: missing })).rejects.toThrow();
    await expect(acquireNodeAuthorityWriter({ authorityRoot: file })).rejects.toMatchObject({
      code: 'AUTHORITY_LOCK_UNAVAILABLE',
    });
    await expect(access(missing)).rejects.toThrow();
  });

  it('should make concurrent release callers wait for physical ownership release', async () => {
    const authorityRoot = await root();
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });

    await Promise.all([writer.release(), writer.release()]);
    const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(replacement);
  });
});

describe('unsupported platform refusal', () => {
  it('should fail closed before filesystem work on an unsupported platform', async () => {
    const fixture = join(import.meta.dirname, 'authority-writer-lock.unsupported.fixture.ts');
    const child = fork(fixture, [], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    try {
      const message: unknown = await nextMessage(child);
      expect(message).toHaveProperty('code', 'AUTHORITY_LOCK_UNSUPPORTED');
      expect(message).toHaveProperty('message');
      if (message === null || typeof message !== 'object') {
        throw new Error('Unsupported-platform fixture returned a non-object message.');
      }
      const messageText: unknown = 'message' in message ? message.message : undefined;
      expect(messageText).toContain('win32');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('should refuse Electron on an unqualified platform', async () => {
    const fixture = join(import.meta.dirname, 'authority-writer-lock.unsupported.fixture.ts');
    const child = fork(fixture, ['electron'], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    try {
      const message = await nextMessage(child);
      expect(message).toHaveProperty('code', 'AUTHORITY_LOCK_UNSUPPORTED');
      expect(message).toHaveProperty('message', expect.stringContaining('Electron'));
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});
