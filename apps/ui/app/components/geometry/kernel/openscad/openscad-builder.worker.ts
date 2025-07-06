import { expose } from 'comlink';
import { createOpenSCAD } from 'openscad-wasm-prebuilt';
import type { OpenSCAD } from 'openscad-wasm-prebuilt';
import { parseSTL } from '@amandaghassaei/stl-parser';
import { jsonDefault } from 'json-schema-default';
import type { JSONSchema7 } from 'json-schema';
import {
  processOpenScadParameters,
  flattenParametersForInjection,
} from '~/components/geometry/kernel/openscad/parse-parameters.js';
import type { OpenScadParameterExport } from '~/components/geometry/kernel/openscad/parse-parameters.js';
import type { BuildShapesResult, ExportGeometryResult, ExtractParametersResult } from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { Shape3D } from '~/types/cad.types.js';

// Global storage for computed STL data
const stlDataMemory: Record<string, Uint8Array> = {};

async function getInstance(): Promise<OpenSCAD> {
  const instance = await createOpenSCAD({
    noInitialRun: true,
    print: console.log,
    printErr: console.error,
  });

  return instance.getInstance();
}

// Format JavaScript values to OpenSCAD syntax for parameter injection
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(', ')}]`;
  }

  return String(value);
}

// Extract parameters using OpenSCAD's built-in parameter export
async function extractParametersFromCode(code: string): Promise<ExtractParametersResult> {
  try {
    const inst = await getInstance();
    const inputFile = '/input.scad';
    const parameterFile = '/params.json';

    // Write the SCAD code with preview mode enabled
    const codeWithPreview = '$preview=true;\n' + code;
    inst.FS.writeFile(inputFile, codeWithPreview);

    // Run OpenSCAD with parameter export format
    inst.callMain([inputFile, '-o', parameterFile, '--export-format=param']);

    // Check if parameter file was created
    let jsonSchema: JSONSchema7 = { type: 'object' };
    let defaultParameters: Record<string, unknown> = {};

    try {
      const parameterData = inst.FS.readFile(parameterFile, { encoding: 'utf8' });
      const parsedExport = JSON.parse(parameterData) as OpenScadParameterExport;

      // Process OpenSCAD parameter export format
      jsonSchema = processOpenScadParameters(parsedExport);
      defaultParameters = jsonDefault(jsonSchema) as Record<string, unknown>;
    } catch (error) {
      console.error('No parameters found or error parsing parameter file:', error);
      // Return empty schema if OpenSCAD parameter export fails
      jsonSchema = { type: 'object', properties: {}, additionalProperties: false };
      defaultParameters = {};
    }

    return createKernelSuccess({
      defaultParameters,
      jsonSchema,
    });
  } catch (error) {
    console.error('Error extracting parameters:', error);
    const errorMessage = (error as Error).message ?? 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

async function buildShapesFromCode(
  code: string,
  parameters?: Record<string, unknown>,
  shapeId = 'defaultShape',
): Promise<BuildShapesResult> {
  try {
    const inst = await getInstance();
    const inputFile = '/input.scad';
    const outputFile = '/output.stl';

    // Write the SCAD code
    inst.FS.writeFile(inputFile, code);

    // Build command line arguments
    const args = [inputFile, '--backend=manifold', '-o', outputFile];

    // Add parameter injection if provided
    if (parameters) {
      // Flatten grouped parameters for injection
      const flattenedParameters = flattenParametersForInjection(parameters);
      for (const [key, value] of Object.entries(flattenedParameters)) {
        args.push(`-D${key}=${formatValue(value)}`);
      }
    }

    // Run OpenSCAD
    inst.callMain(args);

    // Read the output STL file
    const stlData = inst.FS.readFile(outputFile) as Uint8Array;

    // Store STL data globally for later export
    stlDataMemory[shapeId] = stlData;

    const mesh = parseSTL(stlData.buffer);

    // Optimize the mesh
    mesh.mergeVertices?.();

    // Extract geometry data
    const vertices = [...mesh.vertices];
    const triangles = [...mesh.facesIndices];
    const normals = Array.from({ length: vertices.length }).fill(0) as number[];

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
  } catch (error) {
    console.error('Error while building shapes from code:', error);
    const errorMessage = (error as Error).message ?? 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

const exportShape = async (
  fileType: 'stl' | 'stl-binary' = 'stl',
  shapeId = 'defaultShape',
): Promise<ExportGeometryResult> => {
  console.log('exportShape-openscad', fileType, shapeId);
  try {
    // Check if STL data exists in memory
    const stlData = stlDataMemory[shapeId];
    if (!stlData) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    // Create blob with appropriate content type
    const blob = new Blob([stlData], {
      type: 'model/stl' + (fileType === 'stl-binary' ? '' : '+ascii'),
    });

    console.log('exportShape-openscad', blob);
    return createKernelSuccess([
      {
        blob,
        name: fileType === 'stl-binary' ? 'model-binary.stl' : 'model.stl',
      },
    ]);
  } catch (error) {
    const errorMessage = (error as Error).message ?? 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
};

const service = {
  async initialize() {
    await getInstance();
  },
  ready: async () => true,
  buildShapesFromCode,
  extractParametersFromCode,
  toggleExceptions: async () => 'single',
  exportShape,
  isExceptionsEnabled: () => false,
};

expose(service);
export type OpenScadBuilderInterface = typeof service;
