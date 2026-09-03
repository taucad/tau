// @vitest-environment node
/* oxlint-disable no-await-in-loop -- Process lifecycle cases are isolated and cleaned up sequentially. */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  chmodSync,
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

import { createMockLogger } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { build123dAnalysisSchema, build123dBuildSchema, build123dEmptySchema } from '#build123d.protocol.js';
import {
  Build123dWorkerError,
  processEnvironmentForTest,
  PythonSession,
  terminateProcessTreeForTest,
} from '#python-session.js';

const nativeSession = (session: PythonSession) =>
  (
    session as unknown as {
      session: {
        child: ChildProcessWithoutNullStreams | undefined;
        pending: Map<string, unknown>;
        recycle(error: Error): Promise<void>;
      };
    }
  ).session;

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

const roots: string[] = [];
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const ready = `process.stdout.write(JSON.stringify({protocolVersion:1,type:'ready',pythonVersion:process.version})+'\\n');`;
const keepAlive = `setInterval(()=>{},1000);`;

const fixture = (workerBody = `${ready}${keepAlive}`, requestTimeout = 2000) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-python-session-test-')));
  roots.push(root);
  const workspacePath = join(root, 'workspace');
  const artifactPath = join(root, 'artifacts');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  const executable = join(root, 'python');
  const workerPath = join(root, 'worker.cjs');
  const analyzerPath = join(root, 'analyzer.py');
  const glbPath = join(root, 'glb.py');
  const trustFile = join(root, 'trust.json');
  const executableBody = `#!/bin/sh\nexec "${process.execPath}" "$4" "$5" "$6" "$7" "$8" "$9" "$10"\n`;
  writeFileSync(executable, executableBody);
  chmodSync(executable, 0o700);
  writeFileSync(workerPath, workerBody);
  writeFileSync(analyzerPath, 'analyzer');
  writeFileSync(glbPath, 'glb');
  writeFileSync(trustFile, '{"version":1,"trusted":true}\n');
  const logger = createMockLogger();
  const options = {
    pythonExecutable: executable,
    workerPath,
    workspacePath,
    artifactPath,
    trustFile,
    pythonSha256: sha256(executableBody),
    workerSha256: sha256(workerBody),
    supportFiles: [
      { path: analyzerPath, sha256: sha256('analyzer') },
      { path: glbPath, sha256: sha256('glb') },
    ],
    requestTimeout,
    maxArtifactBytes: 32,
    logger,
  };
  return { root, artifactPath, trustFile, logger, options, session: new PythonSession(options) };
};

const respondingWorker = (responseExpression: string): string => `${ready}
const readline=require('node:readline').createInterface({input:process.stdin});
readline.on('line',(line)=>{
 const request=JSON.parse(line);
 const response=${responseExpression};
 process.stdout.write(JSON.stringify(response)+'\\n');
 if(request.method==='shutdown') process.exitCode=0;
});
${keepAlive}`;

const fakeChild = (overrides: { readonly exitCode?: number | undefined; readonly pid?: number } = {}) => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- ChildProcess is an EventEmitter; this fake must match it.
  const emitter = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(emitter, {
    exitCode: overrides.exitCode ?? null,
    signalCode: null,
    pid: 'pid' in overrides ? overrides.pid : 999_999,
    kill: vi.fn().mockReturnValue(true),
  });
  return emitter;
};

const request = async <T>(
  session: PythonSession,
  {
    method,
    schema,
    params = {},
    signal = new AbortController().signal,
  }: {
    readonly method: string;
    readonly schema: z.ZodType<T>;
    readonly params?: Record<string, unknown>;
    readonly signal?: AbortSignal;
  },
): Promise<T> => session.request({ method, params, schema, signal });

const delay = async (delayMilliseconds: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMilliseconds);
  });

