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
