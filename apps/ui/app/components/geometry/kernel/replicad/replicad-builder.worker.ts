import { expose } from 'comlink';
import * as replicad from 'replicad';
import { OpenCascadeInstance } from 'replicad-opencascadejs/src/replicad_with_exceptions.js';

import { initOpenCascade, initOpenCascadeWithExceptions } from './init-open-cascade';
import { StudioHelper } from './utils/studio-helper';
import { runInContext, buildModuleEvaluator } from './vm';

import { renderOutput, ShapeStandardizer } from './utils/render-output';

// Track whether we've already set OC in replicad to avoid repeated calls
let replicadHasOC = false;

// Make replicad available in the global scope.
// Eslint overrides are permissible as replicad needs to be global for the vm to work.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
(globalThis as any).replicad = replicad;

/**
 * Run code in a VM with the OC context
 * @param code
 * @param context
 * @returns the result of the code
 */
export function runInContextAsOC(code: string, context: Record<string, unknown> = {}): any {
  const editedText = `
${code}
let dp = {}
try {
  dp = defaultParams;
} catch (e) {}
return main(replicad, __inputParams || dp)
  `;

  return runInContext(editedText, context);
}

async function runAsFunction(code: string, parameters: Record<string, unknown>): Promise<any> {
  const oc = await OC;
  return runInContextAsOC(code, {
    oc,
    replicad,
    __inputParams: parameters,
  });
}

export async function runAsModule(code: string, parameters: Record<string, unknown>): Promise<any> {
  const startTime = performance.now();
  const module = await buildModuleEvaluator(code);
  const buildTime = performance.now();
  console.log(`Module building took ${buildTime - startTime}ms`);

  const execStartTime = performance.now();
  const result = await (module.default
    ? module.default(parameters || module.defaultParams)
    : module.main(replicad, parameters || module.defaultParams || {}));
  const execEndTime = performance.now();
  console.log(`Module execution took ${execEndTime - execStartTime}ms`);

  return result;
}

