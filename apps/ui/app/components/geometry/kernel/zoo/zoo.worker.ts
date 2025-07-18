import { expose } from 'comlink';
import { parseSTL } from '@amandaghassaei/stl-parser';
import { KclUtils } from '~/components/geometry/kernel/zoo/kcl-utils.js';
import type { BuildShapesResult, ExportGeometryResult, ExtractParametersResult } from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { Shape3D } from '~/types/cad.types.js';

// Global storage for computed STL data
const stlDataMemory: Record<string, Uint8Array> = {};
let kclUtils: KclUtils | undefined;

// Create or get the singleton KCL utilities instance
async function getKclUtilsInstance(): Promise<KclUtils> {
  if (!kclUtils) {
    // TODO: inject the API key to the worker
    const apiKey = 'api-XXX';
    kclUtils = new KclUtils({ apiKey });
  }

  return kclUtils;
}

// Initialize KCL utilities with WASM only (for parsing and mock operations)
async function getKclUtils(): Promise<KclUtils> {
  const utils = await getKclUtilsInstance();

  // Initialize WASM (idempotent - will return early if already initialized)
  await utils.initializeWasm();

  return utils;
}

// Get KCL utils with full engine initialization (for export operations)
async function getKclUtilsWithEngine(): Promise<KclUtils> {
  const utils = await getKclUtilsInstance();

  // Initialize engine (idempotent - will return early if already initialized)
  // This automatically initializes WASM first if needed
  await utils.initializeEngine();

  return utils;
}

// Extract parameters from KCL code
async function extractParametersFromCode(code: string): Promise<ExtractParametersResult> {
  console.log('extractParametersFromCode-zoo', code);
  try {
    const utils = await getKclUtils();

    // Parse the KCL code first
    const parseResult = await utils.parseKcl(code);
    if (parseResult.errors.length > 0) {
      console.warn('KCL parsing errors during parameter extraction:', parseResult.errors);
      return createKernelError({
        message: 'KCL parsing errors during parameter extraction',
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    // Execute the KCL code to get variables
    const executionResult = await utils.executeMockKcl(parseResult.program);

    if (executionResult.errors.length > 0) {
      console.warn('KCL execution errors during parameter extraction:', executionResult.errors);
      return createKernelError({
        message: 'KCL execution errors during parameter extraction',
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    // Convert KCL variables to JSON schema format
    const { defaultParameters, jsonSchema } = KclUtils.convertKclVariablesToJsonSchema(executionResult.variables);

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

// Build 3D shapes from KCL code using the new program-based parameter injection
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

    try {
      const utils = await getKclUtilsWithEngine();

      // Clear memory before starting a new build to ensure clean state
      await utils.clearProgram();

      // Parse the KCL code first to get the program JSON
      const parseResult = await utils.parseKcl(trimmedCode);

      if (parseResult.errors.length > 0) {
        console.warn('KCL parsing errors:', parseResult.errors);
        const errorMessages = parseResult.errors.map(String);
        return createKernelError({
          message: `KCL parsing failed: ${errorMessages.join(', ')}`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      // Inject parameters into the program JSON
      const modifiedProgram = KclUtils.injectParametersIntoProgram(parseResult.program, parameters ?? {});

      // Execute the modified program
      const executionResult = await utils.executeProgram(modifiedProgram);

      // Check for execution errors
      if (executionResult.errors.length > 0) {
        console.warn('KCL execution errors:', executionResult.errors);
        const errorMessages = executionResult.errors.map((error) => {
          if (typeof error === 'string') {
            return error;
          }

          const errorObject = error as { message?: string; msg?: string };
          return errorObject.message ?? errorObject.msg ?? JSON.stringify(error);
        });
        return createKernelError({
          message: `KCL execution failed: ${errorMessages.join(', ')}`,
          startColumn: 0,
          startLineNumber: 0,
        });
      }

      // Now export to STL format using operations already in memory
      const exportResult = await utils.exportFromMemory({
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
      stlDataMemory[shapeId] = stlFile.contents;

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
    // Check if STL data exists in memory
    const stlData = stlDataMemory[shapeId];
    if (!stlData) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    if (fileType === 'step') {
      // For STEP export, use operations already in memory without re-execution
      try {
        const utils = await getKclUtilsWithEngine();

        // Use exportFromMemory to export STEP format from operations already in memory
        const stepResult = await utils.exportFromMemory({
          type: 'step',
        });

        if (stepResult.length === 0) {
          return createKernelError({
            message: 'No STEP data received from KCL export',
            startColumn: 0,
            startLineNumber: 0,
          });
        }

        const stepFile = stepResult[0];
        if (!stepFile) {
          return createKernelError({
            message: 'No STEP file in export result',
            startColumn: 0,
            startLineNumber: 0,
          });
        }

        const blob = new Blob([stepFile.contents], {
          type: 'application/step',
        });

        return createKernelSuccess([
          {
            blob,
            name: 'model.step',
          },
        ]);
      } catch (stepError) {
        console.error('STEP export error:', stepError);
        return createKernelError({
          message: 'STEP export failed',
          startColumn: 0,
          startLineNumber: 0,
        });
      }
    }

    // For STL export (both ASCII and binary)
    const blob = new Blob([stlData], {
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
      // Initialize WASM for basic operations - engine will be initialized on-demand
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
