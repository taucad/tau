import { expose } from 'comlink';
import * as replicad from 'replicad';
import * as zod from 'zod/v4';
import ErrorStackParser from 'error-stack-parser';
import type { OpenCascadeInstance as OpenCascadeInstanceWithExceptions } from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type {
  BuildShapesResult,
  KernelStackFrame,
  ExportGeometryResult,
  ExtractParametersResult,
  KernelError,
  ExtractNameResult,
  ExtractSchemaResult,
} from '~/types/kernel.types.js';
import { createKernelSuccess, createKernelError, isKernelError } from '~/types/kernel.types.js';
import {
  initOpenCascade,
  initOpenCascadeWithExceptions,
} from '~/components/geometry/kernel/replicad/init-open-cascade.js';
import { StudioHelper } from '~/components/geometry/kernel/replicad/utils/studio-helper.js';
import { runInCjsContext, buildEsModule } from '~/components/geometry/kernel/replicad/vm.js';
import { renderOutput, ShapeStandardizer } from '~/components/geometry/kernel/replicad/utils/render-output.js';
import { jsonSchemaFromJson } from '~/utils/schema.js';
import type { MainResultShapes, ShapeConfig } from '~/components/geometry/kernel/replicad/utils/render-output.js';

// Track whether we've already set OC in replicad to avoid repeated calls
let replicadHasOc = false;

// Make replicad available in the global scope.
(globalThis as unknown as { replicad: typeof replicad }).replicad = replicad;
(globalThis as unknown as { zod: typeof zod }).zod = zod;

/**
 * Run code in a VM with the OC context
 * @param code
 * @param context
 * @returns the result of the code
 */
function runInContextAsOc(code: string, context: Record<string, unknown> = {}): unknown {
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

async function runAsFunction(code: string, parameters: Record<string, unknown>): Promise<unknown> {
  const contextCode = `
    ${code}
    return main(replicad, __inputParams || {});
  `;

  return runInContextAsOc(contextCode, { __inputParams: parameters });
}

export async function runAsModule(code: string, parameters: Record<string, unknown>): Promise<unknown> {
  const startTime = performance.now();
  const module = await buildEsModule(code);
  const buildTime = performance.now();
  console.log(`Module building took ${buildTime - startTime}ms`);

  const execStartTime = performance.now();
  const result = module.default
    ? module.default(parameters || module.defaultParams)
    : module.main?.(replicad, parameters || module.defaultParams || {});
  const execEndTime = performance.now();
  console.log(`Module execution took ${execEndTime - execStartTime}ms`);

  return result;
}

const runCode = async (code: string, parameters: Record<string, unknown>): Promise<unknown> => {
  console.log('Starting runCode evaluation');
  const startTime = performance.now();

  let result;
  if (/^\s*export\s+/m.test(code)) {
    console.log('Starting runAsModule');
    result = await runAsModule(code, parameters);
  } else {
    console.log('Starting runAsFunction');
    result = await runAsFunction(code, parameters);
  }

  const endTime = performance.now();
  console.log(`Total runCode execution took ${endTime - startTime}ms`);
  return result;
};

const extractParametersFromCode = async (code: string): Promise<ExtractParametersResult> => {
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

    // Generate JSON schema from the default parameters
    const jsonSchema = await jsonSchemaFromJson(defaultParameters);

    return createKernelSuccess({
      defaultParameters,
      jsonSchema,
    });
  } catch (error) {
    const kernelError = await formatKernelError(error);
    return createKernelError({
      message: kernelError.message,
      startLineNumber: kernelError.startLineNumber ?? 0,
      startColumn: kernelError.startColumn ?? 0,
      stack: kernelError.stack,
      stackFrames: kernelError.stackFrames,
      type: kernelError.type,
    });
  }
};

const extractDefaultNameFromCode = async (code: string): Promise<ExtractNameResult> => {
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
};

