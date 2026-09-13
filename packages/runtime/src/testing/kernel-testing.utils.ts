/* oxlint-disable no-await-in-loop -- sequential filesystem operations in test helpers are intentional */
/**
 * Kernel Middleware Testing Utilities
 *
 * Shared helper functions for testing kernel middleware.
 */

import deepmerge from 'deepmerge';
import type { PartialDeep } from 'type-fest';
import type {
  FileExtension,
  GeometryResponse,
  GeometryFile,
  OnWorkerLog,
  FileStat,
  FileStatEntry,
} from '@taucad/types';
import { parentDirectory, joinPath } from '@taucad/utils/path';
import type { Mock } from 'vitest';
import { expect, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
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
} from '#types/runtime.types.js';
import type { TelemetryEntry } from '#types/runtime-protocol.types.js';
import type {
  RuntimeLogger,
  KernelRuntime,
  AnyKernelDefinition,
  KernelFileSystem,
  GetDependenciesInput,
  GetDependenciesResult,
  GetParametersInput,
  CreateGeometryInput,
  ExportGeometryInput,
  RuntimeFileSystemBase,
} from '#types/runtime-kernel.types.js';
import type { BundlerDefinition } from '#types/runtime-bundler.types.js';
import type { RuntimeClient } from '#client/runtime-client.js';
import type {
  KernelMiddlewareRuntime,
  MiddlewareState,
  CreateGeometryHandler,
  GetParametersHandler,
} from '#types/runtime-middleware.types.js';
import type { Dependency } from '#types/runtime-dependency.types.js';
import type { KernelMiddleware } from '#middleware/runtime-middleware.js';
import { z } from 'zod';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import type { ResolvedMiddleware } from '#framework/kernel-worker.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import { createBridgePort } from '#transport/_internal/runtime-filesystem-bridge.js';
import { _fromMemoryFsHandle as fromMemoryFS } from '#transport/_internal/from-memory-fs-handle.js';

let _testFileSystemHandle: ReturnType<typeof fromMemoryFS> | undefined;
let _testFileSystemBase: RuntimeFileSystemBase | undefined;

// =============================================================================
// Test Filesystem Utilities
// =============================================================================

/**
 * Internal helper: materialise (and cache) the underlying
 * `RuntimeFileSystemBase` from the cached `RuntimeFileSystemHandle`.
 *
 * Under the v6 spec/instance contract (see
 * `docs/research/runtime-filesystem-spec-instance-harmonisation.md`)
 * the inline handle is a per-binding factory — every `handle.create()`
 * mints a fresh base. The test utility intentionally caches one
 * materialised base so consecutive `getTestFileSystem()` calls return
 * the same store; `seedTestFileSystem` / `clearTestFileSystem` reset
 * both the spec and the cached base together.
 *
 * @internal
 *
 * @returns The shared in-memory test filesystem implementation.
 */
function unwrapTestFs(): RuntimeFileSystemBase {
  _testFileSystemHandle ??= fromMemoryFS();
  if (_testFileSystemHandle.kind !== 'inline') {
    throw new Error('Internal invariant: fromMemoryFS() must return the inline-kind handle.');
  }
  _testFileSystemBase ??= _testFileSystemHandle.create();
  return _testFileSystemBase;
}

/**
 * Get the shared test filesystem instance for direct manipulation. Tests
 * call `await getTestFileSystem().writeFile(...)` to seed fixtures or
 * mutate state between assertions; the returned value is the bare
 * `RuntimeFileSystemBase` contract, not the runtime-API handle.
 *
 * Use {@link getTestFileSystemHandle} when binding the same in-memory FS
 * to a runtime client (e.g., `client.connect({ fileSystem: getTestFileSystemHandle() })`)
 * so both call sites share one storage instance.
 *
 * @returns The shared in-memory test filesystem implementation.
 * @public
 */
export function getTestFileSystem(): RuntimeFileSystemBase {
  return unwrapTestFs();
}

/**
 * Get the shared test filesystem as the discriminated `RuntimeFileSystemHandle`
 * handle accepted by `client.connect({ fileSystem })`. Backed by the same
 * cached instance as {@link getTestFileSystem} so direct mutation and
 * runtime-bound access stay coherent.
 *
 * @returns The shared in-memory test filesystem handle.
 * @public
 */
