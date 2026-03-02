/* eslint-disable no-await-in-loop -- sequential filesystem operations in test helpers are intentional */
/**
 * Kernel Middleware Testing Utilities
 *
 * Shared helper functions for testing kernel middleware.
 */

import deepmerge from 'deepmerge';
import type { PartialDeep } from 'type-fest';
import type { ExportFormat, GeometryResponse, GeometryFile, OnWorkerLog } from '@taucad/types';
import { dirname } from '@zenfs/core/path';
import type { Mock } from 'vitest';
import { expect, vi } from 'vitest';
import { configure, fs } from '@zenfs/core';
import { InMemory } from '@zenfs/core/backends/memory.js';
import { joinPath } from '@taucad/utils/path';
import type {
  CreateGeometryResult,
  HashedGeometryResult,
  KernelIssue,
  KernelResult,
  KernelSuccessResult,
  KernelErrorResult,
  GetParametersResult,
  ExportGeometryResult,
  MiddlewareRegistrations,
  BundlerRegistrations,
} from '#types/kernel.types.js';
import type { PerformanceEntryData } from '#types/kernel-protocol.types.js';
import type {
  KernelLogger,
  KernelRuntime,
  KernelDefinition,
  KernelFileSystem,
  CanHandleInput,
  GetDependenciesInput,
  GetParametersInput,
  CreateGeometryInput,
  ExportGeometryInput,
} from '#types/kernel-worker.types.js';
import type { BundlerDefinition } from '#types/kernel-bundler.types.js';
import type { KernelMiddlewareRuntime, MiddlewareState } from '#types/kernel-middleware.types.js';
import type { Dependency } from '#types/kernel-dependency.types.js';
import type { KernelMiddleware } from '#middleware/kernel-middleware.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { ResolvedMiddleware } from '#framework/kernel-worker.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import { createFileSystemPort } from '#framework/kernel-filesystem-bridge.js';
import { fromZenFS } from '#client/filesystem-constructors.js';

async function resetFilesystem(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- filesystem mount point requires '/' as key
  await configure({ mounts: { '/': InMemory } });
}

// =============================================================================
// Test Filesystem Utilities
// =============================================================================

/**
 * Seed the test filesystem with files.
 * Resets to a fresh in-memory backend first (to prevent stale files from
 * prior tests interfering with import resolution), then seeds with provided files.
 *
 * @param files - Record of absolute paths to file contents
 */
export async function seedTestFilesystem(files: Record<string, string | Uint8Array<ArrayBuffer>>): Promise<void> {
  // Reset to a clean in-memory filesystem to prevent stale files from prior tests
  // (e.g., a leftover shapes.ts blocking resolution of shapes/index.ts barrel imports)
  await resetFilesystem();

  // Write files to the filesystem
  for (const [path, content] of Object.entries(files)) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const parentDir = dirname(normalizedPath);

    // Create parent directories if needed
    if (parentDir && parentDir !== '/') {
      await fs.promises.mkdir(parentDir, { recursive: true });
    }

    // Write file content
    await fs.promises.writeFile(normalizedPath, content);
  }
}

/**
 * Clear the test filesystem by resetting to a fresh in-memory backend.
 */
export async function clearTestFilesystem(): Promise<void> {
  await resetFilesystem();
}

// =============================================================================
// Worker Testing Utilities
// =============================================================================

/**
 * Options for initializing a kernel worker in tests.
 */
export type InitializeWorkerOptions = {
  /** Custom log handler */
  onLog?: OnWorkerLog;
  /** Worker-specific options passed to initialize (e.g., ReplicadWorker: { withBrepEdges: true }) */
  workerOptions?: Record<string, unknown>;
  /** Middleware configuration (defaults to empty array for tests that bypass dynamic loading) */
  middlewareEntries?: MiddlewareRegistrations;
  /** Telemetry callback -- receives batched performance entries from the worker */
  onTelemetry?: (entries: PerformanceEntryData[]) => void;
};

/**
 * Initialize a kernel worker using the production code path.
 * Uses MessageChannel to connect to the real fileManager, ensuring tests
 * exercise the same code path as production.
 *
 * IMPORTANT: Call seedTestFilesystem() before this to configure InMemory backend.
 * The first call to configure the filesystem "wins" - tests configure InMemory,
 * so the fileManager's ensureFilesystemConfigured('indexeddb') just waits.
 *
 * @param worker - The kernel worker instance to initialize
 * @param options - Optional configuration (onLog, workerOptions for kernel-specific settings like withBrepEdges)
 * @returns Promise resolving to the initialized worker
 */
