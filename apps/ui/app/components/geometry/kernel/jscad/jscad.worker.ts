import { expose } from 'comlink';
import ErrorStackParser from 'error-stack-parser';
import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryFile,
  Geometry,
  KernelError,
  KernelErrorResult,
  KernelStackFrame,
} from '@taucad/types';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';
import { buildEsModule, runInCjsContext, registerKernelModules } from '#components/geometry/kernel/replicad/vm.js';
import { jscadToGltf } from '#components/geometry/kernel/jscad/jscad-to-gltf.js';
import { jsonSchemaFromJson } from '#utils/schema.utils.js';
import type { JscadParameterDefinition } from '#components/geometry/kernel/jscad/jscad.schema.js';
import {
  convertParameterDefinitionsToDefaults,
  convertParameterDefinitionsToJsonSchema,
} from '#components/geometry/kernel/jscad/jscad.schema.js';

type JscadModuleExports = {
  getParameterDefinitions?: () => JscadParameterDefinition[];
  defaultParams?: () => Record<string, unknown>;
};

/**
 * Type guard to check if a value is a plain object (Record<string, unknown>)
 */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if a module has parameter-related exports
 * (getParameterDefinitions function or defaultParams object)
 */
function isModuleWithParameters(module: unknown): module is JscadModuleExports {
  if (!isRecordObject(module)) {
    return false;
  }

  const hasGetParameterDefinitions =
    'getParameterDefinitions' in module && typeof module['getParameterDefinitions'] === 'function';
  const hasDefaultParameters = 'defaultParams' in module;

  return hasGetParameterDefinitions || hasDefaultParameters;
}

/**
 * Type guard to check if a module has entry point exports
 * (main function or default export)
 */
function isModuleWithEntryPoint(module: unknown): module is {
  main?: (parameters: unknown) => unknown;
  default?: (parameters: unknown) => unknown;
} {
  if (!isRecordObject(module)) {
    return false;
  }

  return 'main' in module || 'default' in module;
}

/**
 * Helper function to create standardized kernel errors with stack trace information
 *
 * Extracts detailed error information from various error types:
 * - Error objects: Parses stack traces to extract file, line, and column information
 * - Strings: Treats as error messages
 * - Unknown types: Provides generic error message
 *
 * Always attempts to capture stack traces when available for better debugging.
 *
 * @param error - The error to format (Error, string, or unknown)
 * @param fallbackMessage - Message to use if error cannot be parsed
 * @returns KernelErrorResult with formatted error information
 */
