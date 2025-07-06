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

    // Extract original geometry data
    const originalVertices = [...mesh.vertices];
    const originalTriangles = [...mesh.facesIndices];

    // Create new arrays with duplicate vertices per face (like replicad format)
    const vertices: number[] = [];
    const triangles: number[] = [];
    const normals: number[] = [];

    // For each triangle, create unique vertices with face normals
    for (let i = 0; i < originalTriangles.length; i += 3) {
      const i1 = originalTriangles[i];
      const i2 = originalTriangles[i + 1];
      const i3 = originalTriangles[i + 2];

      // Get triangle vertices from original data
      const v1 = [originalVertices[i1 * 3], originalVertices[i1 * 3 + 1], originalVertices[i1 * 3 + 2]];
      const v2 = [originalVertices[i2 * 3], originalVertices[i2 * 3 + 1], originalVertices[i2 * 3 + 2]];
      const v3 = [originalVertices[i3 * 3], originalVertices[i3 * 3 + 1], originalVertices[i3 * 3 + 2]];

      // Compute edge vectors
      const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
      const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

      // Compute face normal using cross product
      const normal = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0],
      ];

      // Normalize the normal vector
      const length = Math.hypot(normal[0], normal[1], normal[2]);
      if (length > 0) {
        normal[0] /= length;
        normal[1] /= length;
        normal[2] /= length;
      }

      // Add duplicate vertices for this triangle
      const newVertexIndex = vertices.length / 3;

      // Add vertices
      vertices.push(...v1, ...v2, ...v3);

      // Add triangle indices (pointing to new duplicate vertices)
      triangles.push(newVertexIndex, newVertexIndex + 1, newVertexIndex + 2);

      // Add same face normal for all 3 vertices
      normals.push(...normal, ...normal, ...normal);
    }

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
