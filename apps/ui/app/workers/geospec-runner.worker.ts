import { createRuntimeClient } from '@taucad/runtime';
import { fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { createFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileStat } from '@taucad/types';
import { discoverGeoSpecFiles } from 'geospec/runner';
import type { GeoSpecDiscoveryFileSystem } from 'geospec/runner';
import { createGeoSpecWebRunner } from 'geospec/runner/web';
import type { GeoSpecWebRunnerOptions } from 'geospec/runner/web';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
import { GeoSpecModelLoadError, loadModel } from 'geospec/model';
import type { GeoSpecModelLoader } from 'geospec/model';
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
  addEventListener(type: 'message', listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void): void;
  postMessage(message: GeoSpecRunnerWorkerResponse): void;
  close(): void;
};

type ProjectFileSystemBridge = Record<string, unknown> & {
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  lstat(path: string): Promise<FileStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  dispose(): void;
};

type GeoSpecVmFileSystem = GeoSpecWebRunnerOptions['filesystem'];

const workerScope = globalThis as unknown as WorkerScope;

const normalizeGeoSpecPath = (path: string): string => path.replaceAll('\\', '/').replace(/^\.\//u, '');

const normalizeProjectRootPath = (path: string): string => {
  const normalized = normalizeGeoSpecPath(path).replace(/\/+$/u, '');
  if (!normalized || normalized === '.') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const toProjectAbsolutePath = (path: string, projectRootPath: string): string => {
  const normalized = normalizeGeoSpecPath(path);
  if (normalized === projectRootPath || normalized.startsWith(`${projectRootPath}/`)) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return normalized;
  }
  return projectRootPath === '/' ? `/${normalized}` : `${projectRootPath}/${normalized}`;
};

const toBridgePath = (path: string, projectRootPath: string): string => toProjectAbsolutePath(path, projectRootPath);

const toRuntimeModelFile = (file: string, projectRootPath: string): string =>
  toProjectAbsolutePath(file, projectRootPath);

function createBridgeVmFileSystem(proxy: ProjectFileSystemBridge, projectRootPath: string): GeoSpecVmFileSystem {
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const bridgePath = toBridgePath(path, projectRootPath);
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
      return proxy.exists(toBridgePath(path, projectRootPath));
    },
    readFile,
    async writeFile(path: string, content: string): Promise<void> {
      await proxy.writeFile(toBridgePath(path, projectRootPath), content);
    },
    async ensureDir(path: string): Promise<void> {
      await proxy.mkdir(toBridgePath(path, projectRootPath), { recursive: true });
    },
  };
}

function createDiscoveryFileSystem(
  proxy: ProjectFileSystemBridge,
  projectRootPath: string,
): GeoSpecDiscoveryFileSystem {
  return {
    async readdir(path: string): Promise<readonly string[]> {
      return proxy.readdir(toBridgePath(path, projectRootPath));
    },
    async stat(path: string) {
      const stat = await proxy.stat(toBridgePath(path, projectRootPath));
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

const createProjectFileSystemProxy = (port: MessagePort): ProjectFileSystemBridge => {
  return createFileSystemBridgeProxy<ProjectFileSystemBridge>({
    port,
    dispose: () => {
      port.close();
    },
  });
};

const formatRuntimeConfigError = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  ) {
    return (error as { issues: Array<{ path?: Array<string | number>; message?: string }> }).issues
      .map((issue) => {
        const path = issue.path?.join('.') ?? 'runtimeConfig';
        return `${path}: ${issue.message ?? 'invalid value'}`;
      })
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
};

const isFatalRuntimeBootError = (error: unknown): boolean => {
  const consumedPortMessage = ['Port at index 0', ' is already neutered'].join('');
  if (error instanceof GeoSpecModelLoadError) {
    return error.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'RUNTIME_UNAVAILABLE' ||
        (diagnostic.code === 'MODEL_EXPORT_FAILED' &&
          typeof diagnostic.message === 'string' &&
          diagnostic.message.includes(consumedPortMessage)),
    );
  }
  return error instanceof Error && error.message.includes(consumedPortMessage);
};

type WorkerModelState = {
  fatalModelLoadError?: Error;
};

type WorkerSession = {
  sessionId: string;
  projectRootPath: string;
  vmFileSystem: ProjectFileSystemBridge;
  runtimeFileSystemPort: MessagePort;
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
      try {
        activeSession.runtimeFileSystemPort.close();
      } finally {
        activeSession.vmFileSystem.dispose();
      }
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

  let vmFileSystem: ProjectFileSystemBridge | undefined;
  let runtimeFileSystemPort: MessagePort | undefined;
  let runtimeClient: ReturnType<typeof createRuntimeClient> | undefined;
  let runner: ReturnType<typeof createGeoSpecWebRunner> | undefined;
  try {
    const runtimeConfigResult = uiRuntimeConfigSchema.safeParse(request.runtimeConfig);
    if (!runtimeConfigResult.success) {
      throw new Error(`RUNTIME_CONFIG_INVALID: ${formatRuntimeConfigError(runtimeConfigResult.error)}`);
    }

    const projectRootPath = normalizeProjectRootPath(request.projectRootPath);
    vmFileSystem = createProjectFileSystemProxy(request.vmFileSystemPort);
    runtimeFileSystemPort = request.runtimeFileSystemPort;
    const runtimeFileSystem = fromFileSystemBridge({
      port: runtimeFileSystemPort,
      dispose: () => {
        runtimeFileSystemPort?.close();
      },
    });
    runtimeClient = createRuntimeClient(
      createDefaultKernelOptions({
        fileSystem: runtimeFileSystem,
        runtimeConfig: runtimeConfigResult.data,
        ...(request.filePoolBuffer ? { filePoolBuffer: request.filePoolBuffer } : {}),
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
            Object.entries(input.code).map(([file, content]) => [toRuntimeModelFile(file, projectRootPath), content]),
          );
          return loadModel({
            ...input,
            code,
            file: toRuntimeModelFile(input.file, projectRootPath),
            projectPath: projectRootPath,
            runtime: runtimeClient,
          });
        }
        const file = toRuntimeModelFile(input.file, projectRootPath);
        return loadModel({
          ...input,
          file,
          projectPath: projectRootPath,
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
      filesystem: createBridgeVmFileSystem(vmFileSystem, projectRootPath),
      projectPath: projectRootPath,
      modelLoader,
    });
    const activeSession = {
      sessionId: request.sessionId,
      projectRootPath,
      vmFileSystem,
      runtimeFileSystemPort,
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
        try {
          runtimeFileSystemPort?.close();
        } finally {
          vmFileSystem?.dispose();
        }
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
      filesystem: createDiscoveryFileSystem(activeSession.vmFileSystem, activeSession.projectRootPath),
      projectPath: activeSession.projectRootPath,
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

workerScope.addEventListener('message', (event) => {
  const message = event.data;
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
});