export function getTestFileSystemHandle(): ReturnType<typeof fromMemoryFS> {
  // Ensure the handle exists (sets `_testFileSystemHandle` as a side effect).
  unwrapTestFs();
  return _testFileSystemHandle!;
}

/**
 * Seed the test filesystem with files.
 * Resets to a fresh in-memory backend first (to prevent stale files from
 * prior tests interfering with import resolution), then seeds with provided files.
 *
 * @param files - Record of absolute paths to file contents
 * @public
 */
export async function seedTestFileSystem(files: Record<string, string | Uint8Array<ArrayBuffer>>): Promise<void> {
  _testFileSystemHandle = fromMemoryFS();
  _testFileSystemBase = undefined;
  const fs = unwrapTestFs();

  for (const [path, content] of Object.entries(files)) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const parentDirectoryPath = parentDirectory(normalizedPath);

    if (parentDirectoryPath && parentDirectoryPath !== '/') {
      await fs.mkdir(parentDirectoryPath, { recursive: true });
    }

    await fs.writeFile(normalizedPath, content);
  }
}

/**
 * Clear the test filesystem by resetting to a fresh in-memory backend.
 * @public
 */
export async function clearTestFileSystem(): Promise<void> {
  _testFileSystemHandle = fromMemoryFS();
  _testFileSystemBase = undefined;
}

// =============================================================================
// Worker Testing Utilities
// =============================================================================

/**
 * Options for initializing a runtime worker in tests.
 * @public
 */
export type InitializeWorkerOptions = {
  /** Custom log handler */
  onLog?: OnWorkerLog;
  /** Worker-specific options passed to initialize (e.g., ReplicadWorker: { withBrepEdges: true }) */
  workerOptions?: Record<string, unknown>;
  /** Middleware configuration (defaults to empty array for tests that bypass dynamic loading) */
  middlewareEntries?: MiddlewareRegistrations;
  /** Telemetry callback -- receives batched performance entries from the worker */
  onTelemetry?: (entries: TelemetryEntry[]) => void;
};

/**
 * Initialize a runtime worker using the production code path.
 * Uses MessageChannel to connect to the real fileManager, ensuring tests
 * exercise the same code path as production.
 *
 * IMPORTANT: Call seedTestFileSystem() before this to configure InMemory backend.
 * The first call to configure the filesystem "wins" - tests configure InMemory,
 * so the fileManager's ensureFileSystemConfigured('indexeddb') just waits.
 *
 * @param worker - The runtime worker instance to initialize
 * @param options - Optional configuration (onLog, workerOptions for kernel-specific settings like withBrepEdges)
 * @returns Promise resolving to the initialized worker
 * @public
 */
