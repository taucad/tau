import type { PartialDeep, SetRequired } from 'type-fest';
import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';
import type { KclValue } from '@taucad/kcl-wasm-lib/bindings/KclValue';
import type { Operation } from '@taucad/kcl-wasm-lib/bindings/Operation';
import type { ArtifactGraph } from '@taucad/kcl-wasm-lib/bindings/Artifact';
import type { CompilationError } from '@taucad/kcl-wasm-lib/bindings/CompilationError';
import type { ModulePath } from '@taucad/kcl-wasm-lib/bindings/ModulePath';
import type { DefaultPlanes } from '@taucad/kcl-wasm-lib/bindings/DefaultPlanes';
import type { Configuration } from '@taucad/kcl-wasm-lib/bindings/Configuration';
import type { System } from '@taucad/kcl-wasm-lib/bindings/ModelingCmd';
import type { Context } from '@taucad/kcl-wasm-lib';
import type { Models } from '@kittycad/lib';
import wasmPath from '@taucad/kcl-wasm-lib/kcl.wasm?url';
import { EngineConnection, MockEngineConnection } from '#components/geometry/kernel/zoo/engine-connection.js';
import type { WasmModule } from '#components/geometry/kernel/zoo/engine-connection.js';
import {
  KclError,
  KclAuthError,
  KclExportError,
  KclWasmError,
  extractWasmKclError,
} from '#components/geometry/kernel/zoo/kcl-errors.js';

type OutputFormat3d = Models['OutputFormat3d_type'];

// KCL and WASM types
export type KclParseResult = {
  program: Node<Program>;
  errors: CompilationError[];
  warnings: CompilationError[];
};

export type KclExecutionResult = {
  variables: Partial<Record<string, KclValue>>;
  operations: Operation[];
  artifactGraph: ArtifactGraph;
  errors: CompilationError[];
  filenames: Record<number, ModulePath | undefined>;
  defaultPlanes: DefaultPlanes | undefined;
};

export type ExportOptions = SetRequired<Partial<OutputFormat3d>, 'type'> & {
  deterministic?: boolean;
};

export type ExportedFile = {
  name: string;
  contents: Uint8Array;
};

export type KclExportResult = {
  success: boolean;
  files: ExportedFile[];
  error?: string;
};

type KclUtilsOptions = {
  /** API key for modeling API authentication */
  apiKey: string;
  /** Base URL for the modeling API */
  baseUrl?: string;
  /** Stream dimensions for engine */
  streamDimensions?: {
    width: number;
    height: number;
  };
};

const splitErrors = (input: CompilationError[]): { errors: CompilationError[]; warnings: CompilationError[] } => {
  const errors = [];
  const warnings = [];
  for (const i of input) {
    if (i.severity === 'Warning') {
      warnings.push(i);
    } else {
      errors.push(i);
    }
  }

  return { errors, warnings };
};

// Dynamic import function to load WASM module
async function loadWasmModule(): Promise<WasmModule> {
  try {
    const wasmModule = await import('@taucad/kcl-wasm-lib');

    await wasmModule.default(wasmPath);

    return wasmModule;
  } catch (error) {
    throw KclError.simple('engine', `Failed to load WASM module: ${String(error)}`);
  }
}

