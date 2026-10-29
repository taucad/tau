import { fork, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createConnection, Server } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { acquireNodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';
import type { NodeAuthorityWriter } from '#backend/node/authority-writer-lock.js';

const roots: string[] = [];
const writers: NodeAuthorityWriter[] = [];
const children: Array<ReturnType<typeof fork>> = [];

const startOwner = (authorityRoot: string, mode = 'hold'): ReturnType<typeof fork> => {
  const child = fork(join(import.meta.dirname, 'authority-writer-lock.fixture.ts'), [authorityRoot, mode], {
    execArgv: ['--import', 'tsx'],
    stdio: ['pipe', 'ignore', 'inherit', 'ipc'],
  });
  children.push(child);
  return child;
};

const root = async (suffix = ''): Promise<string> => {
  const created = await mkdtemp(join(tmpdir(), `tau-writer-${suffix}`));
  roots.push(created);
  return created;
};

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise<void>((resolve) => {
          child.once('close', () => {
            resolve();
          });
        });
        child.kill('SIGKILL');
        await closed;
      }
    }),
  );
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

/**
 * Runs the disposable SMB fixture without stdin and retains stderr with elapsed time and exit status.
 * Prefers PowerShell 7 to reduce cold host startup within the fixture's 20-second bound; falls back to
 * Windows PowerShell only when PowerShell 7 is unavailable.
 */
const runNetworkFixture = (fixture: string, action: 'cleanup' | 'setup', environment: NodeJS.ProcessEnv): string => {
  const started = performance.now();
  const run = (shell: string): SpawnSyncReturns<string> =>
    spawnSync(shell, ['-NoProfile', '-NonInteractive', '-File', fixture, action], {
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
      windowsHide: true,
    });
  let shell = 'pwsh.exe';
  let result = run(shell);
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    shell = 'powershell.exe';
    result = run(shell);
  }
  /** Milliseconds. */
  const elapsed = Math.round(performance.now() - started);
  const diagnostics = `${action} via ${shell} after ${elapsed} ms (status ${String(result.status)}, signal ${String(result.signal)})\n${result.stderr}`;
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`Disposable SMB fixture ${diagnostics}`, { cause: result.error });
  }
  console.info(`Disposable SMB fixture ${diagnostics}`);
  return result.stdout;
};

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

