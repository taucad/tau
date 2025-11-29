import { expose } from 'comlink';
import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryGltf,
} from '@taucad/types';
import type { CompilationError } from '@taucad/kcl-wasm-lib/bindings/CompilationError';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { KclUtils } from '#components/geometry/kernel/zoo/kcl-utils.js';
import { isKclError, extractExecutionError } from '#components/geometry/kernel/zoo/kcl-errors.js';
import { convertKclErrorToKernelError, mapErrorToKclError } from '#components/geometry/kernel/zoo/error-mappers.js';
import { getErrorPosition } from '#components/geometry/kernel/zoo/source-range-utils.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';
import { FileSystemManager } from '#components/geometry/kernel/zoo/filesystem-manager.js';

type ZooOptions = {
  apiKey: string;
};

class ZooWorker extends KernelWorker<ZooOptions> {
  protected static override readonly supportedExportFormats: ExportFormat[] = [
    'stl',
    'stl-binary',
    'step',
    'gltf',
    'glb',
  ];

  protected override readonly name: string = 'ZooWorker';
  private gltfDataMemory: Record<string, Uint8Array> = {};
  private kclUtils: KclUtils | undefined;
  private fileSystemManager!: FileSystemManager;

  protected override async initialize(): Promise<void> {
    this.fileSystemManager = new FileSystemManager(this.fileReader);
  }

  protected override async cleanup(): Promise<void> {
    await this.kclUtils?.cleanup();
    this.kclUtils = undefined;
    this.gltfDataMemory = {};
  }

  protected override async canHandle(_filename: string, extension: string): Promise<boolean> {
    return extension === 'kcl';
  }

  protected override async extractParameters(filename: string): Promise<ExtractParametersResult> {
    const code = await this.readFile(filename, 'utf8');
    try {
      const utils = await this.getKclUtils();
      const parseResult = await utils.parseKcl(code);
      const criticalErrors = this.filterNonWarningErrors(parseResult.errors);
      if (criticalErrors.length > 0) {
        this.warn('KCL parsing errors during parameter extraction', { data: criticalErrors });
        const firstError = criticalErrors[0]!;
        const errorPosition = getErrorPosition(firstError, code);
        return createKernelError({
          message: firstError.message,
          startColumn: errorPosition.column,
          startLineNumber: errorPosition.line,
        });
      }

      // Log warnings separately for diagnostics
      const warnings = parseResult.errors.filter((error) => error.severity === 'Warning');
      if (warnings.length > 0) {
        this.warn('KCL parsing warnings during parameter extraction', { data: warnings });
      }

      const executionResult = await utils.executeMockKcl(parseResult.program, 'main.kcl');
      const criticalExecutionErrors = this.filterNonWarningErrors(executionResult.errors);
      if (criticalExecutionErrors.length > 0) {
        this.warn('KCL execution errors during parameter extraction', { data: criticalExecutionErrors });
        const errorInfo = extractExecutionError(
          criticalExecutionErrors,
          code,
          'KCL execution errors during parameter extraction',
        );
        return createKernelError({
          message: errorInfo.message,
          startColumn: errorInfo.startColumn,
          startLineNumber: errorInfo.startLineNumber,
        });
      }

      // Log warnings separately for diagnostics
      const executionWarnings = executionResult.errors.filter((error) => error.severity === 'Warning');
      if (executionWarnings.length > 0) {
        this.warn('KCL execution warnings during parameter extraction', { data: executionWarnings });
      }

      const { defaultParameters, jsonSchema } = KclUtils.convertKclVariablesToJsonSchema(executionResult.variables);
      return createKernelSuccess({
        defaultParameters,
        jsonSchema,
      });
    } catch (error) {
      const kclError = this.handleError(error, code);
      this.error(kclError.error.message, { operation: 'extractParameters' });
      return kclError;
    }
  }

