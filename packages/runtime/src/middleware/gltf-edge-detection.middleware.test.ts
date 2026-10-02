/**
 * Tests for the GLTF edge detection middleware.
 * Tests the wrap-style hook with onion model execution, including
 * the skip-existing-lines optimization and round-trip avoidance.
 */

import { describe, it, expect, vi } from 'vitest';
import { Document, NodeIO, Accessor } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import type { GeometryGltf, GeometrySvg } from '@taucad/types';
import type { KernelMiddlewareRuntime } from '#types/runtime-middleware.types.js';
import { gltfEdgeDetectionMiddleware } from '#middleware/gltf-edge-detection.middleware.js';
import { mergedEdgesNodeName } from '#utils/merge-gltf-edges.js';
import {
  createMockCreateGeometryHandler,
  createMockRuntime,
  createMockInput,
  createSuccessResult,
  createErrorResult,
  createEmptySuccessResult,
} from '#testing/kernel-testing.utils.js';

// =============================================================================
// Constants
// =============================================================================

const primitiveModeTriangles = 4;
const primitiveModeLines = 1;

// =============================================================================
// Test GLTF Factories
// =============================================================================

/**
 * Create a minimal GLTF binary with a single cube mesh (triangles only, no lines).
 * The cube has 90-degree dihedral angles so edge detection will find all 12 edges.
 *
 * @returns The binary GLTF data
 */
async function createCubeGltfWithoutLines(): Promise<Uint8Array<ArrayBuffer>> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();

  // Unit cube: 8 vertices
  // prettier-ignore -- preserve vertex coordinate alignment
  const positions = new Float32Array([
    0,
    0,
    1, // 0 - front bottom left
    1,
    0,
    1, // 1 - front bottom right
    1,
    1,
    1, // 2 - front top right
    0,
    1,
    1, // 3 - front top left
    0,
    0,
    0, // 4 - back bottom left
    1,
    0,
    0, // 5 - back bottom right
    1,
    1,
    0, // 6 - back top right
    0,
    1,
    0, // 7 - back top left
  ]);

  // 12 triangles for 6 faces
  // prettier-ignore -- preserve triangle index grouping
  const indices = new Uint16Array([
    0,
    1,
    2,
    2,
    3,
    0, // Front
    5,
    4,
    7,
    7,
    6,
    5, // Back
    3,
    2,
    6,
    6,
    7,
    3, // Top
    4,
    5,
    1,
    1,
    0,
    4, // Bottom
    1,
    5,
    6,
    6,
    2,
    1, // Right
    4,
    0,
    3,
    3,
    7,
    4, // Left
  ]);

  const positionAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(positions);

  const indexAccessor = document.createAccessor().setBuffer(buffer).setType(Accessor.Type['SCALAR']!).setArray(indices);

  const primitive = document
    .createPrimitive()
    .setMode(primitiveModeTriangles)
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor);

  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);

  return io.writeBinary(document);
}

/**
 * Create a GLTF binary with a cube mesh that already has LINE primitives.
 * Simulates replicad's meshEdges() output embedded in the GLTF.
 *
 * @returns The binary GLTF data
 */
