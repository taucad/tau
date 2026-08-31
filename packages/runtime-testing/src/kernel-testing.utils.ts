import deepmerge from 'deepmerge';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { RuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import type { AnyKernelDefinition, KernelFileSystem, KernelRuntime, RuntimeLogger } from '@taucad/runtime/kernel';
import { assertRootedPath } from '@taucad/runtime/kernel';
import type {
  CreateGeometryHandler,
  KernelMiddlewareRuntime,
  MiddlewareCreateGeometryRequest,
  MiddlewareState,
} from '@taucad/runtime/middleware';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import type {
  CreateGeometryResult,
  Dependency,
  FileStat,
  FileStatEntry,
  GeometryResponse,
  HashedGeometryResult,
  GetParametersInput,
  GetParametersResult,
  JSONSchema7,
  KernelErrorResult,
  KernelIssue,
  KernelResult,
  KernelSuccessResult,
  RuntimeContentInput,
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
/** Implements the projected public overload through the runtime's wide client implementation. @public */
export function createTestRuntimeClient({
  runtime,
  files = {},
}: CreateTestRuntimeClientOptions): ReturnType<
  typeof createRuntimeClient<RuntimeDefinition, ReturnType<typeof inProcessTransport<RuntimeDefinition>>>
> {
  return createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(normalizeInitialFiles(files)) }),
  });
}

/** Renders one fixture and releases its client before returning. @public */
export const createTestGeometry = async <const Runtime extends RuntimeDefinition>({
  runtime,
  files,
  mainFile,
  parameters,
  content,
}: CreateTestRuntimeClientOptions<Runtime> & {
  readonly mainFile: string;
  readonly parameters?: Record<string, unknown>;
  readonly content?: RuntimeContentInput;
}): Promise<HashedGeometryResult> => {
  const client = createTestRuntimeClient({ runtime, files });
  try {
    const outcome = await client.render({
      source: { path: mainFile },
      ...(parameters ? { parameters } : {}),
      ...(content ? { content } : {}),
    });
    if (outcome.superseded) {
      throw new Error('Test render was superseded');
    }
    return outcome.geometry;
  } finally {
    await client.shutdown();
  }
};

/** Resolves a fixture's parameter schema and releases its client. @public */
export const getTestParameters = async <const Runtime extends RuntimeDefinition>({
  runtime,
  files,
  mainFile,
}: CreateTestRuntimeClientOptions<Runtime> & {
  readonly mainFile: string;
}): Promise<{ jsonSchema: JSONSchema7; defaultParameters: Record<string, unknown> }> => {
  const client = createTestRuntimeClient({ runtime, files });
  try {
    const parameters = new Promise<{ jsonSchema: JSONSchema7; defaultParameters: Record<string, unknown> }>(
      (resolve, reject) => {
        const unsubscribeError = client.on('error', (issues) => {
          unsubscribeParameters();
          reject(new Error(issues.map((issue) => issue.message).join('\n')));
        });
        const unsubscribeParameters = client.on('parametersResolved', (result) => {
          unsubscribeError();
          unsubscribeParameters();
          if (!result.success) {
            reject(new Error(result.issues.map((issue) => issue.message).join('\n')));
            return;
          }
          resolve(result.data);
        });
      },
    );
    const outcome = await client.render({ source: { path: mainFile } });
    if (outcome.superseded) {
      throw new Error('Test parameter render was superseded');
    }
    return await parameters;
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
}): KernelMiddlewareRuntime<State, Options> & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFileSystem;
  state: ReturnType<typeof createMockState<State>>;
  tracer: { startSpan: ReturnType<typeof vi.fn> };
} => ({
  tracer: { startSpan: vi.fn(() => ({ end: vi.fn() })) },
  logger: createMockLogger(),
  filesystem: createMockFileSystem(options?.filesystemOverrides),
  state: createMockState<State>(),
  options: options?.options ?? (deepmerge({}, {}) as Options),
  dependencies: options?.dependencies ?? [],
  signal: options?.signal ?? new AbortController().signal,
  dependencyHash: options?.dependencyHash ?? 'a'.repeat(64),
});

/** Creates a successful geometry result. @public */
export const createSuccessResult = (geometry: GeometryResponse): KernelSuccessResult<GeometryResponse> => ({
  success: true,
  data: geometry,
  issues: [],
});

/** Creates a successful GLTF geometry result. @public */
export const createGltfSuccessResult = (content: Uint8Array<ArrayBuffer>): KernelSuccessResult<GeometryResponse> =>
  createSuccessResult({ format: 'gltf', content });

