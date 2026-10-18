// @vitest-environment node
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { createMockLogger } from '@taucad/runtime-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { pythonSupportModules } from '#python-kernel.js';
import type { PythonKernelWorker } from '#python-kernel.js';
import { createPythonSession, PythonWorkerError } from '#python-session.js';
import type { PythonSessionOptions } from '#python-session.js';

/** Spawning the fake worker needs the native sandbox; CI always has it, a bare development container may not. */
const sandboxAvailable =
  ((process.platform === 'darwin' || process.platform === 'linux') &&
    SandboxManager.checkDependencies().errors.length === 0) ||
  process.env['CI'] !== undefined;

const worker: PythonKernelWorker = {
  kernelId: 'example',
  kernelName: 'Example',
  workerModules: ['worker.cjs', 'helpers.py'],
};

const roots: string[] = [];
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const ready = `process.stdout.write(JSON.stringify({protocolVersion:1,type:'ready',pythonVersion:process.version})+'\\n');`;
const keepAlive = `setInterval(()=>{},1000);`;

/** A worker that answers each request line with `responseExpression`, evaluated with `request` in scope. */
const respondingWorker = (responseExpression: string): string => `${ready}
const readline=require('node:readline').createInterface({input:process.stdin});
readline.on('line',(line)=>{
 const request=JSON.parse(line);
 const response=request.method==='shutdown'
  ? {protocolVersion:1,requestId:request.requestId,result:{shutdown:true}}
  : ${responseExpression};
 process.stdout.write(JSON.stringify(response)+'\\n');
 if(request.method==='shutdown') setTimeout(()=>process.exit(0),5);
});
${keepAlive}`;

const fixture = (workerBody = `${ready}${keepAlive}`): { root: string; options: PythonSessionOptions } => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-python-kernel-session-test-')));
  roots.push(root);
  const workspacePath = join(root, 'workspace');
  const artifactPath = join(root, 'artifacts');
  // The executable's parent's parent is the readable runtime root; it must not contain the writable artifacts.
  const runtimePath = join(root, 'runtime');
  mkdirSync(workspacePath);
  mkdirSync(artifactPath);
  mkdirSync(join(runtimePath, 'bin'), { recursive: true });
  mkdirSync(join(runtimePath, 'tau_kernel'));
  const executable = join(runtimePath, 'bin', 'python');
  // `python -I -B -u <worker> …`: the shim drops the three interpreter flags and runs the worker with Node.
  const executableBody = `#!/bin/sh\nexec "${process.execPath}" "$4" "$5" "$6" "$7" "$8" "$9" "$10"\n`;
  writeFileSync(executable, executableBody);
  chmodSync(executable, 0o700);
  const workerPath = join(runtimePath, 'worker.cjs');
  writeFileSync(workerPath, workerBody);
  const supportFiles = pythonSupportModules(worker).map((module) => {
    const path = join(runtimePath, ...module.split('/'));
    writeFileSync(path, module);
    return { path, sha256: sha256(module) };
  });
  return {
    root,
    options: {
      worker,
      pythonExecutable: executable,
      workerPath,
      workspacePath,
      artifactPath,
      pythonSha256: sha256(executableBody),
      workerSha256: sha256(workerBody),
      supportFiles,
      requestTimeout: 5000,
      maxArtifactBytes: 32,
      logger: createMockLogger(),
    },
  };
};

const analysisSchema = z.object({ resolved: z.array(z.string()) });
const { signal } = new AbortController();

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('PythonWorkerError', () => {
  it('carries the worker issues and joins their messages', () => {
    const issues = [
      { message: 'bad', code: 'X', type: 'runtime', severity: 'error' },
      { message: 'worse', code: 'Y', type: 'syntax', severity: 'error' },
    ] as const;

    expect(new PythonWorkerError(issues)).toMatchObject({ name: 'PythonWorkerError', message: 'bad; worse', issues });
  });
});

