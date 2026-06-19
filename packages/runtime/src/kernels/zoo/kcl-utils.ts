import type { PartialDeep, SetRequired } from 'type-fest';
import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';
import type { KclValue } from '@taucad/kcl-wasm-lib/bindings/KclValue';
import type { Operation } from '@taucad/kcl-wasm-lib/bindings/Operation';
import type { ArtifactGraph } from '@taucad/kcl-wasm-lib/bindings/Artifact';
import type { CompilationIssue as CompilationError } from '@taucad/kcl-wasm-lib/bindings/CompilationIssue';
import type { DefaultPlanes } from '@taucad/kcl-wasm-lib/bindings/DefaultPlanes';
import type { Configuration } from '@taucad/kcl-wasm-lib/bindings/Configuration';
import type { System } from '@taucad/kcl-wasm-lib/bindings/ModelingCmd';
import type { Context } from '@taucad/kcl-wasm-lib';
import type { Models } from '@kittycad/lib';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import { EngineConnection, MockEngineConnection } from '#kernels/zoo/engine-connection.js';
import type { WasmModule } from '#kernels/zoo/zoo-wasm-module.types.js';
import type { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';
import {
  KclError,
  KclExportError,
  KclWasmError,
  extractWasmKclErrorDetails,
  EXECUTE_INTERRUPTED_ERROR_CODE,
} from '#kernels/zoo/kcl-errors.js';
import { isZooEmptyExportError } from '#kernels/zoo/zoo-error-detection.js';
import { createZooLogger } from '#kernels/zoo/zoo-logs.js';
import { compileWasmStreaming } from '#framework/wasm-loader.js';
import { normalizeSceneGraphDelta } from '#kernels/zoo/types/kcl-scene-graph-delta.js';
import type { KclSceneGraphDelta } from '#kernels/zoo/types/kcl-scene-graph-delta.js';
import type { KclExecutionResult } from '#kernels/zoo/types/kcl-execution-result.js';
import { buildKclSettingsJson } from '#kernels/zoo/kcl-headless-settings.js';

/**
 * URL to the KCL WASM binary, resolved relative to this module for bundler compatibility.
 *
 * @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
 */
export const kclWasmUrl = new URL('wasm/kcl_wasm_lib_bg.wasm', import.meta.url).href;

const log = createZooLogger('KclUtils');

type OutputFormat3d = Models['OutputFormat3d_type'];

/**
 * Outcome of parsing a KCL source file into an AST. Errors and warnings are separated for diagnostic display.
 */
export type KclParseResult = {
  program: Node<Program>;
  errors: CompilationError[];
  warnings: CompilationError[];
};

const partitionExecutionIssues = (
  input: CompilationError[],
): { errors: CompilationError[]; warnings: CompilationError[] } => {
  const errors = [];
  const warnings = [];
  for (const issue of input) {
    if (issue.severity === 'Warning') {
      warnings.push(issue);
    } else {
      errors.push(issue);
    }
  }

  return { errors, warnings };
};

/**
 * `ExecOutcome` from kcl-lib serializes diagnostics as `issues` (see `execution/mod.rs`).
 * Older wasm builds used `errors`; normalize so runtime code can keep using `errors`.
 *
 * @param raw - JSON value returned from WASM `executeMock` / `execute`.
 * @returns Parsed {@link KclExecutionResult} with `errors` / `warnings` partitioned from `issues` or legacy `errors`.
 */
function normalizeKclExecutionResult(raw: unknown): KclExecutionResult {
  if (raw === null || typeof raw !== 'object') {
    throw KclError.simple({
      kind: 'engine',
      message: `KCL execution returned non-object: ${String(raw)}`,
    });
  }

  const record = raw as Record<string, unknown>;
  const fromIssues = record['issues'];
  const fromLegacyErrors = record['errors'];
  const errorsRaw = Array.isArray(fromIssues) ? fromIssues : fromLegacyErrors;
  const allIssues = Array.isArray(errorsRaw) ? (errorsRaw as CompilationError[]) : [];
  const partitioned = partitionExecutionIssues(allIssues);

  return {
    variables: (record['variables'] ?? {}) as KclExecutionResult['variables'],
    operations: (record['operations'] ?? []) as Operation[],
    artifactGraph: (record['artifactGraph'] ?? { map: {}, itemCount: 0 }) as ArtifactGraph,
    errors: partitioned.errors,
    warnings: partitioned.warnings,
    filenames: (record['filenames'] ?? {}) as KclExecutionResult['filenames'],
    defaultPlanes: record['defaultPlanes'] as KclExecutionResult['defaultPlanes'],
  };
}

/**
 * Configuration for exporting a KCL model to a 3D file format. The `type` field selects the output format (e.g., `step`, `stl`).
 */
export type ExportOptions = SetRequired<Partial<OutputFormat3d>, 'type'> & {
  deterministic?: boolean;
};

/**
 * File produced by a KCL export operation, ready to be downloaded or written to disk.
 */
export type ExportedFile = {
  name: string;
  contents: Uint8Array<ArrayBuffer>;
};

/**
 * Outcome of exporting a KCL model to a file format. On failure, `error` contains the human-readable reason.
 */
export type KclExportResult = {
  success: boolean;
  files: ExportedFile[];
  error?: string;
};

type KclUtilitiesOptions = {
  /** Base URL for the modeling API */
  baseUrl?: string;
  /** Stream dimensions for engine */
  streamDimensions?: {
    width: number;
    height: number;
  };
  /** FileSystemManager for resolving file paths */
  fileSystemManager: FileSystemManager;
};

const splitErrors = (input: CompilationError[]): { errors: CompilationError[]; warnings: CompilationError[] } =>
  partitionExecutionIssues(input);

// Dynamic import function to load WASM module
async function loadWasmModule(tracer?: RuntimeSpanTracer): Promise<WasmModule> {
  try {
    const wasmModule = await import('@taucad/kcl-wasm-lib');

    const compiledModule = await compileWasmStreaming(kclWasmUrl, tracer);

    // eslint-disable-next-line @typescript-eslint/naming-convention -- WASM Bindgen API
    await wasmModule.default({ module_or_path: compiledModule });

    return wasmModule;
  } catch (error) {
    throw KclError.simple({
      kind: 'engine',
      message: `Failed to load WASM module: ${String(error)}`,
    });
  }
}

/**
 * Utilities for parsing, executing, and exporting KCL code via WASM and Zoo engine.
 */
export class KclUtilities {
  /**
   * Inject parameters into KCL program JSON by modifying variable declarations.
   * This is a pure transformation that doesn't modify the original program.
   *
   * @param program - The KCL program to inject parameters into
   * @param parameters - The JSON parameters to inject
   * @returns A new program with injected parameters
   */
  public static injectParametersIntoProgram(program: Program, parameters: Record<string, unknown>): Program {
    if (Object.keys(parameters).length === 0) {
      return program;
    }

    // Deep clone the program to avoid mutating the original
    const modifiedProgram = structuredClone(program);

    // Iterate through the body to find variable declarations
    for (const bodyItem of modifiedProgram.body) {
      if (bodyItem.type === 'VariableDeclaration') {
        const { declaration } = bodyItem;
        const variableName = declaration.id.name;
        if (declaration.init.type === 'Literal' && variableName in parameters) {
          const parameterValue = parameters[variableName];

          // Update the literal value while preserving the structure
          if (typeof parameterValue === 'number') {
            // `value` is mistyped - it always has a nested `value` property
            (declaration.init.value as unknown) = {
              value: parameterValue,
              suffix: 'None',
            };
            declaration.init.raw = String(parameterValue);
          } else if (typeof parameterValue === 'string') {
            (declaration.init.value as unknown) = {
              value: parameterValue,
              suffix: 'None',
            };
            declaration.init.raw = `"${parameterValue}"`;
          } else if (typeof parameterValue === 'boolean') {
            (declaration.init.value as unknown) = {
              value: parameterValue,
              suffix: 'None',
            };
            declaration.init.raw = String(parameterValue);
          }
        }
      }
    }

    return modifiedProgram;
  }

  /**
   * Convert KCL variables to JSON schema format for parameter extraction.
   * Only processes literal values (String, Number, Bool) and skips complex types.
   *
   * @param variables - name-to-value map produced by the KCL executor (only literal types are extracted)
   * @returns Object containing default parameters and JSON schema
   */
  public static convertKclVariablesToJsonSchema(variables: Partial<Record<string, KclValue>>): {
    defaultParameters: Record<string, unknown>;
    jsonSchema: Record<string, unknown>;
  } {
    const defaultParameters: Record<string, unknown> = {};
    const properties: Record<string, unknown> = {};

    for (const [name, kclValue] of Object.entries(variables)) {
      if (!kclValue) {
        continue;
      }

      try {
        // Only process literal values: String, Number, and Bool
        switch (kclValue.type) {
          case 'String': {
            defaultParameters[name] = kclValue.value;
            properties[name] = { type: 'string', default: kclValue.value };
            break;
          }

          case 'Number': {
            defaultParameters[name] = kclValue.value;
            properties[name] = { type: 'number', default: kclValue.value };
            break;
          }

          case 'Bool': {
            defaultParameters[name] = kclValue.value;
            properties[name] = { type: 'boolean', default: kclValue.value };
            break;
          }

          default: {
            // Skip non-literal values (Plane, Face, Sketch, etc.)
            log.debug(`Skipping non-literal KCL variable ${name} of type ${kclValue.type}`);
            break;
          }
        }
      } catch (error) {
        log.warn(`Failed to process KCL variable ${name}:`, error);
      }
    }

    const jsonSchema = {
      type: 'object',
      properties,
      additionalProperties: false,
    };

    return { defaultParameters, jsonSchema };
  }

  private wasmModule: WasmModule | undefined;
  private isWasmInitialized = false;
  private isEngineInitialized = false;
  private engineManager: EngineConnection | undefined;
  private mockContext: Context | undefined;
  private readonly baseUrl: string;
  private readonly fileSystemManager: FileSystemManager;
  // Add execution state tracking
  private hasExecutedProgram = false;
  private lastDefaultPlanes: DefaultPlanes | undefined;
  private executeExclusiveGate: Promise<void> = new Promise<void>((resolve) => {
    resolve();
  });
  /** Unsubscribe for modeling WebSocket idle/remote close; cleared in {@link cleanup} and when the socket drops. */
  private engineSocketCloseUnsubscribe: (() => void) | undefined;

  public constructor(options: KclUtilitiesOptions) {
    this.baseUrl = options.baseUrl ?? 'wss://api.zoo.dev';
    this.fileSystemManager = options.fileSystemManager;
  }

  /**
   * Whether the WASM module has been initialized and is ready for parsing.
   *
   * @returns whether the WASM module is initialized
   */
  public get isWasmReady(): boolean {
    return this.isWasmInitialized;
  }

  /**
   * Whether the full engine connection (WASM + WebSocket) has been initialized.
   *
   * @returns whether both WASM and WebSocket are initialized
   */
  public get isEngineReady(): boolean {
    return this.isEngineInitialized;
  }

  /**
   * Whether the current engine session has an executed program available for in-memory export.
   *
   * @returns true when exportFromMemory can run without re-executing KCL
   */
  public get canExportFromMemory(): boolean {
    return this.isEngineInitialized && this.hasExecutedProgram;
  }

  /**
   * Default modeling planes (xy / yz / xz ids) from the last {@link clearProgram} bust result.
   *
   * @returns last normalized default planes, or undefined before the first successful bust
   */
  public get defaultPlanes(): DefaultPlanes | undefined {
    return this.lastDefaultPlanes;
  }

  /**
   * Rejects all pending Zoo modeling commands (in-flight WebSocket round-trips).
   */
  public async cancel(): Promise<void> {
    /* eslint-disable @typescript-eslint/naming-convention -- Zoo bridge wire payload */
    this.engineManager?.bridge?.rejectAllPendingCommand({
      error_code: EXECUTE_INTERRUPTED_ERROR_CODE,
      message: 'kcl execution was interrupted',
    });
    /* eslint-enable @typescript-eslint/naming-convention -- end cancel bridge payload */
  }

  /**
   * Initializes only the WASM module for parsing and mock execution.
   * This allows parseKcl and executeMockKcl to work without a WebSocket connection.
   *
   * @param tracer - optional span tracer for performance instrumentation
   */
  public async initializeWasm(tracer?: RuntimeSpanTracer): Promise<void> {
    if (this.isWasmInitialized) {
      return;
    }

    // Initialize WASM module for parsing
    this.wasmModule = await loadWasmModule(tracer);

    // Create mock context for local operations
    const mockEngine = new MockEngineConnection();
    // oxlint-disable-next-line @typescript-eslint/await-thenable -- WASM Context constructor may return thenable
    this.mockContext = await new this.wasmModule.Context(mockEngine, this.fileSystemManager);

    this.isWasmInitialized = true;
  }

  /**
   * Initializes the full engine connection (WASM + WebSocket) for execution and export.
   *
   * @throws When the WebSocket connection or authentication fails
   */
  public async initializeEngine(): Promise<void> {
    if (this.isEngineInitialized) {
      return;
    }

    // Ensure WASM is initialized first
    await this.initializeWasm();

    // Create and initialize engine manager
    this.engineManager = await this.createEngineManager();
    await this.engineManager.initialize();

    this.engineSocketCloseUnsubscribe?.();
    this.engineSocketCloseUnsubscribe = this.engineManager.onSessionClosed(() => {
      this.invalidateEngineDueToSocketClose();
    });

    this.isEngineInitialized = true;
  }

  /**
   * Parses KCL source code into an AST. Only requires WASM initialization.
   *
   * @param kclCode - the KCL source code to parse
   * @returns the parsed program, errors, and warnings
   * @throws When the WASM module fails to load or parsing encounters a fatal error
   */
  public async parseKcl(kclCode: string): Promise<KclParseResult> {
    if (!this.isWasmInitialized) {
      await this.initializeWasm();
    }

    if (!this.wasmModule) {
      throw KclError.simple({
        kind: 'engine',
        message: 'WASM module not loaded',
      });
    }

    try {
      const result = this.wasmModule.parse_wasm(kclCode) as [Node<Program>, CompilationError[]];
      const errors = splitErrors(result[1]);

      return {
        program: result[0],
        errors: errors.errors,
        warnings: errors.warnings,
      };
    } catch (error) {
      throw KclError.simple({
        kind: 'syntax',
        message: `Failed to parse KCL code: ${String(error)}`,
      });
    }
  }

  /**
   * Executes a KCL program using a mock context without a WebSocket connection.
   *
   * @param program - the parsed KCL program AST to execute
   * @param path - the file path of the entry module
   * @param settings - optional KCL configuration overrides
   * @returns the execution result with variables, operations, and artifacts
   * @throws When execution fails or the WASM module is not loaded
   */
  public async executeMockKcl(
    program: Program,
    path: string,
    settings?: PartialDeep<Configuration>,
  ): Promise<KclExecutionResult> {
    if (!this.isWasmInitialized) {
      await this.initializeWasm();
    }

    if (!this.wasmModule) {
      throw KclError.simple({
        kind: 'engine',
        message: 'WASM module not loaded',
      });
    }

    if (!this.mockContext) {
      throw KclError.simple({
        kind: 'engine',
        message: 'Mock context not initialized',
      });
    }

    try {
      const programJson = JSON.stringify(program);
      const settingsJson = buildKclSettingsJson(settings);
      const outcomeUnknown: unknown = await this.mockContext.executeMock(programJson, path, settingsJson, false);

      return normalizeKclExecutionResult(outcomeUnknown);
    } catch (error) {
      log.error('KCL mock execution error details:', error);

      // Check if this is a WASM KclError
      const extracted = extractWasmKclErrorDetails(error);
      if (extracted) {
        throw new KclWasmError(extracted.wasmError, extracted.partialOutcome);
      }

      const errorMessage =
        error instanceof Error
          ? `KCL mock execution failed: ${error.message}`
          : `KCL mock execution failed: ${String(error)}`;
      throw KclError.simple({ kind: 'engine', message: errorMessage });
    }
  }

  /**
   * Executes a KCL program against the Zoo engine via WebSocket.
   *
   * @param program - the parsed KCL program AST to execute
   * @param path - the file path of the entry module
   * @param settings - optional KCL configuration overrides
   * @returns the execution result with variables, operations, and artifacts
   * @throws When execution fails, the engine is not initialized, or a WASM error occurs
   */
  public async executeProgram(
    program: Program,
    path: string,
    settings?: PartialDeep<Configuration>,
  ): Promise<KclExecutionResult> {
    return this.serializeExclusive(async () => {
      if (!this.isEngineInitialized) {
        await this.initializeEngine();
      }

      if (!this.wasmModule) {
        throw KclError.simple({
          kind: 'engine',
          message: 'WASM module not loaded',
        });
      }

      if (!this.engineManager) {
        throw KclError.simple({
          kind: 'engine',
          message: 'Engine manager not initialized',
        });
      }

      try {
        const programJson = JSON.stringify(program);
        const settingsJson = buildKclSettingsJson(settings);
        const executeResult: unknown = await this.engineManager.context?.execute(programJson, path, settingsJson);

        this.hasExecutedProgram = true;

        const delta = normalizeSceneGraphDelta(executeResult);
        const outcome = normalizeKclExecutionResult(delta.execOutcome);
        await this.engineManager.bridge?.flushPending();
        return outcome;
      } catch (error) {
        log.error('KCL execution error details:', error);

        const extracted = extractWasmKclErrorDetails(error);
        if (extracted) {
          throw new KclWasmError(extracted.wasmError, extracted.partialOutcome);
        }

        const errorMessage =
          error instanceof Error ? `KCL execution failed: ${error.message}` : `KCL execution failed: ${String(error)}`;
        throw KclError.simple({ kind: 'engine', message: errorMessage });
      }
    });
  }

  /**
   * Runs {@link executeProgram} but returns the full scene graph delta for future selection/picking consumers.
   * Prefer {@link executeProgram} unless you need `newGraph` / `newObjects` / `invalidatesIds`.
   *
   * @param program - parsed KCL AST
   * @param path - entry file path for the engine
   * @param settings - optional KCL configuration overrides
   * @returns normalized scene-graph delta including `execOutcome`
   * @public
   */
  public async executeProgramWithSceneDelta(
    program: Program,
    path: string,
    settings?: PartialDeep<Configuration>,
  ): Promise<KclSceneGraphDelta> {
    return this.serializeExclusive(async () => {
      if (!this.isEngineInitialized) {
        await this.initializeEngine();
      }

      if (!this.wasmModule) {
        throw KclError.simple({
          kind: 'engine',
          message: 'WASM module not loaded',
        });
      }

      if (!this.engineManager) {
        throw KclError.simple({
          kind: 'engine',
          message: 'Engine manager not initialized',
        });
      }

      try {
        const programJson = JSON.stringify(program);
        const settingsJson = buildKclSettingsJson(settings);
        const executeResult: unknown = await this.engineManager.context?.execute(programJson, path, settingsJson);

        this.hasExecutedProgram = true;

        const delta = normalizeSceneGraphDelta(executeResult);
        await this.engineManager.bridge?.flushPending();
        return delta;
      } catch (error) {
        log.error('KCL execution error details:', error);

        const extracted = extractWasmKclErrorDetails(error);
        if (extracted) {
          throw new KclWasmError(extracted.wasmError, extracted.partialOutcome);
        }

        const errorMessage =
          error instanceof Error ? `KCL execution failed: ${error.message}` : `KCL execution failed: ${String(error)}`;
        throw KclError.simple({ kind: 'engine', message: errorMessage });
      }
    });
  }

  /**
   * Exports the model from operations already in memory, without re-execution.
   * Must be called after {@link executeProgram}.
   *
   * @param options - export format configuration (e.g., `{ type: 'step' }`)
   * @param settings - optional KCL configuration overrides
   * @returns the exported files, or an empty array if nothing to export
   * @throws When no program has been executed or the export fails
   */
  public async exportFromMemory(
    options: ExportOptions,
    settings: PartialDeep<Configuration> = {},
  ): Promise<ExportedFile[]> {
    if (!this.hasExecutedProgram) {
      throw new KclExportError('No program has been executed yet. Call executeKcl first.');
    }

    if (!this.isEngineInitialized) {
      throw KclError.simple({
        kind: 'engine',
        message: 'Engine not initialized',
      });
    }

    // Get the context used for execution
    const context = this.engineManager?.context;
    if (!context) {
      throw KclError.simple({
        kind: 'engine',
        message: 'No context available for export',
      });
    }

    // Create export format configuration
    const exportFormat = this.createExportFormat(options);

    try {
      // Export the model using operations already in memory
      const result = (await context.export(JSON.stringify(exportFormat), buildKclSettingsJson(settings))) as Array<{
        name: string;
        contents: ArrayBuffer;
      }>;

      // Convert the result to our format
      const files: ExportedFile[] = [];
      if (Array.isArray(result)) {
        for (const file of result) {
          files.push({
            name: file.name,
            contents: new Uint8Array(file.contents),
          });
        }
      }

      return files;
    } catch (error) {
      // Zoo SDK boundary — substring detection is encapsulated in
      // `isZooEmptyExportError`. Replace with a typed `code` check when Zoo
      // ships structured errors.
      if (isZooEmptyExportError(error)) {
        return [];
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new KclExportError(`Export failed: ${errorMessage}`, options.type);
    }
  }

  /**
   * Releases all resources including the WebSocket connection and WASM contexts.
   */
  public async cleanup(): Promise<void> {
    this.engineSocketCloseUnsubscribe?.();
    this.engineSocketCloseUnsubscribe = undefined;
    await this.clearProgram();

    if (this.engineManager) {
      if (typeof this.engineManager.cleanup === 'function') {
        await this.engineManager.cleanup();
      }

      this.engineManager = undefined;
    }

    this.mockContext = undefined;
    this.isWasmInitialized = false;
    this.isEngineInitialized = false;
  }

  /**
   * Clears the operations cache in WASM contexts for a clean build state.
   *
   * @param settings - optional KCL configuration overrides for the scene reset
   */
  public async clearProgram(settings?: PartialDeep<Configuration>): Promise<void> {
    const context = this.engineManager?.context;
    if (context && typeof context.bustCacheAndResetScene === 'function') {
      const bustUnknown: unknown = await context.bustCacheAndResetScene(buildKclSettingsJson(settings), null);
      const normalized = normalizeKclExecutionResult(bustUnknown);
      this.lastDefaultPlanes = normalized.defaultPlanes;
    }

    this.hasExecutedProgram = false;
  }

  /**
   * Drops cached engine state when the Zoo modeling WebSocket closes (idle timeout, network drop, etc.) so the next
   * {@link executeProgram} / {@link exportFromMemory} path runs {@link initializeEngine} again with a fresh session.
   */
  private invalidateEngineDueToSocketClose(): void {
    this.engineSocketCloseUnsubscribe?.();
    this.engineSocketCloseUnsubscribe = undefined;
    this.isEngineInitialized = false;
    this.hasExecutedProgram = false;
    const manager = this.engineManager;
    this.engineManager = undefined;
    if (manager) {
      void manager.cleanup();
    }
  }

  /**
   * Serializes KCL engine executions so overlapping `Context.execute` calls do not interleave.
   *
   * @param run - exclusive async work
   * @returns result of `run`
   */
  private async serializeExclusive<T>(run: () => Promise<T>): Promise<T> {
    return this.withExclusiveLock(run);
  }

  private async withExclusiveLock<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.executeExclusiveGate;
    let resolveRelease!: () => void;
    this.executeExclusiveGate = new Promise<void>((resolve) => {
      resolveRelease = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      resolveRelease();
    }
  }

  /**
   * Creates an EngineConnection that connects to the modeling API.
   *
   * @returns a configured but not yet initialized EngineConnection
   */
  private async createEngineManager(): Promise<EngineConnection> {
    if (!this.wasmModule) {
      throw KclError.simple({
        kind: 'engine',
        message: 'WASM module not loaded',
      });
    }

    const engineManager = new EngineConnection({
      baseUrl: this.baseUrl,
      wasmModule: this.wasmModule,
      fileSystemManager: this.fileSystemManager,
    });
    return engineManager;
  }

  /**
   * Creates an OutputFormat3d configuration from export options with sensible defaults.
   *
   * @param options - the export options specifying format type and overrides
   * @returns a fully-populated OutputFormat3d for the WASM export call
   */
  // oxlint-disable-next-line complexity -- supporting many defaults for exports in readable way
  private createExportFormat(options: ExportOptions): OutputFormat3d {
    const defaultCoords: System = {
      forward: { axis: 'y', direction: 'negative' },
      up: { axis: 'z', direction: 'positive' },
    };

    switch (options.type) {
      case 'gltf': {
        return {
          type: 'gltf',
          storage: options.storage ?? 'embedded',
          presentation: options.presentation ?? 'pretty',
        };
      }

      case 'obj': {
        return {
          type: 'obj',
          coords: options.coords ?? defaultCoords,
          units: options.units ?? 'mm',
        };
      }

      case 'stl': {
        return {
          type: 'stl',
          storage: options.storage ?? 'ascii',
          coords: options.coords ?? defaultCoords,
          units: options.units ?? 'mm',
          selection: { type: 'default_scene' },
        };
      }

      case 'step': {
        return {
          type: 'step',
          coords: options.coords ?? defaultCoords,
          ...(options.deterministic && {
            created: '1970-01-01T00:00:00Z',
          }),
        };
      }

      case 'ply': {
        return {
          type: 'ply',
          storage: options.storage ?? 'ascii',
          coords: options.coords ?? defaultCoords,
          selection: { type: 'default_scene' },
          units: options.units ?? 'mm',
        };
      }

      case 'fbx': {
        return {
          type: 'fbx',
          storage: options.storage ?? 'binary',
          ...(options.deterministic && {
            created: '1970-01-01T00:00:00Z',
          }),
        };
      }

      default: {
        const _exhaustiveCheck: never = options;
        throw new KclExportError(`Unsupported export format: ${String(_exhaustiveCheck)}`);
      }
    }
  }
}