  protected override async computeGeometry(
    filename: string,
    parameters?: Record<string, unknown>,
    geometryId = 'defaultGeometry',
  ): Promise<ComputeGeometryResult> {
    const code = await this.readFile(filename, 'utf8');
    try {
      const trimmedCode = code.trim();
      if (trimmedCode === '') {
        return createKernelSuccess([]);
      }

      try {
        const utils = await this.getKclUtilsWithEngine();
        await utils.clearProgram();
        const parseResult = await utils.parseKcl(trimmedCode);
        const criticalParseErrors = this.filterNonWarningErrors(parseResult.errors);
        if (criticalParseErrors.length > 0) {
          this.warn('KCL parsing errors', { data: criticalParseErrors });
          const firstError = criticalParseErrors[0]!;
          const errorPosition = getErrorPosition(firstError, trimmedCode);
          const errorMessages = criticalParseErrors.map((error) => error.message);
          return createKernelError({
            message: `KCL parsing failed: ${errorMessages.join(', ')}`,
            startColumn: errorPosition.column,
            startLineNumber: errorPosition.line,
          });
        }

        // Log warnings separately for diagnostics
        const parseWarnings = parseResult.errors.filter((error) => error.severity === 'Warning');
        if (parseWarnings.length > 0) {
          this.warn('KCL parsing warnings', { data: parseWarnings });
        }

        const modifiedProgram = KclUtils.injectParametersIntoProgram(parseResult.program, parameters ?? {});
        const executionResult = await utils.executeProgram(modifiedProgram, 'main.kcl');
        const criticalExecutionErrors = this.filterNonWarningErrors(executionResult.errors);
        if (criticalExecutionErrors.length > 0) {
          this.warn('KCL execution errors', { data: criticalExecutionErrors });
          const errorInfo = extractExecutionError(criticalExecutionErrors, trimmedCode, 'KCL execution failed');
          return createKernelError({
            message: errorInfo.message,
            startColumn: errorInfo.startColumn,
            startLineNumber: errorInfo.startLineNumber,
          });
        }

        // Log warnings separately for diagnostics
        const executionWarnings = executionResult.errors.filter((error) => error.severity === 'Warning');
        if (executionWarnings.length > 0) {
          this.warn('KCL execution warnings', { data: executionWarnings });
        }

        const exportResult = await utils.exportFromMemory({
          type: 'gltf',
          storage: 'embedded',
          presentation: 'pretty',
        });
        if (exportResult.length === 0) {
          return createKernelSuccess([]);
        }

        const gltf = exportResult[0];
        if (!gltf) {
          return createKernelError({
            message: 'No GLTF file in export result',
            startColumn: 0,
            startLineNumber: 0,
          });
        }

        this.gltfDataMemory[geometryId] = gltf.contents;
        const geometry: GeometryGltf = {
          format: 'gltf',
          content: gltf.contents,
        };
        return createKernelSuccess([geometry]);
      } catch (error) {
        const kclError = this.handleError(error, code);
        this.error(kclError.error.message, { operation: 'computeGeometry' });
        return kclError;
      }
    } catch (error) {
      const kclError = this.handleError(error, code);
      this.error(kclError.error.message, { operation: 'computeGeometry' });
      return kclError;
    }
  }

