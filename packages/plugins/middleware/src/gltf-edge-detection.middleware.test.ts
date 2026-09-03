/**
 * Tests for the GLTF edge detection middleware.
 * Tests the wrap-style hook with onion model execution, including
 * owner-local edge primitive generation and round-trip avoidance.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Document, NodeIO, Accessor } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { EXTManifold } from 'manifold-3d/manifold-gltf';
import type { GeometryGltf, GeometrySvg, ExportGeometryResult } from '@taucad/runtime/types';
import type { KernelMiddlewareRuntime } from '@taucad/runtime/middleware';

import { gltfEdgeDetection } from '#gltf-edge-detection.middleware.js';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import {
  createMockCreateGeometryHandler,
  createMockRuntime,
  createMockInput,
  createSuccessResult,
  createErrorResult,
} from '@taucad/runtime-testing';

// =============================================================================
// Constants
// =============================================================================

const primitiveModeTriangles = 4;
const primitiveModeLines = 1;
const removedEdgeBundleNodeName = ['tau', 'merged', 'edges'].join('-');

// =============================================================================
// Test GLTF Factories
// =============================================================================

/**
 * Create a minimal GLTF binary with a single cube mesh (triangles only, no lines).
 * The cube has 90-degree dihedral angles so edge detection will find all 12 edges.
 *
 * @returns The binary GLTF data
 */
