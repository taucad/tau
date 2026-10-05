import deepmerge from 'deepmerge';
import {
  contentDigest,
  createComputeReuseService,
  createMemoryActionStore,
  createMemoryContentStore,
  digestAction,
  digestContent,
} from '@taucad/cache-core';
import type { ActionDigest, ComputeEvaluationInput, ComputeEvaluationResult } from '@taucad/cache-core';
import { createRuntimeClient } from '@taucad/runtime/client';
import type {
  Description,
  Evaluation,
  ExportResult,
  Rendering,
  RuntimeClient,
  RuntimeDocument,
  UpdateOutcome,
  ViewStatus,
  ViewSubscription,
  ViewUpdateOutcome,
  WideViewRequest,
} from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { compileParameterManifest } from '@taucad/parameters';
import type { ParameterManifest } from '@taucad/parameters';
import type {
  ComputeGeneration,
  ComputeScopeReceipt,
  ComputeStoreEntry,
  KernelComputeCapability,
  KernelFileSystem,
  KernelServices,
  RuntimeLogger,
} from '@taucad/runtime/kernel';
import { assertRootedPath } from '@taucad/runtime/kernel';
import type { EvaluateRequest, KernelMiddlewareServices, MiddlewareState } from '@taucad/runtime/middleware';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import type {
  Dependency,
  TranscodeResult,
  FileStat,
  FileStatEntry,
  DescribeInput,
  DescribeResult,
  EvaluateResult,
  KernelErrorResult,
  KernelIssue,
  KernelResult,
  KernelSuccessResult,
  RuntimeSourceSnapshotResult,
} from '@taucad/runtime/types';
import type { AnyRuntimeDefinition, RuntimeDefinition } from '@taucad/runtime/worker';
import { expect, vi } from 'vitest';
import type { Mock } from 'vitest';

/** Initial files and runtime definition for a real in-process test client. @public */
export type CreateTestRuntimeClientOptions<Runtime extends RuntimeDefinition = RuntimeDefinition> = {
  readonly runtime: Runtime;
  readonly files?: Record<string, string | Uint8Array<ArrayBuffer>>;
};

const normalizeInitialFiles = (
  files: Record<string, string | Uint8Array<ArrayBuffer>>,
): Record<string, string | Uint8Array<ArrayBuffer>> =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [assertRootedPath(path), content]));

/**
 * Creates a real runtime client over the production in-process transport and
 * an isolated in-memory filesystem. The caller owns the returned client and
 * must call `shutdown()`.
 *
 * @public
 */
export function createTestRuntimeClient<const Runtime extends RuntimeDefinition>(
  options: CreateTestRuntimeClientOptions<Runtime>,
): ReturnType<typeof createRuntimeClient<Runtime, ReturnType<typeof inProcessTransport<Runtime>>>>;
/** Implements the projected public overload through a wide unconfigured runtime. @public */
export function createTestRuntimeClient({
  runtime,
  files = {},
}: CreateTestRuntimeClientOptions): RuntimeClient<RuntimeDefinition> {
  return createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(normalizeInitialFiles(files)) }),
  });
}

type TestGeometryClient<Runtime extends RuntimeDefinition> = ReturnType<typeof createTestRuntimeClient<Runtime>>;
type TestGeometryDocument<Runtime extends RuntimeDefinition> = ReturnType<TestGeometryClient<Runtime>['open']>;
type TestGeometryView<Runtime extends RuntimeDefinition> = ReturnType<TestGeometryDocument<Runtime>['view']>;

/** Renders one fixture with the exact open contract of its runtime. @public */
export function createTestGeometry<
  const Runtime extends RuntimeDefinition,
  SelectedView extends TestGeometryView<Runtime> = TestGeometryView<Runtime>,
>(
  input: CreateTestRuntimeClientOptions<Runtime> & {
    readonly open: Parameters<TestGeometryClient<Runtime>['open']>[0];
    readonly view?: (document: TestGeometryDocument<Runtime>) => SelectedView;
  },
): Promise<Rendering<Extract<SelectedView['view'], string>>>;
/** Implements the fixture over one actual document client. @public */
export async function createTestGeometry(
  input: CreateTestRuntimeClientOptions & {
    readonly open: Parameters<TestGeometryClient<RuntimeDefinition>['open']>[0];
    readonly view?: (document: TestGeometryDocument<RuntimeDefinition>) => ViewSubscription;
  },
): Promise<Rendering> {
  const { runtime, files } = input;
  const client = createTestRuntimeClient({ runtime, files });
  let document: ReturnType<typeof client.open> | undefined;
  let view: ViewSubscription | undefined;
  try {
    document = client.open({ ...input.open, watch: input.open.watch ?? false });
    view = input.view?.(document) ?? document.view();
    const outcome = await view.rendering();
    if (outcome.superseded) {
      throw new Error('Test render was superseded');
    }
    return outcome.rendering;
  } finally {
    view?.close();
    document?.close();
    await client.shutdown();
  }
}

