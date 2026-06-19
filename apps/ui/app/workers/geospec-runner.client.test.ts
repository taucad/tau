// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { filesystemBridgeConnectMessageType, openFileSystemBridge } from '@taucad/fs-bridge';
import { createGeoSpecWorkerRpcClient } from '#workers/geospec-runner.client.js';
import type { GeoSpecRunnerWorkerRequest, GeoSpecRunnerWorkerResponse } from '#workers/geospec-runner.types.js';

type WorkerMessageListener = (event: MessageEvent<GeoSpecRunnerWorkerResponse>) => void;
type WorkerErrorListener = (event: ErrorEvent) => void;
type FileSystemBridgeConnectMessage = {
  type: string;
  port: MessagePort;
};

const successResult = (requestId: string): GeoSpecRunnerWorkerResponse => ({
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
    if (message.type === 'initialize') {
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
  openFileSystemBridge(worker as unknown as Worker);

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
  it('should reuse one worker across repeated successful test runs', async () => {
    const fileManagerWorker = new FakeFileManagerWorker();
    const geoSpecWorker = new FakeGeoSpecWorker();
    const createWorker = vi.fn(() => geoSpecWorker as unknown as Worker);
    const filePoolBuffer = new SharedArrayBuffer(1024);
    const client = createGeoSpecWorkerRpcClient({
      openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
      projectRootPath: '/projects/proj-vase',
      runtimeConfig,
      filePoolBuffer,
      createWorker,
    });

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
    expect(fileManagerWorker.postMessage).toHaveBeenCalledTimes(2);
    const vmBridgeCall = fileManagerPostMessageCall(fileManagerWorker, 0);
    const runtimeBridgeCall = fileManagerPostMessageCall(fileManagerWorker, 1);
    expect(vmBridgeCall[0].type).toBe(filesystemBridgeConnectMessageType);
    expect(vmBridgeCall[0].port).toBeDefined();
    expect(vmBridgeCall[1]).toEqual([vmBridgeCall[0].port]);
    expect(runtimeBridgeCall[0].type).toBe(filesystemBridgeConnectMessageType);
    expect(runtimeBridgeCall[0].port).toBeDefined();
    expect(runtimeBridgeCall[1]).toEqual([runtimeBridgeCall[0].port]);
    expect(runtimeBridgeCall[0].port).not.toBe(vmBridgeCall[0].port);

    const [initializeMessage, initializeTransferables] = geoSpecPostMessageCall(geoSpecWorker, 0);
    expect(initializeMessage.type).toBe('initialize');
    if (initializeMessage.type !== 'initialize') {
      throw new Error('Expected initialize message.');
    }
    expect(initializeMessage.projectRootPath).toBe('/projects/proj-vase');
    expect(initializeMessage.runtimeConfig).toEqual(runtimeConfig);
    expect(initializeMessage.filePoolBuffer).toBe(filePoolBuffer);
    expect(initializeMessage.vmFileSystemPort).toBeDefined();
    expect(initializeMessage.runtimeFileSystemPort).toBeDefined();
    expect(initializeMessage.runtimeFileSystemPort).not.toBe(initializeMessage.vmFileSystemPort);
    expect(initializeTransferables).toEqual([
      initializeMessage.vmFileSystemPort,
      initializeMessage.runtimeFileSystemPort,
    ]);

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
      projectRootPath: '/projects/proj-vase',
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
      projectRootPath: '/projects/proj-vase',
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
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        projectRootPath: '/projects/proj-vase',
        runtimeConfig,
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

      geoSpecWorker.emitMessage(successResult(runMessage.requestId));
      await expect(resultPromise).resolves.toEqual(expect.objectContaining({ success: true }));
      expect(geoSpecWorker.terminate).not.toHaveBeenCalled();
      await client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should hard terminate when abort grace expires', async () => {
    vi.useFakeTimers();
    try {
      const fileManagerWorker = new FakeFileManagerWorker();
      const geoSpecWorker = new FakeGeoSpecWorker();
      geoSpecWorker.autoResolveRuns = false;
      const client = createGeoSpecWorkerRpcClient({
        openFileSystemBridge: createOpenFileSystemBridge(fileManagerWorker),
        projectRootPath: '/projects/proj-vase',
        runtimeConfig,
        createWorker: () => geoSpecWorker as unknown as Worker,
        runnerTimeout: 100,
        abortGrace: 50,
      });

      const resultPromise = client.runTests({ files: ['slow.geospec.ts'] });
      await vi.advanceTimersByTimeAsync(150);

      await expect(resultPromise).resolves.toEqual({
        success: false,
        errorCode: 'UNKNOWN',
        message: 'GeoSpec worker timed out after 100ms.',
      });
      expect(geoSpecWorker.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
      projectRootPath: '/projects/proj-vase',
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
});
