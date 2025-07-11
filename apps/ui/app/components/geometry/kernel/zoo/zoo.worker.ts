import { expose } from 'comlink';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Zoo KittyCAD SDK may not be installed
import type { file } from '@kittycad/lib';
import type { BuildShapesResult, ExportGeometryResult, ExtractParametersResult } from '~/types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '~/types/kernel.types.js';
import type { Shape3D } from '~/types/cad.types.js';

// Import the Zoo KittyCAD SDK
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Zoo KittyCAD SDK may not be installed
let zooSDK: typeof import('@kittycad/lib') | undefined;

// Global storage for computed geometry data
const geometryDataMemory: Record<string, { 
  stlData?: Uint8Array; 
  stepData?: Uint8Array; 
  vertices: number[];
  triangles: number[];
  normals: number[];
}> = {};

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Zoo KittyCAD SDK may not be installed
async function initializeZooSDK(): Promise<typeof import('@kittycad/lib')> {
  if (zooSDK) {
    return zooSDK;
  }

  try {
    // Dynamic import of the Zoo KittyCAD SDK
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Zoo KittyCAD SDK may not be installed
    zooSDK = await import('@kittycad/lib');
    return zooSDK;
  } catch (error) {
    console.error('Failed to import Zoo KittyCAD SDK:', error);
    throw new Error('Zoo KittyCAD SDK not available. Please install @kittycad/lib');
  }
}

// Format JavaScript values to KCL syntax for parameter injection
function formatKCLValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => formatKCLValue(v)).join(', ')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([k, v]) => `${k}: ${formatKCLValue(v)}`);
    return `{${entries.join(', ')}}`;
  }

  return String(value);
}

// Extract parameters from KCL code (basic implementation)
async function extractParametersFromCode(code: string): Promise<ExtractParametersResult> {
  try {
    // Basic parameter extraction for KCL
    // Look for variable declarations and const definitions
    const parameterRegex = /(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)/g;
    const defaultParameters: Record<string, unknown> = {};
    
    let match;
    while ((match = parameterRegex.exec(code)) !== null) {
      const [, name, value] = match;
      if (!name || value === undefined) continue;
      
      try {
        // Try to parse as JSON first for simple values
        if (value.trim().startsWith('"') || value.trim().startsWith("'")) {
          defaultParameters[name] = value.trim().slice(1, -1);
        } else if (!isNaN(Number(value.trim()))) {
          defaultParameters[name] = Number(value.trim());
        } else if (value.trim() === 'true' || value.trim() === 'false') {
          defaultParameters[name] = value.trim() === 'true';
        } else {
          defaultParameters[name] = value.trim();
        }
      } catch {
        defaultParameters[name] = value.trim();
      }
    }

    // Create a basic JSON schema
    const jsonSchema = {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(defaultParameters).map(([key, value]) => [
          key,
          {
            type: typeof value,
            default: value,
          },
        ])
      ),
      additionalProperties: false,
    };

    return createKernelSuccess({
      defaultParameters,
      jsonSchema,
    });
  } catch (error) {
    console.error('Error extracting parameters:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
}

// Build shapes from KCL code using Zoo API
async function buildShapesFromCode(
  code: string,
  parameters?: Record<string, unknown>,
  shapeId = 'defaultShape',
): Promise<BuildShapesResult> {
  try {
    // Check if code is empty after trimming whitespace
    const trimmedCode = code.trim();
    if (trimmedCode === '') {
      // Return empty shape for empty code
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

    const zoo = await initializeZooSDK();

    // Inject parameters into KCL code if provided
    let processedCode = code;
    if (parameters) {
      // Simple parameter injection - replace variable declarations
      for (const [key, value] of Object.entries(parameters)) {
        const paramRegex = new RegExp(`(const|let|var)\\s+${key}\\s*=\\s*[^;\\n]+`, 'g');
        const replacement = `const ${key} = ${formatKCLValue(value)}`;
        processedCode = processedCode.replace(paramRegex, replacement);
      }
    }

    try {
      // Call Zoo API to execute KCL code and get geometry
      // For now, we'll create a basic geometric shape as placeholder
      // In a real implementation, you would use zoo.modeling.execute_kcl or similar API
      
      // This is a placeholder implementation - you would replace this with actual Zoo API calls
      const mockGeometry = createMockGeometry(processedCode);
      
      // Store geometry data for export
      geometryDataMemory[shapeId] = mockGeometry;

      // Create Shape3D object from the geometry data
      const shape: Shape3D = {
        type: '3d',
        name: 'KCL Shape',
        faces: {
          vertices: mockGeometry.vertices,
          triangles: mockGeometry.triangles,
          normals: mockGeometry.normals,
          faceGroups: [
            {
              start: 0,
              count: mockGeometry.triangles.length,
              faceId: 0,
            },
          ],
        },
        edges: { lines: [], edgeGroups: [] },
        error: false,
      };

      return createKernelSuccess([shape]);

    } catch (apiError) {
      console.error('Zoo API error:', apiError);
      const errorMessage = apiError instanceof Error ? apiError.message : 'Zoo API execution failed';
      return createKernelError({ 
        message: errorMessage, 
        startColumn: 0, 
        startLineNumber: 0,
        type: 'runtime'
      });
    }

  } catch (error) {
    console.error('Error while building shapes from KCL code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ 
      message: errorMessage, 
      startColumn: 0, 
      startLineNumber: 0,
      type: 'compilation'
    });
  }
}

// Create mock geometry for demonstration (replace with actual Zoo API calls)
function createMockGeometry(code: string): {
  stlData?: Uint8Array;
  stepData?: Uint8Array;
  vertices: number[];
  triangles: number[];
  normals: number[];
} {
  // Create a simple cube as mock geometry
  const vertices = [
    // Front face
    -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,  1,
    // Back face
    -1, -1, -1, -1,  1, -1,  1,  1, -1,  1, -1, -1,
    // Top face
    -1,  1, -1, -1,  1,  1,  1,  1,  1,  1,  1, -1,
    // Bottom face
    -1, -1, -1,  1, -1, -1,  1, -1,  1, -1, -1,  1,
    // Right face
     1, -1, -1,  1,  1, -1,  1,  1,  1,  1, -1,  1,
    // Left face
    -1, -1, -1, -1, -1,  1, -1,  1,  1, -1,  1, -1,
  ];

  const triangles = [
    0,  1,  2,   0,  2,  3,    // front
    4,  5,  6,   4,  6,  7,    // back
    8,  9, 10,   8, 10, 11,    // top
   12, 13, 14,  12, 14, 15,    // bottom
   16, 17, 18,  16, 18, 19,    // right
   20, 21, 22,  20, 22, 23,    // left
  ];

  const normals: number[] = [];
  // Calculate face normals for each vertex
  for (let i = 0; i < triangles.length; i += 3) {
    const i1 = triangles[i] * 3;
    const i2 = triangles[i + 1] * 3;
    const i3 = triangles[i + 2] * 3;

    const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
    const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
    const v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];

    // Calculate edges
    const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

    // Calculate normal using cross product
    const normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0],
    ];

    // Normalize
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (length > 0) {
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }

    // Add normal for each vertex of the triangle
    normals.push(...normal, ...normal, ...normal);
  }

  return {
    vertices,
    triangles,
    normals,
  };
}