function createJscadKernelError(error: unknown, fallbackMessage: string): KernelErrorResult {
  let message = fallbackMessage;
  let stack: string | undefined;
  let kernelStackFrames: KernelStackFrame[] = [];
  let startLineNumber = 0;
  let startColumn = 0;
  const type: 'compilation' | 'runtime' | 'kernel' | 'unknown' = 'runtime';

  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;

    try {
      const stackFrames = ErrorStackParser.parse(error);

      kernelStackFrames = stackFrames.map((frame) => ({
        fileName: frame.fileName,
        functionName: frame.functionName,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
        source: frame.source,
      }));

      // Find the most relevant frame (prefer 'Module.main' or fall back to first frame)
      const userFrame = stackFrames.find((frame) => frame.functionName === 'Module.main') ?? stackFrames[0];

      startLineNumber = userFrame?.lineNumber ?? 0;
      startColumn = userFrame?.columnNumber ?? 0;
    } catch {
      // If stack parsing fails, use defaults but keep the stack string
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  const kernelError: KernelError = {
    message,
    stack,
    stackFrames: kernelStackFrames.length > 0 ? kernelStackFrames : undefined,
    startLineNumber,
    startColumn,
    type,
  };

  return createKernelError(kernelError);
}

/**
 * JSCAD worker for executing @jscad/modeling scripts
 *
 * Features:
 * - Detects JSCAD files by checking for '@jscad/modeling' imports/requires
 * - Executes user code in a sandboxed VM with @jscad/modeling injected
 * - Converts JSCAD geometries to GLTF for rendering
 * - Supports parameter extraction from getParameterDefinitions()
 */
class JscadWorker extends KernelWorker {
  protected static override readonly supportedExportFormats: ExportFormat[] = ['glb', 'gltf'];
  protected override readonly name: string = 'JscadWorker';

  private shapesMemory: Record<string, unknown[]> = {};
  private geometryAccessOrder: string[] = [];
  private get maxStoredGeometries() {
    // Keep last 5 geometries to prevent unbounded memory growth
    return 5;
  }

  public constructor() {
    super();
    registerKernelModules();
  }

  public override async initialize(onLog: Parameters<KernelWorker['initialize']>[0], options: Record<string, never>) {
    await super.initialize(onLog, options);
    this.debug('Initialized JSCAD worker with @jscad/modeling', { operation: 'initialize' });
  }

  public override async cleanup(): Promise<void> {
    // Clear all stored shapes to free memory
    this.shapesMemory = {};
    this.geometryAccessOrder = [];
    await super.cleanup();
  }

  public override async canHandle(file: GeometryFile): Promise<boolean> {
    const extension = KernelWorker.getFileExtension(file.filename);
    if (!['ts', 'js', 'tsx', 'jsx'].includes(extension)) {
      return false;
    }

    const code = KernelWorker.extractCodeFromFile(file);
    const hasEsmImport = /import\s+.*from\s+['"]@jscad\/modeling['"]/.test(code);
    const hasRequire = /require\s*\(\s*['"]@jscad\/modeling['"]\s*\)/.test(code);
    const hasNamespaceUsage = /\b@jscad\/modeling\b/.test(code);
    return hasEsmImport || hasRequire || hasNamespaceUsage;
  }

  /**
   * Extract parameter definitions from JSCAD code
   *
   * Analyzes JSCAD source code to extract user-configurable parameters. Supports both
   * ES Module and CommonJS formats. The function looks for either:
   * - getParameterDefinitions() export: Standard JSCAD pattern returning parameter array
   * - defaultParams export: Simplified pattern for basic parameter objects
   *
   * Parameter extraction flow:
   * 1. Detects code format (ES Module vs CommonJS)
   * 2. Executes code in sandboxed VM to access exports
   * 3. Extracts parameter definitions if present
   * 4. Converts to default values object and JSON Schema
   * 5. Returns both for UI generation and validation
   *
   * If no parameters are found, returns empty defaults with generated schema.
   * Errors during extraction are caught and returned as kernel errors.
   *
   * @param file - Geometry file containing JSCAD source code
   * @returns ExtractParametersResult containing:
   *          - defaultParameters: Object mapping parameter names to initial values
   *          - jsonSchema: JSON Schema object for validation and UI generation
   *          - Or kernel error if extraction fails
   *
   * @example
   * ```typescript
   * // ES Module format
   * export function getParameterDefinitions() {
   *   return [
   *     { name: 'width', caption: 'Width:', type: 'float', initial: 10 }
   *   ];
   * }
   *
   * // Or CommonJS format
   * module.exports.defaultParams = { width: 10 };
   * ```
   */
  public override async extractParameters(file: GeometryFile): Promise<ExtractParametersResult> {
    try {
      const code = KernelWorker.extractCodeFromFile(file);
      let defaultParameters: Record<string, unknown> = {};
      let jsonSchema;

      if (/^\s*export\s+/m.test(code)) {
        // ES Module format
        const module = await buildEsModule(code);

        // Check for getParameterDefinitions function (ES module export)
        if (isModuleWithParameters(module)) {
          if (typeof module.getParameterDefinitions === 'function') {
            const definitions = module.getParameterDefinitions();
            defaultParameters = convertParameterDefinitionsToDefaults(definitions);
            jsonSchema = convertParameterDefinitionsToJsonSchema(definitions);
          } else if (module.defaultParams && isRecordObject(module.defaultParams)) {
            defaultParameters = module.defaultParams;
            jsonSchema = await jsonSchemaFromJson(defaultParameters);
          } else {
            jsonSchema = await jsonSchemaFromJson(defaultParameters);
          }
        } else {
          jsonSchema = await jsonSchemaFromJson(defaultParameters);
        }
      } else {
        // CommonJS format - execute code to get module.exports
        const cjsResult = runInCjsContext<Record<string, unknown>, Record<string, unknown>>(code, {});

        // Check for getParameterDefinitions function
        if (isModuleWithParameters(cjsResult)) {
          if (typeof cjsResult.getParameterDefinitions === 'function') {
            const definitions = cjsResult.getParameterDefinitions();
            defaultParameters = convertParameterDefinitionsToDefaults(definitions);
            jsonSchema = convertParameterDefinitionsToJsonSchema(definitions);
          } else if (cjsResult.defaultParams && isRecordObject(cjsResult.defaultParams)) {
            defaultParameters = cjsResult.defaultParams;
            jsonSchema = await jsonSchemaFromJson(defaultParameters);
          } else {
            jsonSchema = await jsonSchemaFromJson(defaultParameters);
          }
        } else {
          jsonSchema = await jsonSchemaFromJson(defaultParameters);
        }
      }

      return createKernelSuccess({
        defaultParameters,
        jsonSchema,
      });
    } catch (error) {
      return createJscadKernelError(error, 'Failed to extract parameters');
    }
  }

  /**
   * Compute 3D geometry from JSCAD code
   *
   * Executes user-provided JSCAD code in a sandboxed VM with @jscad/modeling available,
   * then converts the resulting geometry to glTF format for 3D visualization.
   *
   * Execution flow:
   * 1. Detects code format (ES Module vs CommonJS)
   * 2. Executes code via runCode() with user parameters
   * 3. Stores raw JSCAD shapes in memory for potential export
   * 4. Converts each shape to glTF format via jscadToGltf()
   * 5. Returns geometries as an array of Geometry objects
   *
   * Performance is tracked at multiple levels:
   * - Code execution time (VM runtime)
   * - GLTF conversion time (mesh processing)
   * - Total operation time
   *
   * Shape failures are logged as warnings but don't stop the pipeline - only successfully
   * converted shapes are included in the result.
   *
   * @param file - Geometry file containing JSCAD source code
   * @param parameters - Object mapping parameter names to values for parametric designs
   * @param geometryId - Unique identifier to store computed shapes in memory (default: 'defaultGeometry')
   * @returns ComputeGeometryResult containing:
   *          - Array of Geometry objects with glTF blobs ready for rendering
   *          - Or kernel error if code execution fails
   *
   * @example
   * ```typescript
   * const file = { filename: 'box.js', content: '...' };
   * const params = { width: 10, height: 20 };
   * const result = await worker.computeGeometry(file, params);
   * // result is array of { format: 'gltf', gltfBlob: Blob }
   * ```
   */
  public override async computeGeometry(
    file: GeometryFile,
    parameters: Record<string, unknown> = {},
    geometryId = 'defaultGeometry',
  ): Promise<ComputeGeometryResult> {
    const startTime = performance.now();
    this.log('Computing JSCAD geometry from code', { operation: 'computeGeometry' });

    try {
      const code = KernelWorker.extractCodeFromFile(file);

      // Execute the user code with parameters
      let shapes: unknown;

      try {
        const runCodeStartTime = performance.now();
        shapes = await this.runCode(code, parameters);
        const runCodeEndTime = performance.now();
        this.log(`Kernel computation took ${runCodeEndTime - runCodeStartTime}ms`, { operation: 'computeGeometry' });
      } catch (error) {
        const endTime = performance.now();
        this.error(`Error occurred after ${endTime - startTime}ms`, {
          data: error,
          operation: 'computeGeometry',
        });
        return createJscadKernelError(error, 'Failed to execute JSCAD code');
      }

      // Store shapes in memory for export with LRU cleanup
      const shapesArray = Array.isArray(shapes) ? shapes : [shapes];
      this.storeShapesWithLruCleanup(geometryId, shapesArray.filter(Boolean));

      // Convert JSCAD geometry to GLTF for rendering
      if (shapesArray.length === 0) {
        return createKernelSuccess([]);
      }

      const gltfStartTime = performance.now();
      const geometries: Geometry[] = [];

      // Convert shapes sequentially
      const results = await Promise.allSettled(shapesArray.filter(Boolean).map(async (shape) => jscadToGltf(shape)));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          geometries.push({
            format: 'gltf',
            gltfBlob: result.value,
          });
        } else {
          this.warn('Failed to convert shape to GLTF', { data: result.reason, operation: 'computeGeometry' });
        }
      }

      const gltfEndTime = performance.now();
      this.log(`GLTF conversion took ${gltfEndTime - gltfStartTime}ms`, { operation: 'computeGeometry' });

      const endTime = performance.now();
      this.log(`Total computeGeometry took ${endTime - startTime}ms`, { operation: 'computeGeometry' });

      return createKernelSuccess(geometries);
    } catch (error) {
      return createJscadKernelError(error, 'Failed to compute JSCAD geometry');
    }
  }

  public override async exportGeometry(
    fileType: ExportFormat,
    geometryId = 'defaultGeometry',
  ): Promise<ExportGeometryResult> {
    try {
      // Check if geometry exists in memory
      const shapes = this.shapesMemory[geometryId];
      if (!shapes || shapes.length === 0) {
        return createKernelError({
          message: `Geometry ${geometryId} not computed yet. Please compute geometry before exporting.`,
          startLineNumber: 0,
          startColumn: 0,
          type: 'runtime',
        });
      }

      // Handle GLTF/GLB export by converting shapes to GLTF
      if (fileType === 'glb' || fileType === 'gltf') {
        const gltfBlobs = await Promise.all(shapes.map(async (shape) => jscadToGltf(shape)));

        // Merge all GLTF blobs into one (for simplicity, just return the first one)
        // In a more sophisticated implementation, you could merge multiple geometries
        const blob = gltfBlobs[0];
        if (!blob) {
          return createKernelError({
            message: 'Failed to generate GLTF from computed geometry',
            startLineNumber: 0,
            startColumn: 0,
            type: 'runtime',
          });
        }

        return createKernelSuccess([
          {
            blob,
            name: fileType === 'glb' ? 'model.glb' : 'model.gltf',
          },
        ]);
      }

      // STL and STL-binary formats are not yet implemented for JSCAD
      // This would require installing and using @jscad/stl-serializer
      return createKernelError({
        message: `Export format '${fileType}' is not yet implemented for JSCAD. Only 'glb' and 'gltf' formats are currently supported.`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      });
    } catch (error) {
      return createJscadKernelError(error, 'Failed to export JSCAD geometry');
    }
  }

  /**
   * Execute JSCAD code in a sandboxed VM with @jscad/modeling available
   *
   * Handles both ES Module and CommonJS code formats and extracts the geometry
   * by looking for either a `main` function or `default` export/value.
   *
   * Execution flow:
   * 1. Detects code format (ES Module vs CommonJS)
   * 2. Executes code in isolated VM context with @jscad/modeling injected
   * 3. Looks for entry point: main() function or default export
   * 4. Calls entry point with user parameters
   * 5. Returns the resulting JSCAD geometry object(s)
   *
   * For ES modules, priority is: main() > default() > default value
   * For CommonJS, priority is: main() function > entire module.exports
   *
   * @param code - JSCAD source code (string)
   * @param parameters - Object containing user parameter values to pass to main()
   * @returns Promise resolving to JSCAD geometry object(s)
   *          Can be single geom3, geom2, or array of geometries
   *          May also be undefined if code has no explicit return
   *
   * @throws Throws error if code execution fails (syntax errors, runtime errors)
   *         Errors are caught by callers and converted to kernel errors
   *
   * @internal This is a private method used internally by computeGeometry().
   */
  private async runCode(code: string, parameters: Record<string, unknown>): Promise<unknown> {
    if (/^\s*export\s+/m.test(code)) {
      // ES module format
      const module = await buildEsModule(code);

      if (isModuleWithEntryPoint(module)) {
        if (typeof module.main === 'function') {
          return module.main(parameters);
        }

        if (typeof module.default === 'function') {
          return module.default(parameters);
        }

        // Module doesn't match expected shape, return as-is
        return module;
      }
    }

    // CommonJS format - execute code to get module.exports
    const cjsResult = runInCjsContext<Record<string, unknown>, Record<string, unknown>>(code, {});

    // Check for main function in module.exports
    if (isModuleWithEntryPoint(cjsResult)) {
      if (typeof cjsResult.main === 'function') {
        return cjsResult.main(parameters);
      }

      if (typeof cjsResult.default === 'function') {
        return cjsResult.default(parameters);
      }
    }

    // If no main function, return the module.exports itself (might be the geometry)
    return cjsResult;
  }

  /**
   * Store shapes in memory with LRU-based cleanup to prevent unbounded memory growth
   *
   * Implements a Least Recently Used (LRU) cache strategy that:
   * - Tracks access order of geometry IDs
   * - Removes oldest geometries when maxStoredGeometries limit is exceeded
   * - Updates access order when existing geometry is recomputed
   *
   * This prevents memory leaks from accumulating shapes when multiple different
   * geometryId values are used over the worker's lifetime.
   *
   * @param geometryId - The unique identifier for this geometry
   * @param shapes - Array of JSCAD geometry objects to store
   *
   * @internal This is a private method used internally by computeGeometry().
   */
  private storeShapesWithLruCleanup(geometryId: string, shapes: unknown[]): void {
    // Update access order - remove if exists and add to end (most recent)
    const existingIndex = this.geometryAccessOrder.indexOf(geometryId);
    if (existingIndex !== -1) {
      this.geometryAccessOrder.splice(existingIndex, 1);
    }

    this.geometryAccessOrder.push(geometryId);

    // Store the shapes
    this.shapesMemory[geometryId] = shapes;

    // Remove oldest geometries if we exceed the limit
    while (this.geometryAccessOrder.length > this.maxStoredGeometries) {
      const oldestGeometryId = this.geometryAccessOrder.shift();
      if (oldestGeometryId) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- LRU cache cleanup
        delete this.shapesMemory[oldestGeometryId];
        this.debug(`Cleaned up old geometry from memory: ${oldestGeometryId}`, {
          operation: 'storeShapesWithLruCleanup',
        });
      }
    }
  }
}

const service = new JscadWorker();
expose(service);
export type JscadWorkerInterface = typeof service;