async function createCubeGltfWithLines(): Promise<Uint8Array<ArrayBuffer>> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();

  // Cube triangle data (same as above)
  // prettier-ignore -- preserve vertex coordinate alignment
  const positions = new Float32Array([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);

  // prettier-ignore -- preserve triangle index grouping
  const indices = new Uint16Array([
    0, 1, 2, 2, 3, 0, 5, 4, 7, 7, 6, 5, 3, 2, 6, 6, 7, 3, 4, 5, 1, 1, 0, 4, 1, 5, 6, 6, 2, 1, 4, 0, 3, 3, 7, 4,
  ]);

  const positionAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(positions);

  const indexAccessor = document.createAccessor().setBuffer(buffer).setType(Accessor.Type['SCALAR']!).setArray(indices);

  const trianglePrimitive = document
    .createPrimitive()
    .setMode(primitiveModeTriangles)
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor);

  // Add existing LINE primitive (simulating replicad native edges)
  // Just one edge from (0,0,0) to (1,0,0) as a minimal example
  const linePositions = new Float32Array([0, 0, 0, 1, 0, 0]);
  const lineIndices = new Uint32Array([0, 1]);

  const linePositionAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(linePositions);

  const lineIndexAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(lineIndices);

  const linePrimitive = document
    .createPrimitive()
    .setMode(primitiveModeLines)
    .setAttribute('POSITION', linePositionAccessor)
    .setIndices(lineIndexAccessor);

  const mesh = document.createMesh().addPrimitive(trianglePrimitive).addPrimitive(linePrimitive);
  const node = document.createNode().setMesh(mesh);
  document.createScene().addChild(node);

  return io.writeBinary(document);
}

/**
 * Create a GLTF with two meshes: one with existing lines (should be skipped)
 * and one without (should get edge detection).
 */
async function createMixedMeshGltf(): Promise<Uint8Array<ArrayBuffer>> {
  const io = new NodeIO();
  const document = new Document();
  const buffer = document.createBuffer();

  // --- Mesh 1: cube WITH existing line primitive ---
  // prettier-ignore -- preserve vertex coordinate alignment
  const positions1 = new Float32Array([0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  // prettier-ignore -- preserve triangle index grouping
  const indices1 = new Uint16Array([
    0, 1, 2, 2, 3, 0, 5, 4, 7, 7, 6, 5, 3, 2, 6, 6, 7, 3, 4, 5, 1, 1, 0, 4, 1, 5, 6, 6, 2, 1, 4, 0, 3, 3, 7, 4,
  ]);

  const trianglePrimitive1 = document
    .createPrimitive()
    .setMode(primitiveModeTriangles)
    .setAttribute(
      'POSITION',
      document.createAccessor().setBuffer(buffer).setType(Accessor.Type['VEC3']!).setArray(positions1),
    )
    .setIndices(document.createAccessor().setBuffer(buffer).setType(Accessor.Type['SCALAR']!).setArray(indices1));

  const linePositions1 = new Float32Array([0, 0, 0, 1, 0, 0]);
  const linePrimitive1 = document
    .createPrimitive()
    .setMode(primitiveModeLines)
    .setAttribute(
      'POSITION',
      document.createAccessor().setBuffer(buffer).setType(Accessor.Type['VEC3']!).setArray(linePositions1),
    )
    .setIndices(
      document
        .createAccessor()
        .setBuffer(buffer)
        .setType(Accessor.Type['SCALAR']!)
        .setArray(new Uint32Array([0, 1])),
    );

  const mesh1 = document.createMesh().addPrimitive(trianglePrimitive1).addPrimitive(linePrimitive1);

  // --- Mesh 2: cube WITHOUT line primitive ---
  // Offset cube at (2,0,0)
  // prettier-ignore -- preserve vertex coordinate alignment
  const positions2 = new Float32Array([2, 0, 1, 3, 0, 1, 3, 1, 1, 2, 1, 1, 2, 0, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0]);
  // prettier-ignore -- preserve triangle index grouping
  const indices2 = new Uint16Array([
    0, 1, 2, 2, 3, 0, 5, 4, 7, 7, 6, 5, 3, 2, 6, 6, 7, 3, 4, 5, 1, 1, 0, 4, 1, 5, 6, 6, 2, 1, 4, 0, 3, 3, 7, 4,
  ]);

  const trianglePrimitive2 = document
    .createPrimitive()
    .setMode(primitiveModeTriangles)
    .setAttribute(
      'POSITION',
      document.createAccessor().setBuffer(buffer).setType(Accessor.Type['VEC3']!).setArray(positions2),
    )
    .setIndices(document.createAccessor().setBuffer(buffer).setType(Accessor.Type['SCALAR']!).setArray(indices2));

  const mesh2 = document.createMesh().addPrimitive(trianglePrimitive2);

  // Add both meshes to scene
  const node1 = document.createNode().setMesh(mesh1).setName('MeshWithLines');
  const node2 = document.createNode().setMesh(mesh2).setName('MeshWithoutLines');
  const scene = document.createScene();
  scene.addChild(node1);
  scene.addChild(node2);

  return io.writeBinary(document);
}

// =============================================================================
// Test GLTF Analysis Utilities
// =============================================================================

/**
 * Parse GLTF content and return primitive counts per mesh.
 */
async function analyzeGltfPrimitives(gltfContent: Uint8Array<ArrayBuffer>): Promise<
  Array<{
    meshName: string | undefined;
    triangleCount: number;
    lineCount: number;
    linePrimitiveVertexCounts: number[];
  }>
> {
  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
  const document = await io.readBinary(gltfContent);

  const meshAnalysis: Array<{
    meshName: string | undefined;
    triangleCount: number;
    lineCount: number;
    linePrimitiveVertexCounts: number[];
  }> = [];

  for (const mesh of document.getRoot().listMeshes()) {
    let triangleCount = 0;
    let lineCount = 0;
    const linePrimitiveVertexCounts: number[] = [];

    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() === primitiveModeTriangles) {
        triangleCount++;
      } else if (primitive.getMode() === primitiveModeLines) {
        lineCount++;
        const positionAccessor = primitive.getAttribute('POSITION');
        linePrimitiveVertexCounts.push(positionAccessor?.getCount() ?? 0);
      }
    }

    // Get mesh name from the node that references it
    const nodes = document.getRoot().listNodes();
    const meshNode = nodes.find((n) => n.getMesh() === mesh);

    meshAnalysis.push({
      meshName: meshNode?.getName(),
      triangleCount,
      lineCount,
      linePrimitiveVertexCounts,
    });
  }

  return meshAnalysis;
}

