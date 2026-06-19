/**
 * Tests for the GLTF coordinate transform middleware.
 * Tests the wrap-style hook with onion model execution.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Document, NodeIO, Accessor } from '@gltf-transform/core';
import type { GeometryGltf, GeometrySvg } from '@taucad/types';
import { gltfCoordinateTransform } from '#middleware/gltf-coordinate-transform.middleware.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import {
  createMockRuntime,
  createMockInput,
  createSuccessResult,
  createErrorResult,
  createEmptySuccessResult,
  createMockCreateGeometryHandler,
} from '#testing/kernel-testing.utils.js';

/**
 * Create a minimal GLTF binary with a single triangle at specified positions.
 * Positions are in Y-up meters (standard GLTF format).
 *
 * @param positions - Array of vertex positions [x1, y1, z1, x2, y2, z2, ...]
 * @returns The binary GLTF data
 */
async function createTestGltf(positions: number[]): Promise<Uint8Array<ArrayBuffer>> {
  const io = new NodeIO();
  const document = new Document();

  // Create a buffer
  const buffer = document.createBuffer();

  // Create position accessor
  const positionAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array(positions));

  // Create indices for a triangle (or multiple triangles)
  const numberVertices = positions.length / 3;
  const indices: number[] = [];
  for (let index = 0; index < numberVertices; index++) {
    indices.push(index);
  }

  const indexAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint16Array(indices));

  // Create normal accessor (dummy normals)
  const normals = new Float32Array(numberVertices * 3);
  for (let index = 0; index < numberVertices; index++) {
    normals[index * 3] = 0;
    normals[index * 3 + 1] = 1;
    normals[index * 3 + 2] = 0;
  }

  const normalAccessor = document.createAccessor().setBuffer(buffer).setType(Accessor.Type['VEC3']!).setArray(normals);

  // Create primitive
  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('NORMAL', normalAccessor)
    .setIndices(indexAccessor);

  // Create mesh and add to scene
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);

  return io.writeBinary(document);
}

/**
 * Read vertex positions from a GLTF binary.
 *
 * @param data - The binary GLTF data
 * @returns Array of vertex positions [x1, y1, z1, x2, y2, z2, ...]
 */
async function readGltfPositions(data: Uint8Array<ArrayBuffer>): Promise<number[]> {
  const io = new NodeIO();
  const document = await io.readBinary(data);

  const positions: number[] = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const positionAccessor = primitive.getAttribute('POSITION');
      if (positionAccessor) {
        const array = positionAccessor.getArray();
        if (array) {
          positions.push(...array);
        }
      }
    }
  }

  return positions;
}

/**
 * Create input and runtime for testing.
 */
function createTransformContext() {
  return {
    input: createMockInput(),
    runtime: createMockRuntime(),
  };
}