export async function initializeWorkerForTesting<T extends KernelWorker>(
  worker: T,
  options?: InitializeWorkerOptions,
): Promise<T> {
  if (options?.onTelemetry) {
    worker.setTelemetrySend(options.onTelemetry);
  }

  const { port } = createBridgePort(getTestFileSystem());

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

type MockLogger = {
  [Key in keyof RuntimeLogger]: Mock<RuntimeLogger[Key]>;
};

/**
 * Creates a mock logger for kernel and middleware testing.
 *
 * @returns A logger with vitest mock functions for all log levels
 * @public
 */
export function createMockLogger(): RuntimeLogger & MockLogger {
  const logger: MockLogger = {
    log: vi.fn<RuntimeLogger['log']>(),
    debug: vi.fn<RuntimeLogger['debug']>(),
    trace: vi.fn<RuntimeLogger['trace']>(),
    warn: vi.fn<RuntimeLogger['warn']>(),
    error: vi.fn<RuntimeLogger['error']>(),
    custom: vi.fn<RuntimeLogger['custom']>(),
  };

  return logger;
}

/**
 * Options for creating a mock filesystem with vitest mocks.
 * @public
 */
export type MockFileSystemOptions = {
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
 * @public
 */
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

/**
 * A mock KernelFileSystem with vitest mock functions for verification.
 * Use the `mocks` property to access mock functions for test setup.
 * @public
 */
export type MockFileSystem = KernelFileSystem & {
  /** Access underlying mock functions for test assertions and setup */
  mocks: MockFileSystemMocks;
};

/**
 * Create a mock filesystem for middleware testing.
 * Returns a filesystem with vitest mock functions for assertion.
 *
 * @param options - Optional overrides for default mock behavior
 * @returns A mock filesystem with vitest mock functions
 *
 * @public
 *
 * @example <caption>Mocking filesystem in tests</caption>
 * ```typescript
 * import { createMockFileSystem } from '@taucad/runtime/testing';
 *
 * const filesystem = createMockFileSystem();
 * filesystem.mocks.readFile.mockResolvedValue('file content');
 * ```
 */
export function createMockFileSystem(options?: MockFileSystemOptions): MockFileSystem {
  const existsFunction = vi.fn().mockImplementation(async (path: string) => {
    if (typeof options?.existsResult === 'function') {
      return options.existsResult(path);
    }

    return options?.existsResult ?? false;
  });

  const readFileFunction = vi.fn().mockImplementation(async (path: string) => {
    if (typeof options?.readFileResult === 'function') {
      return options.readFileResult(path);
    }

    return options?.readFileResult ?? new Uint8Array();
  });

  const writeFileFunction = vi
    .fn<(path: string, data: Uint8Array<ArrayBuffer> | string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const mkdirFunction = vi
    .fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const unlinkFunction = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);
  const readdirFunction = vi.fn<(path: string) => Promise<string[]>>().mockResolvedValue([]);
  const rmdirFunction = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);
  const renameFunction = vi.fn<(oldPath: string, newPath: string) => Promise<void>>().mockResolvedValue(undefined);
  const statFunction = vi.fn<(path: string) => Promise<FileStat>>().mockRejectedValue(new Error('Not found'));
  const lstatFunction = vi.fn<(path: string) => Promise<FileStat>>().mockRejectedValue(new Error('Not found'));
  const readFilesFunction = vi
    .fn<(paths: string[]) => Promise<Record<string, Uint8Array<ArrayBuffer>>>>()
    .mockResolvedValue({});
  const readdirContentsFunction = vi
    .fn<(directoryPath: string) => Promise<Record<string, Uint8Array<ArrayBuffer>>>>()
    .mockResolvedValue({});
  const readdirStatFunction = vi.fn<(directoryPath: string) => Promise<FileStatEntry[]>>().mockResolvedValue([]);
  const ensureDirectoryFunction = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);

  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- mock delegate; readFileFunction is untyped to support both string and Uint8Array overloads
    return readFileFunction(path, encoding);
  }

  // Mocks object for test assertions
  const mocks: MockFileSystemMocks = {
    readFile: readFileFunction,
    exists: existsFunction,
    readdir: readdirFunction,
    writeFile: writeFileFunction,
    mkdir: mkdirFunction,
    unlink: unlinkFunction,
    rmdir: rmdirFunction,
    rename: renameFunction,
    stat: statFunction,
    lstat: lstatFunction,
    readFiles: readFilesFunction,
    readdirContents: readdirContentsFunction,
    readdirStat: readdirStatFunction,
    ensureDir: ensureDirectoryFunction,
  };

  return {
    id: 'runtime:mock-fs',
    capabilities: { persistent: false, writable: true, quotaBased: false, caseSensitive: true },
    dispose() {
      /* The mock filesystem holds no resources beyond GC-managed maps. */
    },
    readFile,
    exists: async (path: string): Promise<boolean> => existsFunction(path) as boolean,
    readdir: async (path: string) => readdirFunction(path),
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string) => writeFileFunction(path, data),
    mkdir: async (path: string, options_?: { recursive?: boolean }) => mkdirFunction(path, options_),
    unlink: async (path: string) => unlinkFunction(path),
    rmdir: async (path: string) => rmdirFunction(path),
    rename: async (oldPath: string, newPath: string) => renameFunction(oldPath, newPath),
    stat: async (path: string) => statFunction(path),
    lstat: async (path: string) => lstatFunction(path),
    readFiles: async (paths: string[]) => readFilesFunction(paths),
    readdirContents: async (directoryPath: string) => readdirContentsFunction(directoryPath),
    readdirStat: async (directoryPath: string) => readdirStatFunction(directoryPath),
    ensureDir: async (path: string) => ensureDirectoryFunction(path),
    mocks,
  };
}

/**
 * Creates a mock state for middleware testing with deep-merge update semantics.
 *
 * @template T - The state shape
 * @returns A middleware state with a vitest mock `update` function
 * @public
 */
