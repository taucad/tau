import { expose } from 'comlink';
import * as replicad from 'replicad';

import { initOpenCascade, initOpenCascadeWithExceptions } from './init-open-cascade';
import { StudioHelper } from './utils/studio-helper';
import { runInContext, buildModuleEvaluator } from './vm';

import { renderOutput, ShapeStandardizer } from './utils/render-output';

globalThis.replicad = replicad;

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
  const oc = await OC;

  return runInContextAsOC(code, {
    oc,
    replicad,
    __inputParams: parameters,
  });
}

export async function runAsModule(code: string, parameters: any): Promise<any> {
  const module = await buildModuleEvaluator(code);

  if (module.default) return module.default(parameters || module.defaultParams);
  return module.main(replicad, parameters || module.defaultParams || {});
}

const runCode = async (code: string, parameters: any): Promise<any> => {
  if (/^\s*export\s+/m.test(code)) {
    return runAsModule(code, parameters);
  }
  return runAsFunction(code, parameters);
};

const extractDefaultParametersFromCode = async (code: string): Promise<any> => {
  if (/^\s*export\s+/m.test(code)) {
    const module = await buildModuleEvaluator(code);
    return module.defaultParams || null;
  }

  const editedText = `
${code}
try {
  return defaultParams;
} catch (e) {
  return null;
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

const SHAPES_MEMORY = {};

const ocVersions: Record<string, any | null> = {
  withExceptions: null,
  single: null,
  current: null,
};

let OC: Promise<any> = Promise.reject('OpenCascade not initialized');

function enableExceptions() {
  if (!ocVersions.withExceptions) {
    ocVersions.withExceptions = initOpenCascadeWithExceptions();
  }
  ocVersions.current = 'withExceptions';
  OC = ocVersions.withExceptions;
}

function disableExceptions() {
  if (!ocVersions.single) {
    ocVersions.single = initOpenCascade();
  }
  ocVersions.current = 'single';
  OC = ocVersions.single;
}

async function toggleExceptions() {
  if (ocVersions.current === 'single') {
    enableExceptions();
  } else {
    disableExceptions();
  }

  await OC;
  return ocVersions.current;
}

disableExceptions();

const formatException = (oc: any, e: any): { error: boolean; message: string; stack?: string } => {
  let message = 'error';

  if (typeof e === 'number') {
    if (oc.OCJS) {
      const error = oc.OCJS.getStandard_FailureData(e);
      message = error.GetMessageString();
    } else {
      message = `Kernel error ${e}`;
    }
  } else {
    message = e.message;
    console.error(e);
  }

  return {
    error: true,
    message,
    stack: e.stack,
  };
};

const buildShapesFromCode = async (code: string, parameters: any): Promise<any> => {
  console.log('building shapes from code');
  const oc = await OC;
  replicad.setOC(oc);
  // TODO: Add font loading
  // if (!replicad.getFont()) await replicad.loadFont('/fonts/HKGrotesk-Regular.ttf');

  let shapes;
  let defaultName;
  const helper = new StudioHelper();
  const standardizer = new ShapeStandardizer();

  try {
    globalThis.$ = helper;
    globalThis.registerShapeStandardizer = standardizer.registerAdapter.bind(standardizer);
    shapes = await runCode(code, parameters);
    defaultName = code && (await extractDefaultNameFromCode(code));
  } catch (error) {
    return formatException(oc, error);
  }

  return renderOutput(
    shapes,
    standardizer,
    (shapes) => {
      const editedShapes = helper.apply(shapes);
      SHAPES_MEMORY.defaultShape = shapes;
      return editedShapes;
    },
    defaultName,
  );
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
  ready: (): Promise<boolean> => OC.then(() => true),
  buildShapesFromCode,
  extractDefaultParametersFromCode,
  extractDefaultNameFromCode,
  exportShape,
  edgeInfo,
  faceInfo,
  toggleExceptions,
  exceptionsEnabled: (): boolean => ocVersions.current === 'withExceptions',
};

export type BuilderWorkerInterface = typeof service;

expose(service, globalThis);
export default service;