// =============================================================================
// Test Context Helpers
// =============================================================================

type EdgeDetectionOptions = { thresholdDegrees: number };

function createEdgeDetectionContext(config?: EdgeDetectionOptions): {
  input: ReturnType<typeof createMockInput>;
  runtime: KernelMiddlewareRuntime<Record<string, never>, EdgeDetectionOptions> &
    ReturnType<typeof createMockRuntime<Record<string, never>, EdgeDetectionOptions>>;
} {
  return {
    input: createMockInput(),
    runtime: createMockRuntime<Record<string, never>, EdgeDetectionOptions>({
      options: config ?? { thresholdDegrees: 30 },
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('gltfEdgeDetectionMiddleware', () => {
  describe('wrapCreateGeometry', () => {
    describe('meshes without existing line primitives', () => {
      it('should detect edges and merge them into the tau-merged-edges mesh', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        expect(wrapCreateGeometry).toBeDefined();

        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(handler).toHaveBeenCalled();
        expect(result.success).toBe(true);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          expect(geometry.format).toBe('gltf');

          const meshes = await analyzeGltfPrimitives(geometry.content);
          // Source mesh (now triangles only) + merged-edges mesh.
          expect(meshes).toHaveLength(2);

          const sourceMesh = meshes.find((m) => m.meshName !== mergedEdgesNodeName);
          expect(sourceMesh).toBeDefined();
          expect(sourceMesh!.triangleCount).toBe(1);
          expect(sourceMesh!.lineCount).toBe(0);

          const mergedMesh = meshes.find((m) => m.meshName === mergedEdgesNodeName);
          expect(mergedMesh).toBeDefined();
          expect(mergedMesh!.triangleCount).toBe(0);
          expect(mergedMesh!.lineCount).toBe(1);
        }
      });

      it('should detect 12 edges for a cube (all 90-degree dihedral angles)', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          const meshes = await analyzeGltfPrimitives(geometry.content);

          // A cube has 12 edges, each edge has 2 vertices, all in the merged primitive.
          const mergedMesh = meshes.find((m) => m.meshName === mergedEdgesNodeName);
          expect(mergedMesh).toBeDefined();
          const edgeVertexCount = mergedMesh!.linePrimitiveVertexCounts[0]!;
          const edgeCount = edgeVertexCount / 2;
          expect(edgeCount).toBe(12);
        }
      });

      it('should produce a new GLTF binary (not return original)', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          // The content should be different from the original (re-serialized with merged edges)
          expect(geometry.content).not.toBe(gltfData);
          expect(geometry.content.byteLength).toBeGreaterThan(gltfData.byteLength);
        }
      });
    });

    describe('meshes with existing line primitives', () => {
      it('should skip detection but still merge pre-existing LINES into tau-merged-edges', async () => {
        const gltfData = await createCubeGltfWithLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          expect(geometry.format).toBe('gltf');

          const meshes = await analyzeGltfPrimitives(geometry.content);
          // Source mesh (triangles only after merge) + merged-edges mesh.
          expect(meshes).toHaveLength(2);

          const sourceMesh = meshes.find((m) => m.meshName !== mergedEdgesNodeName);
          expect(sourceMesh).toBeDefined();
          expect(sourceMesh!.triangleCount).toBe(1);
          // The pre-existing LINE primitive moved into tau-merged-edges.
          expect(sourceMesh!.lineCount).toBe(0);

          const mergedMesh = meshes.find((m) => m.meshName === mergedEdgesNodeName);
          expect(mergedMesh).toBeDefined();
          expect(mergedMesh!.lineCount).toBe(1);
          // The single pre-existing edge (2 vertices) survives the merge with identity transform.
          expect(mergedMesh!.linePrimitiveVertexCounts[0]).toBe(2);
        }
      });

      it('should re-serialize when only pre-existing LINES are present (merge runs)', async () => {
        // Pre-merge behaviour returned the original geometry untouched when no detection
        // ran; post-merge we still consolidate native LINES so the document is rewritten.
        const gltfData = await createCubeGltfWithLines();
        const originalGeometry: GeometryGltf = {
          format: 'gltf',
          content: gltfData,
        };
        const handlerResult = createSuccessResult([originalGeometry]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          // A different object reference — the document was re-serialised after merging.
          expect(result.data[0]).not.toBe(originalGeometry);
          const geometry = result.data[0] as GeometryGltf;
          expect(geometry.content).not.toBe(gltfData);
        }
      });
    });

    describe('mixed meshes', () => {
      it('should merge detection-generated edges and pre-existing edges into one primitive', async () => {
        const gltfData = await createMixedMeshGltf();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          const meshes = await analyzeGltfPrimitives(geometry.content);

          // 2 source meshes (triangles only) + 1 merged-edges mesh
          expect(meshes).toHaveLength(3);

          // Source meshes lost their LINE primitives during the merge.
          const meshWithLines = meshes.find((m) => m.meshName === 'MeshWithLines');
          expect(meshWithLines).toBeDefined();
          expect(meshWithLines!.lineCount).toBe(0);

          const meshWithoutLines = meshes.find((m) => m.meshName === 'MeshWithoutLines');
          expect(meshWithoutLines).toBeDefined();
          expect(meshWithoutLines!.lineCount).toBe(0);

          // The single merged primitive contains 2 (pre-existing) + 24 (detected) = 26 vertices.
          const mergedMesh = meshes.find((m) => m.meshName === mergedEdgesNodeName);
          expect(mergedMesh).toBeDefined();
          expect(mergedMesh!.lineCount).toBe(1);
          expect(mergedMesh!.linePrimitiveVertexCounts[0]).toBe(26);
        }
      });

      it('should produce a new GLTF binary for mixed meshes (some edges were added)', async () => {
        const gltfData = await createMixedMeshGltf();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          // Should be different from original (edges were added + merged).
          expect(geometry.content).not.toBe(gltfData);
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
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data[0]).toEqual(svgGeometry);
        }
      });

      it('should handle mixed GLTF and SVG geometries', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const svgGeometry: GeometrySvg = {
          format: 'svg',
          paths: ['<path d="M0,0 L10,10"/>'],
          viewbox: '0 0 100 100',
          name: 'test-svg',
        };
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }, svgGeometry]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data).toHaveLength(2);
          // GLTF should be processed (edges added)
          expect(result.data[0]?.format).toBe('gltf');
          // SVG should be unchanged
          expect(result.data[1]).toEqual(svgGeometry);
        }
      });
    });

    describe('failed and empty results', () => {
      it('should pass through failed results unchanged', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(errorResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result).toEqual(errorResult);
      });

      it('should pass through results with empty data array', async () => {
        const emptyResult = createEmptySuccessResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(emptyResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result).toEqual(emptyResult);
      });
    });

    describe('logging', () => {
      it('should log trace message when processing GLTF geometries', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).toHaveBeenCalledWith('Adding edge primitives to GLTF geometries');
      });

      it('should not log when result is empty', async () => {
        const emptyResult = createEmptySuccessResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(emptyResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).not.toHaveBeenCalled();
      });

      it('should not log when result is an error', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(errorResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).not.toHaveBeenCalled();
      });
    });

    describe('edge material properties', () => {
      it('should use unlit material for the merged edges primitive', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
          const document = await io.readBinary(geometry.content);

          const mergedMesh = document
            .getRoot()
            .listMeshes()
            .find((m) => m.getName() === mergedEdgesNodeName);
          expect(mergedMesh).toBeDefined();

          const mergedPrimitive = mergedMesh!.listPrimitives().find((p) => p.getMode() === primitiveModeLines);
          expect(mergedPrimitive).toBeDefined();

          const material = mergedPrimitive!.getMaterial();
          expect(material).not.toBeNull();
          expect(material!.getName()).toBe('tau-edge-material');

          const baseColor = material!.getBaseColorFactor();
          expect(baseColor[0]).toBeCloseTo(0, 5);
          expect(baseColor[1]).toBeCloseTo(0, 5);
          expect(baseColor[2]).toBeCloseTo(0, 5);
          expect(baseColor[3]).toBeCloseTo(1, 5);

          const unlitExtension = material!.getExtension('KHR_materials_unlit');
          expect(unlitExtension).not.toBeNull();
        }
      });
    });

    describe('merged-edges topology guarantees', () => {
      it('emits exactly one LINES primitive across the entire document', async () => {
        const gltfData = await createMixedMeshGltf();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);
        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
          const document = await io.readBinary(geometry.content);

          let lineCount = 0;
          for (const mesh of document.getRoot().listMeshes()) {
            for (const primitive of mesh.listPrimitives()) {
              if (primitive.getMode() === primitiveModeLines) {
                lineCount++;
              }
            }
          }
          expect(lineCount).toBe(1);
        }
      });

      it('attaches the merged-edges node at the scene root with identity transform', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult([{ format: 'gltf', content: gltfData }]);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionMiddleware;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data[0] as GeometryGltf;
          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
          const document = await io.readBinary(geometry.content);

          const scene = document.getRoot().listScenes()[0]!;
          const mergedNode = scene.listChildren().find((n) => n.getName() === mergedEdgesNodeName);
          expect(mergedNode).toBeDefined();
          expect(mergedNode!.getTranslation()).toEqual([0, 0, 0]);
          expect(mergedNode!.getRotation()).toEqual([0, 0, 0, 1]);
          expect(mergedNode!.getScale()).toEqual([1, 1, 1]);
        }
      });
    });
  });
});
