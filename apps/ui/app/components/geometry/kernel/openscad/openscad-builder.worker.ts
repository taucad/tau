import { expose } from 'comlink';
// @ts-expect-error -- No types for WASM module
import OpenSCAD from 'openscad-wasm-prebuilt';
// @ts-expect-error -- No types for STL parser
import { parseSTL } from '@amandaghassaei/stl-parser';
import type {
  BuildShapesResult,
  ExportGeometryResult,
  ExtractParametersResult,
  KernelError,
  KernelStackFrame,
} from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { Shape3D } from '~/types/cad.types.js';

// Lazy-load instance
let openscadInstancePromise: Promise<any>;

function getInstance(): Promise<any> {
  if (!openscadInstancePromise) {
    // @ts-ignore Emscripten types
    openscadInstancePromise = OpenSCAD({ noInitialRun: true }) as unknown as Promise<any>;
  }
  return openscadInstancePromise;
}

async function buildShapesFromCode(code: string): Promise<BuildShapesResult> {
  try {
    const inst = await getInstance();
    // Write source
    inst.FS.writeFile('/input.scad', code);

    // Produce STL using manifold engine for speed
    const outFile = '/output.stl';
    inst.callMain(['/input.scad', '--enable=manifold', '-o', outFile]);

    const stlData = inst.FS.readFile(outFile);
    const mesh = parseSTL(stlData.buffer);
    mesh.mergeVertices?.();

    const vertices = Array.from(mesh.vertices) as number[];
    const triangles = (mesh as any).facesIndices ? Array.from((mesh as any).facesIndices) as number[] : [];
    const normals = new Array(vertices.length).fill(0);

    const shape: Shape3D = {
      type: '3d',
      name: 'Shape',
      faces: {
        vertices,
        triangles,
        normals,
        faceGroups: [
          {
            start: 0,
            count: triangles.length,
            faceId: 0,
          },
        ],
      },
      edges: { lines: [], edgeGroups: [] },
      error: false,
    };

    return createKernelSuccess([shape]);
  } catch (e) {
    const err = (e as Error).message ?? 'Unknown error';
    return createKernelError({ message: err, startColumn: 0, startLineNumber: 0 });
  }
}

const extractDefaultParametersFromCode = async (): Promise<ExtractParametersResult> => {
  return createKernelSuccess({});
};

const exportShape = async (): Promise<ExportGeometryResult> => {
  return createKernelError({ message: 'Not implemented', startColumn: 0, startLineNumber: 0 });
};

const service = {
  initialize: async () => {
    await getInstance();
  },
  ready: async () => true,
  buildShapesFromCode,
  extractDefaultParametersFromCode,
  toggleExceptions: async () => 'single',
  exportShape,
  isExceptionsEnabled: () => false,
};

expose(service);
export type OpenSCADBuilderInterface = typeof service;