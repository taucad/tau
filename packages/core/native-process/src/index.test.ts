// @vitest-environment node
/* oxlint-disable no-await-in-loop -- native process cases are isolated and cleaned up sequentially. */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createMockFileSystem, createMockLogger } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceMirror,
  NativeProcessSession,
  NativeWorkerReportedError,
  processEnvironment,
  terminateProcessTree,
} from '#index.js';

const fsOverrides = vi.hoisted(() => ({
  readFile: undefined as undefined | (() => Promise<Uint8Array<ArrayBuffer>>),
  unlink: undefined as undefined | (() => Promise<void>),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<{ readFile: typeof readFile; unlink: typeof unlink }>();
  return {
    ...actual,
    readFile: async (...arguments_: Parameters<typeof actual.readFile>) =>
      fsOverrides.readFile ? fsOverrides.readFile() : actual.readFile(...arguments_),
    unlink: async (...arguments_: Parameters<typeof actual.unlink>) =>
      fsOverrides.unlink ? fsOverrides.unlink() : actual.unlink(...arguments_),
  };
});

type Issue = { readonly message: string };
const roots: string[] = [];
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const ready = `process.stdout.write('{"protocolVersion":1,"type":"ready"}\\n');`;
const keepAlive = `setInterval(()=>{},1000);`;

const fixture = (workerBody = `${ready}${keepAlive}`, requestTimeout = 2000) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-native-session-test-')));
  roots.push(root);
  const workspacePath = join(root, 'workspace');
  const artifactPath = join(root, 'artifacts');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  const executablePath = join(root, 'native-worker');
  const workerPath = join(root, 'worker.cjs');
  const resourcePath = join(root, 'resource');
  const trustFile = join(root, 'trust.json');
  const executableBody = `#!/bin/sh\nexec "${process.execPath}" "$@"\n`;
  writeFileSync(executablePath, executableBody);
  chmodSync(executablePath, 0o700);
  writeFileSync(workerPath, workerBody);
  writeFileSync(resourcePath, 'resource');
  writeFileSync(trustFile, '{"version":1,"trusted":true}\n');
  const logger = createMockLogger();
  const options = {
    executablePath,
    executableSha256: hash(executableBody),
    arguments: [workerPath],
    workspacePath,
    artifactPath,
    trustFile,
    resources: [{ path: resourcePath, sha256: hash('resource'), label: 'support resource' }],
    protocolVersion: 1,
    parseReady: (value: unknown) => {
      const record = value as Record<string, unknown>;
      if (record['protocolVersion'] !== 1 || record['type'] !== 'ready') {
        throw new Error('bad ready');
      }
    },
    parseResponse: (value: unknown) => {
      const record = value as Record<string, unknown>;
      if (record['protocolVersion'] !== 1 || typeof record['requestId'] !== 'string') {
        throw new Error('bad response');
      }
      if ('issues' in record) {
        return { requestId: record['requestId'], issues: record['issues'] as Issue[] };
      }
      return { requestId: record['requestId'], result: record['result'] };
    },
    requestTimeout,
    maxArtifactBytes: 32,
    logger,
    sessionName: 'Test native',
    executableName: 'test executable',
    shutdown: {
      method: 'shutdown',
      parseResult: (value: unknown) => {
        if ((value as { shutdown?: unknown }).shutdown !== true) {
          throw new Error('bad shutdown');
        }
        return value;
      },
    },
  };
  return { root, artifactPath, trustFile, logger, options, session: new NativeProcessSession<Issue>(options) };
};

const request = async <T>(
  session: NativeProcessSession<Issue>,
  options: { readonly signal?: AbortSignal; readonly parseResult?: (value: unknown) => T } = {},
): Promise<T> =>
  session.request({
    method: 'work',
    params: {},
    signal: options.signal ?? new AbortController().signal,
    parseResult: options.parseResult ?? ((value) => value as T),
  });

const respondingWorker = (response: string): string => `${ready}
const readline=require('node:readline').createInterface({input:process.stdin});
readline.on('line',(line)=>{const request=JSON.parse(line);const result=${response};process.stdout.write(JSON.stringify(result)+'\\n');if(request.method==='shutdown')setTimeout(()=>process.exit(0),5)});
${keepAlive}`;
const privateSession = (session: NativeProcessSession<Issue>) =>
  session as unknown as { child?: ChildProcessWithoutNullStreams; pending: Map<string, unknown> };