async function createCubeGltfWithoutLines(manifold = false): Promise<Uint8Array<ArrayBuffer>> {
  const io = manifold ? new NodeIO().registerExtensions([EXTManifold]) : new NodeIO();
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
  const indices = new Uint32Array([
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

  const normals = new Float32Array(positions.length);
  for (let index = 2; index < normals.length; index += 3) {
    normals[index] = 1;
  }
  const normalAccessor = document.createAccessor().setBuffer(buffer).setType(Accessor.Type['VEC3']!).setArray(normals);

  const indexAccessor = document.createAccessor().setBuffer(buffer).setType(Accessor.Type['SCALAR']!).setArray(indices);

  const primitive = document
    .createPrimitive()
    .setMode(primitiveModeTriangles)
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('NORMAL', normalAccessor)
    .setIndices(indexAccessor);

  const mesh = document.createMesh().addPrimitive(primitive);
  if (manifold) {
    const topology = document
      .createExtension(EXTManifold)
      .createManifoldPrimitive()
      .setIndices(indexAccessor)
      .setRunIndex([0, indices.length]);
    mesh.setExtension(EXTManifold.EXTENSION_NAME, topology);
  }
  const node = document.createNode().setMesh(mesh).setExtras({ tauComponentId: 'cube' });
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

  const authoredLineMaterial = document
    .createMaterial('authored-line-material')
    .setBaseColorFactor([0.25, 0.5, 0.75, 1])
    .setMetallicFactor(0.25)
    .setRoughnessFactor(0.75)
    .setDoubleSided(false)
    .setAlphaMode('OPAQUE');

  const linePrimitive = document
    .createPrimitive()
    .setMode(primitiveModeLines)
    .setAttribute('POSITION', linePositionAccessor)
    .setIndices(lineIndexAccessor)
    .setMaterial(authoredLineMaterial);

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

async function readTriangleSnapshot(gltfContent: Uint8Array<ArrayBuffer>) {
  const document = await new NodeIO().registerExtensions([KHRMaterialsUnlit]).readBinary(gltfContent);
  return {
    nodes: document
      .getRoot()
      .listNodes()
      .map((node) => [...node.getMatrix()]),
    primitives: document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .filter((primitive) => primitive.getMode() === primitiveModeTriangles)
      .map((primitive) => ({
        positions: [...primitive.getAttribute('POSITION')!.getArray()!],
        normals: [...primitive.getAttribute('NORMAL')!.getArray()!],
        indices: [...primitive.getIndices()!.getArray()!],
        material: primitive.getMaterial()?.getBaseColorFactor() ?? null,
      })),
  };
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
    input: createMockInput({ content: { includeEdges: true } }),
    runtime: createMockRuntime<Record<string, never>, EdgeDetectionOptions>({
      options: config ?? { thresholdDegrees: 30 },
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('gltfEdgeDetection', () => {
  const resolveGltfEdgeDetectionDefinition = async () =>
    resolveRuntimePluginDefinition('middleware', gltfEdgeDetection());
  let gltfEdgeDetectionDefinition: Awaited<ReturnType<typeof resolveGltfEdgeDetectionDefinition>>;

  beforeAll(async () => {
    gltfEdgeDetectionDefinition = await resolveGltfEdgeDetectionDefinition();
  });

  it('should version owner-local edge output for geometry cache invalidation', () => {
    expect(gltfEdgeDetectionDefinition.version).toBe('2.0.0');
  });

  describe('wrapCreateGeometry', () => {
    describe('meshes without existing line primitives', () => {
      it('should detect edges and attach them to the source mesh', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        expect(wrapCreateGeometry).toBeDefined();

        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(handler).toHaveBeenCalled();
        expect(result.success).toBe(true);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          expect(geometry.format).toBe('gltf');

          const meshes = await analyzeGltfPrimitives(geometry.content);
          expect(meshes).toHaveLength(1);

          const sourceMesh = meshes[0]!;
          expect(sourceMesh.triangleCount).toBe(1);
          expect(sourceMesh.lineCount).toBe(1);
        }
      });

      it('should preserve source surface data and only add LINES content', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const before = await readTriangleSnapshot(gltfData);
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const result = await gltfEdgeDetectionDefinition.wrapCreateGeometry!(
          input,
          createMockCreateGeometryHandler(handlerResult),
          runtime,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          const geometry = result.data as GeometryGltf;
          expect(await readTriangleSnapshot(geometry.content)).toEqual(before);
          const meshes = await analyzeGltfPrimitives(geometry.content);
          expect(meshes[0]).toMatchObject({
            triangleCount: 1,
            lineCount: 1,
          });
        }
      });

      it('should detect 12 edges for a cube (all 90-degree dihedral angles)', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          const meshes = await analyzeGltfPrimitives(geometry.content);

          // A cube has 12 edges, each edge has 2 vertices, all in the source mesh's edge primitive.
          const sourceMesh = meshes[0]!;
          const edgeVertexCount = sourceMesh.linePrimitiveVertexCounts[0]!;
          const edgeCount = edgeVertexCount / 2;
          expect(edgeCount).toBe(12);
        }
      });

      it('should produce a new GLTF binary (not return original)', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          // The content should be different from the original (re-serialized with generated edges).
          expect(geometry.content).not.toBe(gltfData);
          expect(geometry.content.byteLength).toBeGreaterThan(gltfData.byteLength);
        }
      });

      it('should preserve manifold surfaces and attach generated lines as an identity child', async () => {
        const gltfData = await createCubeGltfWithoutLines(true);
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const result = await gltfEdgeDetectionDefinition.wrapCreateGeometry!(
          input,
          createMockCreateGeometryHandler(handlerResult),
          runtime,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, EXTManifold]);
          const document = await io.readBinary((result.data as GeometryGltf).content);
          const [surface, edges] = document.getRoot().listMeshes();
          const surfaceNode = document
            .getRoot()
            .listNodes()
            .find((node) => node.getMesh() === surface)!;
          const edgeNode = surfaceNode.listChildren().find((node) => node.getMesh() === edges)!;

          expect(surface!.listPrimitives().map((primitive) => primitive.getMode())).toEqual([primitiveModeTriangles]);
          expect(surface!.getExtension(EXTManifold.EXTENSION_NAME)).not.toBeNull();
          expect(edges!.listPrimitives().map((primitive) => primitive.getMode())).toEqual([primitiveModeLines]);
          expect(edges!.getExtension(EXTManifold.EXTENSION_NAME)).toBeNull();
          expect(edgeNode.getMatrix()).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
          expect(edgeNode.getExtras()).toMatchObject({ tauComponentId: 'cube' });
        }
      });
    });

    describe('meshes with existing line primitives', () => {
      it('should preserve pre-existing LINES and add fallback lines for triangles', async () => {
        const gltfData = await createCubeGltfWithLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          expect(geometry.format).toBe('gltf');

          const meshes = await analyzeGltfPrimitives(geometry.content);
          expect(meshes).toHaveLength(1);

          const sourceMesh = meshes[0]!;
          expect(sourceMesh.triangleCount).toBe(1);
          expect(sourceMesh.lineCount).toBe(2);
          expect(sourceMesh.linePrimitiveVertexCounts[0]).toBe(2);
          expect(sourceMesh.linePrimitiveVertexCounts[1]).toBe(24);

          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
          const document = await io.readBinary(geometry.content);
          const authoredMaterial = document
            .getRoot()
            .listMaterials()
            .find((material) => material.getName() === 'authored-line-material')!;
          const generatedMaterial = document
            .getRoot()
            .listMaterials()
            .find((material) => material.getName() === 'tau-edge-material')!;
          expect(authoredMaterial.getBaseColorFactor()).toEqual([0.25, 0.5, 0.75, 1]);
          expect(authoredMaterial.getMetallicFactor()).toBe(0.25);
          expect(authoredMaterial.getRoughnessFactor()).toBe(0.75);
          expect(authoredMaterial.getDoubleSided()).toBe(false);
          expect(authoredMaterial.getAlphaMode()).toBe('OPAQUE');
          expect(generatedMaterial.getBaseColorFactor()).toEqual([0, 0, 0, 1]);
          expect(generatedMaterial.getExtension('KHR_materials_unlit')).not.toBeNull();
        }
      });

      it('should return a new object while retaining authored LINES', async () => {
        const gltfData = await createCubeGltfWithLines();
        const originalGeometry: GeometryGltf = {
          format: 'gltf',
          content: gltfData,
        };
        const handlerResult = createSuccessResult(originalGeometry);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          expect(result.data).not.toBe(originalGeometry);
          const geometry = result.data as GeometryGltf;
          expect(geometry.content).not.toBe(gltfData);
          const meshes = await analyzeGltfPrimitives(geometry.content);
          expect(meshes[0]!.lineCount).toBe(2);
        }
      });
    });

    describe('mixed meshes', () => {
      it('should keep detection-generated edges and pre-existing edges on their source meshes', async () => {
        const gltfData = await createMixedMeshGltf();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          const meshes = await analyzeGltfPrimitives(geometry.content);

          expect(meshes).toHaveLength(2);

          const meshWithLines = meshes.find((m) => m.meshName === 'MeshWithLines');
          expect(meshWithLines).toBeDefined();
          expect(meshWithLines!.triangleCount).toBe(1);
          expect(meshWithLines!.lineCount).toBe(2);
          expect(meshWithLines!.linePrimitiveVertexCounts[0]).toBe(2);
          expect(meshWithLines!.linePrimitiveVertexCounts[1]).toBe(24);

          const meshWithoutLines = meshes.find((m) => m.meshName === 'MeshWithoutLines');
          expect(meshWithoutLines).toBeDefined();
          expect(meshWithoutLines!.triangleCount).toBe(1);
          expect(meshWithoutLines!.lineCount).toBe(1);
          expect(meshWithoutLines!.linePrimitiveVertexCounts[0]).toBe(24);
        }
      });

      it('should produce a new GLTF binary for mixed meshes (some edges were added)', async () => {
        const gltfData = await createMixedMeshGltf();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          // Should be different from original (edges were added to one source mesh).
          expect(geometry.content).not.toBe(gltfData);
        }
      });
    });

    describe('non-GLTF geometries', () => {
      it('should pass through SVG geometries unchanged', async () => {
        const svgGeometry: GeometrySvg = {
          format: 'svg',
          content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0,0 L10,10"/></svg>',
          name: 'test-svg',
        };
        const handlerResult = createSuccessResult(svgGeometry);
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data).toEqual(svgGeometry);
        }
      });
    });

    describe('failed results', () => {
      it('should pass through failed results unchanged', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(errorResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result).toEqual(errorResult);
      });
    });

    describe('logging', () => {
      it('should log trace message when processing GLTF geometries', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).toHaveBeenCalledWith('Adding edge primitives to GLTF geometry');
      });

      it('should not log when result failed', async () => {
        const emptyResult = createErrorResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(emptyResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).not.toHaveBeenCalled();
      });

      it('should not log when result is an error', async () => {
        const errorResult = createErrorResult();
        const { input, runtime } = createEdgeDetectionContext();
        const handler = vi.fn().mockResolvedValue(errorResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        await wrapCreateGeometry!(input, handler, runtime);

        expect(runtime.logger.trace).not.toHaveBeenCalled();
      });
    });

    describe('edge material properties', () => {
      it('should use unlit material for generated edge primitives', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
          const document = await io.readBinary(geometry.content);

          const sourceMesh = document.getRoot().listMeshes()[0]!;
          const edgePrimitive = sourceMesh.listPrimitives().find((p) => p.getMode() === primitiveModeLines);
          expect(edgePrimitive).toBeDefined();

          const material = edgePrimitive!.getMaterial();
          expect(material).not.toBeNull();
          expect(material!.getName()).toBe('tau-edge-material');

          expect(material!.getBaseColorFactor()).toEqual([0, 0, 0, 1]);
          expect(material!.getMetallicFactor()).toBe(0);
          expect(material!.getRoughnessFactor()).toBe(1);
          expect(material!.getDoubleSided()).toBe(true);
          expect(material!.getAlphaMode()).toBe('OPAQUE');

          const unlitExtension = material!.getExtension('KHR_materials_unlit');
          expect(unlitExtension).not.toBeNull();
        }
      });
    });

    describe('owner-local edge topology guarantees', () => {
      it('emits one LINES primitive per owner mesh that has edges', async () => {
        const gltfData = await createMixedMeshGltf();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        expect(result.success).toBe(true);
        if (result.success) {
          const geometry = result.data as GeometryGltf;
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
          expect(lineCount).toBe(3);
        }
      });

      it('does not attach a bundled merged-edges node at the scene root', async () => {
        const gltfData = await createCubeGltfWithoutLines();
        const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
        const { input, runtime } = createEdgeDetectionContext();
        const handler = createMockCreateGeometryHandler(handlerResult);

        const { wrapCreateGeometry } = gltfEdgeDetectionDefinition;
        const result = await wrapCreateGeometry!(input, handler, runtime);

        if (result.success) {
          const geometry = result.data as GeometryGltf;
          const io = new NodeIO().registerExtensions([KHRMaterialsUnlit]);
          const document = await io.readBinary(geometry.content);

          const scene = document.getRoot().listScenes()[0]!;
          const mergedNode = scene.listChildren().find((n) => n.getName() === removedEdgeBundleNodeName);
          expect(mergedNode).toBeUndefined();
        }
      });
    });
  });

  it('is a byte-identical passthrough when edges are false', async () => {
    const gltfData = await createCubeGltfWithoutLines();
    const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
    const input = createMockInput({ content: { includeEdges: false } });
    const runtime = createMockRuntime<Record<string, never>, EdgeDetectionOptions>({
      options: { thresholdDegrees: 30 },
    });
    const handler = createMockCreateGeometryHandler(handlerResult);

    const result = await gltfEdgeDetectionDefinition.wrapCreateGeometry!(input, handler, runtime);

    expect(result).toBe(handlerResult);
    expect(runtime.logger.trace).not.toHaveBeenCalled();
  });

  it('adds requested edges on the meshGeometry phase', async () => {
    const gltfData = await createCubeGltfWithoutLines();
    const handlerResult = createSuccessResult({ format: 'gltf', content: gltfData });
    const runtime = createMockRuntime<Record<string, never>, EdgeDetectionOptions>({
      options: { thresholdDegrees: 30 },
    });
    const handler = vi.fn().mockResolvedValue(handlerResult);

    const result = await gltfEdgeDetectionDefinition.wrapMeshGeometry!(
      { options: {}, content: { includeEdges: true } },
      handler,
      runtime,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const primitives = await analyzeGltfPrimitives((result.data as GeometryGltf).content);
      expect(primitives[0]!.lineCount).toBe(1);
    }
  });

  it('adds requested edges to GLB export files and leaves other files untouched', async () => {
    const gltfData = await createCubeGltfWithoutLines();
    const textBytes = new Uint8Array([1, 2, 3]);
    const handlerResult = {
      success: true,
      data: [
        { name: 'model.glb', bytes: gltfData, mimeType: 'model/gltf-binary' },
        { name: 'notes.txt', bytes: textBytes, mimeType: 'application/octet-stream' },
      ],
      issues: [],
    } satisfies ExportGeometryResult;
    const runtime = createMockRuntime<Record<string, never>, EdgeDetectionOptions>({
      options: { thresholdDegrees: 30 },
    });
    const handler = vi.fn().mockResolvedValue(handlerResult);

    const result = await gltfEdgeDetectionDefinition.wrapExportGeometry!(
      { format: 'glb', options: {}, content: { includeEdges: true } },
      handler,
      runtime,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const primitives = await analyzeGltfPrimitives(result.data[0]!.bytes);
      expect(primitives[0]!.lineCount).toBe(1);
      expect(result.data[1]!.bytes).toBe(textBytes);
    }
  });

  it('does not parse export bytes when edges are false', async () => {
    const malformed = new Uint8Array([1, 2, 3]);
    const handlerResult = {
      success: true,
      data: [{ name: 'model.glb', bytes: malformed, mimeType: 'model/gltf-binary' }],
      issues: [],
    } satisfies ExportGeometryResult;
    const runtime = createMockRuntime<Record<string, never>, EdgeDetectionOptions>({
      options: { thresholdDegrees: 30 },
    });
    const handler = vi.fn().mockResolvedValue(handlerResult);

    const result = await gltfEdgeDetectionDefinition.wrapExportGeometry!(
      { format: 'glb', options: {}, content: { includeEdges: false } },
      handler,
      runtime,
    );

    expect(result).toBe(handlerResult);
  });
});
