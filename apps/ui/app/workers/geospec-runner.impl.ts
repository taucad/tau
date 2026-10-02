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
 * What remains here is only the browser half: the engine's browser
 * registration, the bridge-backed filesystems, the kernel worker, and the
 * request queue. Discovery, model loading and result projection are
 * `@taucad/agent-tools/geospec`, which the daemon runs too.
 *
 * @module
 */

import { runGeoSpecTests } from '@taucad/agent-tools/geospec';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { fromFsLike } from '@taucad/runtime/filesystem';
import type { FsLike } from '@taucad/runtime/filesystem';
import type { FileStat } from '@taucad/types';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { assertRootedPath } from '@taucad/utils/path';
import type { GeoSpecDiscoveryFileSystem } from 'geospec/runner';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from 'geospec/runner/worker';
import { z } from 'zod';
import { createDefaultKernelOptions } from '#constants/kernel-worker.constants.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
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

type GeoSpecVmFileSystem = GeoSpecRunnerOptions['filesystem'];

const workerScope = globalThis as unknown as WorkerScope;
const candidateEncoder = new TextEncoder();
const candidateDecoder = new TextDecoder('utf-8', { fatal: true });
let foreignCandidates: ReadonlyArray<Uint8Array<ArrayBuffer>> = [];
let locallyEstablishedCandidates: Array<Uint8Array<ArrayBuffer>> = [];
let candidateSharingEnabled = false;

type ExactClusterSelector = Readonly<{ subjectHash: string; toleranceMm: number }>;

/** The one native fact family this browser candidate route can represent. */
export const exactClusterSelector = (request: Uint8Array<ArrayBuffer>): ExactClusterSelector | undefined => {
  try {
    const input: unknown = JSON.parse(candidateDecoder.decode(request));
    if (
      typeof input !== 'object' ||
      input === null ||
      !('method' in input) ||
      input.method !== 'submitClaims' ||
      !('plan' in input)
    ) {
      return undefined;
    }
    const { plan } = input;
    if (
      typeof plan !== 'object' ||
      plan === null ||
      !('subjects' in plan) ||
      !('claims' in plan) ||
      !Array.isArray(plan.subjects) ||
      !Array.isArray(plan.claims)
    ) {
      return undefined;
    }
    const claim = plan.claims[0] as unknown;
    if (
      typeof claim !== 'object' ||
      claim === null ||
      !('capability' in claim) ||
      claim.capability !== 'toHaveConnectedComponents' ||
      !('payload' in claim)
    ) {
      return undefined;
    }
    const { payload } = claim;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('kind' in payload) ||
      payload.kind !== 'connectedComponents'
    ) {
      return undefined;
    }
    const expected: unknown =
      'arguments' in payload && Array.isArray(payload.arguments) ? payload.arguments[0] : undefined;
    if (
      typeof expected !== 'object' ||
      expected === null ||
      !('toleranceMm' in expected) ||
      typeof expected.toleranceMm !== 'number' ||
      !Number.isFinite(expected.toleranceMm) ||
      expected.toleranceMm < 0
    ) {
      return undefined;
    }
    if (!('subjectSlots' in claim) || !Array.isArray(claim.subjectSlots) || claim.subjectSlots.length !== 1) {
      return undefined;
    }
    const slot: unknown = claim.subjectSlots[0];
    const subject: unknown = plan.subjects.find(
      (row: unknown) => typeof row === 'object' && row !== null && 'slot' in row && row.slot === slot,
    );
    if (typeof subject !== 'object' || subject === null) {
      return undefined;
    }
    const hash = 'subjectHash' in subject ? subject.subjectHash : undefined;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/u.test(hash)) {
      return undefined;
    }
    return { subjectHash: hash, toleranceMm: expected.toleranceMm };
  } catch {
    return undefined;
  }
};

const candidateControl = (
  input: Readonly<{
    engine: { processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> };
    canonicalize: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    selector: ExactClusterSelector;
    operation: 'export' | 'compare';
    candidate?: unknown;
  }>,
): Record<string, unknown> => {
  const { engine, canonicalize, selector, operation, candidate } = input;
  const control =
    candidate === undefined
      ? { operation, subjectHash: selector.subjectHash, toleranceMm: selector.toleranceMm }
      : { candidate, operation, subjectHash: selector.subjectHash, toleranceMm: selector.toleranceMm };
  const bytes = canonicalize(candidateEncoder.encode(JSON.stringify({ _tauNativeExactClusterCandidateV1: control })));
  const result: unknown = JSON.parse(candidateDecoder.decode(engine.processRequest(bytes)));
  return typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {};
};

