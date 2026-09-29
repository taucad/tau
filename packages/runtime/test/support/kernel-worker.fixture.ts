/* oxlint-disable no-await-in-loop -- fixture seeding is intentionally sequential */
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileExtension, FileStat, FileStatEntry, GeometryResponse, OnWorkerLog } from '@taucad/types';
import { assertRootedPath } from '@taucad/utils/path';
import { vi } from 'vitest';
import { z } from 'zod';
import type { NativeBuildInput, OperationOwner } from '#framework/render-artifact.js';
import type { ResolvedMiddleware } from '#framework/kernel-worker.js';
import { KernelWorker } from '#framework/kernel-worker.js';
import type { MiddlewarePluginFactory } from '#middleware/runtime-middleware.js';
import type { MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { runtimePluginDefinitionSymbol } from '#plugins/plugin-runtime-definition.js';
import { _fromMemoryFsHandle as fromMemoryFs } from '#transport/_internal/from-memory-fs-handle.js';
import type {
  ExportGeometryInput,
  GetDependenciesInput,
  GetParametersInput,
  KernelFileSystem,
  KernelRuntime,
  RuntimeFileSystemBase,
} from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { EvaluateResult, KernelOffers, RenderResult } from '#types/runtime-kernel-v2.types.js';
import type { KernelMiddlewareV2, MiddlewareContent, RenderRequest } from '#types/runtime-middleware-v2.types.js';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  GetParameterDeclarationsResult,
  HashedGeometryResult,
  KernelIssue,
} from '#types/runtime.types.js';

let testFileSystemHandle: ReturnType<typeof fromMemoryFs> | undefined;
let testFileSystemBase: RuntimeFileSystemBase | undefined;

const materializeTestFileSystem = (): RuntimeFileSystemBase => {
  testFileSystemHandle ??= fromMemoryFs();
  if (testFileSystemHandle.kind !== 'inline') {
    throw new Error('fromMemoryFs() must return an inline filesystem in tests.');
  }
  testFileSystemBase ??= testFileSystemHandle.create();
  return testFileSystemBase;
};

/** Returns the runtime-local test filesystem. */
export const getTestFileSystem = (): RuntimeFileSystemBase => materializeTestFileSystem();

/** Replaces and seeds the runtime-local test filesystem. */
export const seedTestFileSystem = async (files: Record<string, string | Uint8Array<ArrayBuffer>>): Promise<void> => {
  testFileSystemHandle = fromMemoryFs();
  testFileSystemBase = undefined;
  const fileSystem = materializeTestFileSystem();
  for (const [path, content] of Object.entries(files)) {
    const normalizedPath = assertRootedPath(path);
    const separator = normalizedPath.lastIndexOf('/');
    const directory = separator === -1 ? '' : normalizedPath.slice(0, separator);
    if (directory) {
      await fileSystem.mkdir(directory, { recursive: true });
    }
    await fileSystem.writeFile(normalizedPath, content);
  }
};

/** Initializes a concrete runtime worker through the production bridge path. */
export const initializeWorkerForTesting = async <T extends KernelWorker>(
  worker: T,
  options?: {
    readonly onLog?: OnWorkerLog;
    readonly workerOptions?: Record<string, unknown>;
    readonly config?: unknown;
    readonly onTelemetry?: Parameters<T['setTelemetrySend']>[0];
    /** Serve the store without its watch channel, for the kernel's watcherless freshness path. */
    readonly watchable?: boolean;
  },
): Promise<T> => {
  if (options?.onTelemetry) {
    worker.setTelemetrySend(options.onTelemetry);
  }
  const base = getTestFileSystem();
  const { port } = createFileSystemBridgePort(options?.watchable === false ? { ...base, watch: undefined } : base);
  await worker.initialize({
    callbacks: { onLog: options?.onLog ?? (() => undefined) },
    transferables: { fileSystemPort: port },
    options: options?.workerOptions ?? {},
    config: options?.config,
  });
  return worker;
};