export function createMockState<T extends Record<string, unknown>>(): MiddlewareState<T> & {
  update: ReturnType<typeof vi.fn>;
} {
  // Start with empty object - we use a wrapper object to allow reassignment
  // while still having the getter work correctly
  const stateContainer: { value: PartialDeep<T> } = {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test utility requires flexible typing
    value: {} as PartialDeep<T>,
  };

  const updateFunction = vi.fn().mockImplementation((partial: Partial<T>) => {
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
    update: updateFunction,
  };
}

/**
 * Create a mock middleware runtime for testing.
 * Combines logger, filesystem, state, and dependencies.
 */
/** Default mock dependency hash for testing */
const defaultMockDependencyHash = 'a'.repeat(64);

/**
 * Creates a mock KernelMiddlewareRuntime for unit testing middleware hooks.
 *
 * @template State - The state shape (defaults to empty object)
 * @template Options - The options shape (defaults to empty object)
 * @param mockOptions - optional overrides for filesystem, dependencies, and options
 * @returns A fully mocked middleware runtime
 * @public
 */
export function createMockRuntime<
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  State extends Record<string, unknown> = {},
  // oxlint-disable-next-line @typescript-eslint/no-empty-object-type -- Default represents z.infer<z.object({})>
  Options extends Record<string, unknown> = {},
>(mockOptions?: {
  filesystemOverrides?: MockFileSystemOptions;
  dependencies?: readonly Dependency[];
  dependencyHash?: string;
  options?: Options;
}): KernelMiddlewareRuntime<State, Options> & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFileSystem;
  state: ReturnType<typeof createMockState<State>>;
} {
  return {
    logger: createMockLogger(),
    filesystem: createMockFileSystem(mockOptions?.filesystemOverrides),
    state: createMockState<State>(),

    options: (mockOptions?.options ?? {}) as Options,
    dependencies: mockOptions?.dependencies ?? [],
    dependencyHash: mockOptions?.dependencyHash ?? defaultMockDependencyHash,
    registerWatchPath: vi.fn(),
  };
}

/**
 * Creates a successful CreateGeometryResult for testing middleware.
 *
 * @param geometries - The geometry responses to include
 * @returns A successful result wrapping the provided geometries
 * @public
 */
export function createSuccessResult(geometries: GeometryResponse[]): CreateGeometryResult {
  return {
    success: true,
    data: geometries,
    issues: [],
  };
}

/**
 * Creates a successful result containing a single GLTF geometry.
 *
 * @param content - The GLB binary content
 * @returns A successful result with one GLTF geometry
 * @public
 */
export function createGltfSuccessResult(content: Uint8Array<ArrayBuffer>): CreateGeometryResult {
  return createSuccessResult([{ format: 'gltf', content }]);
}

/**
 * Creates a successful result containing a single GLTF geometry and diagnostic issues.
 *
 * @param content - The GLB binary content
 * @param issues - The diagnostic issues to attach
 * @returns A successful result with one GLTF geometry and issues
 * @public
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
 * Creates a failed CreateGeometryResult for testing error paths.
 *
 * @param issues - Optional issues (defaults to a single generic error)
 * @returns A failed result with the provided issues
 * @public
 */
export function createErrorResult(issues?: KernelIssue[]): CreateGeometryResult {
  return {
    success: false,
    issues: issues ?? [
      {
        message: 'Test error',
        code: 'RUNTIME',
        severity: 'error',
        type: 'kernel',
      },
    ],
  };
}

/**
 * Creates an empty successful result with no geometries.
 *
 * @returns A successful result with an empty geometry array
 * @public
 */
export function createEmptySuccessResult(): CreateGeometryResult {
  return createSuccessResult([]);
}

// =============================================================================
// Type-Narrowing Assertion Helpers
// =============================================================================

/**
 * Asserts that a kernel result is successful, narrowing to KernelSuccessResult<T>.
 *
 * @param result - The kernel result to assert on
 * @param context - Optional label for error messages
 * @public
 */
export function assertSuccess<T>(result: KernelResult<T>, context?: string): asserts result is KernelSuccessResult<T> {
  if (!result.success) {
    const prefix = context ? `[${context}] ` : '';
    const issuesSummary = result.issues.map((issue) => `  [${issue.severity}] ${issue.message}`).join('\n');
    throw new Error(`${prefix}Expected success but got failure:\n${issuesSummary}`);
  }

  expect(result.success).toBe(true);
}

/**
 * Asserts that a kernel result is a failure, narrowing to KernelErrorResult.
 *
 * @param result - The kernel result to assert on
 * @param context - Optional label for error messages
 * @public
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
 *
 * @param overrides - optional partial input to override default values
 * @returns a mock CreateGeometryInput with sensible defaults
 * @public
 */
