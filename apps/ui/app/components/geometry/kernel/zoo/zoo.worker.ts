import { expose } from 'comlink';
import type {
  ComputeGeometryResult,
  ExportFormat,
  ExportGeometryResult,
  ExtractParametersResult,
  GeometryGltf,
  GeometryFile,
} from '@taucad/types';
import { createKernelError, createKernelSuccess } from '#components/geometry/kernel/utils/kernel-helpers.js';
import { KclUtils } from '#components/geometry/kernel/zoo/kcl-utils.js';
import { isKclError, extractExecutionError } from '#components/geometry/kernel/zoo/kcl-errors.js';
import { convertKclErrorToKernelError, mapErrorToKclError } from '#components/geometry/kernel/zoo/error-mappers.js';
import { getErrorPosition } from '#components/geometry/kernel/zoo/source-range-utils.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';

type ZooOptions = {
  apiKey: string;
};

class ZooWorker extends KernelWorker<ZooOptions> {
  protected static override readonly supportedExportFormats: ExportFormat[] = ['stl', 'stl-binary', 'step', 'gltf'];
  private gltfDataMemory: Record<string, Uint8Array> = {};
  private kclUtils: KclUtils | undefined;

  public override async canHandle(file: GeometryFile): Promise<boolean> {
    const extension = KernelWorker.getFileExtension(file.filename);
    return extension === 'kcl';
  }

  public override async extractParameters(file: GeometryFile): Promise<ExtractParametersResult> {
    const code = KernelWorker.extractCodeFromFile(file);
    try {
      const utils = await this.getKclUtils();
      const parseResult = await utils.parseKcl(code);
      if (parseResult.errors.length > 0) {
        this.warn('KCL parsing errors during parameter extraction', { data: parseResult.errors });
        const firstError = parseResult.errors[0]!;
        const errorPosition = getErrorPosition(firstError, code);
        return createKernelError({
          message: firstError.message,
          startColumn: errorPosition.column,
          startLineNumber: errorPosition.line,
        });
      }

      const executionResult = await utils.executeMockKcl(parseResult.program, 'main.kcl');
      if (executionResult.errors.length > 0) {
        this.warn('KCL execution errors during parameter extraction', { data: executionResult.errors });
        const errorInfo = extractExecutionError(
          executionResult.errors,
          code,
          'KCL execution errors during parameter extraction',
        );
        return createKernelError({
          message: errorInfo.message,
          startColumn: errorInfo.startColumn,
          startLineNumber: errorInfo.startLineNumber,
        });
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

  public override async computeGeometry(
    file: GeometryFile,
    parameters?: Record<string, unknown>,
    geometryId = 'defaultGeometry',
  ): Promise<ComputeGeometryResult> {
    const code = KernelWorker.extractCodeFromFile(file);
    try {
      const trimmedCode = code.trim();
      if (trimmedCode === '') {
        return createKernelSuccess([]);
      }

      try {
        const utils = await this.getKclUtilsWithEngine();
        await utils.clearProgram();
        const parseResult = await utils.parseKcl(trimmedCode);
        if (parseResult.errors.length > 0) {
          this.warn('KCL parsing errors', { data: parseResult.errors });
          const firstError = parseResult.errors[0]!;
          const errorPosition = getErrorPosition(firstError, trimmedCode);
          const errorMessages = parseResult.errors.map((error) => error.message);
          return createKernelError({
            message: `KCL parsing failed: ${errorMessages.join(', ')}`,
            startColumn: errorPosition.column,
            startLineNumber: errorPosition.line,
          });
        }

        const modifiedProgram = KclUtils.injectParametersIntoProgram(parseResult.program, parameters ?? {});
        const executionResult = await utils.executeProgram(modifiedProgram, 'main.kcl');
        if (executionResult.errors.length > 0) {
          this.warn('KCL execution errors', { data: executionResult.errors });
          const errorInfo = extractExecutionError(executionResult.errors, trimmedCode, 'KCL execution failed');
          return createKernelError({
            message: errorInfo.message,
            startColumn: errorInfo.startColumn,
            startLineNumber: errorInfo.startLineNumber,
          });
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
            message: 'No STL file in export result',
            startColumn: 0,
            startLineNumber: 0,
          });
        }

        this.gltfDataMemory[geometryId] = gltf.contents;
        const arrayBuffer = new ArrayBuffer(gltf.contents.byteLength);
        const view = new Uint8Array(arrayBuffer);
        view.set(gltf.contents);
        const geometry: GeometryGltf = {
          type: 'gltf',
          gltfBlob: new Blob([gltf.contents]),
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

  public override async exportGeometry(
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

  public override async cleanup(): Promise<void> {
    await this.kclUtils?.cleanup();
    this.kclUtils = undefined;
    this.gltfDataMemory = {};
  }

  private handleError(error: unknown, code?: string): ReturnType<typeof createKernelError> {
    if (isKclError(error)) {
      return convertKclErrorToKernelError(error, code);
    }

    const mappedError = mapErrorToKclError(error);
    return convertKclErrorToKernelError(mappedError, code);
  }

  private async getKclUtilsInstance(): Promise<KclUtils> {
    this.kclUtils ??= new KclUtils({ apiKey: this.options.apiKey });
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
