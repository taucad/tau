import { expose } from 'comlink';
import * as jscadModeling from '@jscad/modeling';
import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryFile,
  Geometry,
} from '@taucad/types';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';
import { buildEsModule, runInCjsContext } from '#components/geometry/kernel/replicad/vm.js';
import { jscadToGltf } from '#components/geometry/kernel/jscad/jscad-to-gltf.js';
import { jsonSchemaFromJson } from '#utils/schema.utils.js';
import type { JscadParameterDefinition } from '#components/geometry/kernel/jscad/jscad.schema.js';
import {
  convertParameterDefinitionsToDefaults,
  convertParameterDefinitionsToJsonSchema,
} from '#components/geometry/kernel/jscad/jscad.schema.js';

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
  protected static override readonly supportedExportFormats: ExportFormat[] = ['stl', 'stl-binary', 'glb', 'gltf'];
  private shapesMemory: Record<string, unknown[]> = {};

  public constructor() {
    super();
    // Inject @jscad/modeling into global scope for VM access
    (globalThis as unknown as { jscadModeling: typeof jscadModeling }).jscadModeling = jscadModeling;
  }

  public override async initialize(onLog: Parameters<KernelWorker['initialize']>[0], options: Record<string, never>) {
    await super.initialize(onLog, options);
    this.debug('Initialized JSCAD worker with @jscad/modeling', { operation: 'initialize' });
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

  public override async extractParameters(file: GeometryFile): Promise<ExtractParametersResult> {
    try {
      const code = KernelWorker.extractCodeFromFile(file);
      let defaultParameters: Record<string, unknown> = {};
      let jsonSchema;

      if (/^\s*export\s+/m.test(code)) {
        // ES Module format
        const module = await buildEsModule(code);

        // Check for getParameterDefinitions function (ES module export)
        const moduleWithParameters = module as {
          getParameterDefinitions?: () => JscadParameterDefinition[];
          defaultParams?: Record<string, unknown>;
        };

        if (typeof moduleWithParameters.getParameterDefinitions === 'function') {
          const definitions = moduleWithParameters.getParameterDefinitions();
          defaultParameters = convertParameterDefinitionsToDefaults(definitions);
          jsonSchema = convertParameterDefinitionsToJsonSchema(definitions);
        } else if (moduleWithParameters.defaultParams) {
          defaultParameters = moduleWithParameters.defaultParams;
          jsonSchema = await jsonSchemaFromJson(defaultParameters);
        } else {
          jsonSchema = await jsonSchemaFromJson(defaultParameters);
        }
      } else {
        // CommonJS format - execute code to get module.exports
        const cjsResult = runInCjsContext<Record<string, unknown>, Record<string, unknown>>(code, {});

        // Check for getParameterDefinitions function
        const moduleExports = cjsResult as {
          getParameterDefinitions?: () => JscadParameterDefinition[];
          defaultParams?: Record<string, unknown>;
        };

        if (typeof moduleExports.getParameterDefinitions === 'function') {
          const definitions = moduleExports.getParameterDefinitions();
          defaultParameters = convertParameterDefinitionsToDefaults(definitions);
          jsonSchema = convertParameterDefinitionsToJsonSchema(definitions);
        } else if ('defaultParams' in cjsResult) {
          // Check for defaultParams export
          defaultParameters = cjsResult['defaultParams'] as Record<string, unknown>;
          jsonSchema = await jsonSchemaFromJson(defaultParameters);
        } else {
          jsonSchema = await jsonSchemaFromJson(defaultParameters);
        }
      }

      return createKernelSuccess({
        defaultParameters,
        jsonSchema,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract parameters';
      return createKernelError({
        message,
        startLineNumber: 0,
        startColumn: 0,
        stack: error instanceof Error ? error.stack : undefined,
        type: 'runtime',
      });
    }
  }

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
        const message = error instanceof Error ? error.message : 'Failed to execute JSCAD code';
        return createKernelError({
          message,
          startLineNumber: 0,
          startColumn: 0,
          type: 'runtime',
        });
      }

      // Store shapes in memory for export
      const shapesArray = Array.isArray(shapes) ? shapes : [shapes];
      this.shapesMemory[geometryId] = shapesArray.filter(Boolean);

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
      const message = error instanceof Error ? error.message : 'Failed to compute JSCAD geometry';
      return createKernelError({
        message,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      });
    }
  }

  public override async exportGeometry(_fileType: ExportFormat): Promise<ExportGeometryResult> {
    // With no computed geometry in memory, exporting cannot proceed.
    return createKernelError({
      message: 'No geometry available to export. Compute geometry first.',
      startLineNumber: 0,
      startColumn: 0,
      type: 'runtime',
    });
  }

  /**
   * Run user code in the VM with @jscad/modeling injected
   */
  private async runCode(code: string, parameters: Record<string, unknown>): Promise<unknown> {
    if (/^\s*export\s+/m.test(code)) {
      // ES module format
      const module = await buildEsModule(code);
      const moduleWithMethods = module as { main?: (p: unknown) => unknown; default?: unknown };
      if (typeof moduleWithMethods.main === 'function') {
        return moduleWithMethods.main(parameters);
      }

      if (typeof moduleWithMethods.default === 'function') {
        return (moduleWithMethods.default as (p: unknown) => unknown)(parameters);
      }

      return moduleWithMethods.default ?? moduleWithMethods.main;
    }

    // CommonJS format - execute code to get module.exports
    const cjsResult = runInCjsContext<Record<string, unknown>, Record<string, unknown>>(code, {});

    // Check for main function in module.exports
    const moduleExports = cjsResult as {
      main?: (p: unknown) => unknown;
      default?: unknown;
    };

    if (typeof moduleExports.main === 'function') {
      return moduleExports.main(parameters);
    }

    // If no main function, return the module.exports itself (might be the geometry)
    return moduleExports;
  }
}

const service = new JscadWorker();
expose(service);
export type JscadWorkerInterface = typeof service;