  // eslint-disable-next-line complexity -- refactor to remove common boilerplate.
  protected override async exportGeometry(
    fileType: ExportFormat,
    geometryId = 'defaultGeometry',
  ): Promise<ExportGeometryResult> {
    try {
      const gltfData = this.gltfDataMemory[geometryId];
      if (!gltfData) {
        return createKernelError({
          message: `Geometry ${geometryId} not computed yet. Please build geometries before exporting.`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      switch (fileType) {
        case 'stl':
        case 'stl-binary': {
          try {
            const utils = await this.getKclUtilsWithEngine();
            const stlResult = await utils.exportFromMemory({
              type: 'stl',
              storage: fileType === 'stl-binary' ? 'binary' : 'ascii',
              units: 'mm',
            });
            if (stlResult.length === 0) {
              return createKernelError({
                message: 'No STL data received from KCL export',
                startColumn: 0,
                startLineNumber: 0,
              });
            }

            const stlFile = stlResult[0];
            if (!stlFile) {
              return createKernelError({
                message: 'No STL file in export result',
                startColumn: 0,
                startLineNumber: 0,
              });
            }

            const blob = new Blob([stlFile.contents], {
              type: fileType === 'stl-binary' ? 'application/octet-stream' : 'text/plain',
            });
            return createKernelSuccess([
              {
                blob,
                name: 'model.stl',
              },
            ]);
          } catch (error) {
            const kclError = this.handleError(error);
            this.error(kclError.error.message, { operation: 'exportGeometry' });
            return kclError;
          }
        }

        case 'step': {
          try {
            const utils = await this.getKclUtilsWithEngine();
            const stepResult = await utils.exportFromMemory({
              type: 'step',
            });
            if (stepResult.length === 0) {
              return createKernelError({
                message: 'No STEP data received from KCL export',
                startColumn: 0,
                startLineNumber: 0,
              });
            }

            const stepFile = stepResult[0];
            if (!stepFile) {
              return createKernelError({
                message: 'No STEP file in export result',
                startColumn: 0,
                startLineNumber: 0,
              });
            }

            const blob = new Blob([stepFile.contents], {
              type: 'application/step',
            });
            return createKernelSuccess([
              {
                blob,
                name: 'model.step',
              },
            ]);
          } catch (error) {
            const kclError = this.handleError(error);
            this.error(kclError.error.message, { operation: 'exportGeometry' });
            return kclError;
          }
        }

        case 'glb': {
          try {
            const utils = await this.getKclUtilsWithEngine();
            const glbResult = await utils.exportFromMemory({
              type: 'gltf',
              storage: 'embedded',
              presentation: 'pretty',
            });
            if (glbResult.length === 0) {
              return createKernelError({
                message: 'No GLB data received from KCL export',
                startColumn: 0,
                startLineNumber: 0,
              });
            }

            const glbFile = glbResult[0];
            if (!glbFile) {
              return createKernelError({
                message: 'No GLB file in export result',
                startColumn: 0,
                startLineNumber: 0,
              });
            }

            const blob = new Blob([glbFile.contents], {
              type: 'model/gltf-binary',
            });
            return createKernelSuccess([
              {
                blob,
                name: 'model.glb',
              },
            ]);
          } catch (error) {
            const kclError = this.handleError(error);
            this.error(kclError.error.message, { operation: 'exportGeometry' });
            return kclError;
          }
        }

        case 'gltf': {
          try {
            const blob = new Blob([gltfData], {
              type: 'model/gltf-json',
            });
            return createKernelSuccess([
              {
                blob,
                name: 'model.gltf',
              },
            ]);
          } catch (error) {
            const kclError = this.handleError(error);
            this.error(kclError.error.message, { operation: 'exportGeometry' });
            return kclError;
          }
        }

        default: {
          return createKernelError({
            message: `Unsupported export format: ${fileType}`,
            startColumn: 0,
            startLineNumber: 0,
          });
        }
      }
    } catch (error) {
      const kclError = this.handleError(error);
      this.error(kclError.error.message, { operation: 'exportGeometry' });
      return kclError;
    }
  }

  /**
   * Filters errors to only include Error and Fatal severities, excluding Warnings
   */
  private filterNonWarningErrors(errors: CompilationError[]): CompilationError[] {
    return errors.filter((error) => error.severity === 'Error' || error.severity === 'Fatal');
  }

  private handleError(error: unknown, code?: string): ReturnType<typeof createKernelError> {
    if (isKclError(error)) {
      return convertKclErrorToKernelError(error, code);
    }

    const mappedError = mapErrorToKclError(error);
    return convertKclErrorToKernelError(mappedError, code);
  }

  private async getKclUtilsInstance(): Promise<KclUtils> {
    this.kclUtils ??= new KclUtils({
      apiKey: this.options.apiKey,
      fileSystemManager: this.fileSystemManager,
    });
    return this.kclUtils;
  }

  private async getKclUtils(): Promise<KclUtils> {
    const utils = await this.getKclUtilsInstance();
    await utils.initializeWasm();
    return utils;
  }

  private async getKclUtilsWithEngine(): Promise<KclUtils> {
    const utils = await this.getKclUtilsInstance();
    await utils.initializeEngine();
    return utils;
  }
}

const service = new ZooWorker();
expose(service);
export type ZooBuilderInterface = typeof service;
