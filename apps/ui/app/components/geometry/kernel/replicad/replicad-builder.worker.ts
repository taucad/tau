import { expose } from 'comlink';
import * as replicad from 'replicad';

import { initOpenCascade, initOpenCascadeWithExceptions } from './init-open-cascade';
import { StudioHelper } from './utils/studio-helper';
import { runInContext, buildModuleEvaluator } from './vm';

import { renderOutput, ShapeStandardizer } from './utils/render-output';

// Track whether we've already set OC in replicad to avoid repeated calls
let replicadHasOC = false;

// Define types for OC to avoid typescript errors
interface OpenCascadeInstance {
  [key: string]: any;
}

(globalThis as any).replicad = replicad;

/**
 * Run code in a VM with the OC context
 * @param code
 * @param context
 * @returns the result of the code
 */
export function runInContextAsOC(code: string, context: Record<string, any> = {}): any {
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

async function runAsFunction(code: string, parameters: any): Promise<any> {
  const oc = await initializeOpenCascade();
  return runInContextAsOC(code, {
    oc,
    replicad,
    __inputParams: parameters,
  });
}

export async function runAsModule(code: string, parameters: any): Promise<any> {
  const startTime = performance.now();
  console.log('Module not in cache, building evaluator');
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

const runCode = async (code: string, parameters: any): Promise<any> => {
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

const SHAPES_MEMORY: Record<string, any> = {};

const ocVersions: Record<string, any> = {
  withExceptions: undefined,
  single: undefined,
  current: 'single', // Default to single for better initial performance
};

// Simplify the OC initialization promise - this approach is more direct like the original replicad
let OC = (async () => {
  try {
    console.log('Initial OpenCascade initialization starting');
    const oc = await initOpenCascadeWithExceptions();
    console.log('Initial OpenCascade initialization complete');
    return oc;
  } catch (error) {
    console.error('Initial OpenCascade initialization failed:', error);
    throw error;
  }
})();

let isInitializing = false;

async function initializeOpenCascade() {
  if (isInitializing) {
    console.log('Already initializing OpenCascade, returning existing promise');
    return OC;
  }

  isInitializing = true;

  // Track performance
  const startTime = performance.now();

  try {
    // If OC is already resolved, return it immediately
    const resolved = await Promise.race([
      OC.then(() => true).catch(() => false),
      new Promise((resolve) => setTimeout(() => resolve(false), 5)),
    ]);

    if (resolved) {
      console.log('Using already initialized OpenCascade');
      isInitializing = false;
      return OC;
    }

    console.log('Initializing OpenCascade');

    // Reset the promise based on the current version
    if (ocVersions.current === 'single') {
      if (!ocVersions.single) {
        ocVersions.single = initOpenCascade();
      }
      OC = ocVersions.single;
    } else {
      if (!ocVersions.withExceptions) {
        ocVersions.withExceptions = initOpenCascadeWithExceptions();
      }
      OC = ocVersions.withExceptions;
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
  return initializeOpenCascade();
}

function disableExceptions() {
  ocVersions.current = 'single';
  return initializeOpenCascade();
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

const buildShapesFromCode = async (code: string, parameters: any): Promise<any> => {
  const startTime = performance.now();
  console.log('building shapes from code');

  try {
    // Use optimized OC initialization with caching benefits
    let oc: OpenCascadeInstance;
    try {
      // Try getting OC from cache first without full initialization call
      oc = await OC;
    } catch {
      console.log('Cached OC not available, initializing from scratch');
      oc = await initializeOpenCascade();
    }

    const ocEndTime = performance.now();
    console.log(`OpenCascade initialization took ${ocEndTime - startTime}ms`);

    // Set replicad OC once we have it
    if (!replicadHasOC) {
      console.log('Setting OC in replicad');
      replicad.setOC(oc as any); // Cast to any to avoid TypeScript errors
      replicadHasOC = true;
    }

    // Ensure font is loaded
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
      (globalThis as any).$ = helper;
      (globalThis as any).registerShapeStandardizer = standardizer.registerAdapter.bind(standardizer);

      // Run the code with measurements
      const runCodeStartTime = performance.now();
      shapes = await runCode(code, parameters);
      const runCodeEndTime = performance.now();
      console.log(`Code execution took ${runCodeEndTime - runCodeStartTime}ms`);

      defaultName = code && (await extractDefaultNameFromCode(code));
    } catch (error) {
      const endTime = performance.now();
      console.log(`Error occurred after ${endTime - startTime}ms`);
      return formatException(oc, error);
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

const buildBlob = (
  shape: any,
  fileType: string,
  meshConfig: { tolerance: number; angularTolerance: number } = { tolerance: 0.01, angularTolerance: 30 },
): Blob => {
  if (fileType === 'stl') return shape.blobSTL(meshConfig);
  if (fileType === 'stl-binary') return shape.blobSTL({ ...meshConfig, binary: true });
  if (fileType === 'step') return shape.blobSTEP();
  throw new Error(`Filetype "${fileType}" unknown for export.`);
};

const exportShape = async (
  fileType = 'stl' as 'stl' | 'stl-binary' | 'step' | 'step-assembly',
  shapeId = 'defaultShape',
  meshConfig?: { tolerance: number; angularTolerance: number },
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

const faceInfo = (subshapeIndex: number, faceIndex: number, shapeId = 'defaultShape'): any | null => {
  const face = SHAPES_MEMORY[shapeId]?.[subshapeIndex]?.shape.faces[faceIndex];
  if (!face) return null;
  return {
    type: face.geomType,
    center: face.center.toTuple(),
    normal: face.normalAt().normalize().toTuple(),
  };
};

const edgeInfo = (subshapeIndex: number, edgeIndex: number, shapeId = 'defaultShape'): any | null => {
  const edge = SHAPES_MEMORY[shapeId]?.[subshapeIndex]?.shape.edges[edgeIndex];
  if (!edge) return null;
  return {
    type: edge.geomType,
    start: edge.startPoint.toTuple(),
    end: edge.endPoint.toTuple(),
    direction: edge.tangentAt().normalize().toTuple(),
  };
};

const service = {
  ready: async (): Promise<boolean> => {
      try {
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
  toggleExceptions,
  exceptionsEnabled: (): boolean => ocVersions.current === 'withExceptions',
};

expose(service, globalThis);

export type BuilderWorkerInterface = typeof service;
export default service;