const withPlatform = async (platform: NodeJS.Platform, operation: () => Promise<void>): Promise<void> => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
  try {
    await operation();
  } finally {
    Object.defineProperty(process, 'platform', descriptor);
  }
};

afterEach(() => {
  fsOverrides.readFile = undefined;
  fsOverrides.unlink = undefined;
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('PythonSession', () => {
  it('terminates POSIX and Windows process trees across every fallback', async () => {
    await terminateProcessTreeForTest(fakeChild({ exitCode: 0 }));
    await terminateProcessTreeForTest(fakeChild({ pid: undefined }));

    const kill = vi.spyOn(process, 'kill');
    kill.mockImplementationOnce(() => {
      throw new Error('already gone');
    });
    await terminateProcessTreeForTest(fakeChild());

    const hardKilled = fakeChild();
    kill.mockReturnValueOnce(true).mockImplementationOnce(() => {
      throw new Error('exited during grace');
    });
    await terminateProcessTreeForTest(hardKilled);

    const exited = fakeChild();
    kill.mockImplementationOnce(() => {
      setTimeout(() => exited.emit('exit', 0, null), 0);
      return true;
    });
    await terminateProcessTreeForTest(exited);
    const graceful = fakeChild();
    kill.mockImplementationOnce(() => {
      Object.assign(graceful, { exitCode: 0 });
      return true;
    });
    await terminateProcessTreeForTest(graceful);
    kill.mockRestore();

    await withPlatform('win32', async () => {
      const previousSystemRoot = process.env['SystemRoot'];
      delete process.env['SystemRoot'];
      const direct = fakeChild();
      await terminateProcessTreeForTest(direct);
      expect(direct.kill).toHaveBeenCalledWith('SIGKILL');
      expect(processEnvironmentForTest('/tmp')).not.toHaveProperty('SystemRoot');

      const systemRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-taskkill-test-')));
      roots.push(systemRoot);
      const taskkill = join(systemRoot, 'System32', 'taskkill.exe');
      mkdirSync(dirname(taskkill), { recursive: true });
      writeFileSync(taskkill, '#!/bin/sh\nexit 0\n');
      chmodSync(taskkill, 0o700);
      process.env['SystemRoot'] = systemRoot;
      expect(processEnvironmentForTest('/tmp')).toHaveProperty('SystemRoot', systemRoot);
      await terminateProcessTreeForTest(fakeChild());
      unlinkSync(taskkill);
      const fallback = fakeChild();
      await terminateProcessTreeForTest(fallback);
      expect(fallback.kill).toHaveBeenCalledWith('SIGKILL');
      if (previousSystemRoot === undefined) {
        delete process.env['SystemRoot'];
      } else {
        process.env['SystemRoot'] = previousSystemRoot;
      }
    });
  });

  it('reports worker issues and denies absent or malformed trust', async () => {
    expect(new Build123dWorkerError([{ message: 'bad', code: 'X', type: 'runtime', severity: 'error' }])).toMatchObject(
      {
        name: 'Build123dWorkerError',
        message: 'bad',
      },
    );
    const { session, trustFile } = fixture();
    unlinkSync(trustFile);
    await expect(session.assertTrusted()).rejects.toThrow(/not trusted/);
    for (const marker of ['null', '{}', '{"version":2,"trusted":true}', '{"version":1,"trusted":false}']) {
      writeFileSync(trustFile, marker);
      await expect(session.assertTrusted()).rejects.toThrow(/invalid/);
    }
    await session.cleanup();
    await session.cleanup();
    await nativeSession(session).recycle(new Error('already stopped'));
    await expect(request(session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(/closed/);
  });

  it('validates every resource digest before spawning', async () => {
    const cases = [
      {
        mutate: (options: ReturnType<typeof fixture>['options']) => ({ ...options, supportFiles: [] }),
        message: 'missing',
      },
      {
        mutate: (options: ReturnType<typeof fixture>['options']) => ({ ...options, pythonSha256: '0'.repeat(64) }),
        message: 'Python',
      },
      {
        mutate: (options: ReturnType<typeof fixture>['options']) => ({ ...options, workerSha256: '0'.repeat(64) }),
        message: 'worker',
      },
      {
        mutate: (options: ReturnType<typeof fixture>['options']) => ({
          ...options,
          supportFiles: options.supportFiles.map((file, index) =>
            index === 0 ? { ...file, sha256: '0'.repeat(64) } : file,
          ),
        }),
        message: 'support',
      },
    ];
    for (const { mutate, message } of cases) {
      const value = fixture();
      const session = new PythonSession(mutate(value.options));
      await expect(request(session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
        new RegExp(message),
      );
      await session.cleanup();
    }
  });

  it('handles chunked frames, stderr redaction, release, and graceful cleanup', async () => {
    const body = `${ready}
const readline=require('node:readline').createInterface({input:process.stdin});
readline.on('line',(line)=>{
 const request=JSON.parse(line);
 process.stderr.write(process.cwd()+'\\n');
 const result=request.method==='analyze'
  ? {defaultParameters:{width:2},jsonSchema:{type:'object'},resolved:['main.py'],unresolved:[]}
  : request.method==='build' ? {handleId:'shape',observedDependencies:['main.py']}
  : request.method==='shutdown' ? {shutdown:true} : {};
 const encoded=JSON.stringify({protocolVersion:1,requestId:request.requestId,result})+'\\n';
 process.stdout.write(Buffer.from(encoded).subarray(0,3));
 setTimeout(()=>process.stdout.write(Buffer.from(encoded).subarray(3)),1);
 if(request.method==='shutdown') setTimeout(()=>process.exit(0),5);
});`;
    const { session, logger } = fixture(body);
    const analysis = await request(session, { method: 'analyze', schema: build123dAnalysisSchema });
    expect(analysis.resolved).toEqual(['main.py']);
    const built = await request(session, { method: 'build', schema: build123dBuildSchema });
    expect(session.isHandleGenerationValid(session.generation)).toBe(true);
    session.release(built.handleId, session.generation + 1);
    session.release(built.handleId, session.generation);
    const requestSpy = vi.spyOn(session, 'request').mockRejectedValueOnce(new Error('release failed'));
    session.release(built.handleId, session.generation);
    await delay(10);
    requestSpy.mockRestore();
    writeFileSync(
      (session as unknown as { options: { trustFile: string } }).options.trustFile,
      '{"version":1,"trusted":true}\n',
    );
    await delay(300);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('<private>'));
    await session.cleanup();
    expect(session.isHandleGenerationValid(session.generation)).toBe(false);
  });

  it('rejects malformed handshakes and protocol frames', async () => {
    const cases = [
      { body: `process.stdout.write('{}\\n');${keepAlive}`, message: 'invalid handshake' },
      {
        body: `${ready}process.stdin.once('data',()=>process.stdout.write('not-json\\n'));${keepAlive}`,
        message: 'malformed JSON',
      },
      {
        body: `${ready}process.stdin.once('data',()=>process.stdout.write('x'.repeat(1_048_577)));${keepAlive}`,
        message: 'oversized',
      },
      {
        body: `${ready}process.stdin.once('data',()=>process.stdout.write('x'.repeat(1_048_577)+'\\n'));${keepAlive}`,
        message: 'oversized',
      },
    ];
    for (const { body, message } of cases) {
      const { session } = fixture(body);
      await expect(request(session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
        new RegExp(message),
      );
      await session.cleanup();
    }
  });

  it('rejects invalid, unknown, duplicate, error, and schema-invalid responses', async () => {
    const responseCases = [
      {
        expression: `({protocolVersion:2,requestId:request.requestId,result:{}})`,
        message: 'invalid response',
      },
      {
        expression: `({protocolVersion:1,requestId:'unknown',result:{}})`,
        message: 'unknown response',
      },
      {
        expression: `({protocolVersion:1,requestId:request.requestId,result:{},error:{issues:[{message:'bad',code:'X',type:'runtime',severity:'error'}]}})`,
        message: 'invalid response',
      },
      {
        expression: `({protocolVersion:1,requestId:request.requestId,error:{issues:[{message:'worker failed',code:'X',type:'runtime',severity:'error'}]}})`,
        message: 'worker failed',
      },
      {
        expression: `({protocolVersion:1,requestId:request.requestId,result:{wrong:true}})`,
        message: 'failed validation',
      },
    ];
    for (const { expression, message } of responseCases) {
      const { session } = fixture(respondingWorker(expression));
      await expect(request(session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
        new RegExp(message),
      );
      await session.cleanup();
    }

    const duplicate = fixture(`${ready}
process.stdin.once('data',(line)=>{const request=JSON.parse(line);const frame=JSON.stringify({protocolVersion:1,requestId:request.requestId,result:{defaultParameters:{},jsonSchema:{},resolved:[],unresolved:[]}})+'\\n';process.stdout.write(frame+frame)});${keepAlive}`);
    await expect(
      request(duplicate.session, { method: 'analyze', schema: build123dAnalysisSchema }),
    ).resolves.toMatchObject({ resolved: [] });
    await delay(10);
    expect(duplicate.session.isHandleGenerationValid(duplicate.session.generation)).toBe(false);
    await duplicate.session.cleanup();
  });

  it('bounds the queue and terminates on abort, timeout, revocation, and process exit', async () => {
    const queued = fixture(
      `${ready}
const readline=require('node:readline').createInterface({input:process.stdin});
readline.on('line',(line)=>{const request=JSON.parse(line);if(request.method==='shutdown'){process.stdout.write(JSON.stringify({protocolVersion:1,requestId:request.requestId,result:{shutdown:true}})+'\\n');process.exit(0)}});${keepAlive}`,
      5000,
    );
    const requests = Array.from({ length: 16 }, async () =>
      request(queued.session, { method: 'analyze', schema: build123dAnalysisSchema }),
    );
    await expect(request(queued.session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
      /queue exceeds/,
    );
    await queued.session.cleanup();
    await Promise.allSettled(requests);

    const aborted = fixture(`${ready}${keepAlive}`);
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'reason', { value: undefined });
    const abortedRequest = request(aborted.session, {
      method: 'analyze',
      schema: build123dAnalysisSchema,
      signal: controller.signal,
    });
    while (nativeSession(aborted.session).pending.size === 0) {
      await delay(5);
    }
    controller.abort();
    await expect(abortedRequest).rejects.toThrow();
    await aborted.session.cleanup();

    const abortedStart = fixture(`setTimeout(()=>{${ready}},1000);${keepAlive}`);
    const startController = new AbortController();
    const startRequest = request(abortedStart.session, {
      method: 'analyze',
      schema: build123dAnalysisSchema,
      signal: startController.signal,
    });
    while (!abortedStart.session.isHandleGenerationValid(abortedStart.session.generation)) {
      await delay(5);
    }
    startController.abort(new Error('start aborted'));
    await expect(startRequest).rejects.toThrow();
    await abortedStart.session.cleanup();

    const timedOut = fixture(`${ready}${keepAlive}`, 20);
    await expect(request(timedOut.session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
      /timed out/,
    );
    await timedOut.session.cleanup();

    const handshakeTimeout = fixture(keepAlive, 20);
    await expect(
      request(handshakeTimeout.session, { method: 'analyze', schema: build123dAnalysisSchema }),
    ).rejects.toThrow(/handshake timed out/);
    await handshakeTimeout.session.cleanup();

    const revoked = fixture(`${ready}${keepAlive}`, 2000);
    const revokedRequest = request(revoked.session, { method: 'analyze', schema: build123dAnalysisSchema });
    setTimeout(() => {
      unlinkSync(revoked.trustFile);
    }, 20);
    await expect(revokedRequest).rejects.toThrow(/revoked/);
    await revoked.session.cleanup();

    const exited = fixture(`process.exit(7);`);
    await expect(request(exited.session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
      /exited/,
    );
    await exited.session.cleanup();

    const spawnError = fixture();
    chmodSync(spawnError.options.pythonExecutable, 0o600);
    await expect(request(spawnError.session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow();
    await spawnError.session.cleanup();
  }, 15_000);

  it('confines, validates, reads, and removes artifacts', async () => {
    const { artifactPath, root, session } = fixture();
    await expect(session.readArtifact({ artifactPath: join(root, 'outside.glb'), byteLength: 0 })).rejects.toThrow(
      /outside/,
    );
    const missing = join(artifactPath, 'missing.glb');
    await expect(session.readArtifact({ artifactPath: missing, byteLength: 0 })).rejects.toThrow();
    const target = join(artifactPath, 'target.glb');
    const link = join(artifactPath, 'link.glb');
    writeFileSync(target, 'data');
    symlinkSync(target, link);
    await expect(session.readArtifact({ artifactPath: link, byteLength: 4 })).rejects.toThrow(/invalid artifact/);
    await expect(session.readArtifact({ artifactPath: target, byteLength: 3 })).rejects.toThrow(/invalid size/);
    fsOverrides.readFile = async () => new TextEncoder().encode('changed');
    await expect(session.readArtifact({ artifactPath: target, byteLength: 4 })).rejects.toThrow(/changed while/);
    fsOverrides.readFile = undefined;
    writeFileSync(target, 'data');
    fsOverrides.unlink = async () => {
      throw new Error('already removed');
    };
    await expect(session.readArtifact({ artifactPath: target, byteLength: 4 })).resolves.toEqual(
      new Uint8Array([100, 97, 116, 97]),
    );
    fsOverrides.unlink = undefined;
    unlinkSync(target);
    await expect(session.readArtifact({ artifactPath: target, byteLength: 4 })).rejects.toThrow();
    await session.cleanup();
  });

  it('rejects unwritable child input', async () => {
    const body = `${ready}process.stdin.destroy();${keepAlive}`;
    const { session } = fixture(body, 100);
    await expect(request(session, { method: 'release', schema: build123dEmptySchema })).rejects.toThrow();
    await session.cleanup();

    const successful = fixture(
      respondingWorker(
        `({protocolVersion:1,requestId:request.requestId,result:{defaultParameters:{},jsonSchema:{},resolved:[],unresolved:[]}})`,
      ),
    );
    await request(successful.session, { method: 'analyze', schema: build123dAnalysisSchema });
    const child = nativeSession(successful.session).child!;
    child.stdin.end();
    await new Promise<void>((resolve) => {
      child.stdin.once('finish', () => {
        resolve();
      });
    });
    await expect(request(successful.session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
      /not writable/,
    );
    await successful.session.cleanup();

    const writeError = fixture(
      respondingWorker(
        `({protocolVersion:1,requestId:request.requestId,result:{defaultParameters:{},jsonSchema:{},resolved:[],unresolved:[]}})`,
      ),
    );
    await request(writeError.session, { method: 'analyze', schema: build123dAnalysisSchema });
    const writeErrorChild = nativeSession(writeError.session).child!;
    writeErrorChild.stdin.write = ((_chunk: unknown, _encoding: unknown, callback: (error: Error) => void) => {
      callback(new Error('write failed'));
      return false;
    }) as typeof writeErrorChild.stdin.write;
    await expect(request(writeError.session, { method: 'analyze', schema: build123dAnalysisSchema })).rejects.toThrow(
      /write failed/,
    );
    await writeError.session.cleanup();
  });
});
/* oxlint-enable no-await-in-loop */