/**
 * Verify that two render projections and an optional export read one retained
 * evaluation without changing the first projection or export evidence.
 * Callers close over the same native handle and choose semantically different
 * views, options or content for A and B.
 *
 * @public
 */
export const expectKernelProjectionOrder = async <First, Intervening, Exported = never>({
  renderA,
  renderB,
  export: exportModel,
  freshB,
}: {
  readonly renderA: () => First | Promise<First>;
  readonly renderB: () => Intervening | Promise<Intervening>;
  readonly export?: () => Exported | Promise<Exported>;
  readonly freshB?: () => Intervening | Promise<Intervening>;
}): Promise<{ first: First; intervening: Intervening; repeated: First }> => {
  const first = await renderA();
  const exportedBefore = exportModel ? await exportModel() : undefined;
  const intervening = await renderB();
  if (freshB) {
    expect(intervening).toEqual(await freshB());
  }
  const repeated = await renderA();
  expect(repeated).toEqual(first);
  if (exportModel) {
    expect(await exportModel()).toEqual(exportedBefore);
  }
  return { first, intervening, repeated };
};

/** Resolves a fixture's parameter schema and releases its client. @public */
export const getTestParameters = async ({
  runtime,
  files,
  mainFile,
}: CreateTestRuntimeClientOptions & {
  readonly mainFile: string;
}): Promise<ParameterManifest> => {
  const client = createTestRuntimeClient({ runtime, files });
  try {
    const description = await client.describe({ source: { path: mainFile } });
    if (!description.success) {
      throw new Error(description.issues.map((issue) => issue.message).join('\n'));
    }
    return description.parameters;
  } finally {
    await client.shutdown();
  }
};

type MockLogger = { [Key in keyof RuntimeLogger]: Mock<RuntimeLogger[Key]> };

/** Creates a Vitest-backed runtime logger. @public */
export const createMockLogger = (): RuntimeLogger & MockLogger => ({
  log: vi.fn<RuntimeLogger['log']>(),
  debug: vi.fn<RuntimeLogger['debug']>(),
  trace: vi.fn<RuntimeLogger['trace']>(),
  warn: vi.fn<RuntimeLogger['warn']>(),
  error: vi.fn<RuntimeLogger['error']>(),
  custom: vi.fn<RuntimeLogger['custom']>(),
});

/** Options for a mocked kernel filesystem. @public */
export type MockFileSystemOptions = {
  readonly existsResult?: boolean | ((path: string) => boolean | Promise<boolean>);
  readonly readFileResult?:
    | string
    | Uint8Array<ArrayBuffer>
    | ((path: string) => string | Uint8Array<ArrayBuffer> | Promise<string | Uint8Array<ArrayBuffer>>);
  readonly readdirResult?: string[] | ((path: string) => string[] | Promise<string[]>);
};

/** Vitest functions exposed by a mocked kernel filesystem. @public */
export type MockFileSystemMocks = {
  readFile: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  readdir: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
  rmdir: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  lstat: ReturnType<typeof vi.fn>;
  readFiles: ReturnType<typeof vi.fn>;
  readdirContents: ReturnType<typeof vi.fn>;
  readdirStat: ReturnType<typeof vi.fn>;
  ensureDir: ReturnType<typeof vi.fn>;
};

/** A mocked kernel filesystem and its assertion functions. @public */
export type MockFileSystem = KernelFileSystem & { readonly mocks: MockFileSystemMocks };