type MockFileSystemOptions = {
  readonly existsResult?: boolean | ((path: string) => boolean | Promise<boolean>);
  readonly readFileResult?:
    | string
    | Uint8Array<ArrayBuffer>
    | ((path: string) => string | Uint8Array<ArrayBuffer> | Promise<string | Uint8Array<ArrayBuffer>>);
};

type MockFileSystem = KernelFileSystem & {
  readonly mocks: {
    readonly readFile: ReturnType<typeof vi.fn>;
    readonly exists: ReturnType<typeof vi.fn>;
    readonly readdir: ReturnType<typeof vi.fn>;
    readonly writeFile: ReturnType<typeof vi.fn>;
    readonly mkdir: ReturnType<typeof vi.fn>;
    readonly unlink: ReturnType<typeof vi.fn>;
    readonly rmdir: ReturnType<typeof vi.fn>;
    readonly rename: ReturnType<typeof vi.fn>;
    readonly stat: ReturnType<typeof vi.fn>;
    readonly lstat: ReturnType<typeof vi.fn>;
    readonly readFiles: ReturnType<typeof vi.fn>;
    readonly readdirContents: ReturnType<typeof vi.fn>;
    readonly readdirStat: ReturnType<typeof vi.fn>;
    readonly ensureDir: ReturnType<typeof vi.fn>;
  };
};

/** Creates a runtime-local mocked filesystem for white-box worker tests. */
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
  const readdir = vi.fn(async (_path: string): Promise<string[]> => []);
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
  const readFiles = vi.fn(
    async (paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>> =>
      Object.fromEntries(paths.map((path) => [path, new Uint8Array()])),
  );
  const readdirContents = vi.fn(async (_path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> => ({}));
  const readdirStat = vi.fn(async (_path: string): Promise<FileStatEntry[]> => []);
  const ensureDirectory = vi.fn(async (_path: string): Promise<void> => undefined);

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
    mocks: {
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
    },
  };
};

/** Creates a normalized locator for white-box worker calls. */
export const createGeometryFile = (filename: string): RuntimeFileLocator => {
  const filePath = assertRootedPath(filename);
  const separator = filePath.lastIndexOf('/');
  return {
    filename: filePath.slice(separator + 1),
    path: separator === -1 ? '' : filePath.slice(0, separator),
  };
};

/** Options for the runtime-local white-box worker fixture. */
export type MockKernelWorkerOptions = {
  readonly middleware: Array<
    | KernelMiddlewareV2<z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>, MiddlewareContent | undefined>
    | MiddlewarePlugin
    | MiddlewarePluginFactory<string, unknown>
  >;
  readonly middlewareConfigs?: Array<Record<string, unknown>>;
  readonly middlewareEnabled?: boolean[];
  readonly computeResult?: CreateGeometryResult;
  readonly exportResult?: ExportGeometryResult;
  readonly onLog?: OnWorkerLog;
  readonly filesystem?: KernelFileSystem;
  readonly exportZodSchemas?: Partial<Record<FileExtension, z.ZodType>>;
  readonly renderZodSchema?: z.ZodType;
  readonly nativeHandle?: unknown;
  readonly transcoders?: readonly TranscoderPlugin[];
};

const normalizeTestMiddleware = (
  entry: MockKernelWorkerOptions['middleware'][number],
): KernelMiddlewareV2<z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>, MiddlewareContent | undefined> => {
  const plugin = typeof entry === 'function' ? entry() : entry;
  if ('name' in plugin) {
    return plugin;
  }
  const load = (
    plugin as {
      readonly [runtimePluginDefinitionSymbol]?: () =>
        | KernelMiddlewareV2<z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>, MiddlewareContent | undefined>
        | Promise<
            KernelMiddlewareV2<z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>, MiddlewareContent | undefined>
          >;
    }
  )[runtimePluginDefinitionSymbol];
  if (!load) {
    throw new Error(`Test middleware '${plugin.id}' is missing a worker-owned definition.`);
  }
  const middleware = load();
  if (middleware instanceof Promise) {
    throw new TypeError(`Test middleware '${plugin.id}' resolved asynchronously; use KernelRuntimeWorker instead.`);
  }
  return middleware;
};

