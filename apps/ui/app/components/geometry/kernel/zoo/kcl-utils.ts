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
import type { Models } from '@kittycad/lib';
import wasmPath from '@taucad/kcl-wasm-lib/kcl.wasm?url';
import { EngineConnection } from '~/components/geometry/kernel/zoo/engine-connection.js';
import type { WasmModule } from '~/components/geometry/kernel/zoo/engine-connection.js';

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

export type ExportFormat = OutputFormat3d['type'];

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
    throw new Error(`Failed to load WASM module: ${String(error)}`);
  }
}

export class KclUtils {
  private wasmModule: WasmModule | undefined;
  private isInitialized = false;
  private engineManager: EngineConnection | undefined;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  public constructor(options: KclUtilsOptions) {
    if (!options.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'wss://api.zoo.dev';
  }

  /**
   * Initialize the KCL export utility.
   * This will initialize the WASM module and engine connection.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize WASM module for parsing
    this.wasmModule = await loadWasmModule();

    // Create and initialize engine manager
    this.engineManager = await this.createEngineManager();
    await this.engineManager.initialize();

    this.isInitialized = true;
  }

  /**
   * Parse KCL code and return the AST
   */
  public async parseKcl(kclCode: string): Promise<KclParseResult> {
    if (!this.isInitialized) {
      throw new Error('KclExportUtils not initialized. Call initialize() first.');
    }

    if (!this.wasmModule) {
      throw new Error('WASM module not loaded');
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
      throw new Error(`Failed to parse KCL code: ${String(error)}`);
    }
  }

  /**
   * Execute KCL code using the engine
   */
  public async executeKcl(program: Program, settings?: PartialDeep<Configuration>): Promise<KclExecutionResult> {
    if (!this.isInitialized) {
      throw new Error('KclExportUtils not initialized. Call initialize() first.');
    }

    if (!this.wasmModule) {
      throw new Error('WASM module not loaded');
    }

    if (!this.engineManager) {
      throw new Error('Real engine manager not initialized');
    }

    try {
      const result = (await this.engineManager.context?.execute(
        JSON.stringify(program),
        undefined,
        JSON.stringify(settings ?? {}),
      )) as KclExecutionResult;

      return result;
    } catch (error) {
      console.error('KCL execution error details:', error);
      const errorMessage =
        error && typeof error === 'object' && 'message' in error
          ? `KCL execution failed: ${(error as { message: string }).message}`
          : `KCL execution failed: ${JSON.stringify(error)}`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Export KCL code from string input
   */
  public async exportKcl(
    kclCode: string,
    options: ExportOptions,
    settings?: PartialDeep<Configuration>,
  ): Promise<ExportedFile[]> {
    try {
      // Parse the KCL code
      const { program, errors } = await this.parseKcl(kclCode);

      if (errors.length > 0) {
        throw new Error(`KCL parsing errors: ${JSON.stringify(errors)}`);
      }

      // Export the program
      const files = await this.exportKclInternal(program, options, settings);

      return files;
    } catch (error) {
      throw new Error(`Failed to export KCL: ${String(error)}`);
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    if (this.engineManager) {
      await this.engineManager.cleanup();
      this.engineManager = undefined;
    }

    this.isInitialized = false;
  }

  /**
   * Create an engine manager that connects to the modeling API
   */
  private async createEngineManager(): Promise<EngineConnection> {
    if (!this.wasmModule) {
      throw new Error('WASM module not loaded');
    }

    const engineManager = new EngineConnection(this.apiKey, this.baseUrl, this.wasmModule);
    return engineManager;
  }

  /**
   * Export a KCL program to the specified format using WASM export API
   */
  private async exportKclInternal(
    program: Program,
    options: ExportOptions,
    settings: PartialDeep<Configuration> = {},
  ): Promise<ExportedFile[]> {
    // First execute the program to get the model
    const execResult = await this.executeKcl(program, settings);

    if (execResult.errors.length > 0) {
      const errorMessages = execResult.errors.map((error: unknown) => {
        if (typeof error === 'string') {
          return error;
        }

        if (error && typeof error === 'object') {
          const errorObject = error as { message?: string; msg?: string };
          return errorObject.message ?? errorObject.msg ?? JSON.stringify(error);
        }

        return String(error);
      });
      throw new Error(`KCL execution failed: ${errorMessages.join(', ')}`);
    }

    // Get the context used for execution
    const context = this.engineManager?.context;
    if (!context) {
      throw new Error('No context available for export. Make sure KCL code was executed first.');
    }

    // Create export format configuration following the main app's approach
    const exportFormat = this.createExportFormat(options);

    // Export the model
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
  }

  /**
   * Create export format configuration based on options
   */
  private createExportFormat(options: ExportOptions): OutputFormat3d {
    const defaultCoords: System = {
      forward: { axis: 'y', direction: 'negative' },
      up: { axis: 'z', direction: 'positive' },
    };

    switch (options.type) {
      case 'gltf': {
        return {
          type: 'gltf',
          storage: 'binary',
          presentation: 'pretty',
        };
      }

      case 'obj': {
        return {
          type: 'obj',
          coords: options.coords ?? defaultCoords,
          units: 'mm',
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
          storage: 'binary',
          ...(options.deterministic && {
            created: '1970-01-01T00:00:00Z',
          }),
        };
      }

      default: {
        const _exhaustiveCheck: never = options;
        throw new Error(`Unsupported export format: ${String(_exhaustiveCheck)}`);
      }
    }
  }
}