/** Creates a mocked kernel filesystem. @public */
export const createMockFileSystem = (options?: MockFileSystemOptions): MockFileSystem => {
  const exists = vi.fn(async (path: string): Promise<boolean> => {
    if (typeof options?.existsResult === 'function') {
      return options.existsResult(path);
    }
    return options?.existsResult ?? false;
  });
  const readFileMock = vi.fn(async (path: string, _encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> => {
    if (typeof options?.readFileResult === 'function') {
      return options.readFileResult(path);
    }
    return options?.readFileResult ?? new Uint8Array();
  });
  const readdir = vi.fn(async (path: string): Promise<string[]> => {
    if (typeof options?.readdirResult === 'function') {
      return options.readdirResult(path);
    }
    return options?.readdirResult ?? [];
  });
  const writeFile = vi.fn(async (_path: string, _data: string | Uint8Array<ArrayBuffer>): Promise<void> => undefined);
  const mkdir = vi.fn(async (_path: string, _options?: { recursive?: boolean }): Promise<void> => undefined);
  const unlink = vi.fn(async (_path: string): Promise<void> => undefined);
  const rmdir = vi.fn(async (_path: string): Promise<void> => undefined);
  const rename = vi.fn(async (_oldPath: string, _newPath: string): Promise<void> => undefined);
  const stat = vi.fn(async (_path: string): Promise<FileStat> => {
    throw new Error('Not found');
  });
  const lstat = vi.fn(async (_path: string): Promise<FileStat> => {
    throw new Error('Not found');
  });
  const readFiles = vi.fn(async (_paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>> => ({}));
  const readdirContents = vi.fn(async (_path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> => ({}));
  const readdirStat = vi.fn(async (_path: string): Promise<FileStatEntry[]> => []);
  const ensureDirectory = vi.fn(async (_path: string): Promise<void> => undefined);
  const mocks: MockFileSystemMocks = {
    readFile: readFileMock,
    exists,
    readdir,
    writeFile,
    mkdir,
    unlink,
    rmdir,
    rename,
    stat,
    lstat,
    readFiles,
    readdirContents,
    readdirStat,
    ensureDir: ensureDirectory,
  };

  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = await readFileMock(path, encoding);
    if (encoding === 'utf8') {
      return typeof value === 'string' ? value : new TextDecoder().decode(value);
    }
    return typeof value === 'string' ? new TextEncoder().encode(value) : value;
  }

  return {
    id: 'runtime:mock-fs',
    capabilities: { persistent: false, writable: true, quotaBased: false },
    dispose: () => undefined,
    readFile,
    exists,
    readdir,
    writeFile,
    mkdir,
    unlink,
    rmdir,
    rename,
    stat,
    lstat,
    readFiles,
    readdirContents,
    readdirStat,
    ensureDir: ensureDirectory,
    mocks,
  };
};

const createMockState = <T extends Record<string, unknown>>(): MiddlewareState<T> & {
  update: ReturnType<typeof vi.fn>;
} => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- test state begins empty by design.
  let value = {} as MiddlewareState<T>['value'];
  const update = vi.fn((partial: Partial<T>) => {
    value = deepmerge(value, partial, {
      arrayMerge: (_target: unknown[], source: unknown[]) => source,
    }) as MiddlewareState<T>['value'];
  });
  return {
    get value() {
      return value;
    },
    update,
  };
};

/** Creates a mocked middleware runtime. @public */
export const createMockRuntime = <
  State extends Record<string, unknown> = Record<string, never>,
  Options extends Record<string, unknown> = Record<string, never>,
>(options?: {
  readonly filesystemOverrides?: MockFileSystemOptions;
  readonly dependencies?: readonly Dependency[];
  readonly dependencyHash?: string;
  readonly options?: Options;
  readonly signal?: AbortSignal;
}): KernelMiddlewareServices<State, Options> & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFileSystem;
  state: ReturnType<typeof createMockState<State>>;
  tracer: { startSpan: ReturnType<typeof vi.fn> };
} => {
  const signal = options?.signal ?? new AbortController().signal;
  return {
    tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
    logger: createMockLogger(),
    filesystem: createMockFileSystem(options?.filesystemOverrides),
    compute: createMockComputeRuntime(signal),
    state: createMockState<State>(),
    options: options?.options ?? (deepmerge({}, {}) as Options),
    dependencies: options?.dependencies ?? [],
    signal,
    dependencyHash: options?.dependencyHash ?? 'a'.repeat(64),
  };
};

/** Creates a failed geometry result. @public */
export const createErrorResult = (issues?: KernelIssue[]): KernelErrorResult => ({
  success: false,
  issues: issues ?? [{ message: 'Test error', code: 'RUNTIME', severity: 'error', type: 'kernel' }],
});

/** Asserts and narrows a successful kernel result. @public */
export function assertSuccess<T>(result: KernelResult<T>, context?: string): asserts result is KernelSuccessResult<T> {
  if (!result.success) {
    const prefix = context ? `[${context}] ` : '';
    throw new Error(
      `${prefix}Expected success but got failure:\n${result.issues.map((issue) => issue.message).join('\n')}`,
    );
  }
  expect(result.success).toBe(true);
}