export async function initializeWorkerForTesting<T extends KernelWorker>(
  worker: T,
  options?: InitializeWorkerOptions,
): Promise<T> {
  if (options?.onTelemetry) {
    worker.setTelemetrySend(options.onTelemetry);
  }

  const port = createFileSystemPort(fromZenFS(fs));

  await worker.initialize({
    callbacks: {
      onLog:
        options?.onLog ??
        (() => {
          // No-op for testing
        }),
    },
    transferables: { fileSystemPort: port },
    options: options?.workerOptions ?? {},
    middlewareEntries: options?.middlewareEntries ?? [],
  });

  return worker;
}

type MockKernelLogger = {
  [Key in keyof KernelLogger]: Mock<KernelLogger[Key]>;
};

/**
 * Create a mock logger for kernel and middleware testing.
 * Returns a logger with vitest mock functions.
 */
export function createMockLogger(): KernelLogger & MockKernelLogger {
  const logger: MockKernelLogger = {
    log: vi.fn<KernelLogger['log']>(),
    debug: vi.fn<KernelLogger['debug']>(),
    trace: vi.fn<KernelLogger['trace']>(),
    warn: vi.fn<KernelLogger['warn']>(),
    error: vi.fn<KernelLogger['error']>(),
    custom: vi.fn<KernelLogger['custom']>(),
  };

  return logger;
}

/**
 * Options for creating a mock filesystem with vitest mocks.
 */
export type MockFilesystemOptions = {
  /** Result for exists calls */
  existsResult?: boolean | ((path: string) => boolean | Promise<boolean>);
  /** Result for readFile calls */
  readFileResult?:
    | string
    | Uint8Array<ArrayBuffer>
    | ((path: string) => string | Uint8Array<ArrayBuffer> | Promise<string | Uint8Array<ArrayBuffer>>);
};

/**
 * Mock functions exposed for test assertions and setup.
 */
export type MockFilesystemMocks = {
  readFile: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  readdir: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
};

/**
 * A mock KernelFileSystem with vitest mock functions for verification.
 * Use the `mocks` property to access mock functions for test setup.
 */
export type MockFilesystem = KernelFileSystem & {
  /** Access underlying mock functions for test assertions and setup */
  mocks: MockFilesystemMocks;
};

/**
 * Create a mock filesystem for middleware testing.
 * Returns a filesystem with vitest mock functions for assertion.
 *
 * @example
 * ```typescript
 * const filesystem = createMockFilesystem({ existsResult: true });
 * // Configure mock behavior
 * filesystem.mocks.readFile.mockRejectedValue(new Error('Read error'));
 * // Verify calls
 * expect(filesystem.mocks.writeFile).toHaveBeenCalledWith(path, data);
 * ```
 */
export function createMockFilesystem(options?: MockFilesystemOptions): MockFilesystem {
  const existsFn = vi.fn().mockImplementation(async (path: string) => {
    if (typeof options?.existsResult === 'function') {
      return options.existsResult(path);
    }

    return options?.existsResult ?? false;
  });

  const readFileFn = vi.fn().mockImplementation(async (path: string) => {
    if (typeof options?.readFileResult === 'function') {
      return options.readFileResult(path);
    }

    return options?.readFileResult ?? new Uint8Array();
  });

  // Create base mock functions
  const writeFileFn = vi.fn().mockResolvedValue(undefined);
  const mkdirFn = vi.fn().mockResolvedValue(undefined);
  const unlinkFn = vi.fn().mockResolvedValue(undefined);
  const readdirFn = vi.fn().mockResolvedValue([]);
  const statFn = vi.fn().mockRejectedValue(new Error('Not found'));

  // Define readFile with overload signatures - delegates to mock
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return readFileFn(path, encoding) as Promise<string | Uint8Array<ArrayBuffer>>;
  }

  // Mocks object for test assertions
  const mocks: MockFilesystemMocks = {
    readFile: readFileFn,
    exists: existsFn,
    readdir: readdirFn,
    writeFile: writeFileFn,
    mkdir: mkdirFn,
    unlink: unlinkFn,
    stat: statFn,
  };

  return {
    readFile,
    exists: async (path: string) => existsFn(path) as Promise<boolean>,
    readdir: async (path: string) => readdirFn(path) as Promise<string[]>,
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => writeFileFn(path, data) as Promise<void>,
    mkdir: async (path: string, options_?: { recursive?: boolean }) => mkdirFn(path, options_) as Promise<void>,
    unlink: async (path: string) => unlinkFn(path) as Promise<void>,
    stat: async (path: string) => statFn(path) as Promise<{ type: 'file' | 'dir'; size: number; mtimeMs: number }>,

    // Expose mocks for test assertions
    mocks,
  };
}

