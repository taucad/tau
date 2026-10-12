import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';

/** Run one permission probe. */
const denied = async (probe) => {
  try {
    await probe;
    return false;
  } catch {
    return true;
  }
};

/**
 * Whether a worker started with `options` is refused, or cannot read a file
 * outside the child's grants.
 *
 * @param options - The worker's own options.
 * @returns Whether it was contained.
 */
const refusesWorker = async (options) => {
  const { Worker } = /** @type {typeof import('node:worker_threads')} */ (process.getBuiltinModule('worker_threads'));
  const workerOptions = /** @type {import('node:worker_threads').WorkerOptions} */ (options);
  try {
    const worker = new Worker(
      "const { parentPort } = require('node:worker_threads'); let read = true; try { require('node:fs').readFileSync('/etc/hosts'); } catch { read = false; } parentPort.postMessage(read);",
      { eval: true, ...workerOptions },
    );
    const answer = await once(worker, 'message');
    await worker.terminate();
    return answer[0] !== true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ERR_ACCESS_DENIED';
  }
};

/** Detect Node permission failures without treating network refusal as containment. */
const isPermissionError = (error) => {
  if (!(error instanceof Error) || !('cause' in error) || typeof error.cause !== 'object' || error.cause === null) {
    return false;
  }
  const { cause: rawCause } = error;
  const cause = /** @type {{ code?: string; errno?: { code?: string } }} */ (rawCause);
  return cause.code === 'ERR_ACCESS_DENIED' || cause.errno?.code === 'ERR_ACCESS_DENIED';
};

/** Run the requested permission proof. */
const handleStart = async (message) => {
  if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'start') {
    return;
  }
  const [outputPath, networkUrl] = process.argv.slice(2);
  if (!outputPath || !networkUrl) {
    throw new TypeError('Permission fixture requires an output path and network URL.');
  }
  const filesystem = /** @type {typeof import('node:fs')} */ (process.getBuiltinModule('fs'));
  const childProcess = /** @type {typeof import('node:child_process')} */ (process.getBuiltinModule('child_process'));
  const workerThreads = /** @type {typeof import('node:worker_threads')} */ (
    process.getBuiltinModule('worker_threads')
  );
  const wasi = /** @type {typeof import('node:wasi')} */ (process.getBuiltinModule('wasi'));
  const inspector = /** @type {typeof import('node:inspector')} */ (process.getBuiltinModule('inspector'));
  const os = /** @type {typeof import('node:os')} */ (process.getBuiltinModule('os'));
  const path = process.getBuiltinModule('path');
  const url = /** @type {typeof import('node:url')} */ (process.getBuiltinModule('url'));
  const networkResponse = await fetch(networkUrl);
  const proof = {
    filesystem: await denied(
      (async () => {
        filesystem.readFileSync('/etc/hosts');
      })(),
    ),
    childProcess: await denied(
      (async () => {
        childProcess.execFileSync(process.execPath, ['--version']);
      })(),
    ),
    worker: await denied(
      (async () => {
        const worker = new workerThreads.Worker('0', { eval: true });
        await worker.terminate();
      })(),
    ),
    /* A worker carries its own permission flags: Node cannot let the host start
     * workers and refuse these, so the child may start none (operator ruling Q8). */
    workerExecArgvEscalation: await refusesWorker({
      execArgv: ['--permission', '--allow-fs-read=*', '--allow-child-process'],
    }),
    workerNodeOptionsEscalation: await refusesWorker({
      env: { ...process.env, NODE_OPTIONS: '--allow-fs-read=*' },
    }),
    addon: await denied(
      (async () => {
        process.dlopen({ exports: {} }, new URL('missing.node', import.meta.url).pathname);
      })(),
    ),
    wasi: await denied(
      (async () => {
        return new wasi.WASI({ version: 'preview1' });
      })(),
    ),
    inspector: await denied(
      (async () => {
        inspector.open(0, '127.0.0.1', false);
        inspector.close();
      })(),
    ),
    /* A bundling kernel writes its bundle to `os.tmpdir()` and imports it back. */
    temporaryDirectoryReadable: await (async () => {
      const temporaryFile = path.join(os.tmpdir(), 'permission-proof.mjs');
      await writeFile(temporaryFile, 'export default true;');
      const module = /** @type {{ default: unknown }} */ (await import(url.pathToFileURL(temporaryFile).href));
      return module.default === true;
    })().catch(() => false),
    temporaryDirectory: os.tmpdir(),
    environmentSecretAbsent: process.env.TAU_HOST_TEST_SECRET === undefined,
    network: networkResponse.ok,
    arbitraryNetworkAllowed: await (async () => {
      try {
        await fetch('http://127.0.0.2:9');
        return true;
      } catch (error) {
        return !isPermissionError(error);
      }
    })(),
  };
  await writeFile(outputPath, JSON.stringify(proof));
  process.send?.({ type: 'ready', url: 'ws://127.0.0.1:9', runtimeVersion: 'permission-proof' });
};

process.once('message', handleStart);

process.once('message', (message) => {
  if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'close') {
    process.exit(0);
  }
});
