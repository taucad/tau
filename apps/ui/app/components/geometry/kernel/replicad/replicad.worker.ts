import { expose } from 'comlink';
import * as replicad from 'replicad';
import * as zod from 'zod/v4';
import ErrorStackParser from 'error-stack-parser';
import type { OpenCascadeInstance as OpenCascadeInstanceWithExceptions } from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type {
  ComputeGeometryResult,
  KernelStackFrame,
  ExportGeometryResult,
  ExtractParametersResult,
  KernelError,
  ExtractNameResult,
  ExportFormat,
} from '#types/kernel.types.js';
import { createKernelSuccess, createKernelError, isKernelError } from '#types/kernel.types.js';
import {
  initOpenCascade,
  initOpenCascadeWithExceptions,
} from '#components/geometry/kernel/replicad/init-open-cascade.js';
import { runInCjsContext, buildEsModule } from '#components/geometry/kernel/replicad/vm.js';
import { renderOutput, ShapeStandardizer } from '#components/geometry/kernel/replicad/utils/render-output.js';
import { convertReplicadShapesToGltf } from '#components/geometry/kernel/replicad/utils/replicad-to-gltf.js';
import { jsonSchemaFromJson } from '#utils/schema.js';
import type { MainResultShapes, ShapeConfig } from '#components/geometry/kernel/replicad/utils/render-output.js';
import type { GeometryGltf, Geometry3D, Geometry2D } from '#types/cad.types.js';
import type { OnWorkerLog } from '#types/console.types.js';
import { KernelWorker } from '#components/geometry/kernel/utils/kernel-worker.js';

type ReplicadOptions = {
  /**
   * Whether to use OpenCascade with exceptions. Enabling this will set the OpenCascade
   * instance to use the OpenCascadeWithExceptions class, which has an error extraction
   * API for detailed error information.
   *
   * Enabling this will increase the initialization time of the OpenCascade instance,
   * and will also increase rendering time.
   *
   * This should only be enabled if you need to debug OpenCascade errors, usually
   * when designing CAD parts.
   *
   * @default false
   */
  withExceptions: boolean;
};

class ReplicadWorker extends KernelWorker<ReplicadOptions> {
  protected static override readonly supportedExportFormats: ExportFormat[] = [
    'stl',
    'stl-binary',
    'step',
    'step-assembly',
    'glb',
    'gltf',
  ];

  private replicadHasOc = false;
  private shapesMemory: Record<string, ShapeConfig[]> = {};
  private readonly ocVersions: {
    withExceptions: Promise<OpenCascadeInstanceWithExceptions> | undefined;
    single: Promise<OpenCascadeInstance> | undefined;
    current: 'single' | 'withExceptions';
  } = {
    withExceptions: undefined,
    single: undefined,
    current: 'single',
  };

  private oc: Promise<OpenCascadeInstance | OpenCascadeInstanceWithExceptions> | undefined;
  private isInitializing = false;

  public constructor() {
    super();
    (globalThis as unknown as { replicad: typeof replicad }).replicad = replicad;
    (globalThis as unknown as { zod: typeof zod }).zod = zod;
  }

  public override async initialize(
    onLog: OnWorkerLog,
    options: ReplicadOptions = {} as ReplicadOptions,
  ): Promise<void> {
    await super.initialize(onLog, options);
    const { withExceptions } = this.options;
    const startTime = performance.now();
    const oc = await this.initializeOpenCascadeInstance(withExceptions);
    const ocEndTime = performance.now();
    this.debug(`OpenCascade initialization took ${ocEndTime - startTime}ms`);

    if (!this.replicadHasOc) {
      this.debug('Setting OC in replicad');
      replicad.setOC(oc);
      this.replicadHasOc = true;
    }
  }

  public override async extractParameters(code: string): Promise<ExtractParametersResult> {
    try {
      let defaultParameters: Record<string, unknown> = {};

      if (/^\s*export\s+/m.test(code)) {
        const module = await buildEsModule(code);
        defaultParameters = module.defaultParams ?? {};
      } else {
        const editedText = `
${code}
try {
  return defaultParams;
} catch (e) {
  return undefined;
}
      `;

        try {
          const result = await runInCjsContext(editedText, {});
          defaultParameters = (result ?? {}) as Record<string, unknown>;
        } catch {
          defaultParameters = {};
        }
      }

      const jsonSchema = await jsonSchemaFromJson(defaultParameters);

      return createKernelSuccess({
        defaultParameters,
        jsonSchema,
      });
    } catch (error) {
      const kernelError = await this.formatKernelError(error);
      return createKernelError({
        message: kernelError.message,
        startLineNumber: kernelError.startLineNumber,
        startColumn: kernelError.startColumn,
        stack: kernelError.stack,
        stackFrames: kernelError.stackFrames,
        type: kernelError.type,
      });
    }
  }