/**
 * Create a mock state for middleware testing.
 */
export function createMockState<T extends Record<string, unknown>>(): MiddlewareState<T> & {
  update: ReturnType<typeof vi.fn>;
} {
  // Start with empty object - we use a wrapper object to allow reassignment
  // while still having the getter work correctly
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test utility requires flexible typing
  const stateContainer: { value: PartialDeep<T> } = { value: {} as PartialDeep<T> };

  const updateFn = vi.fn().mockImplementation((partial: Partial<T>) => {
    // Use deepmerge to match production createMiddlewareState behavior
    // Use arrayMerge to replace arrays instead of concatenating (matches kernel-middleware.ts)
    stateContainer.value = deepmerge(stateContainer.value, partial, {
      arrayMerge: (_target: unknown[], source: unknown[]) => source,
    }) as PartialDeep<T>;
  });

  return {
    get value() {
      return stateContainer.value;
    },
    update: updateFn,
  };
}

/**
 * Create a mock middleware runtime for testing.
 * Combines logger, filesystem, state, and dependencies.
 */
/** Default mock dependency hash for testing */
const defaultMockDependencyHash = 'a'.repeat(64);

/** Create a mock KernelMiddlewareRuntime for unit testing middleware hooks. */
export function createMockRuntime<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  State extends Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
>(mockOptions?: {
  filesystemOverrides?: MockFilesystemOptions;
  dependencies?: readonly Dependency[];
  dependencyHash?: string;
  options?: Options;
}): KernelMiddlewareRuntime<State, Options> & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFilesystem;
  state: ReturnType<typeof createMockState<State>>;
} {
  return {
    logger: createMockLogger(),
    filesystem: createMockFilesystem(mockOptions?.filesystemOverrides),
    state: createMockState<State>(),

    options: (mockOptions?.options ?? {}) as Options,
    dependencies: mockOptions?.dependencies ?? [],
    dependencyHash: mockOptions?.dependencyHash ?? defaultMockDependencyHash,
  };
}

/**
 * Create a successful CreateGeometryResultInternal with geometries.
 * Used for testing middleware which works with internal types (without hash).
 */
export function createSuccessResult(geometries: GeometryResponse[]): CreateGeometryResult {
  return {
    success: true,
    data: geometries,
    issues: [],
  };
}

/**
 * Create a successful CreateGeometryResultInternal with a single GLTF geometry.
 */
export function createGltfSuccessResult(content: Uint8Array<ArrayBuffer>): CreateGeometryResult {
  return createSuccessResult([{ format: 'gltf', content }]);
}

/**
 * Create a successful CreateGeometryResultInternal with a single GLTF geometry and issues.
 */
export function createGltfSuccessResultWithIssues(
  content: Uint8Array<ArrayBuffer>,
  issues: KernelIssue[],
): CreateGeometryResult {
  return {
    success: true,
    data: [{ format: 'gltf', content }],
    issues,
  };
}

/**
 * Create a failed CreateGeometryResultInternal.
 */
export function createErrorResult(issues?: KernelIssue[]): CreateGeometryResult {
  return {
    success: false,
    issues: issues ?? [
      {
        message: 'Test error',
        severity: 'error',
        type: 'kernel',
      },
    ],
  };
}

/**
 * Create an empty successful result.
 */
export function createEmptySuccessResult(): CreateGeometryResult {
  return createSuccessResult([]);
}

// =============================================================================
// Type-Narrowing Assertion Helpers
// =============================================================================

/**
 * Asserts that a kernel result is successful. Acts as a type guard narrowing
 * the result to KernelSuccessResult<T> for subsequent assertions.
 * Logs detailed error information when the assertion fails.
 */
