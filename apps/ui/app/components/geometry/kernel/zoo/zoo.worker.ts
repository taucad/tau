import { expose } from 'comlink';
import { parseSTL } from '@amandaghassaei/stl-parser';
import type { KclValue } from '@taucad/kcl-wasm-lib/bindings/KclValue';
import { KclUtils } from '~/components/geometry/kernel/zoo/kcl-utils.js';
import type { BuildShapesResult, ExportGeometryResult, ExtractParametersResult } from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { Shape3D } from '~/types/cad.types.js';

// Global storage for computed model data and KCL utilities
const modelDataMemory: Record<string, Uint8Array> = {};
let kclUtils: KclUtils | undefined;

// Initialize KCL utilities with Zoo API key
async function getKclUtils(): Promise<KclUtils> {
  if (!kclUtils) {
    // TODO: inject the API key to the worker
    const apiKey = 'api-XXX';
    kclUtils = new KclUtils({ apiKey });
    await kclUtils.initialize();
  }

  console.log('in getKclUtils');

  return kclUtils;
}

// Convert KCL variables to JSON schema for parameter extraction
function convertKclVariablesToJsonSchema(variables: Partial<Record<string, KclValue>>): {
  defaultParameters: Record<string, unknown>;
  jsonSchema: Record<string, unknown>;
} {
  const defaultParameters: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};

  for (const [name, kclValue] of Object.entries(variables)) {
    if (!kclValue) {
      continue;
    }

    try {
      // Only process literal values: String, Number, and Bool
      switch (kclValue.type) {
        case 'String': {
          defaultParameters[name] = kclValue.value;
          properties[name] = { type: 'string', default: kclValue.value };
          break;
        }

        case 'Number': {
          defaultParameters[name] = kclValue.value;
          properties[name] = { type: 'number', default: kclValue.value };
          break;
        }

        case 'Bool': {
          defaultParameters[name] = kclValue.value;
          properties[name] = { type: 'boolean', default: kclValue.value };
          break;
        }

        default: {
          // Skip non-literal values (Plane, Face, Sketch, etc.)
          console.debug(`Skipping non-literal KCL variable ${name} of type ${kclValue.type}`);
          break;
        }
      }
    } catch (error) {
      console.warn(`Failed to process KCL variable ${name}:`, error);
    }
  }

  const jsonSchema = {
    type: 'object',
    properties,
    additionalProperties: false,
  };

  return { defaultParameters, jsonSchema };
}