/** Creates a failed geometry result. @public */
export const createErrorResult = (issues?: KernelIssue[]): CreateGeometryResult => ({
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

/** Asserts and narrows a failed kernel result. @public */
export function assertFailure<T>(result: KernelResult<T>, context?: string): asserts result is KernelErrorResult {
  expect(result.success, context ? `[${context}] Expected failure` : 'Expected failure').toBe(false);
}

/** Creates a middleware render request. @public */
export const createMockInput = (
  overrides?: Partial<MiddlewareCreateGeometryRequest>,
): MiddlewareCreateGeometryRequest => ({ entryPath: 'test.kcl', parameters: {}, options: {}, ...overrides });

/** Creates a normalized worker-level file locator. @public */
export const createGeometryFile = (filename: string): { filename: string; path: string } => {
  const path = assertRootedPath(filename);
  const separator = path.lastIndexOf('/');
  return { filename: path.slice(separator + 1), path: separator === -1 ? '' : path.slice(0, separator) };
};

/** Creates a mocked kernel runtime. @public */
export const createMockKernelRuntime = (options?: {
  readonly filesystemOverrides?: MockFileSystemOptions;
  readonly signal?: AbortSignal;
}): KernelRuntime & { logger: ReturnType<typeof createMockLogger>; filesystem: MockFileSystem } => ({
  signal: options?.signal ?? new AbortController().signal,
  emitEvent: () => undefined,
  logger: createMockLogger(),
  filesystem: createMockFileSystem(options?.filesystemOverrides),
  fileContentCache: new Map(),
  getCompiledWasmModule: () => undefined,
  bundler: {
    resolveDependencies: async () => ({ resolved: [], unresolved: [] }),
    bundle: async () => ({ code: '', issues: [], success: false, dependencies: [], unresolvedPaths: [] }),
    registerModule: () => undefined,
  },
  execute: async () => ({
    success: false,
    issues: [{ message: 'Mock executor', code: 'RUNTIME', severity: 'error' }],
  }),
  tracer: { startSpan: () => ({ end: () => undefined }) },
});

const noop = (): void => undefined;

/** Creates an explicit Vitest-backed RuntimeClient literal. @public */
export function createMockRuntimeClient(): RuntimeClient;
export function createMockRuntimeClient<Runtime extends AnyRuntimeDefinition>(): RuntimeClient<Runtime>;
/** Implements the wide and runtime-projected mock client overloads. @public */
export function createMockRuntimeClient(): unknown {
  const client = {
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
    renderStatus: 'idle',
    activeKernelId: undefined,
    capabilities: undefined,
    connect: vi.fn(async () => undefined),
    transcode: vi.fn(async () => ({ success: false, issues: [] })),
    snapshotSource: vi.fn(async () => ({ success: false, issues: [] })),
    render: vi.fn(async () => ({ superseded: true })),
    updateParameters: vi.fn(async () => ({ superseded: true })),
    setOptions: vi.fn(async () => ({ superseded: true })),
    setRenderTimeout: vi.fn(),
    export: vi.fn(async () => ({
      success: true,
      data: [{ bytes: new Uint8Array([1, 2, 3]), name: 'model.stl', mimeType: 'model/stl' }],
      issues: [],
    })),
    routesFor: vi.fn(() => []),
    bestRouteFor: vi.fn(() => undefined),
    terminate: vi.fn(),
    shutdown: vi.fn(async () => undefined),
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- implements RuntimeClient event overloads.
    on: vi.fn(() => noop),
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- explicit literal implements RuntimeClient overloads.
  return client as RuntimeClient;
}

/** Creates standard file, middleware, and framework dependencies. @public */
export const createMockDependencies = (overrides?: Dependency[]): readonly Dependency[] => [
  { type: 'file', path: 'test.kcl', contentHash: 'abc123' },
  { type: 'middleware', id: 'test-middleware', version: '1', index: 0, options: {} },
  { type: 'framework', name: 'tau', version: '0.0.1' },
  ...(overrides ?? []),
];

/** Creates a mocked middleware geometry handler. @public */
export const createMockCreateGeometryHandler = (result?: CreateGeometryResult): CreateGeometryHandler =>
  vi.fn(async () => result ?? createGltfSuccessResult(new Uint8Array([1, 2, 3])));

/** Creates a mocked middleware parameter handler. @public */
type TestGetParametersHandler = (input: GetParametersInput) => Promise<GetParametersResult>;

/** Creates a mocked middleware parameter handler. @public */
export const createMockGetParametersHandler = (result?: GetParametersResult): TestGetParametersHandler =>
  vi.fn(
    async (): Promise<GetParametersResult> =>
      result ?? {
        success: true,
        data: { defaultParameters: {}, jsonSchema: { type: 'object', properties: {} } },
        issues: [],
      },
  );

/** Runtime definition accepted by public test integration helpers. @public */
export type TestRuntimeDefinition = RuntimeDefinition;

/** Kernel definition type retained for mock-authoring signatures. @public */
export type TestKernelDefinition = AnyKernelDefinition;