describe.runIf(['darwin', 'linux', 'win32'].includes(process.platform))('Node authority writer', () => {
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

    expect(first.lockPath).not.toBe(second.lockPath);
    await first.assertCurrent();
    await second.assertCurrent();
  });

  it('should release the parent-owned descriptor idempotently', async () => {
    const authorityRoot = await root();
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(writer);
    await writer.release();
    await writer.release();
    await expect(writer.assertCurrent()).rejects.toMatchObject({ code: 'AUTHORITY_LOCK_UNAVAILABLE' });

    const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(replacement);
  });

  it('should release the native owner after its parent is killed', async () => {
    const authorityRoot = await root();
    const owner = startOwner(authorityRoot);
    try {
      expect(await nextMessage(owner)).toBe('ready');
      const closed = new Promise<void>((resolve) => {
        owner.once('close', () => {
          resolve();
        });
      });
      expect(owner.kill('SIGKILL')).toBe(true);
      await closed;

      const replacement = await acquireEventually(authorityRoot);
      writers.push(replacement);
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) {
        owner.kill('SIGKILL');
      }
    }
  });

  it('should refuse a competing process while ownership is alive', async () => {
    const authorityRoot = await root();
    const first = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(first);
    const contender = startOwner(authorityRoot, 'probe');
    expect(await nextMessage(contender)).toMatchObject({
      name: 'NodeAuthorityWriterError',
      code: 'AUTHORITY_ALREADY_OWNED',
    });
    await first.assertCurrent();
  });

  it('should admit only one of two simultaneously released process contenders', async () => {
    const authorityRoot = await root();
    const first = startOwner(authorityRoot, 'race');
    const second = startOwner(authorityRoot, 'race');
    expect(await Promise.all([nextMessage(first), nextMessage(second)])).toEqual(['waiting', 'waiting']);
    const results = Promise.all([nextMessage(first), nextMessage(second)]);
    first.send('acquire');
    second.send('acquire');
    const outcomes = await results;
    expect(outcomes.filter((outcome) => outcome === 'ready')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome !== 'ready')).toMatchObject({ code: 'AUTHORITY_ALREADY_OWNED' });
  });

  it('should transfer ownership to another process after explicit release', async () => {
    const authorityRoot = await root();
    const first = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(first);
    await first.release();
    const contender = startOwner(authorityRoot, 'probe');
    expect(await nextMessage(contender)).toEqual({ status: 'acquired-and-released' });
  });

  it.runIf(process.platform === 'win32')('should exclude a Windows case alias from a competing process', async () => {
    const authorityRoot = await root('case-');
    const first = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(first);
    const contender = startOwner(authorityRoot.toUpperCase(), 'probe');
    expect(await nextMessage(contender)).toMatchObject({ code: 'AUTHORITY_ALREADY_OWNED' });
  });

  it.runIf(process.platform === 'win32')(
    'should retain exclusion after pipe clients connect and disconnect',
    async () => {
      const authorityRoot = await root();
      const writer = await acquireNodeAuthorityWriter({ authorityRoot });
      writers.push(writer);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const client = createConnection(writer.lockPath);
        try {
          // oxlint-disable-next-line no-await-in-loop -- Exercise successive native pipe instances, not simultaneous clients.
          await new Promise<void>((resolve, reject) => {
            client.once('connect', resolve);
            client.once('error', reject);
          });
          // oxlint-disable-next-line no-await-in-loop -- Each probe follows one actual connection.
          await writer.assertCurrent();
          const contender = startOwner(authorityRoot, 'probe');
          // oxlint-disable-next-line no-await-in-loop -- Each subprocess tests exclusion during this connection.
          expect(await nextMessage(contender)).toMatchObject({ code: 'AUTHORITY_ALREADY_OWNED' });
        } finally {
          client.destroy();
        }
      }
      await writer.assertCurrent();
    },
  );

  it.runIf(process.platform === 'win32')(
    'should fence a writer after its authority directory is replaced',
    async () => {
      const parent = await root();
      const authorityRoot = join(parent, 'authority');
      await mkdir(authorityRoot);
      const writer = await acquireNodeAuthorityWriter({ authorityRoot });
      writers.push(writer);
      await rename(authorityRoot, join(parent, 'retired'));
      await mkdir(authorityRoot);
      await expect(writer.assertCurrent()).rejects.toMatchObject({ code: 'AUTHORITY_LOCK_UNAVAILABLE' });
      const replacement = await acquireNodeAuthorityWriter({ authorityRoot });
      writers.push(replacement);
      expect(replacement.lockPath).not.toBe(writer.lockPath);
      await replacement.assertCurrent();
    },
  );

  it.runIf(process.platform === 'win32')('should release the native pipe when startup aborts at listen', async () => {
    const authorityRoot = await root();
    const controller = new AbortController();
    const nativeListen = Server.prototype.listen;
    const listen = vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server, ...arguments_) {
      const server = nativeListen.apply(this, arguments_);
      controller.abort(new Error('abort at native listen'));
      return server;
    });
    try {
      await expect(acquireNodeAuthorityWriter({ authorityRoot, signal: controller.signal })).rejects.toThrow(
        'abort at native listen',
      );
    } finally {
      listen.mockRestore();
    }
    const replacement = await acquireEventually(authorityRoot);
    writers.push(replacement);
    await replacement.assertCurrent();
  });

  it.runIf(process.platform === 'win32' && process.env['TAU_WINDOWS_DISPOSABLE_HOST'] === '1')(
    'should refuse real UNC and mapped SMB authority directories',
    async (context) => {
      const authorityRoot = await root('network-');
      const fixture = join(import.meta.dirname, 'authority-writer-network.fixture.ps1');
      const environment = {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Child fixture environment boundary.
        TAU_AUTHORITY_TEST_SHARE: `tau-authority-${randomUUID().replaceAll('-', '')}`,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Child fixture environment boundary.
        TAU_AUTHORITY_TEST_ROOT: authorityRoot,
      };
      let drive: string | undefined;
      try {
        const setup: unknown = JSON.parse(runNetworkFixture(fixture, 'setup', environment));
        if (typeof setup !== 'object' || setup === null || !('status' in setup)) {
          throw new TypeError('Invalid disposable network fixture result');
        }
        if (setup.status === 'unavailable') {
          context.skip('Native network refusal unverified: disposable SMB share/mapping unavailable');
        }
        if (
          !('unc' in setup) ||
          typeof setup.unc !== 'string' ||
          !('drive' in setup) ||
          typeof setup.drive !== 'string'
        ) {
          throw new TypeError('Disposable network fixture omitted its paths');
        }
        drive = setup.drive;
        const acquireNetwork = async (networkRoot: string): Promise<NodeAuthorityWriter> => {
          const writer = await acquireNodeAuthorityWriter({ authorityRoot: networkRoot });
          writers.push(writer);
          return writer;
        };
        await expect(acquireNetwork(setup.unc)).rejects.toMatchObject({
          code: 'AUTHORITY_LOCK_UNAVAILABLE',
        });
        await expect(acquireNetwork(`${drive}:\\`)).rejects.toMatchObject({
          code: 'AUTHORITY_LOCK_UNAVAILABLE',
        });
      } finally {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Child fixture environment boundary.
        runNetworkFixture(fixture, 'cleanup', { ...environment, TAU_AUTHORITY_TEST_DRIVE: drive });
      }
    },
    50_000,
  );

  it.runIf(process.platform === 'win32' && process.env['TAU_WINDOWS_DISPOSABLE_HOST'] === '1')(
    'should preserve a foreign SMB fixture share and mapping on setup and cleanup collisions',
    async () => {
      const authorityRoot = await root('network-owner-');
      const otherRoot = await root('network-collision-');
      const fixture = join(import.meta.dirname, 'authority-writer-network.fixture.ps1');
      const environment = {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Child fixture environment boundary.
        TAU_AUTHORITY_TEST_SHARE: `tau-authority-${randomUUID().replaceAll('-', '')}`,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Child fixture environment boundary.
        TAU_AUTHORITY_TEST_ROOT: authorityRoot,
      };
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Child fixture environment boundary.
      const collision = { ...environment, TAU_AUTHORITY_TEST_ROOT: otherRoot };
      await writeFile(join(authorityRoot, 'owner.txt'), 'original owner bytes');
      let cleaned = false;
      try {
        const setup: unknown = JSON.parse(runNetworkFixture(fixture, 'setup', environment));
        if (
          typeof setup !== 'object' ||
          setup === null ||
          !('status' in setup) ||
          setup.status !== 'ready' ||
          !('unc' in setup) ||
          typeof setup.unc !== 'string' ||
          !('drive' in setup) ||
          typeof setup.drive !== 'string'
        ) {
          throw new TypeError('Disposable SMB collision regression requires a ready share and mapping');
        }
        const uncFile = `${setup.unc}\\owner.txt`;
        const mappedFile = `${setup.drive}:\\owner.txt`;
        expect(() => runNetworkFixture(fixture, 'setup', collision)).toThrow(
          'Fixture share name already bound elsewhere',
        );
        expect(await readFile(uncFile, 'utf8')).toBe('original owner bytes');
        expect(await readFile(mappedFile, 'utf8')).toBe('original owner bytes');
        expect(() => runNetworkFixture(fixture, 'cleanup', collision)).toThrow(
          'Fixture share name already bound elsewhere',
        );
        expect(await readFile(uncFile, 'utf8')).toBe('original owner bytes');
        expect(await readFile(mappedFile, 'utf8')).toBe('original owner bytes');
        runNetworkFixture(fixture, 'cleanup', environment);
        cleaned = true;
        await expect(access(uncFile)).rejects.toThrow();
        await expect(access(mappedFile)).rejects.toThrow();
        expect(await readFile(join(authorityRoot, 'owner.txt'), 'utf8')).toBe('original owner bytes');
      } finally {
        if (!cleaned) {
          runNetworkFixture(fixture, 'cleanup', environment);
        }
      }
    },
    50_000,
  );

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
    await symlink(authorityRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const writer = await acquireNodeAuthorityWriter({ authorityRoot });
    writers.push(writer);

    await expect(acquireNodeAuthorityWriter({ authorityRoot: alias })).rejects.toMatchObject({
      code: 'AUTHORITY_ALREADY_OWNED',
    });
  });

  it.runIf(process.platform !== 'win32')('should refuse a symbolic-link final lock component', async () => {
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
    writers.push(writer);

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
      expect(messageText).toContain('freebsd');
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
      expect(message).toHaveProperty('message', expect.stringContaining('freebsd'));
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});