  public async extractDefaultNameFromCode(code: string): Promise<ExtractNameResult> {
    if (/^\s*export\s+/m.test(code)) {
      const module = await buildEsModule(code);
      return createKernelSuccess(module.defaultName ?? undefined);
    }

    const editedText = `
${code}
try {
  return defaultName;
} catch (e) {
  return;
}
  `;

    try {
      const result = await runInCjsContext(editedText, {});
      return createKernelSuccess((result ?? {}) as string | undefined);
    } catch {
      return createKernelError({
        message: 'Failed to extract default name from code',
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      });
    }
  }

  public override async computeGeometry(
    code: string,
    parameters: Record<string, unknown>,
  ): Promise<ComputeGeometryResult> {
    const startTime = performance.now();
    this.log('Computing geometry from code', { operation: 'computeGeometry' });

    try {
      // Ensure font is loaded
      // TODO: Review font loading
      // if (!replicad.getFont()) {
      //   await replicad.loadFont('/fonts/HKGrotesk-Regular.ttf');
      // }

      let shapes: MainResultShapes;
      let defaultName: string | undefined;
      const standardizer = new ShapeStandardizer();

      try {
        const runCodeStartTime = performance.now();
        shapes = ((await this.runCode(code, parameters)) ?? []) as MainResultShapes;
        const runCodeEndTime = performance.now();
        this.log(`Code execution took ${runCodeEndTime - runCodeStartTime}ms`, { operation: 'computeGeometry' });

        const defaultNameResult = await this.extractDefaultNameFromCode(code);
        defaultName = isKernelError(defaultNameResult) ? undefined : defaultNameResult.data;
      } catch (error) {
        const endTime = performance.now();
        this.error(`Error occurred after ${endTime - startTime}ms`, {
          data: error,
          operation: 'computeGeometry',
        });
        return {
          success: false,
          error: await this.formatKernelError(error),
        };
      }

      const renderStartTime = performance.now();
      const renderedShapes = renderOutput(
        shapes,
        standardizer,
        (shapesArray) => {
          this.shapesMemory['defaultShape'] = shapesArray;
          return shapesArray;
        },
        defaultName,
      );
      const renderEndTime = performance.now();
      this.log(`Render output took ${renderEndTime - renderStartTime}ms`, { operation: 'computeGeometry' });

      const gltfStartTime = performance.now();
      const shapes3d = renderedShapes.filter((shape): shape is Geometry3D => shape.type === '3d');
      const shapes2d = renderedShapes.filter((shape): shape is Geometry2D => shape.type === '2d');

      if (shapes3d.length === 0 && shapes2d.length === 0) {
        return createKernelSuccess([]);
      }

      const gltfShapes = [];
      if (shapes3d.length > 0) {
        const gltfBlob = await convertReplicadShapesToGltf(shapes3d, 'glb');
        const gltfEndTime = performance.now();
        this.log(`GLTF conversion took ${gltfEndTime - gltfStartTime}ms`, {
          operation: 'computeGeometry',
        });

        const shapeGltf: GeometryGltf = {
          type: 'gltf',
          name: defaultName ?? 'Shape',
          gltfBlob,
        };
        gltfShapes.push(shapeGltf);
      }

      const totalTime = performance.now() - startTime;
      this.log(`Total computeGeometry time: ${totalTime}ms`, { operation: 'computeGeometry' });

      return {
        success: true,
        data: [...gltfShapes, ...shapes2d],
      };
    } catch (error) {
      this.error('Error in computeGeometry', { data: error, operation: 'computeGeometry' });
      return {
        success: false,
        error: await this.formatKernelError(error),
      };
    }
  }