/** Asserts and narrows a successful public document rendering. @public */
export function assertRenderingSuccess(
  rendering: Rendering,
  context?: string,
): asserts rendering is Extract<Rendering, { success: true }> {
  if (!rendering.success) {
    const prefix = context ? `[${context}] ` : '';
    throw new Error(
      `${prefix}Expected rendering success:\n${rendering.issues.map((issue) => issue.message).join('\n')}`,
    );
  }
  expect(rendering.success).toBe(true);
}

/** Asserts and narrows a failed kernel result. @public */
export function assertFailure<T>(result: KernelResult<T>, context?: string): asserts result is KernelErrorResult {
  expect(result.success, context ? `[${context}] Expected failure` : 'Expected failure').toBe(false);
}

/** Creates a middleware render request. @public */
export const createMockInput = (overrides?: Partial<EvaluateRequest>): EvaluateRequest => ({
  entryPath: 'test.kcl',
  parameters: {},
  options: {},
  ...overrides,
});

/** Creates a normalized worker-level file locator. @public */
export const createGeometryFile = (filename: string): { filename: string; path: string } => {
  const path = assertRootedPath(filename);
  const separator = path.lastIndexOf('/');
  return { filename: path.slice(separator + 1), path: separator === -1 ? '' : path.slice(0, separator) };
};

const createMockComputeRuntime = (signal: AbortSignal): KernelComputeCapability => {
  const service = createComputeReuseService({
    contentStore: createMemoryContentStore({ maxBytes: 64 * 1024 * 1024 }),
    actionStore: createMemoryActionStore({ maxBytes: 8 * 1024 * 1024 }),
  });
  const generation = 1 as ComputeGeneration;
  const published = new Map<ActionDigest, ComputeStoreEntry>();
  return {
    status: 'on',
    mode: 'memory',
    evaluate: async <T>(input: ComputeEvaluationInput<T>): Promise<ComputeEvaluationResult<T>> =>
      service.evaluate({ ...input, signal }),
    openScope: ({ resident }) => {
      const pending = new Set<ActionDigest>();
      let receipt: ComputeScopeReceipt | undefined;
      return {
        generation,
        warm: async ({ digests }) => {
          const entries = digests.flatMap((digest) => {
            const entry = published.get(digest);
            return entry ? [entry] : [];
          });
          const imported = await resident.importEntries({ entries, signal });
          return {
            status: 'imported',
            imported: imported.imported,
            omitted: [...imported.omitted, ...digests.filter((digest) => !published.has(digest))],
            bytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
          };
        },
        announce: ({ entries }) => {
          const admitted: ActionDigest[] = [];
          for (const entry of entries) {
            if (entry.kind === 'action') {
              pending.add(entry.digest);
              admitted.push(entry.digest);
            }
          }
          return { admitted, rejected: [] };
        },
        close: ({ outcome }) => {
          receipt ??= {
            settled: (async () => {
              if (outcome !== 'delivered') {
                return { status: 'abandoned', published: [], omitted: [...pending], conflicts: [] } as const;
              }
              const exported = await resident.exportEntries({ digests: [...pending], signal });
              const keys: ActionDigest[] = [];
              for (const entry of exported.entries) {
                // oxlint-disable-next-line no-await-in-loop -- each entry has an independent content identity.
                const key = await digestAction({ action: entry.action });
                published.set(key, {
                  action: entry.action,
                  actionDigest: key,
                  // oxlint-disable-next-line no-await-in-loop -- content identity is per entry.
                  contentDigest: await digestContent({ bytes: entry.bytes }),
                  mediaType: entry.mediaType,
                  bytes: new Uint8Array(entry.bytes),
                  determinism: entry.determinism,
                });
                keys.push(key);
              }
              return { status: 'published', published: keys, omitted: exported.omitted, conflicts: [] } as const;
            })(),
          };
          return receipt;
        },
      };
    },
  };
};