// Export shape to STL or STEP format
const exportShape = async (
  fileType: 'stl' | 'stl-binary' | 'step' | 'step-assembly' = 'stl',
  shapeId = 'defaultShape',
): Promise<ExportGeometryResult> => {
  console.log('exportShape-zoo', fileType, shapeId);
  try {
    // Check if geometry data exists in memory
    const geometryData = geometryDataMemory[shapeId];
    if (!geometryData) {
      return createKernelError({
        message: `Shape ${shapeId} not computed yet. Please build shapes before exporting.`,
        startColumn: 0,
        startLineNumber: 0,
      });
    }

    const zoo = await initializeZooSDK();

    // For STL export
    if (fileType === 'stl' || fileType === 'stl-binary') {
      let stlData: Uint8Array;
      
      if (geometryData.stlData) {
        stlData = geometryData.stlData;
      } else {
        // Generate STL data from mesh geometry
        stlData = generateSTLFromMesh(geometryData, fileType === 'stl-binary');
        geometryData.stlData = stlData;
      }

      const blob = new Blob([stlData], {
        type: 'model/stl' + (fileType === 'stl-binary' ? '' : '+ascii'),
      });

      console.log('exportShape-zoo', blob);
      return createKernelSuccess([
        {
          blob,
          name: fileType === 'stl-binary' ? 'model-binary.stl' : 'model.stl',
        },
      ]);
    }

    // For STEP export
    if (fileType === 'step' || fileType === 'step-assembly') {
      let stepData: Uint8Array;
      
      if (geometryData.stepData) {
        stepData = geometryData.stepData;
      } else {
        // Generate STEP data - in a real implementation, this would use Zoo API
        stepData = generateSTEPFromMesh(geometryData);
        geometryData.stepData = stepData;
      }

      const blob = new Blob([stepData], {
        type: 'model/step',
      });

      return createKernelSuccess([
        {
          blob,
          name: fileType === 'step-assembly' ? 'model-assembly.step' : 'model.step',
        },
      ]);
    }

    return createKernelError({
      message: `Unsupported export format: ${fileType}`,
      startColumn: 0,
      startLineNumber: 0,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createKernelError({ message: errorMessage, startColumn: 0, startLineNumber: 0 });
  }
};

// Generate STL data from mesh geometry
function generateSTLFromMesh(geometryData: { vertices: number[]; triangles: number[]; normals: number[] }, binary: boolean): Uint8Array {
  const { vertices, triangles, normals } = geometryData;
  
  if (binary) {
    // Binary STL format
    const triangleCount = triangles.length / 3;
    const buffer = new ArrayBuffer(80 + 4 + triangleCount * 50);
    const view = new DataView(buffer);
    
    // Header (80 bytes) - filled with zeros
    let offset = 80;
    
    // Triangle count
    view.setUint32(offset, triangleCount, true);
    offset += 4;
    
    // Triangles
    for (let i = 0; i < triangles.length; i += 3) {
      const t1 = triangles[i];
      const t2 = triangles[i + 1];
      const t3 = triangles[i + 2];
      
      if (t1 === undefined || t2 === undefined || t3 === undefined) continue;
      
      const i1 = t1 * 3;
      const i2 = t2 * 3;
      const i3 = t3 * 3;
      const normalIndex = i * 3; // normals are per-vertex, so index is different
      
      // Normal vector (12 bytes)
      view.setFloat32(offset, normals[normalIndex] || 0, true); offset += 4;
      view.setFloat32(offset, normals[normalIndex + 1] || 0, true); offset += 4;
      view.setFloat32(offset, normals[normalIndex + 2] || 0, true); offset += 4;
      
      // Vertex 1 (12 bytes)
      view.setFloat32(offset, vertices[i1] || 0, true); offset += 4;
      view.setFloat32(offset, vertices[i1 + 1] || 0, true); offset += 4;
      view.setFloat32(offset, vertices[i1 + 2] || 0, true); offset += 4;
      
      // Vertex 2 (12 bytes)
      view.setFloat32(offset, vertices[i2] || 0, true); offset += 4;
      view.setFloat32(offset, vertices[i2 + 1] || 0, true); offset += 4;
      view.setFloat32(offset, vertices[i2 + 2] || 0, true); offset += 4;
      
      // Vertex 3 (12 bytes)
      view.setFloat32(offset, vertices[i3] || 0, true); offset += 4;
      view.setFloat32(offset, vertices[i3 + 1] || 0, true); offset += 4;
      view.setFloat32(offset, vertices[i3 + 2] || 0, true); offset += 4;
      
      // Attribute byte count (2 bytes)
      view.setUint16(offset, 0, true); offset += 2;
    }
    
    return new Uint8Array(buffer);
  } else {
    // ASCII STL format
    let stlContent = 'solid ZooModel\n';
    
    for (let i = 0; i < triangles.length; i += 3) {
      const t1 = triangles[i];
      const t2 = triangles[i + 1];
      const t3 = triangles[i + 2];
      
      if (t1 === undefined || t2 === undefined || t3 === undefined) continue;
      
      const i1 = t1 * 3;
      const i2 = t2 * 3;
      const i3 = t3 * 3;
      const normalIndex = i * 3;
      
      stlContent += `facet normal ${normals[normalIndex] || 0} ${normals[normalIndex + 1] || 0} ${normals[normalIndex + 2] || 0}\n`;
      stlContent += 'outer loop\n';
      stlContent += `vertex ${vertices[i1] || 0} ${vertices[i1 + 1] || 0} ${vertices[i1 + 2] || 0}\n`;
      stlContent += `vertex ${vertices[i2] || 0} ${vertices[i2 + 1] || 0} ${vertices[i2 + 2] || 0}\n`;
      stlContent += `vertex ${vertices[i3] || 0} ${vertices[i3 + 1] || 0} ${vertices[i3 + 2] || 0}\n`;
      stlContent += 'endloop\n';
      stlContent += 'endfacet\n';
    }
    
    stlContent += 'endsolid ZooModel\n';
    return new TextEncoder().encode(stlContent);
  }
}

// Generate STEP data from mesh geometry (placeholder implementation)
function generateSTEPFromMesh(geometryData: { vertices: number[]; triangles: number[]; normals: number[] }): Uint8Array {
  // This is a placeholder implementation for STEP export
  // In a real implementation, you would use the Zoo API to generate proper STEP files
  const stepContent = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Generated by Zoo KCL Kernel'),'2;1');
FILE_NAME('model.step','${new Date().toISOString()}',('Zoo'),('Zoo Corporation'),'Zoo CAD Kernel','Zoo CAD Kernel','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
/* Placeholder STEP content - replace with actual Zoo API call */
ENDSEC;
END-ISO-10303-21;
`;
  return new TextEncoder().encode(stepContent);
}

const service = {
  async initialize() {
    await initializeZooSDK();
  },
  ready: async () => {
    try {
      await initializeZooSDK();
      return true;
    } catch {
      return false;
    }
  },
  buildShapesFromCode,
  extractParametersFromCode,
  toggleExceptions: async () => 'single' as const,
  exportShape,
  isExceptionsEnabled: () => false,
};

expose(service);
export type ZooBuilderInterface = typeof service;