  public override async exportGeometry(
    fileType: ExportFormat,
    shapeId = 'defaultShape',
    meshConfig?: {
      /** The mesh tolerance in millimeters for linear distances. */
      linearTolerance: number;
      /** The mesh tolerance in degrees for angular distances. */
      angularTolerance: number;
    },
  ): Promise<ExportGeometryResult> {
    const config = meshConfig ?? { linearTolerance: 0.01, angularTolerance: 30 };
    try {
      if (!this.shapesMemory[shapeId]) {
        return createKernelError({
          message: `Shape ${shapeId} not computed yet`,
          startLineNumber: 0,
          startColumn: 0,
          type: 'runtime',
        });
      }

      if (fileType === 'glb' || fileType === 'gltf') {
        const temporaryShapes = this.shapesMemory[shapeId].map((shapeConfig) => {
          const { shape } = shapeConfig;
          const faces = shape.mesh({
            tolerance: config.linearTolerance,
            angularTolerance: config.angularTolerance,
          });

          return {
            type: '3d' as const,
            name: shapeConfig.name ?? 'Shape',
            color: (shapeConfig as { color?: string }).color,
            opacity: (shapeConfig as { opacity?: number }).opacity,
            faces,
            edges: {
              lines: [],
              edgeGroups: [],
            },
          } satisfies Geometry3D;
        });

        const gltfBlob = await convertReplicadShapesToGltf(temporaryShapes, fileType);
        return createKernelSuccess([
          {
            blob: gltfBlob,
            name: fileType === 'glb' ? 'model.glb' : 'model.gltf',
          },
        ]);
      }

      if (fileType === 'step-assembly') {
        const result = [
          {
            blob: replicad.exportSTEP(this.shapesMemory[shapeId]),
            name: shapeId,
          },
        ];
        return createKernelSuccess(result);
      }

      const result = this.shapesMemory[shapeId].map(({ shape, name }) => ({
        blob: this.buildBlob(shape, fileType, {
          tolerance: config.linearTolerance,
          angularTolerance: config.angularTolerance,
        }),
        name: name ?? 'Shape',
      }));
      return createKernelSuccess(result);
    } catch (error) {
      const kernelError = await this.formatKernelError(error);
      return createKernelError({
        message: kernelError.message,
        startLineNumber: kernelError.startLineNumber,
        startColumn: kernelError.startColumn,
        stack: kernelError.stack,
        stackFrames: kernelError.stackFrames,
        type: kernelError.type,
      });
    }
  }

  private runInContextAsOc(code: string, context: Record<string, unknown> = {}): unknown {
    const editedText = `
${code}
let dp = {}
try {
  dp = defaultParams;
} catch (e) {}
return main(replicad, __inputParams || dp)
  `;

    return runInCjsContext(editedText, context);
  }

  private async runAsFunction(code: string, parameters: Record<string, unknown>): Promise<unknown> {
    const contextCode = `
    ${code}
    return main(replicad, __inputParams || {});
  `;

    return this.runInContextAsOc(contextCode, { __inputParams: parameters });
  }

  private async runAsModule(code: string, parameters: Record<string, unknown>): Promise<unknown> {
    const startTime = performance.now();
    const module = await buildEsModule(code);
    const buildTime = performance.now();
    this.log(`Module building took ${buildTime - startTime}ms`, { operation: 'runAsModule' });

    const execStartTime = performance.now();
    const result = module.default ? module.default(parameters) : module.main?.(replicad, parameters);
    const execEndTime = performance.now();
    this.log(`Module execution took ${execEndTime - execStartTime}ms`, { operation: 'runAsModule' });

    return result;
  }

  private async runCode(code: string, parameters: Record<string, unknown>): Promise<unknown> {
    this.log('Starting runCode evaluation', { operation: 'runCode' });
    const startTime = performance.now();

    let result;
    if (/^\s*export\s+/m.test(code)) {
      this.log('Starting runAsModule', { operation: 'runCode' });
      result = await this.runAsModule(code, parameters);
    } else {
      this.log('Starting runAsFunction', { operation: 'runCode' });
      result = await this.runAsFunction(code, parameters);
    }

    const endTime = performance.now();
    this.log(`Total runCode execution took ${endTime - startTime}ms`, { operation: 'runCode' });
    return result;
  }