const extractSchemaFromCode = async (code: string): Promise<ExtractSchemaResult> => {
  if (/^\s*export\s+/m.test(code)) {
    const module = await buildEsModule(code);
    return createKernelSuccess(module.schema);
  }

  const editedText = `
${code}
try {
  return schema;
} catch (e) {
  return;
}
  `;

  try {
    const result = await runInCjsContext(editedText, {});
    return createKernelSuccess(result ?? {});
  } catch {
    return createKernelError({
      message: 'Failed to extract schema from code',
      startLineNumber: 0,
      startColumn: 0,
      type: 'runtime',
    });
  }
};

const shapesMemory: Record<string, ShapeConfig[]> = {};

const ocVersions: {
  withExceptions: Promise<OpenCascadeInstanceWithExceptions> | undefined;
  single: Promise<OpenCascadeInstance> | undefined;
  current: 'single' | 'withExceptions';
} = {
  withExceptions: undefined,
  single: undefined,
  current: 'single', // Default to single for better initial performance
};

// Initialize OC as a placeholder that will be set during initialization
// eslint-disable-next-line @typescript-eslint/naming-convention -- FIXME
let OC: Promise<OpenCascadeInstance | OpenCascadeInstanceWithExceptions> | undefined;

let isInitializing = false;

/**
 * Initializes the OpenCascade instance with the specified mode
 * @param withExceptions Whether to use exceptions mode
 * @returns The initialized OpenCascade instance
 */
