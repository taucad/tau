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

// Simple parser for OpenSCAD Customizer comments.
// It supports lines like:
//   // [radius] = 10
//   // [name] = "foo"
// Returns a map of parameter name -> default value parsed to JS types.
function parseCustomizerParameters(source: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const paramRegex = /^\s*\/\/\s*\[(.+?)\]\s*=\s*(.+?)\s*$/;

  source.split(/\r?\n/).forEach((line) => {
    const match = line.match(paramRegex);
    if (!match) return;

    const [, rawKey, rawDefault] = match;
    const key = rawKey.trim();
    let value: unknown = rawDefault.trim();

    // Try to JSON-parse to coerce numbers / booleans / arrays / objects
    try {
      // Wrap single quotes to double for JSON parse if needed
      const toParse = (/^(?:true|false|null|[\d.-]+)$/i.test(value as string)) ? (value as string) : JSON.stringify(value);
      value = JSON.parse(toParse);
    } catch {
      // Fallback, strip quotes if present
      value = (value as string).replace(/^"|"$/g, '');
    }

    params[key] = value;
  });

  return params;
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

const extractDefaultParametersFromCode = async (
  code: string,
): Promise<ExtractParametersResult> => {
  try {
    const params = parseCustomizerParameters(code);
    return createKernelSuccess(params);
  } catch (e) {
    const err = (e as Error).message ?? 'Unknown error';
    return createKernelError({ message: err, startColumn: 0, startLineNumber: 0 });
  }
};

const defaultExportConfig = {
  binary: false,
};

const exportShape = async (
  fileType: 'stl' | 'stl-binary' = 'stl',
): Promise<ExportGeometryResult> => {
  try {
    const inst = await getInstance();

    // We assume the last compiled model still exists at /output.stl if buildShapesFromCode was called.
    // If not present, we simply fail with an informative error.
    const asciiOut = '/output.stl';

    let stlData: Uint8Array;

    if (inst.FS.analyzePath(asciiOut).exists) {
      stlData = inst.FS.readFile(asciiOut);
    } else {
      return createKernelError({
        message: 'No previously built STL. Please build shapes before exporting.',
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    // If binary requested, we can simply return the bytes; if ascii requested, ensure ascii.
    const blob = new Blob([stlData], {
      type: 'model/stl' + (fileType === 'stl-binary' ? '' : '+ascii'),
    });

    return createKernelSuccess([
      {
        blob,
        name: fileType === 'stl-binary' ? 'model-binary.stl' : 'model.stl',
      },
    ]);
  } catch (e) {
    const err = (e as Error).message ?? 'Unknown error';
    return createKernelError({ message: err, startColumn: 0, startLineNumber: 0 });
  }
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