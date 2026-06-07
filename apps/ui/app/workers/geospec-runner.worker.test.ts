// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
import type {
  GeoSpecRunnerWorkerRequest,
  GeoSpecRunnerWorkerResponse,
  GeoSpecRunnerWorkerRunRequest,
} from '#workers/geospec-runner.types.js';

const workerMocks = vi.hoisted(() => {
  const fsProxy = {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    lstat: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    rmdir: vi.fn(),
    rename: vi.fn(),
    exists: vi.fn(),
    dispose: vi.fn(),
  };
  const runtimeClient = {
    export: vi.fn(),
    terminate: vi.fn(),
  };
  const runner = {
    run: vi.fn(),
    close: vi.fn(),
  };
  class MockGeoSpecModelLoadError extends Error {
    public readonly diagnostics: ReadonlyArray<{ code: string; message: string }>;

    public constructor(diagnostics: ReadonlyArray<{ code: string; message: string }>) {
      super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
      this.name = 'GeoSpecModelLoadError';
      this.diagnostics = diagnostics;
    }
  }
  const uiRuntimeConfigSchema = {
    safeParse: vi.fn(),
  };
  return {
    fsProxy,
    runtimeClient,
    runner,
    geoSpecModelLoadErrorClass: MockGeoSpecModelLoadError,
    createGeoSpecModelLoadError: (diagnostics: ReadonlyArray<{ code: string; message: string }>) =>
      new MockGeoSpecModelLoadError(diagnostics),
    uiRuntimeConfigSchema,
    createRuntimeClient: vi.fn(),
    createBridgeProxy: vi.fn(),
    fromFsLike: vi.fn(),
    wrapMessagePort: vi.fn(),
    createGeoSpecWebRunner: vi.fn(),
    loadModel: vi.fn(),
    createDefaultKernelOptions: vi.fn(),
  };
});

vi.mock('@taucad/runtime', () => ({
  createRuntimeClient: workerMocks.createRuntimeClient,
}));

vi.mock('@taucad/runtime/transport-internals', () => ({
  createBridgeProxy: workerMocks.createBridgeProxy,
  wrapMessagePort: workerMocks.wrapMessagePort,
}));

vi.mock('@taucad/runtime/filesystem', () => ({
  fromFsLike: workerMocks.fromFsLike,
}));

vi.mock('geospec/runner/web', () => ({
  createGeoSpecWebRunner: workerMocks.createGeoSpecWebRunner,
}));

vi.mock('geospec/model', () => {
  const modelLoadErrorExport = 'GeoSpecModelLoadError';
  return {
    [modelLoadErrorExport]: workerMocks.geoSpecModelLoadErrorClass,
    loadModel: workerMocks.loadModel,
  };
});

vi.mock('#constants/kernel-worker.constants.js', () => ({
  createDefaultKernelOptions: workerMocks.createDefaultKernelOptions,
}));

vi.mock('#runtime/ui-runtime.definition.js', () => ({
  uiRuntimeConfigSchema: workerMocks.uiRuntimeConfigSchema,
}));

const successfulRunnerResult = (): GeoSpecRunnerResult => ({
  success: true,
  passed: 1,
  failed: 0,
  selectedTests: 1,
  files: [
    {
      file: 'main.geospec.ts',
      result: {
        success: true,
        passed: true,
        tests: [
          {
            suite: ['geometry'],
            name: 'should use the requested model',
            assertions: [],
            status: 'passed',
            diagnostics: [],
          },
        ],
        bundle: {
          code: '',
          issues: [],
          success: true,
          dependencies: [],
          unresolvedPaths: [],
        },
      },
    },
  ],
});