/** Creates a mocked kernel runtime. @public */
export const createMockKernelRuntime = (options?: {
  readonly filesystemOverrides?: MockFileSystemOptions;
  readonly signal?: AbortSignal;
}): KernelServices & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFileSystem;
  tracer: { startSpan: ReturnType<typeof vi.fn> };
} => {
  const signal = options?.signal ?? new AbortController().signal;
  return {
    signal,
    logger: createMockLogger(),
    filesystem: createMockFileSystem(options?.filesystemOverrides),
    fileContentCache: new Map(),
    getCompiledWasmModule: () => undefined,
    compute: createMockComputeRuntime(signal),
    bundler: {
      resolveDependencies: async () => ({ resolved: [], unresolved: [] }),
      bundle: async () => ({ code: '', issues: [], success: false, dependencies: [], unresolvedPaths: [] }),
      registerModule: () => undefined,
    },
    execute: async () => ({
      success: false,
      issues: [{ message: 'Mock executor', code: 'RUNTIME', severity: 'error' }],
    }),
    /* A spy, so a kernel's own spans and their end attributes are assertable — which is how a
     * native kernel's stage timings are checked now that they are attributes rather than a log. */
    tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
  };
};

const noop = (): void => undefined;

const subscribeMockEvent = (listeners: Map<string, Set<unknown>>, event: string, handler: unknown): (() => void) => {
  let callbacks = listeners.get(event);
  if (!callbacks) {
    callbacks = new Set();
    listeners.set(event, callbacks);
  }
  callbacks.add(handler);
  return () => callbacks.delete(handler);
};

const emitMockEvent = (listeners: Map<string, Set<unknown>>, event: string, value: unknown): void => {
  for (const listener of listeners.get(event) ?? []) {
    if (typeof listener === 'function') {
      Reflect.apply(listener, undefined, [value]);
    }
  }
};

/** Public document/view spies and event controls for one test. @public */
export type MockRuntimeDocumentFixture = Readonly<{
  document: RuntimeDocument;
  view: ViewSubscription;
  viewSpy: Mock<(id?: string, request?: WideViewRequest) => ViewSubscription>;
  evaluation: Evaluation;
  rendering: Rendering;
  emitEvaluated(next: Evaluation): void;
  emitRendered(next: Rendering): void;
  emitDocumentStatus(status: 'evaluating' | 'ready' | 'error' | 'closed'): void;
  emitViewStatus(status: ViewStatus): void;
}>;

/** A document/view test fixture with real public result shapes and controllable events. @public */
export const createMockRuntimeDocument = (): MockRuntimeDocumentFixture => {
  const documentListeners = new Map<string, Set<unknown>>();
  const viewListeners = new Map<string, Set<unknown>>();
  const evaluation: Evaluation = {
    id: 'mock-evaluation',
    success: true,
    transient: false,
    views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
    exports: [],
    issues: [],
  };
  const rendering: Rendering = {
    success: true,
    requestId: 'mock-rendering',
    evaluationId: evaluation.id,
    transient: false,
    view: 'model',
    artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array([1]) },
    hash: 'mock-rendering',
    issues: [],
  };
  const view: ViewSubscription = {
    view: 'model',
    request: {},
    on: vi.fn((event: 'rendered' | 'status', handler: unknown) => subscribeMockEvent(viewListeners, event, handler)),
    rendering: vi.fn(async (): Promise<ViewUpdateOutcome> => ({ superseded: false, rendering })),
    update: vi.fn(async (): Promise<ViewUpdateOutcome> => ({ superseded: false, rendering })),
    close: vi.fn(),
  };
  const viewSpy = vi.fn((_id?: string, _request?: WideViewRequest) => view);
  function documentView(): ViewSubscription<string, Readonly<{ options?: never; instance?: never; content?: never }>>;
  function documentView<Id extends string>(id: Id, request?: WideViewRequest): ViewSubscription<Id>;
  function documentView(id?: string, request?: WideViewRequest): ViewSubscription {
    return viewSpy(id, request);
  }
  const document: RuntimeDocument = {
    id: 'mock-document',
    view: documentView,
    export: vi.fn(async (): Promise<ExportResult> => ({ success: false, issues: [] })),
    evaluation: vi.fn(async (): Promise<UpdateOutcome> => ({ superseded: false, evaluation })),
    update: vi.fn(async (): Promise<UpdateOutcome> => ({ superseded: false, evaluation })),
    on: vi.fn((event: 'described' | 'evaluated' | 'progress' | 'status', handler: unknown) =>
      subscribeMockEvent(documentListeners, event, handler),
    ),
    close: vi.fn(),
  };
  return {
    document,
    view,
    viewSpy,
    evaluation,
    rendering,
    emitEvaluated: (next: Evaluation): void => {
      emitMockEvent(documentListeners, 'evaluated', next);
    },
    emitRendered: (next: Rendering): void => {
      emitMockEvent(viewListeners, 'rendered', next);
    },
    emitDocumentStatus: (status: 'evaluating' | 'ready' | 'error' | 'closed'): void => {
      emitMockEvent(documentListeners, 'status', status);
    },
    emitViewStatus: (status: ViewStatus): void => {
      emitMockEvent(viewListeners, 'status', status);
    },
  };
};

