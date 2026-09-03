/**
 * The GeoSpec runner worker's implementation, loaded by
 * `geospec-runner.worker.ts` through a dynamic import.
 *
 * Everything heavy lives here rather than in the worker entry on purpose: a
 * module worker whose entry graph fails to evaluate is silent in Chrome — no
 * `error` event, no `messageerror`, no console output — so a failure anywhere
 * under this graph would only ever surface as the client's init timeout. Behind
 * a dynamic import the same failure is a rejected promise the entry can report.
 *
 * @module
 */

import '@taucad/geospec-engine/register';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromFsLike } from '@taucad/runtime/filesystem';
import type { FsLike } from '@taucad/runtime/filesystem';
import type { FileStat } from '@taucad/types';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { assertRootedPath } from '@taucad/utils/path';
import { discoverGeoSpecFiles } from 'geospec/runner';
import type { GeoSpecDiscoveryFileSystem } from 'geospec/runner';
import { createGeoSpecWebRunner } from 'geospec/runner/web';
import type { GeoSpecWebRunnerOptions } from 'geospec/runner/web';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
import { GeoSpecModelLoadError, loadModel } from 'geospec/model';
import type { GeoSpecModelLoader } from 'geospec/model';
import { z } from 'zod';
import { createDefaultKernelOptions } from '#constants/kernel-worker.constants.js';
import { runnerResultToTestModelOutput } from '#lib/geospec-rpc-result.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.definition.js';
import type {
  GeoSpecRunnerWorkerInitializeRequest,
  GeoSpecRunnerWorkerRequest,
  GeoSpecRunnerWorkerResponse,
  GeoSpecRunnerWorkerRunRequest,
} from '#workers/geospec-runner.types.js';

type WorkerScope = {
  postMessage(message: GeoSpecRunnerWorkerResponse): void;
  close(): void;
};

type ProjectFileSystemBridge = Pick<
  FileSystemBridgeProxy,
  | 'readFile'
  | 'writeFile'
  | 'readdir'
  | 'stat'
  | 'lstat'
  | 'mkdir'
  | 'unlink'
  | 'rmdir'
  | 'rename'
  | 'exists'
  | 'dispose'
>;

type GeoSpecVmFileSystem = GeoSpecWebRunnerOptions['filesystem'];

const workerScope = globalThis as unknown as WorkerScope;

function createBridgeVmFileSystem(proxy: ProjectFileSystemBridge): GeoSpecVmFileSystem {
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const bridgePath = assertRootedPath(path);
    if (encoding === 'utf8') {
      return proxy.readFile(bridgePath, 'utf8');
    }
    const bytes = await proxy.readFile(bridgePath);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
  }

  return {
    async exists(path: string): Promise<boolean> {
      return proxy.exists(assertRootedPath(path));
    },
    readFile,
    async writeFile(path: string, content: string): Promise<void> {
      await proxy.writeFile(assertRootedPath(path), content);
    },
    async ensureDir(path: string): Promise<void> {
      await proxy.mkdir(assertRootedPath(path), { recursive: true });
    },
  };
}

function createDiscoveryFileSystem(proxy: ProjectFileSystemBridge): GeoSpecDiscoveryFileSystem {
  return {
    async readdir(path: string): Promise<readonly string[]> {
      return proxy.readdir(assertRootedPath(path));
    },
    async stat(path: string) {
      const stat = await proxy.stat(assertRootedPath(path));
      return { kind: stat.type === 'dir' ? 'directory' : 'file' };
    },
  };
}

const hasGeoSpecSelectionFilters = (args: GeoSpecRunnerWorkerRunRequest['args']): boolean =>
  Boolean(
    (args.files !== undefined && args.files.length > 0) ||
    (args.include !== undefined && args.include.length > 0) ||
    (args.exclude !== undefined && args.exclude.length > 0) ||
    (args.testNamePattern ?? '') !== '',
  );

const createProjectFileSystemProxy = async (port: MessagePort): Promise<ProjectFileSystemBridge> => {
  const { createTransferredFileSystemBridgeProxy } = await import('@taucad/fs-bridge');
  const proxy = createTransferredFileSystemBridgeProxy(port);
  await proxy.ready;
  return proxy;
};