const mockProjectTree = (projectRootPath: string, files: readonly string[]): void => {
  const directories = new Map<string, Set<string>>([[projectRootPath, new Set()]]);
  const filePaths = new Set<string>();

  for (const file of files) {
    const parts = file.split('/').filter(Boolean);
    let currentDirectory = projectRootPath;
    for (const directory of parts.slice(0, -1)) {
      const nextDirectory = `${currentDirectory}/${directory}`;
      directories.get(currentDirectory)?.add(directory);
      if (!directories.has(nextDirectory)) {
        directories.set(nextDirectory, new Set());
      }
      currentDirectory = nextDirectory;
    }
    const fileName = parts.at(-1);
    if (fileName === undefined) {
      continue;
    }
    directories.get(currentDirectory)?.add(fileName);
    filePaths.add(`${currentDirectory}/${fileName}`);
  }

  workerMocks.fsProxy.readdir.mockImplementation(async (path: string) => {
    const entries = directories.get(path);
    if (!entries) {
      throw new Error(`Unexpected readdir path: ${path}`);
    }
    return [...entries].sort((left, right) => left.localeCompare(right));
  });
  workerMocks.fsProxy.stat.mockImplementation(async (path: string) => {
    if (directories.has(path)) {
      return { type: 'dir', size: 0, mtimeMs: 1 };
    }
    if (filePaths.has(path)) {
      return { type: 'file', size: 100, mtimeMs: 1 };
    }
    throw new Error(`Unexpected stat path: ${path}`);
  });
};