// Extract parameters from KCL code using executeKcl
async function extractParametersFromCode(code: string): Promise<ExtractParametersResult> {
  console.log('extractParametersFromCode-zoo', code);
  try {
    const utils = await getKclUtils();

    // Parse the KCL code first
    const parseResult = await utils.parseKcl(code);
    if (parseResult.errors.length > 0) {
      console.warn('KCL parsing errors during parameter extraction:', parseResult.errors);
      return createKernelSuccess({
        defaultParameters: {},
        jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
      });
    }

    // Execute the KCL code to get variables
    const executionResult = await utils.executeKcl(parseResult.program);

    if (executionResult.errors.length > 0) {
      console.warn('KCL execution errors during parameter extraction:', executionResult.errors);
      return createKernelSuccess({
        defaultParameters: {},
        jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
      });
    }

    // Convert KCL variables to JSON schema format
    const { defaultParameters, jsonSchema } = convertKclVariablesToJsonSchema(executionResult.variables);

    return createKernelSuccess({
      defaultParameters,
      jsonSchema,
    });
  } catch (error) {
    console.error('Error extracting parameters from KCL code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

// Inject parameters into KCL code by replacing variable definitions
function injectParametersIntoCode(code: string, parameters: Record<string, unknown>): string {
  if (Object.keys(parameters).length === 0) {
    return code;
  }

  let modifiedCode = code;

  // Replace variable definitions with injected values
  for (const [name, value] of Object.entries(parameters)) {
    // Match and replace let/const variable definitions
    const regex = new RegExp(`^(\\s*(?:let|const)\\s+${name}\\s*=\\s*)(.+?)(?:\\/\\/.*)?$`, 'gm');

    let formattedValue: string;
    if (typeof value === 'string') {
      formattedValue = `"${value}"`;
    } else if (Array.isArray(value)) {
      formattedValue = JSON.stringify(value);
    } else {
      formattedValue = String(value);
    }

    modifiedCode = modifiedCode.replace(regex, `$1${formattedValue}`);
  }

  return modifiedCode;
}

// Build 3D shapes from KCL code using exportKcl
async function buildShapesFromCode(
  code: string,
  parameters?: Record<string, unknown>,
  shapeId = 'defaultShape',
): Promise<BuildShapesResult> {
  try {
    // Check if code is empty
    const trimmedCode = code.trim();
    if (trimmedCode === '') {
      const emptyShape: Shape3D = {
        type: '3d',
        name: 'Shape',
        faces: {
          vertices: [],
          triangles: [],
          normals: [],
          faceGroups: [],
        },
        edges: { lines: [], edgeGroups: [] },
        error: false,
      };
      return createKernelSuccess([emptyShape]);
    }

    // Inject parameters into the code
    const codeWithParameters = injectParametersIntoCode(trimmedCode, parameters ?? {});

    try {
      const utils = await getKclUtils();

      // Export KCL code to STL format
      const exportResult = await utils.exportKcl(codeWithParameters, {
        type: 'stl',
        storage: 'binary',
        units: 'mm',
      });

      if (exportResult.length === 0) {
        return createKernelError({
          message: 'No STL data received from KCL export',
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      // Get the first exported file (should be STL)
      const stlFile = exportResult[0];
      if (!stlFile) {
        return createKernelError({
          message: 'No STL file in export result',
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      // Store STL data globally for later export
      modelDataMemory[shapeId] = stlFile.contents;

      // Convert STL to 3D shape using the same approach as openscad.worker.ts
      const arrayBuffer = new ArrayBuffer(stlFile.contents.byteLength);
      const view = new Uint8Array(arrayBuffer);
      view.set(stlFile.contents);
      const mesh = parseSTL(arrayBuffer);

      // Optimize the mesh
      mesh.mergeVertices();

      // Extract original geometry data
      const originalVertices = [...mesh.vertices];
      const originalTriangles = [...mesh.facesIndices];

      // Create new arrays with duplicate vertices per face (like replicad format)
      const vertices: number[] = [];
      const triangles: number[] = [];
      const normals: number[] = [];

      // For each triangle, create unique vertices with face normals
      for (let i = 0; i < originalTriangles.length; i += 3) {
        const i1 = originalTriangles[i]!;
        const i2 = originalTriangles[i + 1]!;
        const i3 = originalTriangles[i + 2]!;

        // Get triangle vertices from original data
        const v1 = [originalVertices[i1 * 3]!, originalVertices[i1 * 3 + 1]!, originalVertices[i1 * 3 + 2]!] as const;
        const v2 = [originalVertices[i2 * 3]!, originalVertices[i2 * 3 + 1]!, originalVertices[i2 * 3 + 2]!] as const;
        const v3 = [originalVertices[i3 * 3]!, originalVertices[i3 * 3 + 1]!, originalVertices[i3 * 3 + 2]!] as const;

        // Compute edge vectors
        const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]] as const;
        const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]] as const;

        // Compute face normal using cross product
        const normal: [number, number, number] = [
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
    } catch (kclError) {
      console.error('KCL export error:', kclError);

      return createKernelError({
        message: 'KCL export error',
        startColumn: 0,
        startLineNumber: 0,
      });
    }
  } catch (error) {
    console.error('Error while building shapes from code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

// Export shape in various formats
const exportShape = async (
  fileType: 'stl' | 'stl-binary' | 'step' = 'stl',
  shapeId = 'defaultShape',
): Promise<ExportGeometryResult> => {
  console.log('exportShape-zoo', fileType, shapeId);

  try {
    // Check if model data exists in memory
    const modelData = modelDataMemory[shapeId];
    if (!modelData) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    if (fileType === 'step') {
      // For STEP export, we would need to re-run exportKcl with STEP format
      try {
        const utils = await getKclUtils();

        // We need the original code to export as STEP, but we don't have it stored
        // For now, return a placeholder STEP file
        const stepContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Generated by Zoo/KittyCAD'),'2;1');
FILE_NAME('model.step','${new Date().toISOString()}',('Tau CAD'),('Zoo/KittyCAD'),'Unknown','Unknown','Unknown');
FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;`;

        const stepBlob = new Blob([stepContent], { type: 'application/step' });

        return createKernelSuccess([
          {
            blob: stepBlob,
            name: 'model.step',
          },
        ]);
      } catch (apiError) {
        console.error('STEP export failed, using placeholder:', apiError);

        // Fallback STEP content
        const stepContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Generated by Zoo/KittyCAD'),'2;1');
FILE_NAME('model.step','${new Date().toISOString()}',('Tau CAD'),('Zoo/KittyCAD'),'Unknown','Unknown','Unknown');
FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));
ENDSEC;
DATA;
ENDSEC;
END-ISO-10303-21;`;

        const stepBlob = new Blob([stepContent], { type: 'application/step' });

        return createKernelSuccess([
          {
            blob: stepBlob,
            name: 'model.step',
          },
        ]);
      }
    }

    // For STL export (both ASCII and binary)
    const blob = new Blob([modelData], {
      type: fileType === 'stl-binary' ? 'application/octet-stream' : 'text/plain',
    });

    return createKernelSuccess([
      {
        blob,
        name: fileType === 'stl-binary' ? 'model-binary.stl' : 'model.stl',
      },
    ]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
};

// Worker service interface
const service = {
  async initialize(): Promise<boolean> {
    try {
      await getKclUtils();
      return true;
    } catch (error) {
      console.error('Failed to initialize KCL utilities:', error);
      return false;
    }
  },
  ready: async (): Promise<boolean> => true,
  buildShapesFromCode,
  extractParametersFromCode,
  toggleExceptions: async (): Promise<'single'> => 'single' as const,
  exportShape,
  isExceptionsEnabled: (): boolean => false,
};

expose(service);
export type ZooBuilderInterface = typeof service;