const successGeometry = (): CreateGeometryResult => ({
  success: true,
  data: { format: 'gltf', content: new Uint8Array([1, 2, 3]) } satisfies GeometryResponse,
  issues: [],
});

/** Native empty parameter declaration used by runtime framework fixtures. */
export const createParameterDeclaration = (
  defaults: Readonly<Record<string, unknown>> = {},
  schema: Readonly<Record<string, unknown>> = {},
): GetParameterDeclarationsResult => ({
  success: true,
  data: {
    schema: {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:kernel-parameters',
      $uses: ['JSONSchemaUnits'],
      name: 'KernelParameters',
      type: 'object',
      ...schema,
    },
    defaults,
  },
  issues: [],
});

/** White-box KernelWorker fixture retained only for runtime's own framework tests. */
export class MockKernelWorker extends KernelWorker {
  public createGeometryCalls = 0;
  public readonly exportGeometrySpy = vi.fn<(input: ExportGeometryInput, runtime: KernelRuntime) => void>();
  protected override readonly name = 'MockKernelWorker';
  private readonly testResolvedMiddleware: ResolvedMiddleware[];
  private readonly mockComputeResult: CreateGeometryResult;
  private readonly mockExportResult: ExportGeometryResult;
  private readonly handleToCapture: unknown;
  private readonly geometryByHandle = new Map<unknown, GeometryResponse>();

  public constructor(options: MockKernelWorkerOptions) {
    super({ transcoders: options.transcoders ?? [] });
    this.testResolvedMiddleware = options.middleware.map((entry, index) => {
      const middleware = normalizeTestMiddleware(entry);
      return {
        middleware,
        options: options.middlewareConfigs?.[index] ?? {},
        id: middleware.name,
        enabled: options.middlewareEnabled?.[index] ?? middleware.enabled ?? true,
      };
    });
    this.mockComputeResult = options.computeResult ?? successGeometry();
    this.mockExportResult = options.exportResult ?? {
      success: true,
      data: [{ bytes: new Uint8Array(), name: 'export.gltf', mimeType: 'model/gltf+json' }],
      issues: [],
    };
    this.handleToCapture = options.nativeHandle ?? { kind: 'mock-native-handle' };
    // @ts-expect-error -- white-box fixture configures worker internals.
    this.onLog = options.onLog ?? (() => undefined);
    // @ts-expect-error -- white-box fixture configures worker internals.
    this._filesystem = options.filesystem ?? createMockFileSystem();
    // @ts-expect-error -- white-box fixture configures worker internals.
    this._logger = this.createLogger();
    this.kernelExportZodSchemasMap.set(
      'mock-kernel',
      options.exportZodSchemas ?? { glb: z.object({}), gltf: z.object({}) },
    );
    this.kernelRenderContentMap.set('mock-kernel', []);
    if (options.renderZodSchema) {
      this.kernelRenderZodSchemaMap.set('mock-kernel', options.renderZodSchema);
    }
    this.rebuildAndPushCapabilities();
  }

  public async runCreateGeometry(
    filename = 'test.kcl',
    parameters: Record<string, unknown> = {},
    options?: Record<string, unknown>,
  ): Promise<HashedGeometryResult> {
    return this.createGeometry({ file: createGeometryFile(filename), parameters, options });
  }