const createRuntimeFsLike = (proxy: ProjectFileSystemBridge): FsLike => {
  const toNativeStat = async (stat: FileStat) => {
    return {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      isDirectory: () => stat.type === 'dir',
    };
  };

  return {
    promises: {
      readFile: proxy.readFile.bind(proxy),
      writeFile: proxy.writeFile.bind(proxy),
      mkdir: proxy.mkdir.bind(proxy),
      readdir: proxy.readdir.bind(proxy),
      unlink: proxy.unlink.bind(proxy),
      rmdir: proxy.rmdir.bind(proxy),
      rename: proxy.rename.bind(proxy),
      stat: async (path) => toNativeStat(await proxy.stat(path)),
      lstat: async (path) => toNativeStat(await proxy.lstat(path)),
    },
  };
};

const formatRuntimeConfigError = (error: unknown): string => {
  if (error instanceof z.ZodError) {
    return z.prettifyError(error);
  }
  return error instanceof Error ? error.message : String(error);
};

const isFatalRuntimeBootError = (error: unknown): boolean => {
  if (error instanceof GeoSpecModelLoadError) {
    return error.diagnostics.some((diagnostic) => diagnostic.code === 'RUNTIME_UNAVAILABLE');
  }
  return false;
};

type WorkerModelState = {
  fatalModelLoadError?: Error;
};

type WorkerSession = {
  sessionId: string;
  fileSystem: ProjectFileSystemBridge;
  runtimeClient: ReturnType<typeof createRuntimeClient>;
  runner: ReturnType<typeof createGeoSpecWebRunner>;
  modelState: WorkerModelState;
};

type QueuedRun = {
  request: GeoSpecRunnerWorkerRunRequest;
};

let session: WorkerSession | undefined;
let activeRun: QueuedRun | undefined;
const runQueue: QueuedRun[] = [];
let processingQueue = false;
let closing = false;

const postError = (requestId: string, message: string): void => {
  workerScope.postMessage({
    type: 'error',
    requestId,
    message,
  });
};

const disposeSession = async (): Promise<void> => {
  const activeSession = session;
  session = undefined;
  if (!activeSession) {
    return;
  }

  try {
    await activeSession.runner.close();
  } finally {
    try {
      activeSession.runtimeClient.terminate();
    } finally {
      activeSession.fileSystem.dispose();
    }
  }
};

const initializeGeoSpecWorker = async (request: GeoSpecRunnerWorkerInitializeRequest): Promise<void> => {
  if (session) {
    if (session.sessionId === request.sessionId) {
      workerScope.postMessage({ type: 'initialized', requestId: request.requestId, sessionId: request.sessionId });
      return;
    }
    await disposeSession();
  }

  let fileSystem: ProjectFileSystemBridge | undefined;
  let runtimeClient: ReturnType<typeof createRuntimeClient> | undefined;
  let runner: ReturnType<typeof createGeoSpecWebRunner> | undefined;
  try {
    const runtimeConfigResult = uiRuntimeConfigSchema.safeParse(request.runtimeConfig);
    if (!runtimeConfigResult.success) {
      throw new Error(`RUNTIME_CONFIG_INVALID: ${formatRuntimeConfigError(runtimeConfigResult.error)}`);
    }

    fileSystem = await createProjectFileSystemProxy(request.fileSystemPort);
    const runtimeFileSystem = fromFsLike(createRuntimeFsLike(fileSystem));
    runtimeClient = createRuntimeClient(
      createDefaultKernelOptions({
        fileSystem: runtimeFileSystem,
        runtimeConfig: runtimeConfigResult.data,
      }),
    );
    const modelState: WorkerModelState = {};
    const modelLoader: GeoSpecModelLoader = async (input) => {
      if (modelState.fatalModelLoadError) {
        throw modelState.fatalModelLoadError;
      }
      const load = async () => {
        if ('source' in input) {
          return loadModel(input);
        }
        if ('code' in input) {
          const code = Object.fromEntries(
            Object.entries(input.code).map(([file, content]) => [assertRootedPath(file), content]),
          );
          return loadModel({
            ...input,
            code,
            file: assertRootedPath(input.file),
            projectPath: '',
            runtime: runtimeClient,
          });
        }
        const file = assertRootedPath(input.file);
        return loadModel({
          ...input,
          file,
          projectPath: '',
          runtime: runtimeClient,
        });
      };

      if ('source' in input) {
        return load();
      }
      try {
        return await load();
      } catch (error) {
        if (isFatalRuntimeBootError(error)) {
          modelState.fatalModelLoadError = error instanceof Error ? error : new Error(String(error));
        }
        throw error;
      }
    };
    runner = createGeoSpecWebRunner({
      filesystem: createBridgeVmFileSystem(fileSystem),
      modelLoader,
    });
    const activeSession = {
      sessionId: request.sessionId,
      fileSystem,
      runtimeClient,
      runner,
      modelState,
    };
    session = activeSession;
    workerScope.postMessage({ type: 'initialized', requestId: request.requestId, sessionId: request.sessionId });
  } catch (error) {
    try {
      await runner?.close();
    } finally {
      try {
        runtimeClient?.terminate();
      } finally {
        fileSystem?.dispose();
      }
    }
    postError(request.requestId, error instanceof Error ? error.message : 'GeoSpec worker failed to initialize.');
  }
};