export class KclUtils {
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
   * @param variables - The KCL variables to convert
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
            console.debug(`Skipping non-literal KCL variable ${name} of type ${kclValue.type}`);
            break;
          }
        }
      } catch (error) {
        console.warn(`Failed to process KCL variable ${name}:`, error);
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
  private readonly apiKey: string;
  private readonly baseUrl: string;
  // Add execution state tracking
  private hasExecutedProgram = false;

  public constructor(options: KclUtilsOptions) {
    if (!options.apiKey) {
      throw new KclAuthError('API key is required');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'wss://api.zoo.dev';
  }

  /**
   * Check if WASM has been initialized
   */
  public get isWasmReady(): boolean {
    return this.isWasmInitialized;
  }

  /**
   * Check if the engine has been initialized
   */
  public get isEngineReady(): boolean {
    return this.isEngineInitialized;
  }

  /**
   * Initialize only the WASM module for parsing and mock execution.
   * This allows parseKcl and executeMockKcl to work without websocket.
   */
  public async initializeWasm(): Promise<void> {
    if (this.isWasmInitialized) {
      return;
    }

    // Initialize WASM module for parsing
    this.wasmModule = await loadWasmModule();

    // Create mock context for local operations
    const mockEngine = new MockEngineConnection();
    // eslint-disable-next-line @typescript-eslint/await-thenable -- WASM Context constructor may return thenable
    this.mockContext = await new this.wasmModule.Context(
      mockEngine,
      undefined, // Fs_manager (undefined for now)
    );

    this.isWasmInitialized = true;
  }

  /**
   * Initialize the full engine connection for operations that need websocket.
   * This is required for executeKcl and exportKcl operations.
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

    this.isEngineInitialized = true;
  }

  /**
   * Parse KCL code and return the AST.
   * Only requires WASM initialization.
   */
  public async parseKcl(kclCode: string): Promise<KclParseResult> {
    if (!this.isWasmInitialized) {
      await this.initializeWasm();
    }

    if (!this.wasmModule) {
      throw KclError.simple('engine', 'WASM module not loaded');
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
      throw KclError.simple('syntax', `Failed to parse KCL code: ${String(error)}`);
    }
  }

  /**
   * Execute KCL code using mock context (no websocket required).
   * Only requires WASM initialization.
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
      throw KclError.simple('engine', 'WASM module not loaded');
    }

    if (!this.mockContext) {
      throw KclError.simple('engine', 'Mock context not initialized');
    }

    try {
      const result = (await this.mockContext.executeMock(
        JSON.stringify(program),
        path,
        JSON.stringify(settings ?? {}),
        false,
      )) as KclExecutionResult;

      return result;
    } catch (error) {
      console.error('KCL mock execution error details:', error);

      // Check if this is a WASM KclError
      const wasmError = extractWasmKclError(error);
      if (wasmError) {
        throw new KclWasmError(wasmError);
      }

      const errorMessage =
        error instanceof Error
          ? `KCL mock execution failed: ${error.message}`
          : `KCL mock execution failed: ${String(error)}`;
      throw KclError.simple('engine', errorMessage);
    }
  }

  /**
   * Execute KCL code using the full engine (requires websocket).
   * Requires full engine initialization.
   */
  public async executeProgram(
    program: Program,
    path: string,
    settings?: PartialDeep<Configuration>,
  ): Promise<KclExecutionResult> {
    if (!this.isEngineInitialized) {
      await this.initializeEngine();
    }

    if (!this.wasmModule) {
      throw KclError.simple('engine', 'WASM module not loaded');
    }

    if (!this.engineManager) {
      throw KclError.simple('engine', 'Engine manager not initialized');
    }

    try {
      const result = (await this.engineManager.context?.execute(
        JSON.stringify(program),
        path,
        JSON.stringify(settings ?? {}),
      )) as KclExecutionResult;

      // Track successful execution
      this.hasExecutedProgram = true;

      return result;
    } catch (error) {
      console.error('KCL execution error details:', error);

      // Check if this is a WASM KclError
      const wasmError = extractWasmKclError(error);
      if (wasmError) {
        throw new KclWasmError(wasmError);
      }

      const errorMessage =
        error instanceof Error ? `KCL execution failed: ${error.message}` : `KCL execution failed: ${String(error)}`;
      throw KclError.simple('engine', errorMessage);
    }
  }

  /**
   * Export from operations already in memory without re-execution.
   * This should be used after executeKcl has been called.
   */
  public async exportFromMemory(
    options: ExportOptions,
    settings: PartialDeep<Configuration> = {},
  ): Promise<ExportedFile[]> {
    if (!this.hasExecutedProgram) {
      throw new KclExportError('No program has been executed yet. Call executeKcl first.');
    }

    if (!this.isEngineInitialized) {
      throw KclError.simple('engine', 'Engine not initialized');
    }

    // Get the context used for execution
    const context = this.engineManager?.context;
    if (!context) {
      throw KclError.simple('engine', 'No context available for export');
    }

    // Create export format configuration
    const exportFormat = this.createExportFormat(options);

    try {
      // Export the model using operations already in memory
      const result = (await context.export(JSON.stringify(exportFormat), JSON.stringify(settings))) as Array<{
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
      // Handle the specific "Nothing to export" case as a valid scenario
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for the "Nothing to export" pattern in various forms
      if (errorMessage.includes('Nothing to export') || errorMessage.includes('internal_engine: Nothing to export')) {
        // This is a valid case - return empty array instead of throwing
        return [];
      }

      // For other export errors, re-throw as KCLExportError
      throw new KclExportError(`Export failed: ${errorMessage}`, options.type);
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    await this.clearProgram();

    if (this.engineManager) {
      await this.engineManager.cleanup();
      this.engineManager = undefined;
    }

    this.mockContext = undefined;
    this.isWasmInitialized = false;
    this.isEngineInitialized = false;
  }

  /**
   * Clear the memory/operations cache in WASM contexts.
   * This should be called before starting a new build to ensure clean state.
   */
  public async clearProgram(settings?: PartialDeep<Configuration>): Promise<void> {
    try {
      // Get the context used for execution
      const context = this.engineManager?.context;
      if (context) {
        // Reset the scene
        await context.bustCacheAndResetScene(JSON.stringify(settings ?? {}));
      }

      // Reset execution state
      this.hasExecutedProgram = false;
    } catch (error) {
      console.warn('Failed to clear memory:', error);
    }
  }

  /**
   * Create an engine manager that connects to the modeling API
   */
  private async createEngineManager(): Promise<EngineConnection> {
    if (!this.wasmModule) {
      throw KclError.simple('engine', 'WASM module not loaded');
    }

    const engineManager = new EngineConnection(this.apiKey, this.baseUrl, this.wasmModule);
    return engineManager;
  }

  /**
   * Create export format configuration based on options
   */
  // eslint-disable-next-line complexity -- supporting many defaults for exports in readable way
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