export function createMockInput(overrides?: Partial<CreateGeometryInput>): CreateGeometryInput {
  return {
    filePath: '/projects/test-build/test.kcl',
    basePath: '/projects/test-build',
    parameters: {},
    options: {},
    ...overrides,
  };
}

/**
 * Creates a GeometryFile for use with worker methods (getParameters, createGeometry).
 *
 * @param filename - The file name (e.g. `'test.ts'`)
 * @param basePath - The project base path (defaults to `/projects/test`)
 * @returns A GeometryFile pointing to the given filename and path
 * @public
 */
export function createGeometryFile(filename: string, basePath = '/projects/test'): GeometryFile {
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
 * @public
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
  onTelemetry?: (entries: TelemetryEntry[]) => void;
};

/**
 * Infer the file extensions a kernel handles from its definition.
 * Uses the kernel name as a heuristic when extensions aren't explicitly provided.
 *
 * @param definition - the kernel definition to infer extensions from
 * @returns array of file extensions the kernel handles
 */
function inferExtensions(definition: AnyKernelDefinition): string[] {
  const name = definition.name.toLowerCase();

  if (
    name.includes('replicad') ||
    name.includes('manifold') ||
    name.includes('jscad') ||
    name.includes('opencascade')
  ) {
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
 *
 * @param _definition - the kernel definition (unused — detection is handled at the plugin layer)
 * @returns undefined — detection is always handled at the plugin layer
 */
function inferDetectImport(_definition: AnyKernelDefinition): string | undefined {
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
 * @public
 */
export async function createTestWorker(
  definition: AnyKernelDefinition,
  files: Record<string, string>,
  options?: CreateTestWorkerOptions,
): Promise<KernelRuntimeWorker> {
  const basePath = '/projects/test';

  const absoluteFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    absoluteFiles[joinPath(basePath, path)] = content;
  }

  await seedTestFileSystem(absoluteFiles);

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
  const needsBundler =
    !options?.skipBundler && extensions.some((extension) => ['ts', 'js', 'tsx', 'jsx'].includes(extension));
  if (needsBundler) {
    const bundlerDefinition =
      options?.bundlerDefinition ??
      (
        (await import('#bundler/esbuild.bundler.js')) as {
          default: BundlerDefinition;
        }
      ).default;
    const dummyConfig = {
      bundlerModuleUrl: 'test://esbuild',
      extensions: ['ts', 'js', 'tsx', 'jsx'],
    };
    await worker.ensureLoadedBundler(dummyConfig, bundlerDefinition);
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
 * @public
 */
export async function getTestParameters(
  definition: AnyKernelDefinition,
  files: Record<string, string>,
  mainFile: string,
): Promise<{
  jsonSchema: unknown;
  defaultParameters: Record<string, unknown>;
}> {
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
 * @public
 */
export async function createTestGeometry(input: {
  definition: AnyKernelDefinition;
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
      const extracted = parametersResult.data as {
        defaultParameters?: Record<string, unknown>;
      };
      if (extracted.defaultParameters) {
        parameters = deepmerge(extracted.defaultParameters, parameters);
      }
    }
  }

  return worker.createGeometry({ file: geometryFile, parameters });
}

/**
 * Creates a mock KernelRuntime for kernel method testing.
 *
 * @param options - optional filesystem overrides for the mock runtime
 * @returns A mocked runtime with logger, filesystem, and no-op bundler/executor
 * @public
 */
export function createMockKernelRuntime(options?: { filesystemOverrides?: MockFileSystemOptions }): KernelRuntime & {
  logger: ReturnType<typeof createMockLogger>;
  filesystem: MockFileSystem;
} {
  const noopBundler: KernelRuntime['bundler'] = {
    async bundle(): Promise<{
      code: string;
      issues: never[];
      success: false;
      dependencies: never[];
      unresolvedPaths: never[];
    }> {
      return { code: '', issues: [], success: false, dependencies: [], unresolvedPaths: [] };
    },
    async resolveDependencies(): Promise<GetDependenciesResult> {
      return { resolved: [], unresolved: [] };
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
    filesystem: createMockFileSystem(options?.filesystemOverrides),
    fileContentCache: new Map(),
    bundler: noopBundler,
    async execute(): Promise<{
      success: false;
      issues: KernelIssue[];
    }> {
      return {
        success: false,
        issues: [{ message: 'Mock executor', code: 'RUNTIME', severity: 'error' }],
      };
    },
    tracer: { startSpan: () => ({ end: noopSpanEnd }) },
  };
}

// =============================================================================
// Mock RuntimeClient for Testing
// =============================================================================

const noop = () => {
  /* No-op */
};

/**
 * Creates a mock RuntimeClient for integration tests that exercise state
 * machines or other consumers without spinning up a real worker.
 *
 * All methods are vitest mocks with sensible defaults (connect resolves,
 * export returns a successful stub, on returns an unsubscribe no-op, etc.).
 *
 * @returns A fully typed RuntimeClient backed by vitest mocks
 *
 * @public
 *
 * @example <caption>Stubbing a runtime client</caption>
 * ```typescript
 * import { createMockRuntimeClient } from '@taucad/runtime/testing';
 *
 * const client = createMockRuntimeClient();
 * ```
 */
export function createMockRuntimeClient(): RuntimeClient {
  return mock<RuntimeClient>({
    lifecycleState: 'connected',
    activeKernelId: undefined,
    capabilities: undefined,
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue({ superseded: true }),
    updateParameters: vi.fn().mockResolvedValue({ superseded: true }),
    setOptions: vi.fn().mockResolvedValue({ superseded: true }),
    export: vi.fn().mockResolvedValue({
      success: true,
      data: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'model/stl' },
      issues: [],
    }),
    terminate: vi.fn(),
    on: vi.fn<(event: string, handler: (...args: never[]) => void) => () => void>().mockReturnValue(noop),
  });
}

// =============================================================================
// Mock KernelWorker for Testing
// =============================================================================

/**
 * Options for creating a MockKernelWorker.
 * @public
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
  /** Per-format Zod schemas for export validation. Keys define supported formats (defaults to glb+gltf with empty schemas). */
  exportZodSchemas?: Partial<Record<FileExtension, z.ZodType>>;
  /** Zod schema for render option validation. When set, the mock kernel's render options are validated against it. */
  renderZodSchema?: z.ZodType;
  /** Pre-set the nativeHandle on construction (simulates prior createGeometry) */
  nativeHandle?: unknown;
};

/**
 * Mock concrete implementation of KernelWorker for testing.
 * Allows injection of custom middleware to test the onion chain behavior.
 * @public
 */
export class MockKernelWorker extends KernelWorker {
  /** Expose onCreateGeometry call count for test assertions */
  public createGeometryCalls = 0;

  public readonly exportGeometrySpy = vi.fn<(input: ExportGeometryInput, runtime: KernelRuntime) => void>();

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
      data: [
        {
          bytes: new Uint8Array(),
          name: 'export.gltf',
          mimeType: 'model/gltf+json',
        },
      ],
      issues: [],
    };

    // Set up onLog - use provided or no-op (must be done before _logger)
    // @ts-expect-error - Test utility accessing internals
    // oxlint-disable-next-line @typescript-eslint/no-empty-function -- Mock implementation
    this.onLog = options.onLog ?? (() => {});

    // Set up the internal _filesystem property directly
    // @ts-expect-error - Test utility accessing internals
    this._filesystem = options.filesystem ?? createMockFileSystem();

    // Set up the internal _logger property directly (uses createLogger which depends on onLog)
    // @ts-expect-error - Test utility accessing internals
    this._logger = this.createLogger();

    const zodSchemas = options.exportZodSchemas ?? { glb: z.object({}), gltf: z.object({}) };
    this.kernelExportZodSchemasMap.set('mock-kernel', zodSchemas);

    if (options.renderZodSchema) {
      this.kernelRenderZodSchemaMap.set('mock-kernel', options.renderZodSchema);
    }

    if (options.nativeHandle !== undefined) {
      this.nativeHandle = options.nativeHandle;
    }
  }

  /**
   * Helper to run createGeometry with a mock file.
   *
   * @param filename - the filename to use for the mock geometry file
   * @param parameters - the parameters to pass to createGeometry
   * @returns the hashed geometry result
   */
  public async runCreateGeometry(
    filename = 'test.kcl',
    parameters: Record<string, unknown> = {},
  ): Promise<HashedGeometryResult> {
    const mockFile = createGeometryFile(filename);
    return this.createGeometry({ file: mockFile, parameters });
  }

  /**
   * Helper to run exportGeometry with a mock export format.
   *
   * @param format - the export format to use
   * @param options - export options to forward to the kernel
   * @returns the export geometry result
   */
  public async runExportGeometry(
    format: FileExtension = 'gltf',
    options?: Record<string, unknown>,
  ): Promise<ExportGeometryResult> {
    return this.exportGeometry(format, options);
  }

  /**
   * Override getMiddleware to return test middleware with resolved configs.
   *
   * @returns the test middleware entries configured on this stub
   */
  public override getMiddleware(): ResolvedMiddleware[] {
    return this.testResolvedMiddleware;
  }

  // Stub implementations of abstract methods
  protected override async onGetParameters(
    _input: GetParametersInput,
    _runtime: KernelRuntime,
  ): Promise<GetParametersResult> {
    return {
      success: true,
      data: {
        defaultParameters: {},
        jsonSchema: { type: 'object', properties: {} },
      },
      issues: [],
    };
  }

  protected override async onCreateGeometry(
    _input: CreateGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    this.createGeometryCalls++;
    return this.mockComputeResult;
  }

  protected override async onExportGeometry(
    input: ExportGeometryInput,
    _runtime: KernelRuntime,
  ): Promise<ExportGeometryResult> {
    this.exportGeometrySpy(input, _runtime);
    return this.mockExportResult;
  }

  protected override async onGetDependencies(
    { filePath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return { resolved: [filePath], unresolved: [] };
  }

  protected override getActiveKernelId(): string | undefined {
    return 'mock-kernel';
  }
}

// =============================================================================
// Mock Dependencies
// =============================================================================

/**
 * Creates a standard set of mock dependencies for middleware testing.
 *
 * @param overrides - Additional dependency entries to append to the defaults
 * @returns A readonly array of dependencies
 * @public
 */
export function createMockDependencies(overrides?: Dependency[]): readonly Dependency[] {
  const defaults: Dependency[] = [
    { type: 'file', path: 'test.kcl', contentHash: 'abc123' },
    {
      type: 'middleware',
      name: 'TestMiddleware',
      version: '1',
      index: 0,
      options: {},
    },
    { type: 'framework', name: 'tau', version: '0.0.1' },
  ];

  if (overrides) {
    return [...defaults, ...overrides];
  }

  return defaults;
}

// =============================================================================
// Mock Middleware Handlers
// =============================================================================

/**
 * Creates a mock createGeometry handler for middleware testing.
 *
 * @param result - The result to resolve with (defaults to a GLTF success result)
 * @returns A vitest mock function typed as CreateGeometryHandler
 * @public
 */
export function createMockCreateGeometryHandler(result?: CreateGeometryResult): CreateGeometryHandler {
  return vi.fn().mockResolvedValue(result ?? createGltfSuccessResult(new Uint8Array([1, 2, 3])));
}

/**
 * Creates a mock getParameters handler for middleware testing.
 *
 * @param result - The result to resolve with (defaults to a success with empty params)
 * @returns A vitest mock function typed as GetParametersHandler
 * @public
 */
export function createMockGetParametersHandler(result?: GetParametersResult): GetParametersHandler {
  return vi.fn().mockResolvedValue(
    result ?? {
      success: true,
      data: {
        defaultParameters: {},
        jsonSchema: { type: 'object', properties: {} },
      },
      issues: [],
    },
  );
}

// =============================================================================
// Mock HTTP Response (Bundler Tests)
// =============================================================================

/**
 * Creates a mock HTTP Response for fetch-based tests (CDN, module manager).
 *
 * @param body - The response body text
 * @param headers - Optional response headers
 * @returns A mock Response object with vitest mock functions
 * @public
 */
export function createMockResponse(body: string, headers?: Record<string, string>): Response {
  const headerMap = new Headers(headers);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: headerMap,
    text: vi.fn<() => Promise<string>>().mockResolvedValue(body),
    json: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
    clone: vi.fn<() => Response>(),
    body: undefined,
    bodyUsed: false,
    arrayBuffer: vi.fn<() => Promise<ArrayBuffer>>(),
    blob: vi.fn<() => Promise<Blob>>(),
    formData: vi.fn<() => Promise<FormData>>(),
    bytes: vi.fn<() => Promise<Uint8Array<ArrayBuffer>>>(),
    redirected: false,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ResponseType union narrowing
    type: 'basic' as ResponseType,
    url: '',
  } as unknown as Response;
}