type WorkerMessageListener = (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void;
type WorkerPostMessageMock = ReturnType<typeof vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>>;

const defaultRuntimeConfig = {
  tauApiUrl: 'https://api.tau.test',
  tauWebSocketUrl: 'wss://api.tau.test',
};

const initializeWorkerSession = async (options: {
  messageListener: WorkerMessageListener | undefined;
  postMessage: WorkerPostMessageMock;
  projectRootPath: string;
  requestId?: string;
  sessionId?: string;
}): Promise<string> => {
  const sessionId = options.sessionId ?? 'session-1';
  const requestId = options.requestId ?? `${sessionId}-initialize`;
  options.messageListener?.({
    data: {
      type: 'initialize',
      requestId,
      sessionId,
      projectRootPath: options.projectRootPath,
      runtimeConfig: defaultRuntimeConfig,
      vmFileSystemPort: new MessageChannel().port1,
    },
  } as MessageEvent<GeoSpecRunnerWorkerRequest>);

  await vi.waitFor(() => {
    expect(options.postMessage).toHaveBeenCalledWith({
      type: 'initialized',
      requestId,
      sessionId,
    } satisfies GeoSpecRunnerWorkerResponse);
  });
  options.postMessage.mockClear();
  return sessionId;
};

const sendRunRequest = (options: {
  messageListener: WorkerMessageListener | undefined;
  requestId: string;
  sessionId: string;
  args: GeoSpecRunnerWorkerRunRequest['args'];
}): void => {
  options.messageListener?.({
    data: {
      type: 'run',
      requestId: options.requestId,
      sessionId: options.sessionId,
      args: options.args,
    },
  } as MessageEvent<GeoSpecRunnerWorkerRequest>);
};

describe('geospec-runner.worker', () => {
  beforeEach(() => {
    vi.resetModules();
    workerMocks.fsProxy.readFile.mockReset();
    workerMocks.fsProxy.writeFile.mockReset();
    workerMocks.fsProxy.readdir.mockReset();
    workerMocks.fsProxy.stat.mockReset();
    workerMocks.fsProxy.lstat.mockReset();
    workerMocks.fsProxy.mkdir.mockReset();
    workerMocks.fsProxy.unlink.mockReset();
    workerMocks.fsProxy.rmdir.mockReset();
    workerMocks.fsProxy.rename.mockReset();
    workerMocks.fsProxy.exists.mockReset();
    workerMocks.fsProxy.dispose.mockReset();
    workerMocks.runtimeClient.export.mockReset();
    workerMocks.runtimeClient.terminate.mockReset();
    workerMocks.runner.run.mockReset();
    workerMocks.runner.close.mockReset();
    workerMocks.createRuntimeClient.mockReset();
    workerMocks.createBridgeProxy.mockReset();
    workerMocks.fromFsLike.mockReset();
    workerMocks.wrapMessagePort.mockReset();
    workerMocks.createGeoSpecWebRunner.mockReset();
    workerMocks.loadModel.mockReset();
    workerMocks.createDefaultKernelOptions.mockReset();
    workerMocks.uiRuntimeConfigSchema.safeParse.mockReset();
    workerMocks.uiRuntimeConfigSchema.safeParse.mockReturnValue({
      success: true,
      data: {
        tauApiUrl: 'https://api.tau.test',
        tauWebSocketUrl: 'wss://api.tau.test',
      },
    });
    vi.unstubAllGlobals();
  });

  it('should run tests with a worker-owned runtime client and bridged project filesystem', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    const addEventListener = vi.fn(
      (type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      },
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    const close = vi.fn();
    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', close);

    const runtimeFileSystem = { kind: 'runtime-fs' };
    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue(runtimeFileSystem);
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-test', ['main.geospec.ts']);
    workerMocks.loadModel.mockResolvedValue({ provenance: { source: { kind: 'runtime' } } });
    workerMocks.runner.run.mockImplementation(async () => {
      const runnerOptions = workerMocks.createGeoSpecWebRunner.mock.calls[0]?.[0] as {
        modelLoader: (input: { file: string; parameters: Record<string, unknown> }) => Promise<unknown>;
      };
      await runnerOptions.modelLoader({ file: 'main.ts', parameters: { height: 42 } });
      return successfulRunnerResult();
    });
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');
    expect(messageListener).toBeDefined();

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-test',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-1',
      sessionId,
      args: {},
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'result',
        requestId: 'request-1',
        result: {
          success: true,
          failures: [],
          passes: [
            {
              id: 'main.geospec.ts:geometry > should use the requested model',
              requirement: 'geometry > should use the requested model',
              targetFile: 'main.geospec.ts',
            },
          ],
          passed: 1,
          total: 1,
        },
      } satisfies GeoSpecRunnerWorkerResponse);
    });
    expect(workerMocks.createRuntimeClient).toHaveBeenCalledWith({
      options: {
        fileSystem: runtimeFileSystem,
        runtimeConfig: {
          tauApiUrl: 'https://api.tau.test',
          tauWebSocketUrl: 'wss://api.tau.test',
        },
      },
    });
    expect(workerMocks.runner.run).toHaveBeenCalledWith({
      files: ['main.geospec.ts'],
      testNamePattern: undefined,
      testTimeout: undefined,
    });
    expect(workerMocks.loadModel).toHaveBeenCalledWith({
      file: '/projects/proj-test/main.ts',
      parameters: { height: 42 },
      projectPath: '/projects/proj-test',
      runtime: workerMocks.runtimeClient,
    });
    expect(workerMocks.runtimeClient.terminate).not.toHaveBeenCalled();
    expect(workerMocks.fsProxy.dispose).not.toHaveBeenCalled();
  });

  it('should resolve GeoSpec entries and model files under the actual project root', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    const addEventListener = vi.fn(
      (type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      },
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    const close = vi.fn();
    vi.stubGlobal('addEventListener', addEventListener);
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', close);

    const runtimeFileSystem = { kind: 'runtime-fs' };
    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue(runtimeFileSystem);
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-vase', ['vase.geospec.ts']);
    workerMocks.loadModel.mockResolvedValue({ provenance: { source: { kind: 'runtime' } } });
    workerMocks.runner.run.mockImplementation(async () => {
      const runnerOptions = workerMocks.createGeoSpecWebRunner.mock.calls[0]?.[0] as {
        modelLoader: (input: { file: string; parameters?: Record<string, unknown> }) => Promise<unknown>;
      };
      await runnerOptions.modelLoader({ file: 'main.scad' });
      return {
        ...successfulRunnerResult(),
        files: [
          {
            ...successfulRunnerResult().files[0]!,
            file: '/projects/proj-vase/vase.geospec.ts',
          },
        ],
      };
    });
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-vase',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-project-root',
      sessionId,
      args: {},
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          requestId: 'request-project-root',
        }),
      );
    });
    expect(workerMocks.fsProxy.readdir).toHaveBeenCalledWith('/projects/proj-vase');
    expect(workerMocks.fsProxy.stat).toHaveBeenCalledWith('/projects/proj-vase/vase.geospec.ts');
    expect(workerMocks.createGeoSpecWebRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: '/projects/proj-vase',
      }),
    );
    expect(workerMocks.runner.run).toHaveBeenCalledWith({
      files: ['vase.geospec.ts'],
      testNamePattern: undefined,
      testTimeout: undefined,
    });
    expect(workerMocks.loadModel).toHaveBeenCalledWith({
      file: '/projects/proj-vase/main.scad',
      projectPath: '/projects/proj-vase',
      runtime: workerMocks.runtimeClient,
    });
  });

  it('should discover root and nested GeoSpec files recursively in the worker', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-vase', [
      'vase.geospec.ts',
      'main.scad',
      'lib/vase_variant.geospec.ts',
      'lib/vase_variant.scad',
    ]);
    workerMocks.runner.run.mockResolvedValue({
      success: true,
      passed: 2,
      failed: 0,
      selectedTests: 2,
      files: [
        {
          file: 'lib/vase_variant.geospec.ts',
          result: {
            success: true,
            passed: true,
            tests: [
              {
                suite: ['variant geometry'],
                name: 'should test the nested variant',
                assertions: [],
                status: 'passed',
                diagnostics: [],
              },
            ],
            bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
          },
        },
        {
          file: 'vase.geospec.ts',
          result: {
            success: true,
            passed: true,
            tests: [
              {
                suite: ['vase geometry'],
                name: 'should test the root vase',
                assertions: [],
                status: 'passed',
                diagnostics: [],
              },
            ],
            bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
          },
        },
      ],
    });
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-vase',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-recursive-discovery',
      sessionId,
      args: {},
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalled();
    });
    expect(workerMocks.runner.run).toHaveBeenCalledWith({
      files: ['lib/vase_variant.geospec.ts', 'vase.geospec.ts'],
      testNamePattern: undefined,
      testTimeout: undefined,
    });
    const resultMessage = postMessage.mock.calls[0]?.[0];
    expect(resultMessage?.type).toBe('result');
    if (resultMessage?.type !== 'result') {
      throw new Error('Expected GeoSpec worker result message.');
    }

    expect(resultMessage.requestId).toBe('request-recursive-discovery');
    expect(resultMessage.result.success).toBe(true);
    if (!resultMessage.result.success) {
      throw new Error('Expected GeoSpec worker success result.');
    }

    expect(resultMessage.result.passed).toBe(2);
    expect(resultMessage.result.total).toBe(2);
    expect(resultMessage.result.failures).toEqual([]);
    expect(resultMessage.result.passes).toEqual([
      {
        id: 'lib/vase_variant.geospec.ts:variant geometry > should test the nested variant',
        requirement: 'variant geometry > should test the nested variant',
        targetFile: 'lib/vase_variant.geospec.ts',
      },
      {
        id: 'vase.geospec.ts:vase geometry > should test the root vase',
        requirement: 'vase geometry > should test the root vase',
        targetFile: 'vase.geospec.ts',
      },
    ]);
  });

  it('should expand directory-root filters in the worker', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-vase', ['vase.geospec.ts', 'lib/vase_variant.geospec.ts']);
    workerMocks.runner.run.mockResolvedValue(successfulRunnerResult());
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-vase',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-directory-filter',
      sessionId,
      args: { files: ['lib'] },
    });

    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(1);
    });
    expect(workerMocks.runner.run).toHaveBeenCalledWith({
      files: ['lib/vase_variant.geospec.ts'],
      testNamePattern: undefined,
      testTimeout: undefined,
    });
  });

  it('should apply include and exclude globs in the worker before running tests', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-vase', [
      'root.geospec.ts',
      'lib/vase_variant.geospec.ts',
      'lib/vase_variant.slow.geospec.ts',
    ]);
    workerMocks.runner.run.mockResolvedValue(successfulRunnerResult());
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-vase',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-include-exclude-filter',
      sessionId,
      args: {
        include: ['lib/**/*.geospec.ts'],
        exclude: ['**/*.slow.geospec.ts'],
        testNamePattern: '^(?!.*known failing check).*',
      },
    });

    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(1);
    });
    expect(workerMocks.runner.run).toHaveBeenCalledWith({
      files: ['lib/vase_variant.geospec.ts'],
      testNamePattern: '^(?!.*known failing check).*',
      testTimeout: undefined,
    });
  });

  it('should adapt the project filesystem proxy through fromFsLike for runtime access', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    const runtimeFileSystem = { kind: 'runtime-fs' };
    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue(runtimeFileSystem);
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-fs', ['main.geospec.ts']);
    workerMocks.runner.run.mockResolvedValue(successfulRunnerResult());
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-fs',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-fs-like',
      sessionId,
      args: {},
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          requestId: 'request-fs-like',
        }),
      );
    });
    const fsLike = workerMocks.fromFsLike.mock.calls[0]?.[0] as {
      promises: {
        readFile(path: string, encoding: 'utf8'): Promise<string>;
        writeFile(path: string, data: string): Promise<void>;
        mkdir(path: string, options: { recursive: boolean }): Promise<void>;
        readdir(path: string): Promise<string[]>;
        unlink(path: string): Promise<void>;
        rmdir(path: string): Promise<void>;
        rename(oldPath: string, newPath: string): Promise<void>;
        stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory(): boolean }>;
        lstat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory(): boolean }>;
      };
    };
    expect(workerMocks.fromFsLike.mock.calls[0]?.[1]).toBe('/');

    workerMocks.fsProxy.readFile.mockResolvedValueOnce('source');
    await expect(fsLike.promises.readFile('main.scad', 'utf8')).resolves.toBe('source');
    expect(workerMocks.fsProxy.readFile).toHaveBeenLastCalledWith('/projects/proj-fs/main.scad', 'utf8');

    await fsLike.promises.writeFile('/cache/out.glb', 'bytes');
    expect(workerMocks.fsProxy.writeFile).toHaveBeenLastCalledWith('/cache/out.glb', 'bytes');

    await fsLike.promises.mkdir('.tau/cache/geometry', { recursive: true });
    expect(workerMocks.fsProxy.mkdir).toHaveBeenLastCalledWith('/projects/proj-fs/.tau/cache/geometry', {
      recursive: true,
    });

    workerMocks.fsProxy.readdir.mockResolvedValueOnce(['entry.bin']);
    await expect(fsLike.promises.readdir('.tau/cache/geometry')).resolves.toEqual(['entry.bin']);
    expect(workerMocks.fsProxy.readdir).toHaveBeenLastCalledWith('/projects/proj-fs/.tau/cache/geometry');

    await fsLike.promises.unlink('.tau/cache/geometry/a.bin');
    expect(workerMocks.fsProxy.unlink).toHaveBeenLastCalledWith('/projects/proj-fs/.tau/cache/geometry/a.bin');

    await fsLike.promises.rmdir('.tau/cache/tmp');
    expect(workerMocks.fsProxy.rmdir).toHaveBeenLastCalledWith('/projects/proj-fs/.tau/cache/tmp');

    await fsLike.promises.rename('.tau/cache/old.bin', '.tau/cache/new.bin');
    expect(workerMocks.fsProxy.rename).toHaveBeenLastCalledWith(
      '/projects/proj-fs/.tau/cache/old.bin',
      '/projects/proj-fs/.tau/cache/new.bin',
    );

    workerMocks.fsProxy.stat.mockResolvedValueOnce({ type: 'dir', size: 12, mtimeMs: 34 });
    const stat = await fsLike.promises.stat('.tau');
    expect(stat.isDirectory()).toBe(true);
    expect(stat.size).toBe(12);
    expect(stat.mtimeMs).toBe(34);

    workerMocks.fsProxy.lstat.mockResolvedValueOnce({ type: 'file', size: 56, mtimeMs: 78 });
    const lstat = await fsLike.promises.lstat('main.scad');
    expect(lstat.isDirectory()).toBe(false);
    expect(lstat.size).toBe(56);
    expect(lstat.mtimeMs).toBe(78);
  });

  it('should preflight invalid runtime config before creating runner or runtime clients', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());
    workerMocks.uiRuntimeConfigSchema.safeParse.mockReturnValueOnce({
      success: false,
      error: {
        issues: [
          { path: ['tauApiUrl'], message: 'expected string' },
          { path: ['tauWebSocketUrl'], message: 'expected string' },
        ],
      },
    });

    await import('#workers/geospec-runner.worker.js');

    messageListener?.({
      data: {
        type: 'initialize',
        requestId: 'request-invalid-config',
        sessionId: 'session-invalid-config',
        projectRootPath: '/projects/proj-vase',
        runtimeConfig: {
          tauApiUrl: 'https://api.tau.test',
          tauWebSocketUrl: 'wss://api.tau.test',
        },
        vmFileSystemPort: new MessageChannel().port1,
      },
    } as MessageEvent<GeoSpecRunnerWorkerRequest>);

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'error',
        requestId: 'request-invalid-config',
        message: 'RUNTIME_CONFIG_INVALID: tauApiUrl: expected string; tauWebSocketUrl: expected string',
      } satisfies GeoSpecRunnerWorkerResponse);
    });
    expect(workerMocks.createBridgeProxy).not.toHaveBeenCalled();
    expect(workerMocks.fromFsLike).not.toHaveBeenCalled();
    expect(workerMocks.createRuntimeClient).not.toHaveBeenCalled();
    expect(workerMocks.createGeoSpecWebRunner).not.toHaveBeenCalled();
    expect(postMessage.mock.calls[0]?.[0].message).not.toContain(['Port at index 0', ' is already neutered'].join(''));
  });

  it('should memoize fatal runtime boot failures during one GeoSpec run', async () => {
    let messageListener: ((event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-vase', ['main.geospec.ts']);
    const fatalError = workerMocks.createGeoSpecModelLoadError([
      { code: 'RUNTIME_UNAVAILABLE', message: 'runtime boot failed' },
    ]);
    workerMocks.loadModel.mockRejectedValueOnce(fatalError);
    workerMocks.runner.run.mockImplementation(async () => {
      const runnerOptions = workerMocks.createGeoSpecWebRunner.mock.calls[0]?.[0] as {
        modelLoader: (input: { file: string }) => Promise<unknown>;
      };
      await expect(runnerOptions.modelLoader({ file: 'main.scad' })).rejects.toBe(fatalError);
      await expect(runnerOptions.modelLoader({ file: 'main.scad' })).rejects.toBe(fatalError);
      return successfulRunnerResult();
    });
    workerMocks.runner.close.mockResolvedValue(undefined);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');

    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-vase',
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-fatal-boot',
      sessionId,
      args: {},
    });

    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(1);
    });
    expect(workerMocks.loadModel).toHaveBeenCalledTimes(1);
  });

  it('should reject run requests before initialization with a structured diagnostic', async () => {
    let messageListener: WorkerMessageListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: WorkerMessageListener) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    await import('#workers/geospec-runner.worker.js');

    sendRunRequest({
      messageListener,
      requestId: 'request-before-init',
      sessionId: 'missing-session',
      args: { files: ['main.geospec.ts'] },
    });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'error',
        requestId: 'request-before-init',
        message: 'GeoSpec worker session is not initialized.',
      } satisfies GeoSpecRunnerWorkerResponse);
    });
    expect(workerMocks.createRuntimeClient).not.toHaveBeenCalled();
    expect(workerMocks.createGeoSpecWebRunner).not.toHaveBeenCalled();
  });

  it('should reuse session runtime state while running discovery fresh for each invocation', async () => {
    let messageListener: WorkerMessageListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: WorkerMessageListener) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    workerMocks.runner.run.mockResolvedValue(successfulRunnerResult());
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);
    mockProjectTree('/projects/proj-fresh', ['main.geospec.ts']);

    await import('#workers/geospec-runner.worker.js');
    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-fresh',
    });

    sendRunRequest({
      messageListener,
      requestId: 'request-first-fresh',
      sessionId,
      args: {},
    });
    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(1);
    });
    expect(workerMocks.runner.run).toHaveBeenLastCalledWith({
      files: ['main.geospec.ts'],
      testNamePattern: undefined,
      testTimeout: undefined,
    });

    mockProjectTree('/projects/proj-fresh', ['main.geospec.ts', 'lib/variant.geospec.ts']);
    sendRunRequest({
      messageListener,
      requestId: 'request-second-fresh',
      sessionId,
      args: {},
    });
    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(2);
    });

    expect(workerMocks.runner.run).toHaveBeenLastCalledWith({
      files: ['lib/variant.geospec.ts', 'main.geospec.ts'],
      testNamePattern: undefined,
      testTimeout: undefined,
    });
    expect(workerMocks.createBridgeProxy).toHaveBeenCalledTimes(1);
    expect(workerMocks.fromFsLike).toHaveBeenCalledTimes(1);
    expect(workerMocks.createRuntimeClient).toHaveBeenCalledTimes(1);
    expect(workerMocks.createGeoSpecWebRunner).toHaveBeenCalledTimes(1);
    expect(workerMocks.runtimeClient.terminate).not.toHaveBeenCalled();
  });

  it('should run multiple requests through a FIFO worker queue', async () => {
    let messageListener: WorkerMessageListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: WorkerMessageListener) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-queue', ['first.geospec.ts', 'second.geospec.ts']);
    const resolvers: Array<(result: GeoSpecRunnerResult) => void> = [];
    workerMocks.runner.run.mockImplementation(async () => {
      const result = await new Promise<GeoSpecRunnerResult>((resolve) => {
        resolvers.push(resolve);
      });
      return result;
    });
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');
    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-queue',
    });

    sendRunRequest({
      messageListener,
      requestId: 'request-first-queue',
      sessionId,
      args: { files: ['first.geospec.ts'] },
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-second-queue',
      sessionId,
      args: { files: ['second.geospec.ts'] },
    });

    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(1);
    });
    resolvers[0]?.(successfulRunnerResult());
    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(2);
    });
    resolvers[1]?.(successfulRunnerResult());
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-second-queue' }));
    });

    const runCallInputs = workerMocks.runner.run.mock.calls.map((call) => {
      const [input] = call as [{ files: readonly string[] }];
      return input.files;
    });
    expect(runCallInputs).toEqual([['first.geospec.ts'], ['second.geospec.ts']]);
    const resultRequestIds = postMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === 'result')
      .map((message) => message.requestId);
    expect(resultRequestIds).toEqual(['request-first-queue', 'request-second-queue']);
  });

  it('should reset fatal model load memoization between runs', async () => {
    let messageListener: WorkerMessageListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: WorkerMessageListener) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', vi.fn());

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    mockProjectTree('/projects/proj-reset', ['main.geospec.ts']);
    const fatalError = workerMocks.createGeoSpecModelLoadError([
      { code: 'RUNTIME_UNAVAILABLE', message: 'runtime boot failed' },
    ]);
    workerMocks.loadModel.mockRejectedValueOnce(fatalError).mockResolvedValueOnce({ provenance: { source: {} } });
    workerMocks.runner.run
      .mockImplementationOnce(async () => {
        const runnerOptions = workerMocks.createGeoSpecWebRunner.mock.calls[0]?.[0] as {
          modelLoader: (input: { file: string }) => Promise<unknown>;
        };
        await expect(runnerOptions.modelLoader({ file: 'main.scad' })).rejects.toBe(fatalError);
        await expect(runnerOptions.modelLoader({ file: 'main.scad' })).rejects.toBe(fatalError);
        return successfulRunnerResult();
      })
      .mockImplementationOnce(async () => {
        const runnerOptions = workerMocks.createGeoSpecWebRunner.mock.calls[0]?.[0] as {
          modelLoader: (input: { file: string }) => Promise<unknown>;
        };
        await expect(runnerOptions.modelLoader({ file: 'main.scad' })).resolves.toEqual({
          provenance: { source: {} },
        });
        return successfulRunnerResult();
      });
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');
    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-reset',
    });

    sendRunRequest({
      messageListener,
      requestId: 'request-reset-first',
      sessionId,
      args: {},
    });
    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(1);
    });
    sendRunRequest({
      messageListener,
      requestId: 'request-reset-second',
      sessionId,
      args: {},
    });
    await vi.waitFor(() => {
      expect(workerMocks.runner.run).toHaveBeenCalledTimes(2);
    });
    expect(workerMocks.loadModel).toHaveBeenCalledTimes(2);
  });

  it('should dispose runner runtime and filesystem state on close', async () => {
    let messageListener: WorkerMessageListener | undefined;
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, listener: WorkerMessageListener) => {
        if (type === 'message') {
          messageListener = listener;
        }
      }),
    );
    const postMessage = vi.fn<(message: GeoSpecRunnerWorkerResponse) => void>();
    const close = vi.fn();
    vi.stubGlobal('postMessage', postMessage);
    vi.stubGlobal('close', close);

    workerMocks.wrapMessagePort.mockReturnValue({ start: vi.fn() });
    workerMocks.createBridgeProxy.mockReturnValue(workerMocks.fsProxy);
    workerMocks.fromFsLike.mockReturnValue({ kind: 'runtime-fs' });
    workerMocks.createDefaultKernelOptions.mockImplementation((options: unknown) => ({ options }));
    workerMocks.createRuntimeClient.mockReturnValue(workerMocks.runtimeClient);
    workerMocks.createGeoSpecWebRunner.mockReturnValue(workerMocks.runner);

    await import('#workers/geospec-runner.worker.js');
    const sessionId = await initializeWorkerSession({
      messageListener,
      postMessage,
      projectRootPath: '/projects/proj-close',
    });

    messageListener?.({
      data: {
        type: 'close',
        requestId: 'request-close',
        sessionId,
      },
    } as MessageEvent<GeoSpecRunnerWorkerRequest>);

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'closed',
        requestId: 'request-close',
        sessionId,
      } satisfies GeoSpecRunnerWorkerResponse);
    });
    expect(workerMocks.runner.close).toHaveBeenCalledTimes(1);
    expect(workerMocks.runtimeClient.terminate).toHaveBeenCalledTimes(1);
    expect(workerMocks.fsProxy.dispose).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('should keep the GeoSpec worker contract on one project filesystem bridge', async () => {
    const source = await readFile(fileURLToPath(new URL('geospec-runner.worker.ts', import.meta.url)), 'utf8');
    const types = await readFile(fileURLToPath(new URL('geospec-runner.types.ts', import.meta.url)), 'utf8');
    const deletedRuntimePortName = ['runtime', 'FileSystem', 'Port'].join('');
    const deletedBridgeFactoryName = ['from', 'FileSystem', 'BridgePort'].join('');

    expect(`${source}\n${types}`).not.toContain(deletedRuntimePortName);
    expect(source).not.toContain(deletedBridgeFactoryName);
    expect(source).toContain('fromFsLike');
    const runRequestStart = types.indexOf('export type GeoSpecRunnerWorkerRunRequest');
    const abortRequestStart = types.indexOf('export type GeoSpecRunnerWorkerAbortRequest');
    const runRequestBlock = types.slice(runRequestStart, abortRequestStart);
    expect(runRequestBlock).not.toContain('vmFileSystemPort');
    expect(runRequestBlock).not.toContain('projectRootPath');
    expect(runRequestBlock).not.toContain('runtimeConfig');
    expect(source).not.toContain('finally {\n    await runner?.close();');
  });
});