export function assertSuccess<T>(result: KernelResult<T>, context?: string): asserts result is KernelSuccessResult<T> {
  if (!result.success) {
    const prefix = context ? `[${context}] ` : '';
    const issuesSummary = result.issues.map((issue) => `  [${issue.severity}] ${issue.message}`).join('\n');
    console.error(`${prefix}Expected success but got failure:\n${issuesSummary}`);
  }

  expect(result.success).toBe(true);
}

/**
 * Asserts that a kernel result is a failure. Acts as a type guard narrowing
 * the result to KernelErrorResult for subsequent assertions.
 * Logs the unexpected success data when the assertion fails.
 */
export function assertFailure<T>(result: KernelResult<T>, context?: string): asserts result is KernelErrorResult {
  if (result.success) {
    const prefix = context ? `[${context}] ` : '';
    console.error(`${prefix}Expected failure but got success with data:`, JSON.stringify(result.data).slice(0, 500));
  }

  expect(result.success).toBe(false);
}

/**
 * Create a CreateGeometryInput for testing.
 */
export function createMockInput(overrides?: Partial<CreateGeometryInput>): CreateGeometryInput {
  return {
    filePath: '/builds/test-build/test.kcl',
    basePath: '/builds/test-build',
    parameters: {},
    ...overrides,
  };
}

/**
 * Create a GeometryFile for testing.
 * Used to create test inputs for worker methods like canHandle, getParameters, createGeometry.
 */
export function createGeometryFile(filename: string, basePath = '/builds/test'): GeometryFile {
  return {
    filename,
    path: basePath,
  };
}

// =============================================================================
// Worker Test Helpers
// =============================================================================

/**
 * Options for createTestWorker.
 */
export type CreateTestWorkerOptions = {
  /** Worker-specific options passed to initialize (e.g., ReplicadWorker: { withBrepEdges: true }) */
  workerOptions?: Record<string, unknown>;
  /** Extensions the kernel handles (defaults to ['ts', 'js', 'scad', 'kcl', '*']) */
  extensions?: string[];
  /** Import detection regex source (for JS/TS kernel disambiguation) */
  detectImport?: string;
  /** Builtin module names this kernel provides (e.g., ['replicad']) */
  builtinModuleNames?: string[];
  /** Bundler config to load (enables detectImports-based transitive detection in tests) */
  bundlerEntries?: BundlerRegistrations;
  /** Pre-loaded bundler definition (bypasses dynamic import; auto-loaded for JS/TS kernels if not provided) */
  bundlerDefinition?: BundlerDefinition;
  /** Skip automatic bundler loading for JS/TS kernels (default: false) */
  skipBundler?: boolean;
  /** Telemetry callback -- receives batched performance entries from the worker */
  onTelemetry?: (entries: PerformanceEntryData[]) => void;
};

/**
 * Infer the file extensions a kernel handles from its definition.
 * Uses the kernel name as a heuristic when extensions aren't explicitly provided.
 */
function inferExtensions(definition: KernelDefinition): string[] {
  const name = definition.name.toLowerCase();

  if (name.includes('replicad') || name.includes('manifold') || name.includes('jscad')) {
    return ['ts', 'js'];
  }

  if (name.includes('openscad') || name.includes('scad')) {
    return ['scad'];
  }

  if (name.includes('zoo') || name.includes('kcl')) {
    return ['kcl'];
  }

  return ['*'];
}

/**
 * Infer an import-detection regex from the kernel name.
 * Returns undefined when the kernel has its own canHandle() that performs detection.
 */
function inferDetectImport(definition: KernelDefinition): string | undefined {
  if (definition.canHandle) {
    return undefined;
  }

  return undefined;
}

/**
 * Create and initialize a KernelRuntimeWorker with a single kernel definition.
 * Seeds the filesystem with provided files before creating the worker.
 * Uses the production runtime worker path (defineKernel modules).
 *
 * @param definition - The kernel definition (from defineKernel())
 * @param files - Record of relative paths to file contents
 * @param options - Optional worker options
 * @returns Promise resolving to the initialized runtime worker
 */