describe('gltfCoordinateTransformMiddleware', () => {
  const resolveGltfCoordinateTransformMiddleware = async () =>
    resolveRuntimePluginDefinition('middleware', gltfCoordinateTransform());
  let gltfCoordinateTransformMiddleware: Awaited<ReturnType<typeof resolveGltfCoordinateTransformMiddleware>>;

  beforeAll(async () => {
    gltfCoordinateTransformMiddleware = await resolveGltfCoordinateTransformMiddleware();
  });

  describe('wrapCreateGeometry', () => {
    describe('successful results with GLTF geometries', () => {
      it('should call handler and transform result', async () => {
        // Input: [1, 2, 3] in Y-up meters
        // Expected output: [1000, -3000, 2000] in Z-up mm
        // Transform: x' = x*1000, y' = -z*1000, z' = y*1000
        const gltfData = await createTestGltf([1, 2, 3]);
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        expect(wrapCreateGeometry).toBeDefined();

        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        expect(handler).toHaveBeenCalled();
        expect(transformed.success).toBe(true);

        if (transformed.success) {
          const geometry = transformed.data[0] as GeometryGltf;
          expect(geometry.format).toBe('gltf');

          const positions = await readGltfPositions(geometry.content);
          expect(positions).toHaveLength(3);
          expect(positions[0]).toBeCloseTo(1000, 1); // X * 1000
          expect(positions[1]).toBeCloseTo(-3000, 1); // -z * 1000
          expect(positions[2]).toBeCloseTo(2000, 1); // Y * 1000
        }
      });

      it('should transform multiple vertices correctly', async () => {
        // Test multiple vertices (a triangle)
        const gltfData = await createTestGltf([
          1,
          0,
          0, // Vertex 1
          0,
          1,
          0, // Vertex 2
          0,
          0,
          1, // Vertex 3
        ]);
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        if (transformed.success) {
          const positions = await readGltfPositions((transformed.data[0] as GeometryGltf).content);
          // Vertex 1: (1,0,0) -> (1000, 0, 0)
          expect(positions[0]).toBeCloseTo(1000, 1);
          expect(positions[1]).toBeCloseTo(0, 1);
          expect(positions[2]).toBeCloseTo(0, 1);
          // Vertex 2: (0,1,0) -> (0, 0, 1000)
          expect(positions[3]).toBeCloseTo(0, 1);
          expect(positions[4]).toBeCloseTo(0, 1);
          expect(positions[5]).toBeCloseTo(1000, 1);
          // Vertex 3: (0,0,1) -> (0, -1000, 0)
          expect(positions[6]).toBeCloseTo(0, 1);
          expect(positions[7]).toBeCloseTo(-1000, 1);
          expect(positions[8]).toBeCloseTo(0, 1);
        }
      });

      it('should transform multiple geometries', async () => {
        const gltfData1 = await createTestGltf([1, 0, 0]);
        const gltfData2 = await createTestGltf([0, 1, 0]);
        const handlerResult = createSuccessResult([
          { format: 'gltf', content: gltfData1 },
          { format: 'gltf', content: gltfData2 },
        ]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        expect(transformed.success).toBe(true);

        if (transformed.success) {
          expect(transformed.data).toHaveLength(2);
          expect(transformed.data[0]?.format).toBe('gltf');
          expect(transformed.data[1]?.format).toBe('gltf');
        }
      });

      it('should handle zero coordinates correctly', async () => {
        const gltfData = await createTestGltf([0, 0, 0]);
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        if (transformed.success) {
          const positions = await readGltfPositions((transformed.data[0] as GeometryGltf).content);
          // All coordinates should be zero (signed zero is acceptable due to IEEE 754 floating point)
          expect(positions[0]).toBeCloseTo(0, 5);
          expect(positions[1]).toBeCloseTo(0, 5);
          expect(positions[2]).toBeCloseTo(0, 5);
        }
      });

      it('should preserve GLTF format in output', async () => {
        const gltfData = await createTestGltf([1, 2, 3]);
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        if (transformed.success) {
          expect(transformed.data[0]?.format).toBe('gltf');
        }
      });
    });

    describe('non-GLTF geometries', () => {
      it('should pass through SVG geometries unchanged', async () => {
        const svgGeometry: GeometrySvg = {
          format: 'svg',
          paths: ['<path d="M0,0 L10,10"/>'],
          viewbox: '0 0 100 100',
          name: 'test-svg',
        };
        const handlerResult = createSuccessResult([svgGeometry]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        expect(transformed.success).toBe(true);

        if (transformed.success) {
          expect(transformed.data[0]).toEqual(svgGeometry);
        }
      });

      it('should handle mixed GLTF and SVG geometries', async () => {
        const gltfData = await createTestGltf([1, 0, 0]);
        const svgGeometry: GeometrySvg = {
          format: 'svg',
          paths: ['<path d="M0,0 L10,10"/>'],
          viewbox: '0 0 100 100',
          name: 'test-svg',
        };
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }, svgGeometry]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        expect(transformed.success).toBe(true);

        if (transformed.success) {
          expect(transformed.data).toHaveLength(2);
          // GLTF should be transformed
          expect(transformed.data[0]?.format).toBe('gltf');
          // SVG should be unchanged
          expect(transformed.data[1]).toEqual(svgGeometry);
        }
      });
    });

    describe('failed results', () => {
      it('should pass through failed results unchanged', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createTransformContext();
        const handler = vi.fn().mockResolvedValue(errorResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        expect(transformed).toEqual(errorResult);
      });
    });

    describe('empty results', () => {
      it('should pass through results with empty data array', async () => {
        const emptyResult = createEmptySuccessResult();
        const { input, runtime } = createTransformContext();
        const handler = vi.fn().mockResolvedValue(emptyResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        const transformed = await wrapCreateGeometry!(input, handler, runtime);

        expect(transformed).toEqual(emptyResult);
      });
    });

    describe('logging', () => {
      it('should log trace message when transforming', async () => {
        const gltfData = await createTestGltf([1, 0, 0]);
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createTransformContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).toHaveBeenCalledWith('Transforming GLTF geometries to Z-up/mm');
      });

      it('should not log when result is empty', async () => {
        const emptyResult = createEmptySuccessResult();
        const { input, runtime } = createTransformContext();
        const handler = vi.fn().mockResolvedValue(emptyResult);

        const { wrapCreateGeometry } = gltfCoordinateTransformMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).not.toHaveBeenCalled();
      });
    });
  });
});