/** Local assertion first; private work is conditional and never changes its result. */
export const withCandidate = <T>(
  input: Readonly<{
    request: Uint8Array<ArrayBuffer>;
    evaluate: () => T;
    engine: { processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> };
    canonicalize: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    enabled: boolean;
  }>,
): T => {
  const result = input.evaluate();
  if (!input.enabled || locallyEstablishedCandidates.length > 0) {
    return result;
  }
  const selector = exactClusterSelector(input.request);
  if (selector === undefined) {
    return result;
  }
  try {
    const { candidate } = candidateControl({
      engine: input.engine,
      canonicalize: input.canonicalize,
      selector,
      operation: 'export',
    });
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'address' in candidate &&
      typeof candidate.address === 'object' &&
      candidate.address !== null &&
      'actionSha256' in candidate.address &&
      typeof candidate.address.actionSha256 === 'string'
    ) {
      const { actionSha256 } = candidate.address;
      if (locallyEstablishedCandidates.length === 0) {
        locallyEstablishedCandidates.push(candidateEncoder.encode(JSON.stringify(candidate)));
      }
      const matching = foreignCandidates.find((bytes) => {
        try {
          const foreign: unknown = JSON.parse(candidateDecoder.decode(bytes));
          return (
            typeof foreign === 'object' &&
            foreign !== null &&
            'address' in foreign &&
            typeof foreign.address === 'object' &&
            foreign.address !== null &&
            'actionSha256' in foreign.address &&
            foreign.address.actionSha256 === actionSha256
          );
        } catch {
          return false;
        }
      });
      if (matching !== undefined) {
        const foreign: unknown = JSON.parse(candidateDecoder.decode(matching));
        candidateControl({
          engine: input.engine,
          canonicalize: input.canonicalize,
          selector,
          operation: 'compare',
          candidate: foreign,
        });
      }
    }
  } catch {
    // Optional candidate work cannot change a completed local assertion.
  }
  return result;
};

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

type WorkerSession = {
  sessionId: string;
  fileSystem: ProjectFileSystemBridge;
  runtimeClient: AppRuntimeClient;
  runner: GeoSpecRunner;
  closeEngine?: (() => void) | undefined;
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
        activeSession.closeEngine?.();
      } finally {
        activeSession.fileSystem.dispose();
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

  let fileSystem: ProjectFileSystemBridge | undefined;
  let runtimeClient: AppRuntimeClient | undefined;
  let runner: GeoSpecRunner | undefined;
  let closeEngine: (() => void) | undefined;
  try {
    const runtimeConfigResult = uiRuntimeConfigSchema.safeParse(request.runtimeConfig);
    if (!runtimeConfigResult.success) {
      throw new Error(`RUNTIME_CONFIG_INVALID: ${formatRuntimeConfigError(runtimeConfigResult.error)}`);
    }

    fileSystem = await createProjectFileSystemProxy(request.fileSystemPort);
    const runtimeFileSystem = fromFsLike(createRuntimeFsLike(fileSystem));
    runtimeClient = createRuntimeClient<AnyRuntimeDefinition>(
      createDefaultKernelOptions({
        fileSystem: runtimeFileSystem,
        runtimeConfig: runtimeConfigResult.data,
      }),
    );
    {
      const [native, { createNativeGeoSpecRunner }] = await Promise.all([
        import('@taucad/geospec-engine-native'),
        import('geospec/runner/native'),
      ]);
      await native.initialize();
      const engine = new native.Engine();
      closeEngine = () => {
        engine.close();
      };
      const candidateEngine = {
        ingestSubject: (...args: Parameters<typeof engine.ingestSubject>) => engine.ingestSubject(...args),
        subjectHandle: (requestBytes: Uint8Array<ArrayBuffer>) => engine.subjectHandle(requestBytes),
        releaseSubject: (requestBytes: Uint8Array<ArrayBuffer>) => engine.releaseSubject(requestBytes),
        processRequest: (requestBytes: Uint8Array<ArrayBuffer>) =>
          withCandidate({
            request: requestBytes,
            evaluate: () => engine.processRequest(requestBytes),
            engine,
            canonicalize: native.canonicalize,
            enabled: candidateSharingEnabled,
          }),
        evaluateClaim: (requestBytes: Uint8Array<ArrayBuffer>) =>
          withCandidate({
            request: requestBytes,
            evaluate: () => engine.evaluateClaim(requestBytes),
            engine,
            canonicalize: native.canonicalize,
            enabled: candidateSharingEnabled,
          }),
      };
      const projectFiles = fileSystem;

      runner = createNativeGeoSpecRunner({
        filesystem: createBridgeVmFileSystem(fileSystem),
        // PERF-OUTPUT-01: the product selects the bounded success evidence (ruling 13).
        nativeAssertions: { engine: candidateEngine, evidenceProfile: 'bounded' },
        model: {
          runtime: runtimeClient,
          readSource: async (source) => {
            if (typeof source !== 'string') {
              throw new TypeError('Project GeoSpec sources must be rooted filesystem paths or in-memory bytes.');
            }
            return projectFiles.readFile(assertRootedPath(source));
          },
        },
      });
    }
    const activeSession = {
      sessionId: request.sessionId,
      fileSystem,
      runtimeClient,
      runner,
      closeEngine,
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
          closeEngine?.();
        } finally {
          fileSystem?.dispose();
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

  foreignCandidates = request.candidates ?? [];
  candidateSharingEnabled = request.candidateSharingEnabled === true;
  locallyEstablishedCandidates = [];

  try {
    const output = await runGeoSpecTests({
      discovery: createDiscoveryFileSystem(activeSession.fileSystem),
      runner: activeSession.runner,
      args: request.args,
    });
    workerScope.postMessage({
      type: 'result',
      requestId: request.requestId,
      result: { success: true, ...output },
      candidates: locallyEstablishedCandidates,
    });
  } catch (error) {
    postError(request.requestId, error instanceof Error ? error.message : 'GeoSpec worker failed to run tests.');
  } finally {
    foreignCandidates = [];
    locallyEstablishedCandidates = [];
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