/** Creates a Vitest-backed document client with typed public methods. @public */
export function createMockRuntimeClient<
  Runtime extends AnyRuntimeDefinition = AnyRuntimeDefinition,
>(): RuntimeClient<Runtime> {
  const client: RuntimeClient<Runtime> = {
    machines: { available: false, reason: 'unsupported' },
    jobs: { available: false, reason: 'unsupported' },
    transport: {
      id: 'in-process',
      descriptor: {
        id: 'in-process',
        wire: 'in-process',
        memory: { geometryDelivery: 'copy', abortSignal: 'wire-notify' },
        fileSystem: 'inline',
      },
    },
    lifecycleState: 'connected',
    capabilities: undefined,
    connect: vi.fn(async () => undefined),
    transcode: vi.fn(async (): Promise<TranscodeResult> => ({ success: false, issues: [] })),
    snapshotSource: vi.fn(async (): Promise<RuntimeSourceSnapshotResult> => ({ success: false, issues: [] })),
    publishAssembly: vi.fn<RuntimeClient<Runtime>['publishAssembly']>(async () => ({ status: 'invalid', issues: [] })),
    openAssembly: vi.fn(async () => {
      throw new TypeError('Mock published assembly admission is not configured.');
    }),
    exportPublished: vi.fn<RuntimeClient<Runtime>['exportPublished']>(async () => ({ success: false, issues: [] })),
    open: vi.fn<RuntimeClient<Runtime>['open']>(),
    describe: vi.fn(async (): Promise<Description> => ({ success: false, kernelId: undefined, issues: [] })),
    setOperationTimeout: vi.fn(),
    setTranscodeTimeout: vi.fn(),
    routesFor: vi.fn(() => []),
    bestRouteFor: vi.fn(() => undefined),
    terminate: vi.fn(),
    shutdown: vi.fn(async () => undefined),
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- implements RuntimeClient event overloads.
    on: vi.fn(() => noop),
  };
  return client;
}

/** Creates standard file, middleware, and framework dependencies. @public */
export const createMockDependencies = (overrides?: Dependency[]): readonly Dependency[] => [
  { type: 'file', path: 'test.kcl', contentHash: 'abc123' },
  { type: 'middleware', id: 'test-middleware', version: '1', index: 0, options: {} },
  { type: 'framework', name: 'tau', version: '0.0.1' },
  ...(overrides ?? []),
];

/** Creates a mocked middleware evaluate handler. @public */
export const createMockEvaluateHandler = (
  result?: EvaluateResult,
): ((input: EvaluateRequest) => Promise<EvaluateResult>) =>
  vi.fn(async () => result ?? { success: true, data: { views: ['model'] }, issues: [] });

/** Creates a mocked middleware describe handler. @public */
type TestGetParametersHandler = (input: DescribeInput) => Promise<DescribeResult<ParameterManifest>>;

/** Creates a mocked middleware describe handler. @public */
export const createMockDescribeHandler = (result?: DescribeResult<ParameterManifest>): TestGetParametersHandler =>
  vi.fn(
    async (): Promise<DescribeResult<ParameterManifest>> =>
      result ?? {
        success: true,
        data: {
          parameters: await compileParameterManifest({
            declaration: {
              schema: {
                $schema: 'https://json-structure.org/meta/extended/v0/#',
                $id: 'urn:taucad:runtime-testing:parameters',
                $uses: ['JSONSchemaUnits'],
                name: 'RuntimeTestingParameters',
                type: 'object',
              },
              defaults: {},
            },
            scope: { kind: 'source', authority: 'runtime-testing', root: '', entry: 'test.kcl' },
            source: {
              id: 'runtime-testing',
              version: '1',
              revision: contentDigest({ value: `sha256:${'0'.repeat(64)}` }),
              capability: 'json-structure',
            },
            dependency: contentDigest({ value: `sha256:${'1'.repeat(64)}` }),
            middleware: contentDigest({ value: `sha256:${'2'.repeat(64)}` }),
          }),
        },
        issues: [],
      },
  );

/** Runtime definition accepted by public test integration helpers. @public */
export type TestRuntimeDefinition = RuntimeDefinition;