export async function createTestWorker(
  definition: KernelDefinition,
  files: Record<string, string>,
  options?: CreateTestWorkerOptions,
): Promise<KernelRuntimeWorker> {
  const basePath = '/builds/test';

  const absoluteFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    absoluteFiles[joinPath(basePath, path)] = content;
  }

  await seedTestFilesystem(absoluteFiles);

  const worker = new KernelRuntimeWorker();
  const extensions = options?.extensions ?? inferExtensions(definition);
  const detectImport = options?.detectImport ?? inferDetectImport(definition);

  await initializeWorkerForTesting(worker, {
    onTelemetry: options?.onTelemetry,
    workerOptions: {
      kernelModules: [
        {
          id: definition.name,
          moduleUrl: 'test://inline',
          extensions,
          detectImport,
          builtinModuleNames: options?.builtinModuleNames,
          options: options?.workerOptions,
          definition,
        },
      ],
    },
  });

  // Auto-load bundler for JS/TS kernels (needed for bundle/execute/resolveDependencies).
  // Lazy import avoids pulling esbuild-wasm at module load time, which crashes in
  // jsdom environments due to a TextEncoder Uint8Array realm mismatch.
  const needsBundler = !options?.skipBundler && extensions.some((ext) => ['ts', 'js', 'tsx', 'jsx'].includes(ext));
  if (needsBundler) {
    const bundlerDef =
      options?.bundlerDefinition ??
      ((await import('#bundler/esbuild.bundler.js')) as { default: BundlerDefinition }).default;
    const dummyConfig = { bundlerModuleUrl: 'test://esbuild', extensions: ['ts', 'js', 'tsx', 'jsx'] };
    await worker.ensureLoadedBundler(dummyConfig, bundlerDef);
  }

  if (options?.bundlerEntries) {
    for (const entry of options.bundlerEntries) {
      await worker.ensureLoadedBundler(entry);
    }
  }

  return worker;
}

/**
 * Helper to extract parameters from a kernel and assert success.
 *
 * @param definition - The kernel definition to use
 * @param files - Record of relative paths to file contents
 * @param mainFile - The main file to extract parameters from
 * @returns Promise resolving to the extracted parameters and JSON schema
 */
export async function getTestParameters(
  definition: KernelDefinition,
  files: Record<string, string>,
  mainFile: string,
): Promise<{ jsonSchema: unknown; defaultParameters: Record<string, unknown> }> {
  const { expect } = await import('vitest');

  const worker = await createTestWorker(definition, files);
  const result = await worker.getParameters(createGeometryFile(mainFile));

  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error('Extraction failed');
  }

  return result.data;
}

/**
 * Helper to create geometry using a kernel and return the result.
 *
 * @param input - Input containing kernel definition, files, main file, and optional parameters/options
 * @param input.definition - The kernel definition to use
 * @param input.files - Record of relative paths to file contents
 * @param input.mainFile - The main file to create geometry from
 * @param input.parameters - Optional parameters to pass to the geometry creation
 * @param input.options - Optional worker options
 * @returns Promise resolving to the geometry creation result
 */
export async function createTestGeometry(input: {
  definition: KernelDefinition;
  files: Record<string, string>;
  mainFile: string;
  parameters?: Record<string, unknown>;
  options?: CreateTestWorkerOptions;
}): Promise<CreateGeometryResult> {
  const worker = await createTestWorker(input.definition, input.files, input.options);
  const geometryFile = createGeometryFile(input.mainFile);

  let parameters = input.parameters ?? {};

  if (!input.parameters) {
    const parametersResult = await worker.getParameters(geometryFile);
    if (parametersResult.success) {
      const extracted = parametersResult.data as { defaultParameters?: Record<string, unknown> };
      if (extracted.defaultParameters) {
        parameters = deepmerge(extracted.defaultParameters, parameters);
      }
    }
  }

  return worker.createGeometry({ file: geometryFile, parameters });
}

/**
 * Create a mock KernelRuntime for kernel method testing.
 * Uses the same filesystem and logger patterns as middleware runtime.
 */
export function createMockKernelRuntime(options?: { filesystemOverrides?: MockFilesystemOptions }): KernelRuntime & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFilesystem;
} {
  const noopBundler: KernelRuntime['bundler'] = {
    async bundle(): Promise<{ code: string; issues: never[]; success: false; dependencies: never[] }> {
      return { code: '', issues: [], success: false, dependencies: [] };
    },
    async resolveDependencies(): Promise<string[]> {
      return [];
    },
    registerModule(): void {
      // No-op for tests
    },
  };

  function noopSpanEnd(): void {
    // Span end no-op for tests
  }

  return {
    logger: createMockLogger(),
    filesystem: createMockFilesystem(options?.filesystemOverrides),
    fileContentCache: new Map(),
    bundler: noopBundler,
    async execute(): Promise<{ success: false; issues: Array<{ message: string; severity: 'error' }> }> {
      return { success: false, issues: [{ message: 'Mock executor', severity: 'error' as const }] };
    },
    tracer: { startSpan: () => ({ end: noopSpanEnd }) },
  };
}