const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
const fakeChild = (overrides: { readonly exitCode?: number; readonly pid?: number } = {}) => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- ChildProcess is an EventEmitter.
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(child, {
    exitCode: overrides.exitCode ?? null,
    signalCode: null,
    pid: 'pid' in overrides ? overrides.pid : 999_999,
    kill: vi.fn(),
  });
  return child;
};
const withPlatform = async (platform: NodeJS.Platform, callback: () => Promise<void>): Promise<void> => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
  try {
    await callback();
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
  }
};

afterEach(() => {
  fsOverrides.readFile = undefined;
  fsOverrides.unlink = undefined;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('NativeProcessSession', () => {
  it('validates trust, closure, resources, and generation state', async () => {
    const absent = fixture();
    unlinkSync(absent.trustFile);
    await expect(absent.session.assertTrusted()).rejects.toThrow(/not trusted/);
    for (const marker of ['null', '{}', '{"version":2,"trusted":true}', '{"version":1,"trusted":false}']) {
      writeFileSync(absent.trustFile, marker);
      await expect(absent.session.assertTrusted()).rejects.toThrow(/invalid/);
    }
    expect(absent.session.isGenerationValid(0)).toBe(false);
    await absent.session.recycle();
    await absent.session.cleanup();
    await absent.session.cleanup();
    await expect(request(absent.session)).rejects.toThrow(/closed/);

    for (const [field, message] of [
      ['executableSha256', 'executable'],
      ['resources', 'support resource'],
    ] as const) {
      const value = fixture();
      const options =
        field === 'resources'
          ? { ...value.options, resources: [{ ...value.options.resources[0]!, sha256: '0'.repeat(64) }] }
          : { ...value.options, executableSha256: '0'.repeat(64) };
      const session = new NativeProcessSession<Issue>(options);
      await expect(request(session)).rejects.toThrow(new RegExp(message));
      await session.cleanup();
    }
  });

  it('serializes chunked requests, validates results, redacts stderr, and shuts down gracefully', async () => {
    const worker = `${ready}
const readline=require('node:readline').createInterface({input:process.stdin});let active=false;
readline.on('line',(line)=>{const request=JSON.parse(line);if(active)process.exit(9);active=true;process.stderr.write(process.cwd()+'\\n');const frame=JSON.stringify({protocolVersion:1,requestId:request.requestId,result:request.method==='shutdown'?{shutdown:true}:{value:request.requestId}})+'\\n';process.stdout.write(Buffer.from(frame).subarray(0,3));setTimeout(()=>{process.stdout.write(Buffer.from(frame).subarray(3));active=false;if(request.method==='shutdown')process.exit(0)},2)});`;
    const value = fixture(worker);
    const [first, second] = await Promise.all([
      request<{ value: string }>(value.session),
      request<{ value: string }>(value.session),
    ]);
    expect(first.value).toBe('1:1');
    expect(second.value).toBe('1:2');
    expect(value.session.isGenerationValid(1)).toBe(true);
    expect(value.logger.debug).toHaveBeenCalledWith(expect.stringContaining('<private>'));
    writeFileSync(value.trustFile, '{"version":1,"trusted":true,"refreshed":true}\n');
    await delay(300);
    await expect(
      request(value.session, {
        parseResult: () => {
          throw new Error('invalid result');
        },
      }),
    ).rejects.toThrow(/failed validation/);
    await value.session.cleanup();
    expect(value.session.isGenerationValid(1)).toBe(false);

    const noShutdown = fixture(respondingWorker(`({protocolVersion:1,requestId:request.requestId,result:{}})`));
    const session = new NativeProcessSession<Issue>({ ...noShutdown.options, shutdown: undefined });
    await request(session);
    await session.cleanup();
  });

  it('rejects malformed handshakes, frames, response ids, issue responses, and early exits', async () => {
    const cases = [
      [`process.stdout.write('{}\\n');${keepAlive}`, /invalid handshake/],
      [`${ready}process.stdin.once('data',()=>process.stdout.write('not-json\\n'));${keepAlive}`, /malformed JSON/],
      [`${ready}process.stdin.once('data',()=>process.stdout.write('x'.repeat(1_048_577)));${keepAlive}`, /oversized/],
      [
        `${ready}process.stdin.once('data',()=>process.stdout.write('x'.repeat(1_048_577)+'\\n'));${keepAlive}`,
        /oversized/,
      ],
      [respondingWorker(`({protocolVersion:2,requestId:request.requestId,result:{}})`), /invalid response/],
      [respondingWorker(`({protocolVersion:1,requestId:'unknown',result:{}})`), /unknown response/],
      [
        respondingWorker(`({protocolVersion:1,requestId:request.requestId,issues:[{message:'worker failure'}]})`),
        /reported/,
      ],
      ['process.exit(7);', /exited/],
    ] as const;
    for (const [body, message] of cases) {
      const value = fixture(body);
      const operation = request(value.session);
      if (message.source === 'reported') {
        await expect(operation).rejects.toBeInstanceOf(NativeWorkerReportedError);
      }
      if (message.source !== 'reported') {
        await expect(operation).rejects.toThrow(message);
      }
      await value.session.cleanup();
    }
    const duplicate = fixture(
      `${ready}process.stdin.once('data',(line)=>{const request=JSON.parse(line);const frame=JSON.stringify({protocolVersion:1,requestId:request.requestId,result:{}})+'\\n';process.stdout.write(frame+frame)});${keepAlive}`,
    );
    await expect(request(duplicate.session)).resolves.toEqual({});
    await delay(10);
    expect(duplicate.session.isGenerationValid(1)).toBe(false);
    await duplicate.session.cleanup();
  });

  it('bounds the queue and handles abort, timeout, trust revocation, spawn, and write failures', async () => {
    const stalled = fixture(`${ready}${keepAlive}`, 5000);
    const operations = Array.from({ length: 16 }, async () => request(stalled.session));
    await expect(request(stalled.session)).rejects.toThrow(/queue exceeds/);
    await stalled.session.cleanup();
    await Promise.allSettled(operations);

    const sending = fixture(`${ready}${keepAlive}`);
    const sendController = new AbortController();
    Object.defineProperty(sendController.signal, 'reason', { value: undefined });
    const sendOperation = request(sending.session, { signal: sendController.signal });
    while (privateSession(sending.session).pending.size === 0) {
      await delay(2);
    }
    sendController.abort();
    await expect(sendOperation).rejects.toThrow();
    await sending.session.cleanup();

    const starting = fixture(`setTimeout(()=>{${ready}},1000);${keepAlive}`);
    const startController = new AbortController();
    const startOperation = request(starting.session, { signal: startController.signal });
    while (!privateSession(starting.session).child) {
      await delay(2);
    }
    startController.abort(new Error('explicit abort'));
    await expect(startOperation).rejects.toThrow(/explicit abort/);
    await starting.session.cleanup();
    const timedOut = fixture(`${ready}${keepAlive}`, 1000);
    await expect(request(timedOut.session)).rejects.toThrow(/request timed out/);
    await timedOut.session.cleanup();
    const handshakeTimeout = fixture(keepAlive, 20);
    await expect(request(handshakeTimeout.session)).rejects.toThrow(/handshake timed out/);
    await handshakeTimeout.session.cleanup();
    const revoked = fixture(`${ready}${keepAlive}`);
    const revocation = request(revoked.session);
    while (privateSession(revoked.session).pending.size === 0) {
      await delay(2);
    }
    unlinkSync(revoked.trustFile);
    await expect(revocation).rejects.toThrow(/revoked/);
    await revoked.session.cleanup();

    const writable = fixture(respondingWorker(`({protocolVersion:1,requestId:request.requestId,result:{}})`));
    await request(writable.session);
    const writableChild = privateSession(writable.session).child!;
    writableChild.stdin.end();
    await new Promise<void>((resolve) => {
      writableChild.stdin.once('finish', resolve);
    });
    await expect(request(writable.session)).rejects.toThrow(/not writable/);
    await writable.session.cleanup();

    const spawnFailure = fixture();
    chmodSync(spawnFailure.options.executablePath, 0o600);
    await expect(request(spawnFailure.session)).rejects.toThrow();
    await spawnFailure.session.cleanup();

    const writeFailure = fixture(respondingWorker(`({protocolVersion:1,requestId:request.requestId,result:{}})`));
    await request(writeFailure.session);
    const child = privateSession(writeFailure.session).child!;
    child.stdin.write = ((_chunk: unknown, _encoding: unknown, callback: (error: Error) => void) => {
      callback(new Error('write failed'));
      return false;
    }) as typeof child.stdin.write;
    await expect(request(writeFailure.session)).rejects.toThrow(/write failed/);
    await writeFailure.session.cleanup();
  }, 15_000);

  it('confines, validates, consumes, and removes private artifacts', async () => {
    const value = fixture();
    await expect(
      value.session.readArtifact({ artifactPath: join(value.root, 'outside'), byteLength: 0 }),
    ).rejects.toThrow(/outside/);
    await expect(
      value.session.readArtifact({ artifactPath: join(value.artifactPath, 'missing'), byteLength: 0 }),
    ).rejects.toThrow();
    const target = join(value.artifactPath, 'target');
    const link = join(value.artifactPath, 'link');
    writeFileSync(target, 'data');
    symlinkSync(target, link);
    await expect(value.session.readArtifact({ artifactPath: link, byteLength: 4 })).rejects.toThrow(/invalid artifact/);
    await expect(value.session.readArtifact({ artifactPath: target, byteLength: 3 })).rejects.toThrow(/invalid size/);
    fsOverrides.readFile = async () => new TextEncoder().encode('changed');
    await expect(value.session.readArtifact({ artifactPath: target, byteLength: 4 })).rejects.toThrow(/changed while/);
    fsOverrides.readFile = undefined;
    writeFileSync(target, 'data');
    fsOverrides.unlink = async () => {
      throw new Error('already gone');
    };
    await expect(value.session.readArtifact({ artifactPath: target, byteLength: 4 })).resolves.toEqual(
      new Uint8Array([100, 97, 116, 97]),
    );
    fsOverrides.unlink = undefined;
    unlinkSync(target);
    await value.session.cleanup();
  });

  it('terminates POSIX and Windows process trees and provides a minimal environment', async () => {
    await terminateProcessTree(fakeChild({ exitCode: 0 }));
    await terminateProcessTree(fakeChild({ pid: undefined }));
    const kill = vi.spyOn(process, 'kill');
    kill.mockImplementationOnce(() => {
      throw new Error('already exited');
    });
    await terminateProcessTree(fakeChild());
    const hard = fakeChild();
    kill.mockReturnValueOnce(true).mockImplementationOnce(() => {
      throw new Error('gone');
    });
    await terminateProcessTree(hard);
    const exiting = fakeChild();
    kill.mockImplementationOnce(() => {
      setTimeout(() => exiting.emit('exit'), 0);
      return true;
    });
    await terminateProcessTree(exiting);
    const stoppedDuringGrace = fakeChild();
    kill.mockImplementationOnce(() => {
      Object.assign(stoppedDuringGrace, { exitCode: 0 });
      return true;
    });
    await terminateProcessTree(stoppedDuringGrace);
    kill.mockRestore();
    await withPlatform('win32', async () => {
      const previous = process.env['SystemRoot'];
      delete process.env['SystemRoot'];
      const direct = fakeChild();
      await terminateProcessTree(direct);
      expect(direct.kill).toHaveBeenCalledWith('SIGKILL');
      expect(processEnvironment('/tmp')).not.toHaveProperty('SystemRoot');
      const systemRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-taskkill-test-')));
      roots.push(systemRoot);
      const taskkill = join(systemRoot, 'System32', 'taskkill.exe');
      mkdirSync(dirname(taskkill), { recursive: true });
      writeFileSync(taskkill, '#!/bin/sh\nexit 0\n');
      chmodSync(taskkill, 0o700);
      process.env['SystemRoot'] = systemRoot;
      expect(processEnvironment('/tmp')).toHaveProperty('SystemRoot', systemRoot);
      await terminateProcessTree(fakeChild());
      unlinkSync(taskkill);
      const fallback = fakeChild();
      await terminateProcessTree(fallback);
      expect(fallback.kill).toHaveBeenCalledWith('SIGKILL');
      if (previous === undefined) {
        delete process.env['SystemRoot'];
      }
      if (previous !== undefined) {
        process.env['SystemRoot'] = previous;
      }
    });
    const environment = processEnvironment('/artifacts');
    expect(environment['LANG']).toBe('C.UTF-8');
    expect(environment['TMPDIR']).toBe('/artifacts');
  });
});

describe('createWorkspaceMirror', () => {
  it('projects sorted files, skips exclusions, updates, deletes, and cleans up', async () => {
    const exitListeners = process.listenerCount('exit');
    const interruptListeners = process.listenerCount('SIGINT');
    const terminateListeners = process.listenerCount('SIGTERM');
    const files = new Map([
      ['main.cs', new TextEncoder().encode('one')],
      ['nested/helper.cs', new TextEncoder().encode('helper')],
      ['nested/data.dll', new TextEncoder().encode('excluded')],
    ]);
    const filesystem = createMockFileSystem({
      readdirResult: (directory) =>
        directory === ''
          ? ['node_modules', 'nested', 'main.cs']
          : directory === 'nested'
            ? ['helper.cs', 'data.dll']
            : [],
      readFileResult: (path) => files.get(path)!,
    });
    filesystem.mocks.lstat.mockImplementation(async (path: string) =>
      path === 'nested' || path === 'node_modules'
        ? { type: 'dir', size: 0, mtimeMs: 0 }
        : { type: 'file', size: files.get(path)!.byteLength, mtimeMs: 0, contentKind: 'text' },
    );
    const mirror = await createWorkspaceMirror({
      temporaryPrefix: 'tau-mirror-test-',
      displayName: 'Test',
      excludedFileSuffixes: ['.dll'],
    });
    expect(process.listenerCount('exit')).toBe(exitListeners + 1);
    expect(process.listenerCount('SIGINT')).toBe(interruptListeners + 1);
    expect(process.listenerCount('SIGTERM')).toBe(terminateListeners + 1);
    roots.push(mirror.rootPath);
    await expect(mirror.sync(filesystem)).resolves.toEqual(['main.cs', 'nested/helper.cs']);
    await expect(mirror.sync(filesystem)).resolves.toEqual(['main.cs', 'nested/helper.cs']);
    files.set('main.cs', new TextEncoder().encode('two'));
    files.delete('nested/helper.cs');
    filesystem.mocks.readdir.mockImplementation(async (directory: string) => (directory === '' ? ['main.cs'] : []));
    await expect(mirror.sync(filesystem)).resolves.toEqual(['main.cs']);
    await mirror.cleanup();
    expect(existsSync(mirror.rootPath)).toBe(false);
    expect(process.listenerCount('exit')).toBe(exitListeners);
    expect(process.listenerCount('SIGINT')).toBe(interruptListeners);
    expect(process.listenerCount('SIGTERM')).toBe(terminateListeners);
  });

  it('rejects case collisions, concurrent changes, depth, and size limits', async () => {
    const collision = createMockFileSystem({ readdirResult: ['A.cs', 'a.cs'], readFileResult: 'x' });
    collision.mocks.lstat.mockResolvedValue({ type: 'file', size: 1, mtimeMs: 0, contentKind: 'text' });
    const collisionMirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-mirror-test-', displayName: 'Test' });
    roots.push(collisionMirror.rootPath);
    await expect(collisionMirror.sync(collision)).rejects.toThrow(/case-colliding/);

    const deep = createMockFileSystem({ readdirResult: (directory) => [directory ? 'next' : 'root'] });
    deep.mocks.lstat.mockResolvedValue({ type: 'dir', size: 0, mtimeMs: 0 });
    const deepMirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-mirror-test-', displayName: 'Test' });
    roots.push(deepMirror.rootPath);
    await expect(deepMirror.sync(deep)).rejects.toThrow(/directory levels/);

    const large = createMockFileSystem({ readdirResult: ['large.cs'] });
    large.mocks.lstat.mockResolvedValue({
      type: 'file',
      size: 32 * 1024 * 1024 + 1,
      mtimeMs: 0,
      contentKind: 'binary',
    });
    const largeMirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-mirror-test-', displayName: 'Test' });
    roots.push(largeMirror.rootPath);
    await expect(largeMirror.sync(large)).rejects.toThrow(/size limits/);

    const changed = createMockFileSystem({ readdirResult: ['main.cs'], readFileResult: 'xx' });
    changed.mocks.lstat.mockResolvedValue({ type: 'file', size: 1, mtimeMs: 0, contentKind: 'text' });
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-mirror-test-', displayName: 'Test' });
    roots.push(mirror.rootPath);
    await expect(mirror.sync(changed)).rejects.toThrow(/changed while mirroring/);
    await mirror.cleanup();
  });
});
/* oxlint-enable no-await-in-loop */
