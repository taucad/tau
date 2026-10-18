// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { geoSpecDefaultMaxRunBudget, geoSpecDefaultMaxWorkUnitLimit } from '@taucad/chat/constants';
import { projectGeoSpecTest } from '@taucad/agent-tools/geospec';
import { createChatToolRegistry } from '@taucad/agent-tools/registry';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import type { openFileSystemBridge as OpenFileSystemBridgeFunction } from '@taucad/fs-bridge';
import { createGeoSpecWorkerRpcClient, geoSpecClientWorstCaseTimeout } from '#workers/geospec-runner.client.js';
import type { GeoSpecRunnerWorkerRequest, GeoSpecRunnerWorkerResponse } from '#workers/geospec-runner.types.js';

type WorkerMessageListener = (event: MessageEvent<GeoSpecRunnerWorkerResponse>) => void;
type WorkerErrorListener = (event: ErrorEvent) => void;
type FileSystemBridgeConnectMessage = {
  type: string;
  port: MessagePort;
};

let openFileSystemBridge: typeof OpenFileSystemBridgeFunction;
let filesystemBridgeConnectMessageType: string;

beforeAll(async () => {
  ({ filesystemBridgeConnectMessageType, openFileSystemBridge } = await import('@taucad/fs-bridge'));
});

const successResult = (requestId: string): Extract<GeoSpecRunnerWorkerResponse, { type: 'result' }> => ({
  type: 'result',
  requestId,
  result: {
    success: true,
    failures: [],
    passes: [
      {
        id: 'main.geospec.ts:geometry > should pass',
        requirement: 'geometry > should pass',
        targetFile: 'main.geospec.ts',
      },
    ],
    passed: 1,
    total: 1,
  },
});

class FakeGeoSpecWorker {
  public readonly postMessage = vi.fn((message: GeoSpecRunnerWorkerRequest, _transfer?: Transferable[]) => {
    if (message.type === 'initialize' && this.autoInitialize) {
      queueMicrotask(() => {
        this.emitMessage({
          type: 'initialized',
          requestId: message.requestId,
          sessionId: message.sessionId,
        });
      });
      return;
    }
    if (message.type === 'run' && this.autoResolveRuns) {
      queueMicrotask(() => {
        this.emitMessage(successResult(message.requestId));
      });
      return;
    }
    if (message.type === 'close') {
      queueMicrotask(() => {
        this.emitMessage({
          type: 'closed',
          requestId: message.requestId,
          sessionId: message.sessionId,
        });
      });
    }
  });

  public readonly terminate = vi.fn();
  public autoResolveRuns = true;
  public autoInitialize = true;
  private messageListener: WorkerMessageListener | undefined;
  private errorListener: WorkerErrorListener | undefined;

  public emitMessage(response: GeoSpecRunnerWorkerResponse): void {
    this.messageListener?.({ data: response } as MessageEvent<GeoSpecRunnerWorkerResponse>);
  }

  public emitError(message: string): void {
    this.errorListener?.({ message } as ErrorEvent);
  }

  public addEventListener(type: 'message', listener: WorkerMessageListener): void;
  public addEventListener(type: 'error', listener: WorkerErrorListener): void;
  public addEventListener(type: 'message' | 'error', listener: WorkerMessageListener | WorkerErrorListener): void {
    if (type === 'message') {
      this.messageListener = listener as WorkerMessageListener;
    } else {
      this.errorListener = listener as WorkerErrorListener;
    }
  }

  public removeEventListener(type: 'message', listener: WorkerMessageListener): void;
  public removeEventListener(type: 'error', listener: WorkerErrorListener): void;
  public removeEventListener(type: 'message' | 'error', listener: WorkerMessageListener | WorkerErrorListener): void {
    if (type === 'message' && this.messageListener === listener) {
      this.messageListener = undefined;
    }
    if (type === 'error' && this.errorListener === listener) {
      this.errorListener = undefined;
    }
  }
}

class FakeFileManagerWorker {
  public readonly postMessage = vi.fn();
}

const createOpenFileSystemBridge = (worker: FakeFileManagerWorker) => (): ReturnType<typeof openFileSystemBridge> =>
  openFileSystemBridge(worker);