const runGeoSpecInWorker = async (request: GeoSpecRunnerWorkerRunRequest): Promise<void> => {
  const activeSession = session;
  if (!activeSession || activeSession.sessionId !== request.sessionId) {
    postError(request.requestId, 'GeoSpec worker session is not initialized.');
    return;
  }

  delete activeSession.modelState.fatalModelLoadError;

  try {
    const discovery = await discoverGeoSpecFiles({
      filesystem: createDiscoveryFileSystem(activeSession.fileSystem),
      projectPath: '',
      files: request.args.files,
      include: request.args.include,
      exclude: request.args.exclude,
    });
    const entryPaths = discovery.files;
    const runResult: GeoSpecRunnerResult =
      entryPaths.length === 0
        ? { success: false, passed: 0, failed: 1, selectedTests: 0, files: [] }
        : await activeSession.runner.run({
            files: entryPaths,
            testNamePattern: request.args.testNamePattern,
            testTimeout: request.args.testTimeout,
          });
    const output = runnerResultToTestModelOutput(runResult, entryPaths, {
      filtersApplied: hasGeoSpecSelectionFilters(request.args),
    });
    workerScope.postMessage({
      type: 'result',
      requestId: request.requestId,
      result: { success: true, ...output },
    });
  } catch (error) {
    postError(request.requestId, error instanceof Error ? error.message : 'GeoSpec worker failed to run tests.');
  }
};

const processRunQueue = async (): Promise<void> => {
  if (processingQueue || closing) {
    return;
  }
  processingQueue = true;
  try {
    while (runQueue.length > 0) {
      activeRun = runQueue.shift();
      if (!activeRun) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- GeoSpec CAD runs are intentionally serialized for deterministic runtime pressure.
      await runGeoSpecInWorker(activeRun.request);
      activeRun = undefined;
    }
  } finally {
    activeRun = undefined;
    processingQueue = false;
  }
};

const abortRun = (message: Extract<GeoSpecRunnerWorkerRequest, { type: 'abort' }>): void => {
  if (activeRun?.request.requestId === message.targetRequestId && session?.sessionId === message.sessionId) {
    session.runner.abort(message.reason);
    return;
  }
  const queuedIndex = runQueue.findIndex((entry) => entry.request.requestId === message.targetRequestId);
  if (queuedIndex === -1) {
    return;
  }
  const [queued] = runQueue.splice(queuedIndex, 1);
  if (queued) {
    postError(queued.request.requestId, message.reason ?? 'GeoSpec run aborted.');
  }
};

const closeWorker = async (request: Extract<GeoSpecRunnerWorkerRequest, { type: 'close' }>): Promise<void> => {
  closing = true;
  if (activeRun && session) {
    session.runner.abort('GeoSpec worker closed.');
  }
  for (const queued of runQueue.splice(0)) {
    postError(queued.request.requestId, 'GeoSpec worker closed.');
  }
  await disposeSession();
  workerScope.postMessage({ type: 'closed', requestId: request.requestId, sessionId: request.sessionId });
  workerScope.close();
};

/**
 * Handle one request from the worker client. The entry buffers requests that
 * arrive while this module is still loading and replays them here in order.
 *
 * @public
 */
export const handleGeoSpecRunnerRequest = (message: GeoSpecRunnerWorkerRequest): void => {
  if (message.type === 'initialize') {
    void initializeGeoSpecWorker(message);
    return;
  }
  if (message.type === 'abort') {
    abortRun(message);
    return;
  }
  if (message.type === 'close') {
    void closeWorker(message);
    return;
  }
  runQueue.push({ request: message });
  void processRunQueue();
};