const runCode = async (code: string, parameters: Record<string, unknown>): Promise<any> => {
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

const extractDefaultParametersFromCode = async (code: string): Promise<any> => {
  if (/^\s*export\s+/m.test(code)) {
    const module = await buildModuleEvaluator(code);
    return module.defaultParams || undefined;
  }

  const editedText = `
${code}
try {
  return defaultParams;
} catch (e) {
  return undefined;
}
  `;

  try {
    return runInContext(editedText, {});
  } catch {
    return {};
  }
};

const extractDefaultNameFromCode = async (code: string): Promise<string | undefined> => {
  if (/^\s*export\s+/m.test(code)) {
    const module = await buildModuleEvaluator(code);
    return module.defaultName;
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
    return runInContext(editedText, {});
  } catch {
    return;
  }
};

const SHAPES_MEMORY: Record<string, { shape: any; name: string }[]> = {};

const ocVersions: {
  withExceptions: Promise<OpenCascadeInstance> | undefined;
  single: Promise<OpenCascadeInstance> | undefined;
  current: 'single' | 'withExceptions';
} = {
  withExceptions: undefined,
  single: undefined,
  current: 'single', // Default to single for better initial performance
};

// Initialize OC as a placeholder that will be set during initialization
let OC: Promise<OpenCascadeInstance>;

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

function enableExceptions() {
  ocVersions.current = 'withExceptions';
  return initializeOpenCascadeInstance(true);
}

function disableExceptions() {
  ocVersions.current = 'single';
  return initializeOpenCascadeInstance(false);
}

async function toggleExceptions() {
  await (ocVersions.current === 'single' ? enableExceptions() : disableExceptions());
  return ocVersions.current;
}

const formatException = (oc: any, error: any): { error: boolean; message: string; stack?: string } => {
  let message = 'error';

  if (typeof error === 'number') {
    if (oc.OCJS) {
      const errorData = oc.OCJS.getStandard_FailureData(error);
      message = errorData.GetMessageString();
    } else {
      message = `Kernel error ${error}`;
    }
  } else {
    message = error.message;
    console.error(error);
  }

  return {
    error: true,
    message,
    stack: error.stack,
  };
};

const buildShapesFromCode = async (code: string, parameters: Record<string, unknown>): Promise<any> => {
  const startTime = performance.now();
  console.log('building shapes from code');

  try {
    // Ensure font is loaded
    // TODO: Review font loading
    // if (!replicad.getFont()) {
    //   await replicad.loadFont('/fonts/HKGrotesk-Regular.ttf');
    // }

    // Prepare context and helpers
    let shapes;
    let defaultName;
    const helper = new StudioHelper();
    const standardizer = new ShapeStandardizer();

    try {
      // Set up global helpers
      // TODO: Review if this is needed.
      // (globalThis as any).$ = helper;
      // (globalThis as any).registerShapeStandardizer = standardizer.registerAdapter.bind(standardizer);

      // Run the code with measurements
      const runCodeStartTime = performance.now();
      shapes = await runCode(code, parameters);
      const runCodeEndTime = performance.now();
      console.log(`Code execution took ${runCodeEndTime - runCodeStartTime}ms`);

      defaultName = code && (await extractDefaultNameFromCode(code));
    } catch (error) {
      const endTime = performance.now();
      console.log(`Error occurred after ${endTime - startTime}ms`);
      return formatException(await OC, error);
    }

    // Process shapes efficiently
    const renderStartTime = performance.now();
    const result = renderOutput(
      shapes,
      standardizer,
      (shapesArray) => {
        const editedShapes = helper.apply(shapesArray);
        SHAPES_MEMORY['defaultShape'] = shapesArray;
        return editedShapes;
      },
      defaultName,
    );
    const renderEndTime = performance.now();
    console.log(`Render output took ${renderEndTime - renderStartTime}ms`);

    const totalTime = performance.now() - startTime;
    console.log(`Total buildShapesFromCode time: ${totalTime}ms`);

    return result;
  } catch (error) {
    console.error('Error in buildShapesFromCode:', error);
    return { error: true, message: error instanceof Error ? error.message : String(error) };
  }
};

const DEFAULT_EXPORT_MESH_CONFIG = { tolerance: 0.01, angularTolerance: 30 };

const buildBlob = (shape: any, fileType: string, meshConfig: { tolerance: number; angularTolerance: number }): Blob => {
  if (fileType === 'stl') return shape.blobSTL(meshConfig);
  if (fileType === 'stl-binary') return shape.blobSTL({ ...meshConfig, binary: true });
  if (fileType === 'step') return shape.blobSTEP();
  throw new Error(`Filetype "${fileType}" unknown for export.`);
};

const exportShape = async (
  fileType: 'stl' | 'stl-binary' | 'step' | 'step-assembly' = 'stl',
  shapeId = 'defaultShape',
  meshConfig = DEFAULT_EXPORT_MESH_CONFIG,
): Promise<{ blob: Blob; name: string }[]> => {
  if (!SHAPES_MEMORY[shapeId]) throw new Error(`Shape ${shapeId} not computed yet`);
  if (fileType === 'step-assembly') {
    return [
      {
        blob: replicad.exportSTEP(SHAPES_MEMORY[shapeId]),
        name: shapeId,
      },
    ];
  }
  return SHAPES_MEMORY[shapeId].map(({ shape, name }) => ({
    blob: buildBlob(shape, fileType, meshConfig),
    name,
  }));
};

const faceInfo = (subshapeIndex: number, faceIndex: number, shapeId = 'defaultShape'): any | undefined => {
  const face = SHAPES_MEMORY[shapeId]?.[subshapeIndex]?.shape.faces[faceIndex];
  if (!face) return undefined;
  return {
    type: face.geomType,
    center: face.center.toTuple(),
    normal: face.normalAt().normalize().toTuple(),
  };
};

const edgeInfo = (subshapeIndex: number, edgeIndex: number, shapeId = 'defaultShape'): any | undefined => {
  const edge = SHAPES_MEMORY[shapeId]?.[subshapeIndex]?.shape.edges[edgeIndex];
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
  if (!replicadHasOC) {
    console.log('Setting OC in replicad');
    replicad.setOC(oc);
    replicadHasOC = true;
  }
};

const service = {
  ready: async (): Promise<boolean> => {
    try {
      // Check that OC is initialized
      await OC;
      return true;
    } catch (error) {
      console.error('OpenCascade initialization error:', error);
      return false;
    }
  },
  buildShapesFromCode,
  extractDefaultParametersFromCode,
  extractDefaultNameFromCode,
  exportShape,
  edgeInfo,
  faceInfo,
  initialize,
  toggleExceptions,
  isExceptionsEnabled: (): boolean => ocVersions.current === 'withExceptions',
};

expose(service, globalThis);

export type BuilderWorkerInterface = typeof service;
export default service;