const runtimeConfig = {
  tauApiUrl: 'https://api.tau.test',
  tauWebSocketUrl: 'wss://api.tau.test',
};

const fileManagerPostMessageCall = (
  worker: FakeFileManagerWorker,
  index: number,
): [FileSystemBridgeConnectMessage, Transferable[]] =>
  worker.postMessage.mock.calls[index] as unknown as [FileSystemBridgeConnectMessage, Transferable[]];

const geoSpecPostMessageCall = (
  worker: FakeGeoSpecWorker,
  index: number,
): [GeoSpecRunnerWorkerRequest, Transferable[] | undefined] =>
  worker.postMessage.mock.calls[index] as unknown as [GeoSpecRunnerWorkerRequest, Transferable[] | undefined];

describe('createGeoSpecWorkerRpcClient', () => {
  it('should initialize without engine negotiation and use candidate sharing by default', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    const fetch = vi.fn(async (): Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>> => []);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
      candidateSync: { fetch, publish: async () => undefined },
    });
    try {
      await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toMatchObject({ success: true });
      expect(fetch).toHaveBeenCalledOnce();
      expect(geoSpecPostMessageCall(geoSpecWorker, 0)[0]).not.toHaveProperty('geoSpecEngine');
    } finally {
      await client.close();
    }
  });

  it('isolates an optional candidate-fetch failure from a native GeoSpec result', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    const fetch = vi.fn(async (): Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>> => {
      throw new Error('offline');
    });
    const publish = vi.fn(async () => undefined);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
      candidateSync: { fetch, publish },
    });
    await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toMatchObject({ success: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(geoSpecPostMessageCall(geoSpecWorker, 1)[0]).toMatchObject({
      type: 'run',
      candidates: [],
      candidateSharingEnabled: false,
    });
    expect(publish).not.toHaveBeenCalled();
    await client.close();
  });

  it('publishes candidates only for a live successful run', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    geoSpecWorker.autoResolveRuns = false;
    const publish = vi.fn(async () => undefined);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
      candidateSync: { fetch: async () => [], publish },
    });
    const candidate = new TextEncoder().encode('{}');
    const controller = new AbortController();
    const first = client.runTests({ files: ['main.geospec.ts'] }, { signal: controller.signal });
    await vi.waitFor(() => {
      expect(geoSpecWorker.postMessage).toHaveBeenCalledTimes(2);
    });
    const [firstRequest] = geoSpecPostMessageCall(geoSpecWorker, 1);
    if (firstRequest.type !== 'run') {
      throw new Error('Expected run request.');
    }
    geoSpecWorker.emitMessage({ ...successResult('unsolicited'), candidates: [candidate] });
    controller.abort();
    geoSpecWorker.emitMessage({ ...successResult(firstRequest.requestId), candidates: [candidate] });
    await expect(first).resolves.toMatchObject({ success: false });
    expect(publish).not.toHaveBeenCalled();

    const second = client.runTests({ files: ['main.geospec.ts'] });
    await vi.waitFor(() => {
      expect(geoSpecWorker.postMessage).toHaveBeenCalledTimes(4);
    });
    const [secondRequest] = geoSpecPostMessageCall(geoSpecWorker, 3);
    if (secondRequest.type !== 'run') {
      throw new Error('Expected second run request.');
    }
    geoSpecWorker.emitMessage({ ...successResult(secondRequest.requestId), candidates: [candidate] });
    await expect(second).resolves.toMatchObject({ success: true });
    expect(publish).toHaveBeenCalledOnce();
    await client.close();
  });

  it("should bound a started call by startup, the host's longest run budget and the abort grace", () => {
    // No outer RPC budget bounds a browser-placed test_model call, so the client's own bound is the only one.
    expect(geoSpecClientWorstCaseTimeout()).toBe(10_000 + geoSpecDefaultMaxRunBudget + 5000);
    expect(geoSpecClientWorstCaseTimeout(3_600_000)).toBe(10_000 + 3_600_000 + 5000);
  });

  it('should refuse a call above the host maxima before starting a worker, and accept a host that raised them', async () => {
    const createWorker = vi.fn(() => new FakeGeoSpecWorker() as unknown as Worker);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(new FakeFileManagerWorker()),
      runtimeConfig,
      createWorker,
    });
    const overBudget = await client.runTests({
      files: ['main.geospec.ts'],
      testTimeout: geoSpecDefaultMaxRunBudget + 1,
    });
    expect(overBudget).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(overBudget.success ? '' : overBudget.message).toContain('maxRunBudget');
    const overWork = await client.runTests({
      files: ['main.geospec.ts'],
      workUnitLimit: geoSpecDefaultMaxWorkUnitLimit + 1,
    });
    expect(overWork).toMatchObject({ success: false, errorCode: 'VALIDATION_ERROR' });
    expect(overWork.success ? '' : overWork.message).toContain('maxWorkUnitLimit');
    expect(createWorker).not.toHaveBeenCalled();
    await client.close();

    const geoSpecWorker = new FakeGeoSpecWorker();
    const raised = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(new FakeFileManagerWorker()),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
      maxRunBudget: 3_600_000,
      maxWorkUnitLimit: 4_000_000_000,
    });
    await expect(
      raised.runTests({ files: ['main.geospec.ts'], testTimeout: 1_800_000, workUnitLimit: 2_000_000_000 }),
    ).resolves.toMatchObject({ success: true });
    const messages = geoSpecWorker.postMessage.mock.calls.map(([message]) => message);
    expect(messages.find((message) => message.type === 'initialize')).toMatchObject({
      maxWorkUnitLimit: 4_000_000_000,
    });
    expect(messages.find((message) => message.type === 'run')).toMatchObject({
      args: { workUnitLimit: 2_000_000_000 },
    });
    await raised.close();
    expect(() =>
      createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(new FakeFileManagerWorker()),
        runtimeConfig,
        maxRunBudget: 0,
      }),
    ).toThrow('maxRunBudget must be a positive safe integer');
  });

  it('should reuse one default compiled worker across repeated successful test runs', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    const createWorker = vi.fn(() => geoSpecWorker as unknown as Worker);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker,
    });

    const registry = createChatToolRegistry({
      fileSystemFor: () => mock<RpcFileSystem>(),
      geospec: client,
      testingEnabled: true,
    });
    const description = registry.list().find((tool) => tool.name === 'test_model')?.description;
    expect(description).toContain('expectGeo');
    expect(description).toContain('loadModel');
    expect(description).not.toContain('expectNativeGeo');
    expect(createWorker).not.toHaveBeenCalled();

    const args = {
      files: ['main.geospec.ts'],
      testNamePattern: 'should pass',
      testTimeout: 5000,
    };
    const first = await client.runTests(args);
    const second = await client.runTests(args);

    expect(first).toEqual(expect.objectContaining({ success: true, passed: 1, total: 1 }));
    expect(second).toEqual(expect.objectContaining({ success: true, passed: 1, total: 1 }));
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(fileManagerWorker.postMessage).toHaveBeenCalledOnce();
    const bridgeCall = fileManagerPostMessageCall(fileManagerWorker, 0);
    expect(bridgeCall[0].type).toBe(filesystemBridgeConnectMessageType);
    expect(bridgeCall[0].port).toBeDefined();
    expect(bridgeCall[1]).toEqual([bridgeCall[0].port]);

    const [initializeMessage, initializeTransferables] = geoSpecPostMessageCall(geoSpecWorker, 0);
    expect(initializeMessage.type).toBe('initialize');
    if (initializeMessage.type !== 'initialize') {
      throw new Error('Expected initialize message.');
    }
    expect(initializeMessage.runtimeConfig).toEqual(runtimeConfig);
    expect(initializeMessage).not.toHaveProperty('geoSpecEngine');
    expect(initializeMessage.fileSystemPort).toBeDefined();
    expect(initializeTransferables).toEqual([initializeMessage.fileSystemPort]);

    const [firstRunMessage, firstRunTransferables] = geoSpecPostMessageCall(geoSpecWorker, 1);
    const [secondRunMessage, secondRunTransferables] = geoSpecPostMessageCall(geoSpecWorker, 2);
    expect(firstRunMessage.type).toBe('run');
    expect(secondRunMessage.type).toBe('run');
    if (firstRunMessage.type !== 'run' || secondRunMessage.type !== 'run') {
      throw new Error('Expected run messages.');
    }
    expect(firstRunMessage.args).toEqual(args);
    expect(secondRunMessage.args).toEqual(args);
    expect(firstRunMessage.sessionId).toBe(initializeMessage.sessionId);
    expect(secondRunMessage.sessionId).toBe(initializeMessage.sessionId);
    expect(firstRunTransferables).toBeUndefined();
    expect(secondRunTransferables).toBeUndefined();
    expect(geoSpecWorker.terminate).not.toHaveBeenCalled();

    await client.close();
  });

  it('should close the persistent worker explicitly without changing the run result shape', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
    });

    await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual(
      expect.objectContaining({ success: true, passed: 1, total: 1 }),
    );
    await client.close();

    const [closeMessage] = geoSpecPostMessageCall(geoSpecWorker, 2);
    expect(closeMessage.type).toBe('close');
    expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
    await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual({
      success: false,
      errorCode: 'UNKNOWN',
      message: 'GeoSpec worker client is closed.',
    });
  });

  it('should return a structured failure when the worker reports an error', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    geoSpecWorker.postMessage.mockImplementation((message: GeoSpecRunnerWorkerRequest) => {
      if (message.type === 'initialize') {
        queueMicrotask(() => {
          geoSpecWorker.emitMessage({
            type: 'initialized',
            requestId: message.requestId,
            sessionId: message.sessionId,
          });
        });
      }
      if (message.type === 'close') {
        queueMicrotask(() => {
          geoSpecWorker.emitMessage({
            type: 'closed',
            requestId: message.requestId,
            sessionId: message.sessionId,
          });
        });
      }
      if (message.type === 'run') {
        queueMicrotask(() => {
          geoSpecWorker.emitMessage({
            type: 'error',
            requestId: message.requestId,
            message: 'worker-side failure',
          });
        });
      }
    });

    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
    });

    await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual({
      success: false,
      errorCode: 'UNKNOWN',
      message: 'worker-side failure',
    });
    expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
    await client.close();
  });

  it('should soft abort a timed-out run before hard termination', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const publish = vi.fn(async () => undefined);
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        candidateSync: { fetch: async () => [], publish },
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 100,
        abortGrace: 1000,
      });

      const resultPromise = client.runTests({ files: ['slow.geospec.ts'] });
      await vi.runOnlyPendingTimersAsync();
      const [runMessage] = geoSpecPostMessageCall(geoSpecWorker, 1);
      expect(runMessage.type).toBe('run');
      if (runMessage.type !== 'run') {
        throw new Error('Expected run message.');
      }
      const [abortMessage] = geoSpecPostMessageCall(geoSpecWorker, 2);
      expect(abortMessage.type).toBe('abort');
      if (abortMessage.type !== 'abort') {
        throw new Error('Expected abort message.');
      }
      expect(abortMessage.targetRequestId).toBe(runMessage.requestId);
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();

      geoSpecWorker.emitMessage({ ...successResult(runMessage.requestId), candidates: [new Uint8Array([1])] });
      await expect(resultPromise).resolves.toEqual(expect.objectContaining({ success: true }));
      expect(publish).not.toHaveBeenCalled();
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
      await client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not publish a late result after closing a pending run', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    geoSpecWorker.autoResolveRuns = false;
    const publish = vi.fn(async () => undefined);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      candidateSync: { fetch: async () => [], publish },
      createWorker: () => geoSpecWorker as unknown as Worker,
    });
    const run = client.runTests({ files: ['main.geospec.ts'] });
    await vi.waitFor(() => {
      expect(geoSpecWorker.postMessage).toHaveBeenCalledTimes(2);
    });
    const [request] = geoSpecPostMessageCall(geoSpecWorker, 1);
    if (request.type !== 'run') {
      throw new Error('Expected run request.');
    }
    const closing = client.close();
    geoSpecWorker.emitMessage({ ...successResult(request.requestId), candidates: [new Uint8Array([1])] });
    await expect(run).resolves.toMatchObject({ success: false });
    await closing;
    expect(publish).not.toHaveBeenCalled();
  });

  it('should answer OPERATION_TIMEOUT and hard terminate when the abort grace expires', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 100,
        abortGrace: 50,
      });

      const resultPromise = client.runTests({ files: ['slow.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(150);

      const result = await resultPromise;
      expect(result).toMatchObject({
        success: true,
        runStatus: 'inconclusive',
        timeout: { errorCode: 'OPERATION_TIMEOUT', code: 'GEOSPEC_RUN_TIMEOUT', budget: 100, phase: 'queued' },
      });
      expect(result.success && result.failures[0]?.category).toBe('timeout');
      expect(geoSpecPostMessageCall(geoSpecWorker, 2)[0]).toMatchObject({ type: 'abort' });
      expect(geoSpecWorker.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should report completed requirements and the one in flight when the run budget expires', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 1000,
        abortGrace: 50,
      });
      const resultPromise = client.runTests({ files: ['lamp.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(0);
      const [run] = geoSpecPostMessageCall(geoSpecWorker, 1);
      const file = 'lamp.geospec.ts';
      const progress = (event: Extract<GeoSpecRunnerWorkerResponse, { type: 'progress' }>['event']): void => {
        geoSpecWorker.emitMessage({ type: 'progress', requestId: run.requestId, event });
      };
      progress({ type: 'run-start', files: [file] });
      progress({ type: 'file-start', file });
      progress({
        type: 'test-complete',
        file,
        projected: projectGeoSpecTest(
          file,
          { suite: ['lamp'], name: 'fits the bed', ordinal: 0, status: 'passed', assertions: [], diagnostics: [] },
          { reports: false },
        ),
      });
      progress({
        type: 'test-start',
        file,
        test: { id: `${file}:1`, requirement: 'lamp > is one piece', targetFile: file, status: 'not-run', ordinal: 1 },
      });
      await vi.advanceTimersByTimeAsync(1050);

      const result = await resultPromise;
      expect(result).toMatchObject({
        success: true,
        passed: 1,
        runStatus: 'inconclusive',
        timeout: { budget: 1000, phase: 'running', file, requirement: 'lamp > is one piece' },
        accounting: { completed: 1, notRun: 1, cancelled: true },
      });
      expect(result.success && result.passes.map((pass) => pass.requirement)).toStrictEqual(['lamp > fits the bed']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should start the run budget when the worker starts the run, not while it waits in the queue', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 1000,
      });
      const resultPromise = client.runTests({ files: ['main.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(800);
      const [run] = geoSpecPostMessageCall(geoSpecWorker, 1);
      geoSpecWorker.emitMessage({
        type: 'progress',
        requestId: run.requestId,
        event: { type: 'run-start', files: ['main.geospec.ts'] },
      });
      await vi.advanceTimersByTimeAsync(800);
      expect(geoSpecWorker.postMessage.mock.calls.some(([message]) => message.type === 'abort')).toBe(false);
      geoSpecWorker.emitMessage(successResult(run.requestId));
      await expect(resultPromise).resolves.toMatchObject({ success: true, passed: 1 });
      await expect(resultPromise).resolves.not.toHaveProperty('timeout');
    } finally {
      vi.useRealTimers();
    }
  });

  it("should raise the run budget to cover the requested testTimeout, up to the host's longest budget", async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 1000,
        abortGrace: 10,
      });
      const resultPromise = client.runTests({ files: ['main.geospec.ts'], testTimeout: geoSpecDefaultMaxRunBudget });
      await vi.advanceTimersByTimeAsync(geoSpecDefaultMaxRunBudget - 1);
      expect(geoSpecWorker.postMessage.mock.calls.some(([message]) => message.type === 'abort')).toBe(false);
      await vi.advanceTimersByTimeAsync(20);
      await expect(resultPromise).resolves.toMatchObject({ timeout: { budget: geoSpecDefaultMaxRunBudget } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should mark the worker answer that arrives inside the abort grace as timed out', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 100,
        abortGrace: 50,
      });
      const resultPromise = client.runTests({ files: ['a.geospec.ts', 'b.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(110);
      const [run] = geoSpecPostMessageCall(geoSpecWorker, 1);
      const late = successResult(run.requestId);
      if (!late.result.success) {
        throw new Error('Expected a successful worker result.');
      }
      geoSpecWorker.emitMessage({
        ...late,
        result: {
          ...late.result,
          accounting: {
            discovered: 1,
            selected: 1,
            completed: 1,
            passed: 1,
            failed: 0,
            unsupported: 0,
            inconclusive: 0,
            skipped: 0,
            notRun: 0,
            requestedFiles: ['a.geospec.ts', 'b.geospec.ts'],
            completedFiles: ['a.geospec.ts'],
            notRunFiles: ['b.geospec.ts'],
            discoveryComplete: false,
            cancelled: true,
            bailed: false,
          },
        },
      });

      const result = await resultPromise;
      expect(result).toMatchObject({ success: true, passed: 1, timeout: { code: 'GEOSPEC_RUN_TIMEOUT', budget: 100 } });
      expect(result.success && result.runStatus).not.toBe('passed');
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
      await client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should abort the matching worker run when its outer request is cancelled', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    geoSpecWorker.autoResolveRuns = false;
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
      abortGrace: 50,
    });
    const controller = new AbortController();
    const resultPromise = client.runTests({ files: ['slow.geospec.ts'] }, { signal: controller.signal });
    try {
      await vi.waitFor(() => {
        expect(geoSpecWorker.postMessage.mock.calls.some((call) => call[0].type === 'run')).toBe(true);
      });
      const [runMessage] = geoSpecPostMessageCall(geoSpecWorker, 1);
      expect(runMessage.type).toBe('run');
      controller.abort();
      const [abortMessage] = geoSpecPostMessageCall(geoSpecWorker, 2);
      expect(abortMessage).toMatchObject({ type: 'abort', targetRequestId: runMessage.requestId });
      await expect(resultPromise).resolves.toMatchObject({ success: false });
      expect(geoSpecWorker.terminate).toHaveBeenCalledOnce();
    } finally {
      await client.close();
    }
  });

  it('should return cancellation when the worker finishes after the outer request aborts', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    geoSpecWorker.autoResolveRuns = false;
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
      abortGrace: 50,
    });
    const controller = new AbortController();
    const resultPromise = client.runTests({ files: ['slow.geospec.ts'] }, { signal: controller.signal });
    try {
      await vi.waitFor(() => {
        expect(geoSpecWorker.postMessage.mock.calls.some((call) => call[0].type === 'run')).toBe(true);
      });
      const [runMessage] = geoSpecPostMessageCall(geoSpecWorker, 1);
      expect(runMessage.type).toBe('run');
      controller.abort();
      geoSpecWorker.emitMessage(successResult(runMessage.requestId));
      await expect(resultPromise).resolves.toEqual({
        success: false,
        errorCode: 'UNKNOWN',
        message: 'GeoSpec request cancelled.',
      });
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it('should preserve a worker result that settled before the outer request aborts', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
    });
    const controller = new AbortController();
    try {
      await expect(
        client.runTests({ files: ['main.geospec.ts'] }, { signal: controller.signal }),
      ).resolves.toMatchObject({
        success: true,
        passed: 1,
      });
      controller.abort();
      expect(geoSpecWorker.postMessage.mock.calls.some((call) => call[0].type === 'abort')).toBe(false);
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
    expect(geoSpecPostMessageCall(geoSpecWorker, 2)[0].type).toBe('close');
  });

  it('should recreate the worker after a crash', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const firstWorker = new FakeGeoSpecWorker();
    const secondWorker = new FakeGeoSpecWorker();
    firstWorker.autoResolveRuns = false;
    const createWorker = vi
      .fn<() => Worker>()
      .mockReturnValueOnce(firstWorker as unknown as Worker)
      .mockReturnValueOnce(secondWorker as unknown as Worker);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker,
    });

    const firstRun = client.runTests({ files: ['main.geospec.ts'] });
    await vi.waitFor(() => {
      expect(firstWorker.postMessage.mock.calls.some((call) => call[0].type === 'run')).toBe(true);
    });
    firstWorker.emitError('worker exploded');

    await expect(firstRun).resolves.toEqual({
      success: false,
      errorCode: 'UNKNOWN',
      message: 'worker exploded',
    });
    await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual(
      expect.objectContaining({ success: true, passed: 1, total: 1 }),
    );
    expect(createWorker).toHaveBeenCalledTimes(2);
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);
    expect(secondWorker.terminate).not.toHaveBeenCalled();
    await client.close();
  });

  it('should fail in-flight runs when the worker closes unexpectedly', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    geoSpecWorker.autoResolveRuns = false;
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      runtimeConfig,
      createWorker: () => geoSpecWorker as unknown as Worker,
    });

    const runPromise = client.runTests({ files: ['main.geospec.ts'] });
    await vi.waitFor(() => {
      expect(geoSpecWorker.postMessage.mock.calls.some((call) => call[0].type === 'run')).toBe(true);
    });

    // Unsolicited close: no close() request is in flight, so the run must fail rather than hang.
    geoSpecWorker.emitMessage({ type: 'closed', requestId: 'unsolicited-close' });

    await expect(runPromise).resolves.toEqual({
      success: false,
      errorCode: 'UNKNOWN',
      message: 'GeoSpec worker closed unexpectedly.',
    });
    expect(geoSpecWorker.terminate).toHaveBeenCalledTimes(1);
  });

  it('should fail runTests when worker initialization times out', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoInitialize = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        initTimeout: 50,
        createWorker: () => geoSpecWorker as unknown as Worker,
      });

      const runPromise = client.runTests({ files: ['main.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(51);

      await expect(runPromise).resolves.toEqual({
        success: false,
        errorCode: 'UNKNOWN',
        message: 'GeoSpec worker initialization timed out after 50ms.',
      });
      expect(geoSpecWorker.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('idle lifetime', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should terminate an idle worker and its runtime after the default idle window, then start a fresh one', async () => {
      vi.useFakeTimers();
      const fileManagerWorker = new FakeFileManagerWorker();
      const firstWorker = new FakeGeoSpecWorker();
      const secondWorker = new FakeGeoSpecWorker();
      const createWorker = vi
        .fn<() => Worker>()
        .mockReturnValueOnce(firstWorker as unknown as Worker)
        .mockReturnValueOnce(secondWorker as unknown as Worker);
      const bridges: Array<ReturnType<typeof openFileSystemBridge>> = [];
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: () => {
          const bridge = openFileSystemBridge(fileManagerWorker);
          vi.spyOn(bridge, 'dispose');
          bridges.push(bridge);
          return bridge;
        },
        runtimeConfig,
        createWorker,
      });

      await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      await vi.advanceTimersByTimeAsync(59_999);
      expect(firstWorker.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(firstWorker.terminate).toHaveBeenCalledOnce();
      expect(bridges[0]?.dispose).toHaveBeenCalledOnce();
      await expect(client.runTests({ files: ['main.geospec.ts'] })).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
      expect(createWorker).toHaveBeenCalledTimes(2);
      expect(secondWorker.terminate).not.toHaveBeenCalled();
      await client.close();
    });

    it('should keep the worker while a run is in flight and arm the idle window when it settles', async () => {
      vi.useFakeTimers();
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        runtimeConfig,
        idleTimeout: 1000,
        runnerTimeout: 60_000,
        createWorker: () => geoSpecWorker as unknown as Worker,
      });

      const run = client.runTests({ files: ['main.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(5000);
      const runCall = geoSpecWorker.postMessage.mock.calls.find((call) => call[0].type === 'run');
      expect(runCall).toBeDefined();
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();

      geoSpecWorker.emitMessage(successResult(runCall![0].requestId));
      await expect(run).resolves.toEqual(expect.objectContaining({ success: true }));
      await vi.advanceTimersByTimeAsync(999);
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(geoSpecWorker.terminate).toHaveBeenCalledOnce();
      await client.close();
    });
  });
});