async function initializeOpenCascadeInstance(withExceptions: boolean): Promise<OpenCascadeInstance> {
  if (isInitializing) {
    console.log('Already initializing OpenCascade, returning existing promise');
    if (!OC) {
      throw new Error('OpenCascade initialization in progress but OC is undefined');
    }

    return OC;
  }

  isInitializing = true;
  const startTime = performance.now();

  try {
    // Set the current version based on the parameter
    ocVersions.current = withExceptions ? 'withExceptions' : 'single';

    // Use cached version if available
    if (withExceptions) {
      if (!ocVersions.withExceptions) {
        console.log('Initializing OpenCascade with exceptions');
        ocVersions.withExceptions = initOpenCascadeWithExceptions();
      }

      OC = ocVersions.withExceptions;
    } else {
      if (!ocVersions.single) {
        console.log('Initializing OpenCascade without exceptions');
        ocVersions.single = initOpenCascade();
      }

      OC = ocVersions.single;
    }

    const result = await OC;
    const endTime = performance.now();
    console.log(`OpenCascade initialized successfully in ${endTime - startTime}ms`);
    return result;
  } catch (error) {
    console.error('Failed to initialize OpenCascade:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
}

async function enableExceptions() {
  ocVersions.current = 'withExceptions';
  return initializeOpenCascadeInstance(true);
}

async function disableExceptions() {
  ocVersions.current = 'single';
  return initializeOpenCascadeInstance(false);
}

async function toggleExceptions(): Promise<'single' | 'withExceptions'> {
  await (ocVersions.current === 'single' ? enableExceptions() : disableExceptions());
  return ocVersions.current;
}

const formatException = (
  oc: OpenCascadeInstanceWithExceptions,
  error: unknown,
): { error: boolean; message: string; stack?: string } => {
  let message = 'error';

  if (typeof error === 'number') {
    if (oc.OCJS) {
      const errorData = oc.OCJS.getStandard_FailureData(error);
      // eslint-disable-next-line new-cap -- valid API in OCJS
      message = errorData.GetMessageString();
    } else {
      message = `Kernel error ${error}`;
    }
  } else {
    message = error instanceof Error ? error.message : 'Unknown error';
    console.error(error);
  }

  return {
    error: true,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  };
};

// Enhanced error formatting function using robust error-stack-parser
const formatKernelError = async (error: unknown): Promise<KernelError> => {
  console.log('Formatting kernel error:\n', error);
  // Start with default values
  let message = 'Unknown error occurred';
  let stack: string | undefined;
  let kernelStackFrames: KernelStackFrame[] = [];
  let startLineNumber = 0;
  let startColumn = 0;
  let type: 'compilation' | 'runtime' | 'kernel' | 'unknown' = 'unknown';

  // Handle OpenCascade kernel errors (numbers)
  if (typeof error === 'number') {
    try {
      // Get the current OpenCascade instance for error message extraction
      const ocInstance = await OC;
      if (ocInstance) {
        const exceptionResult = formatException(ocInstance as OpenCascadeInstanceWithExceptions, error);
        message = exceptionResult.message;
        type = 'kernel';
      } else {
        message = `Kernel error ${error}`;
        type = 'kernel';
      }
    } catch (ocError) {
      console.warn('Failed to format OpenCascade exception:', ocError);
      message = `Kernel error ${error}`;
      type = 'kernel';
    }
  }
  // Handle JavaScript Error objects
  else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
    type = 'runtime';

    try {
      // Use ErrorStackParser for robust cross-browser stack parsing
      const stackFrames = ErrorStackParser.parse(error);

      // Convert error-stack-parser StackFrames to our KernelStackFrames
      kernelStackFrames = stackFrames.map((frame) => ({
        fileName: frame.fileName,
        functionName: frame.functionName,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
        source: frame.source,
      }));

      // Find the first meaningful stack frame (not from this library)
      const userFrame = stackFrames.find((frame) => frame.functionName === 'Module.main') ?? stackFrames[0];

      startLineNumber = userFrame?.lineNumber ?? 0;
      startColumn = userFrame?.columnNumber ?? 0;
    } catch (parseError) {
      // Fallback if stack parsing fails
      console.warn('Failed to parse error stack:', parseError);
    }
  }
  // Handle string errors
  else if (typeof error === 'string') {
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
};

const buildShapesFromCode = async (code: string, parameters: Record<string, unknown>): Promise<BuildShapesResult> => {
  const startTime = performance.now();
  console.log('Building shapes from code');

  try {
    // Ensure font is loaded
    // TODO: Review font loading
    // if (!replicad.getFont()) {
    //   await replicad.loadFont('/fonts/HKGrotesk-Regular.ttf');
    // }

    // Prepare context and helpers
    let shapes: MainResultShapes;
    let defaultName: string | undefined;
    const helper = new StudioHelper();
    const standardizer = new ShapeStandardizer();

    try {
      // Set up global helpers
      // TODO: Review if this is needed.
      // (globalThis as any).$ = helper;
      // (globalThis as any).registerShapeStandardizer = standardizer.registerAdapter.bind(standardizer);

      // Run the code with measurements
      const runCodeStartTime = performance.now();
      shapes = (await runCode(code, parameters)) as MainResultShapes;
      const runCodeEndTime = performance.now();
      console.log(`Code execution took ${runCodeEndTime - runCodeStartTime}ms`);

      const defaultNameResult = await extractDefaultNameFromCode(code);
      defaultName = isKernelError(defaultNameResult) ? undefined : defaultNameResult.data;
    } catch (error) {
      const endTime = performance.now();
      console.log(`Error occurred after ${endTime - startTime}ms`);
      return {
        success: false,
        error: await formatKernelError(error),
      };
    }

    // Process shapes efficiently
    const renderStartTime = performance.now();
    const result = renderOutput(
      shapes,
      standardizer,
      (shapesArray) => {
        const editedShapes = helper.apply(shapesArray);
        shapesMemory.defaultShape = shapesArray;
        return editedShapes as ShapeConfig[];
      },
      defaultName,
    );
    const renderEndTime = performance.now();
    console.log(`Render output took ${renderEndTime - renderStartTime}ms`);

    const totalTime = performance.now() - startTime;
    console.log(`Total buildShapesFromCode time: ${totalTime}ms`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Error in buildShapesFromCode:', error);
    return {
      success: false,
      error: await formatKernelError(error),
    };
  }
};

const defaultExportMeshConfig = { tolerance: 0.01, angularTolerance: 30 };

const buildBlob = (
  shape: replicad.AnyShape,
  fileType: string,
  meshConfig: { tolerance: number; angularTolerance: number },
): Blob => {
  if (fileType === 'stl') return shape.blobSTL(meshConfig);
  if (fileType === 'stl-binary') return shape.blobSTL({ ...meshConfig, binary: true });
  if (fileType === 'step') return shape.blobSTEP();
  throw new Error(`Filetype "${fileType}" unknown for export.`);
};

const exportShape = async (
  fileType: 'stl' | 'stl-binary' | 'step' | 'step-assembly' = 'stl',
  shapeId = 'defaultShape',
  meshConfig = defaultExportMeshConfig,
): Promise<ExportGeometryResult> => {
  try {
    if (!shapesMemory[shapeId]) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      });
    }

    if (fileType === 'step-assembly') {
      const result = [
        {
          blob: replicad.exportSTEP(shapesMemory[shapeId]),
          name: shapeId,
        },
      ];
      return createKernelSuccess(result);
    }

    const result = shapesMemory[shapeId].map(({ shape, name }) => ({
      blob: buildBlob(shape, fileType, meshConfig),
      name: name ?? 'Shape',
    }));
    return createKernelSuccess(result);
  } catch (error) {
    const kernelError = await formatKernelError(error);
    return createKernelError({
      message: kernelError.message,
      startLineNumber: kernelError.startLineNumber ?? 0,
      startColumn: kernelError.startColumn ?? 0,
      stack: kernelError.stack,
      stackFrames: kernelError.stackFrames,
      type: kernelError.type,
    });
  }
};