  public async runExportGeometry(
    format: FileExtension = 'gltf',
    options?: Record<string, unknown>,
  ): Promise<ExportGeometryResult> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    // @ts-expect-error -- fixture checks private render publication state.
    if (!this.currentPublishedRender) {
      await this.runCreateGeometry();
    }
    return this.exportGeometry(format, options);
  }

  public override getMiddleware(): ResolvedMiddleware[] {
    return this.testResolvedMiddleware;
  }

  protected override async onGetParameters(
    _input: GetParametersInput,
    _runtime: KernelRuntime,
  ): Promise<GetParameterDeclarationsResult> {
    return createParameterDeclaration();
  }

  protected override async onCreateGeometry(
    _input: NativeBuildInput,
    _runtime: KernelRuntime,
  ): Promise<CreateGeometryResult> {
    this.createGeometryCalls++;
    this.captureNativeHandle(this.handleToCapture);
    return this.mockComputeResult;
  }

  protected override async onEvaluateForOwner(
    _owner: OperationOwner,
    _input: NativeBuildInput,
    _runtime: KernelRuntime,
  ): Promise<EvaluateResult> {
    this.createGeometryCalls++;
    const result = this.mockComputeResult;
    if (!result.success) {
      return result;
    }
    if (result.data?.format !== 'gltf') {
      return {
        success: false,
        issues: [
          {
            code: 'KERNEL_CAPABILITY_MISSING',
            message: 'Mock evaluation has no GLB view.',
            severity: 'error',
            type: 'kernel',
          },
        ],
      };
    }
    return {
      ...this.completeFixtureEvaluation(result.data.content, { issues: result.issues, handle: this.handleToCapture }),
      ...(result.serializedNativeHandle === undefined ? {} : { serializedHandle: result.serializedNativeHandle }),
      ...(result.serializeNativeHandleSnapshot === undefined
        ? {}
        : { serializeHandleSnapshot: result.serializeNativeHandleSnapshot }),
    };
  }

  /** Complete a v2 evaluation with a real handle and its GLB view content. */
  protected completeFixtureEvaluation(
    content: Uint8Array<ArrayBuffer>,
    options?: { issues?: readonly KernelIssue[]; handle?: unknown; owner?: OperationOwner },
  ): EvaluateResult {
    const handle = options?.handle ?? { kind: 'mock-native-handle' };
    this.captureNativeHandle(handle, options?.owner);
    this.geometryByHandle.set(handle, { format: 'gltf', content });
    return { success: true, data: { views: ['model'] }, issues: [...(options?.issues ?? [])] };
  }

  protected override kernelHasMeshPhaseForOwner(_owner: OperationOwner): boolean {
    return true;
  }

  protected override selectDefaultViewForOwner(
    _owner: OperationOwner,
    offers: KernelOffers,
  ): { view: string; mimeType: 'model/gltf-binary' } | undefined {
    return offers.views?.includes('model') ? { view: 'model', mimeType: 'model/gltf-binary' } : undefined;
  }

  protected override async onRenderForOwner(
    _owner: OperationOwner,
    input: RenderRequest & { nativeHandle: unknown },
    _runtime: KernelRuntime,
  ): Promise<RenderResult> {
    const geometry = this.geometryByHandle.get(input.nativeHandle);
    if (geometry?.format !== 'gltf') {
      return {
        success: false,
        issues: [
          {
            code: 'KERNEL_CAPABILITY_MISSING',
            message: 'Mock handle has no GLB view.',
            severity: 'error',
            type: 'kernel',
          },
        ],
      };
    }
    return { success: true, data: { mimeType: 'model/gltf-binary', content: geometry.content }, issues: [] };
  }

  protected override async onExportGeometry(
    input: ExportGeometryInput,
    runtime: KernelRuntime,
  ): Promise<ExportGeometryResult> {
    this.exportGeometrySpy(input, runtime);
    return this.mockExportResult;
  }

  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return { resolved: [entryPath], unresolved: [] };
  }

  protected override getActiveKernelId(): string | undefined {
    return 'mock-kernel';
  }

  protected override getActiveKernelVersion(): string | undefined {
    return '1.0.0';
  }
}