// =============================================================================
// Mock KernelWorker for Testing
// =============================================================================

/**
 * Options for creating a MockKernelWorker.
 */
export type MockKernelWorkerOptions = {
  /** Middleware array to use (overrides default middleware) */
  middleware: KernelMiddleware[];
  /** Resolved configs parallel to the middleware array (defaults to empty objects) */
  middlewareConfigs?: Array<Record<string, unknown>>;
  /** Per-middleware enabled overrides (defaults to middleware.enabled ?? true) */
  middlewareEnabled?: boolean[];
  /** Result to return from createGeometry */
  computeResult?: CreateGeometryResult;
  /** Result to return from exportGeometry */
  exportResult?: ExportGeometryResult;
  /** Custom onLog handler */
  onLog?: OnWorkerLog;
  /** Mock filesystem for middleware operations */
  filesystem?: KernelFileSystem;
};

/**
 * Mock concrete implementation of KernelWorker for testing.
 * Allows injection of custom middleware to test the onion chain behavior.
 */
export class MockKernelWorker extends KernelWorker {
  protected override readonly name = 'MockKernelWorker';

  private readonly testResolvedMiddleware: ResolvedMiddleware[];
  private readonly mockComputeResult: CreateGeometryResult;
  private readonly mockExportResult: ExportGeometryResult;

  public constructor(options: MockKernelWorkerOptions) {
    super();
    this.testResolvedMiddleware = options.middleware.map((middleware, index) => ({
      middleware,
      options: options.middlewareConfigs?.[index] ?? {},
      url: `mock://${middleware.name}`,
      enabled: options.middlewareEnabled?.[index] ?? middleware.enabled ?? true,
    }));
    this.mockComputeResult =
      options.computeResult ?? createSuccessResult([{ format: 'gltf', content: new Uint8Array([1, 2, 3]) }]);
    this.mockExportResult = options.exportResult ?? {
      success: true,
      data: [{ bytes: new Uint8Array(), name: 'export.gltf', mimeType: 'model/gltf+json' }],
      issues: [],
    };

    // Set up onLog - use provided or no-op (must be done before _logger)
    // @ts-expect-error - Test utility accessing internals
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock implementation
    this.onLog = options.onLog ?? (() => {});

    // Set up the internal _filesystem property directly
    // @ts-expect-error - Test utility accessing internals
    this._filesystem = options.filesystem ?? createMockFilesystem();

    // Set up the internal _logger property directly (uses createLogger which depends on onLog)
    // @ts-expect-error - Test utility accessing internals
    this._logger = this.createLogger();
  }

  /**
   * Helper to run createGeometry with a mock file.
   */
  public async runCreateGeometry(
    filename = 'test.kcl',
    parameters: Record<string, unknown> = {},
  ): Promise<HashedGeometryResult> {
    const mockFile: GeometryFile = { filename, path: filename };
    return this.createGeometry({ file: mockFile, parameters });
  }

  /**
   * Helper to run exportGeometry with a mock export format.
   */
  public async runExportGeometry(fileType = 'gltf'): Promise<ExportGeometryResult> {
    return this.exportGeometry(fileType as ExportFormat);
  }

  /**
   * Override getMiddleware to return test middleware with resolved configs.
   */
  public override getMiddleware(): ResolvedMiddleware[] {
    return this.testResolvedMiddleware;
  }

  // Stub implementations of abstract methods
  protected override async onCanHandle(_input: CanHandleInput, _runtime: KernelRuntime): Promise<boolean> {
    return true;
  }

  protected override async onGetParameters(
    _input: GetParametersInput,
    _runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    return {
      success: true,
      data: { defaultParameters: {}, jsonSchema: { type: 'object', properties: {} } },
      issues: [],
    };
  }

  protected override async onCreateGeometry(
    _input: CreateGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    return this.mockComputeResult;
  }

  protected override async onExportGeometry(
    _input: ExportGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<ExportGeometryResult> {
    return this.mockExportResult;
  }

  protected override async onGetDependencies(
    { filePath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<string[]> {
    return [filePath];
  }
}