const faceInfo = (subshapeIndex: number, faceIndex: number, shapeId = 'defaultShape'): unknown | undefined => {
  const face = shapesMemory[shapeId]?.[subshapeIndex]?.shape.faces[faceIndex];
  if (!face) return undefined;
  return {
    type: face.geomType,
    center: face.center.toTuple(),
    normal: face.normalAt().normalize().toTuple(),
  };
};

const edgeInfo = (subshapeIndex: number, edgeIndex: number, shapeId = 'defaultShape'): unknown | undefined => {
  const edge = shapesMemory[shapeId]?.[subshapeIndex]?.shape.edges[edgeIndex];
  if (!edge) return undefined;
  return {
    type: edge.geomType,
    start: edge.startPoint.toTuple(),
    end: edge.endPoint.toTuple(),
    direction: edge.tangentAt().normalize().toTuple(),
  };
};

const initialize = async (withExceptions: boolean): Promise<void> => {
  const startTime = performance.now();
  const oc = await initializeOpenCascadeInstance(withExceptions);

  const ocEndTime = performance.now();
  console.log(`OpenCascade initialization took ${ocEndTime - startTime}ms`);

  // Set replicad OC once we have it
  if (!replicadHasOc) {
    console.log('Setting OC in replicad');
    replicad.setOC(oc);
    replicadHasOc = true;
  }
};

const service = {
  async ready(): Promise<boolean> {
    try {
      await OC;
      return true;
    } catch (error) {
      console.error('OpenCascade initialization error:', error);
      return false;
    }
  },
  buildShapesFromCode,
  extractParametersFromCode,
  extractDefaultNameFromCode,
  extractSchemaFromCode,
  exportShape,
  edgeInfo,
  faceInfo,
  initialize,
  toggleExceptions,
  isExceptionsEnabled: (): boolean => ocVersions.current === 'withExceptions',
};

// @ts-expect-error -- TODO: Investigate this. It's not causing any issues.
expose(service, globalThis);

export type BuilderWorkerInterface = typeof service;
export default service;