describe('createPythonSession', () => {
  it('refuses a worker manifest without every kernel and tau_kernel support module, naming the kernel', async () => {
    const { options } = fixture();
    const session = createPythonSession({ ...options, supportFiles: options.supportFiles.slice(0, -1) });

    await expect(session.request({ method: 'analyze', params: {}, schema: analysisSchema, signal })).rejects.toThrow(
      'Example worker manifest is missing tau_kernel/protocol.py.',
    );
    await session.cleanup();
  });

  it('verifies every support module digest under the kernel name before spawning', async () => {
    const { options } = fixture();
    const session = createPythonSession({
      ...options,
      supportFiles: options.supportFiles.map((file, index) =>
        index === 1 ? { ...file, sha256: '0'.repeat(64) } : file,
      ),
    });

    await expect(session.request({ method: 'analyze', params: {}, schema: analysisSchema, signal })).rejects.toThrow(
      /Example worker support files/u,
    );
    await session.cleanup();
  });

  it('writes artifacts for the worker and confines the ones it reads', async () => {
    const { options, root } = fixture();
    const session = createPythonSession(options);

    const written = await session.writeArtifact(new Uint8Array([1, 2, 3]), 'bundle.bin');

    expect(written.byteLength).toBe(3);
    expect(written.artifactPath.startsWith(join(options.artifactPath, ''))).toBe(true);
    expect(written.artifactPath.endsWith('.bundle.bin')).toBe(true);
    expect([...readFileSync(written.artifactPath)]).toEqual([1, 2, 3]);
    await expect(session.readArtifact(written)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(session.readArtifact({ artifactPath: join(root, 'outside.glb'), byteLength: 0 })).rejects.toThrow(
      /outside/u,
    );
    await expect(session.readArtifact({ artifactPath: '', byteLength: 0 })).rejects.toThrow();
    await session.cleanup();
  });

  it('ignores a stale release and a failed background operation, and cleans up twice', async () => {
    const { options } = fixture();
    const session = createPythonSession(options);

    session.release('shape', session.generation + 1);
    session.background(Promise.reject(new Error('best effort')));

    await expect(session.cleanup()).resolves.toBeUndefined();
    await expect(session.cleanup()).resolves.toBeUndefined();
    expect(session.isHandleGenerationValid(session.generation)).toBe(false);
  });

  it.skipIf(!sandboxAvailable)('maps worker issues to PythonWorkerError and releases handles', async () => {
    const { options } = fixture(
      respondingWorker(`request.method==='fail'
  ? {protocolVersion:1,requestId:request.requestId,error:{issues:[{message:'worker failed',code:'X',type:'runtime',severity:'error'}]}}
  : {protocolVersion:1,requestId:request.requestId,result:request.method==='analyze'?{resolved:['main.py']}:{}}`),
    );
    const session = createPythonSession(options);

    await expect(session.request({ method: 'analyze', params: {}, schema: analysisSchema, signal })).resolves.toEqual({
      resolved: ['main.py'],
    });
    const failure = session.request({ method: 'fail', params: {}, schema: analysisSchema, signal });
    await expect(failure).rejects.toBeInstanceOf(PythonWorkerError);
    await expect(failure).rejects.toMatchObject({ issues: [{ message: 'worker failed' }] });
    expect(session.isHandleGenerationValid(session.generation)).toBe(true);
    session.release('shape', session.generation);
    await session.cleanup();
    expect(session.isHandleGenerationValid(session.generation)).toBe(false);
  });

  it.skipIf(!sandboxAvailable)('settles a cancelled request as the caller abort', async () => {
    // Cooperative cancellation: the worker answers the cancel notification for the request it is running.
    const { options } = fixture(`${ready}
const readline=require('node:readline').createInterface({input:process.stdin});
let running;
readline.on('line',(line)=>{
 const frame=JSON.parse(line);
 if(frame.method==='cancel'){
  process.stdout.write(JSON.stringify({protocolVersion:1,requestId:running,error:{issues:[{message:'cancelled',code:'CANCELLED',type:'runtime',severity:'error'}]}})+'\\n');
  return;
 }
 if(frame.method==='shutdown'){
  process.stdout.write(JSON.stringify({protocolVersion:1,requestId:frame.requestId,result:{shutdown:true}})+'\\n');
  setTimeout(()=>process.exit(0),5);
  return;
 }
 running=frame.requestId;
 process.stderr.write('running\\n');
});
${keepAlive}`);
    const logger = createMockLogger();
    const session = createPythonSession({ ...options, logger, runtimePath: join(options.workerPath, '..') });
    const controller = new AbortController();
    const reason = new Error('caller cancelled');

    const pending = session.request({
      method: 'analyze',
      params: {},
      schema: analysisSchema,
      signal: controller.signal,
      cancelMethod: 'cancel',
    });
    // Abort once the worker runs the request; an abort during the sandboxed launch recycles instead of cancelling.
    await vi.waitFor(
      () => {
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('running'));
      },
      { timeout: 4000 },
    );
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    await session.cleanup();
  });
});