  private async initializeOpenCascadeInstance(withExceptions: boolean): Promise<OpenCascadeInstance> {
    if (this.isInitializing) {
      this.debug('Already initializing OpenCascade, returning existing promise', {
        operation: 'initializeOpenCascadeInstance',
      });
      if (!this.oc) {
        throw new Error('OpenCascade initialization in progress but oc is undefined');
      }

      return this.oc;
    }

    this.isInitializing = true;
    const startTime = performance.now();

    try {
      this.ocVersions.current = withExceptions ? 'withExceptions' : 'single';

      if (withExceptions) {
        if (!this.ocVersions.withExceptions) {
          this.debug('Initializing OpenCascade with exceptions', { operation: 'initializeOpenCascadeInstance' });
          this.ocVersions.withExceptions = initOpenCascadeWithExceptions();
        }

        this.oc = this.ocVersions.withExceptions;
      } else {
        if (!this.ocVersions.single) {
          this.debug('Initializing OpenCascade without exceptions', { operation: 'initializeOpenCascadeInstance' });
          this.ocVersions.single = initOpenCascade();
        }

        this.oc = this.ocVersions.single;
      }

      const result = await this.oc;
      const endTime = performance.now();
      this.debug(`OpenCascade initialized successfully in ${endTime - startTime}ms`, {
        operation: 'initializeOpenCascadeInstance',
      });
      return result;
    } catch (error) {
      this.error('Failed to initialize OpenCascade', { data: error, operation: 'initializeOpenCascadeInstance' });
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private formatException(
    oc: OpenCascadeInstanceWithExceptions,
    error: unknown,
  ): { error: boolean; message: string; stack?: string } {
    let message = 'error';

    if (typeof error === 'number') {
      const errorData = oc.OCJS.getStandard_FailureData(error);
      // eslint-disable-next-line new-cap -- this is a C++ method
      message = errorData.GetMessageString();
    } else {
      message = error instanceof Error ? error.message : 'Unknown error';
      this.error('Error in formatException', { data: error, operation: 'formatException' });
    }

    return {
      error: true,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    };
  }

  private async formatKernelError(error: unknown): Promise<KernelError> {
    this.debug('Formatting kernel error', { data: error, operation: 'formatKernelError' });
    let message = 'Unknown error occurred';
    let stack: string | undefined;
    let kernelStackFrames: KernelStackFrame[] = [];
    let startLineNumber = 0;
    let startColumn = 0;
    let type: 'compilation' | 'runtime' | 'kernel' | 'unknown' = 'unknown';

    if (typeof error === 'number') {
      try {
        const ocInstance = await this.oc;
        if (ocInstance) {
          const exceptionResult = this.formatException(ocInstance as OpenCascadeInstanceWithExceptions, error);
          message = exceptionResult.message;
          type = 'kernel';
        } else {
          message = `Kernel error ${error}`;
          type = 'kernel';
        }
      } catch (ocError) {
        this.warn('Failed to format OpenCascade exception', { data: ocError, operation: 'formatKernelError' });
        message = `Kernel error ${error}`;
        type = 'kernel';
      }
    } else if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
      type = 'runtime';

      try {
        const stackFrames = ErrorStackParser.parse(error);

        kernelStackFrames = stackFrames.map((frame) => ({
          fileName: frame.fileName,
          functionName: frame.functionName,
          lineNumber: frame.lineNumber,
          columnNumber: frame.columnNumber,
          source: frame.source,
        }));

        const userFrame = stackFrames.find((frame) => frame.functionName === 'Module.main') ?? stackFrames[0];

        startLineNumber = userFrame?.lineNumber ?? 0;
        startColumn = userFrame?.columnNumber ?? 0;
      } catch (parseError) {
        this.warn('Failed to parse error stack', { data: parseError, operation: 'formatKernelError' });
      }
    } else if (typeof error === 'string') {
      message = error;
      type = 'runtime';
    }

    return {
      message,
      stack,
      stackFrames: kernelStackFrames.length > 0 ? kernelStackFrames : undefined,
      startLineNumber,
      startColumn,
      type,
    };
  }

  private buildBlob(
    shape: replicad.AnyShape,
    fileType: string,
    meshConfig: { tolerance: number; angularTolerance: number },
  ): Blob {
    if (fileType === 'stl') {
      return shape.blobSTL(meshConfig);
    }

    if (fileType === 'stl-binary') {
      return shape.blobSTL({ ...meshConfig, binary: true });
    }

    if (fileType === 'step') {
      return shape.blobSTEP();
    }

    throw new Error(`Filetype "${fileType}" unknown for export.`);
  }
}

const service = new ReplicadWorker();
expose(service);

export type ReplicadWorkerInterface = typeof service;
