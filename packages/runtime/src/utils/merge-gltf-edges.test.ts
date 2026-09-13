import { describe, it, expect } from 'vitest';
import { Document, NodeIO, Accessor } from '@gltf-transform/core';
import { mergeGltfLineSegments, mergedEdgesNodeName } from '#utils/merge-gltf-edges.js';

// =============================================================================
// Constants — kept local so the test source is self-contained
// =============================================================================

const primitiveModeTriangles = 4;
const primitiveModeLines = 1;

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Create a fresh glTF document with a single (empty) scene.
 */
function createDocumentWithScene(): Document {
  const document = new Document();
  document.createScene();
  return document;
}

/**
 * Require the first scene in a document — used after `createDocumentWithScene()` where the
 * scene is guaranteed to exist. Keeps callers free of inline non-null assertions.
 */
function requireScene(document: Document): ReturnType<Document['createScene']> {
  const scene = document.getRoot().listScenes()[0];
  if (!scene) {
    throw new Error('Test document is missing the expected scene');
  }
  return scene;
}

/**
 * Attach a LINES primitive (indexed, two vertices = one edge) to a node, optionally
 * setting the node's translation so the world-matrix bake can be observed in tests.
 */
type AttachIndexedLineOptions = {
  readonly document: Document;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly translation?: [number, number, number];
};

function attachIndexedLinePrimitive(options: AttachIndexedLineOptions): void {
  const { document, positions, indices, translation } = options;
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const positionAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['VEC3']!)
    .setArray(new Float32Array(positions));
  const indexAccessor = document
    .createAccessor()
    .setBuffer(buffer)
    .setType(Accessor.Type['SCALAR']!)
    .setArray(new Uint32Array(indices));
  const primitive = document
    .createPrimitive()
    .setMode(primitiveModeLines)
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor);
  const mesh = document.createMesh().addPrimitive(primitive);
  const node = document.createNode().setMesh(mesh);
  if (translation) {
    node.setTranslation(translation);
  }
  const scene = document.getRoot().listScenes()[0];
  if (!scene) {
    throw new Error('attachIndexedLinePrimitive expects a document with at least one scene');
  }
  scene.addChild(node);
}

/**
 * Round-trip a document through the binary writer and reader. Tests that the merge
 * survives serialisation and produces a valid GLTF binary.
 */
async function roundTripDocument(document: Document): Promise<Document> {
  const io = new NodeIO();
  const binary = await io.writeBinary(document);
  return io.readBinary(binary);
}

/**
 * Find the merged primitive by traversing for the `tau-merged-edges` node, returning the
 * primitive's positions (or `undefined` when no merged primitive exists).
 */
function readMergedPositions(document: Document): Float32Array | undefined {
  const node = document
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === mergedEdgesNodeName);
  const mesh = node?.getMesh();
  if (!mesh) {
    return undefined;
  }
  const primitive = mesh.listPrimitives().find((p) => p.getMode() === primitiveModeLines);
  const accessor = primitive?.getAttribute('POSITION');
  const array = accessor?.getArray();
  return array instanceof Float32Array ? array : undefined;
}

/**
 * Count LINES primitives across every mesh in the document.
 */
function countLinePrimitives(document: Document): number {
  let count = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() === primitiveModeLines) {
        count++;
      }
    }
  }
  return count;
}

// =============================================================================
// Tests
// =============================================================================

describe('mergeGltfLineSegments', () => {
  describe('no-op cases', () => {
    it('returns merged: false on an empty document (no scenes)', () => {
      const document = new Document();
      const result = mergeGltfLineSegments(document);
      expect(result).toEqual({ merged: false, segmentCount: 0 });
      expect(document.getRoot().listMeshes()).toHaveLength(0);
    });

    it('returns merged: false on a document with no LINE primitives', () => {
      const document = createDocumentWithScene();
      const buffer = document.createBuffer();
      const trianglePrimitive = document
        .createPrimitive()
        .setMode(primitiveModeTriangles)
        .setAttribute(
          'POSITION',
          document
            .createAccessor()
            .setBuffer(buffer)
            .setType(Accessor.Type['VEC3']!)
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
        );
      const mesh = document.createMesh().addPrimitive(trianglePrimitive);
      requireScene(document).addChild(document.createNode().setMesh(mesh));

      const result = mergeGltfLineSegments(document);

      expect(result).toEqual({ merged: false, segmentCount: 0 });
      expect(countLinePrimitives(document)).toBe(0);
    });
  });

  describe('identity transform', () => {
    it('merges a single LINE primitive verbatim under tau-merged-edges', () => {
      const document = createDocumentWithScene();
      attachIndexedLinePrimitive({
        document,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
        indices: new Uint32Array([0, 1]),
      });

      const result = mergeGltfLineSegments(document);

      expect(result.merged).toBe(true);
      expect(result.segmentCount).toBe(1);

      // Original LINES primitive removed; merged LINES primitive added → still exactly one.
      expect(countLinePrimitives(document)).toBe(1);

      const merged = readMergedPositions(document);
      expect(merged).toBeDefined();
      expect(merged ? [...merged] : []).toEqual([0, 0, 0, 1, 0, 0]);
    });

    it('places the merged node at the scene root with identity transform', () => {
      const document = createDocumentWithScene();
      attachIndexedLinePrimitive({
        document,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
        indices: new Uint32Array([0, 1]),
      });

      mergeGltfLineSegments(document);

      const scene = document.getRoot().listScenes()[0];
      expect(scene).toBeDefined();
      const mergedNode = scene?.listChildren().find((n) => n.getName() === mergedEdgesNodeName);
      expect(mergedNode).toBeDefined();
      expect(mergedNode?.getTranslation()).toEqual([0, 0, 0]);
      expect(mergedNode?.getRotation()).toEqual([0, 0, 0, 1]);
      expect(mergedNode?.getScale()).toEqual([1, 1, 1]);
    });
  });

  describe('node transforms baked into positions', () => {
    it('bakes a translation into the merged positions', () => {
      const document = createDocumentWithScene();
      // Edge from (0,0,0) to (1,0,0) under a node translated by (10, 20, 30).
      // Expected baked positions: (10, 20, 30) to (11, 20, 30).
      attachIndexedLinePrimitive({
        document,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
        indices: new Uint32Array([0, 1]),
        translation: [10, 20, 30],
      });

      const result = mergeGltfLineSegments(document);
      expect(result.merged).toBe(true);

      const merged = readMergedPositions(document);
      expect(merged).toBeDefined();
      expect(merged ? [...merged] : []).toEqual([10, 20, 30, 11, 20, 30]);
    });

    it('concatenates multiple primitives in traversal order', () => {
      const document = createDocumentWithScene();
      // Primitive A at origin, primitive B translated by (100, 0, 0).
      attachIndexedLinePrimitive({
        document,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
        indices: new Uint32Array([0, 1]),
      });
      attachIndexedLinePrimitive({
        document,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
        indices: new Uint32Array([0, 1]),
        translation: [100, 0, 0],
      });

      const result = mergeGltfLineSegments(document);

      expect(result.merged).toBe(true);
      expect(result.segmentCount).toBe(2);
      expect(countLinePrimitives(document)).toBe(1);

      const merged = readMergedPositions(document);
      expect(merged).toBeDefined();
      // First primitive (origin) then second (translated).
      expect(merged ? [...merged] : []).toEqual([0, 0, 0, 1, 0, 0, 100, 0, 0, 101, 0, 0]);
    });
  });

  describe('mixed source primitives', () => {
    it('handles indexed and non-indexed line primitives together', () => {
      const document = createDocumentWithScene();
      const buffer = document.createBuffer();

      // Indexed primitive: one edge (0,0,0) → (1,0,0)
      const indexedPositions = document
        .createAccessor()
        .setBuffer(buffer)
        .setType(Accessor.Type['VEC3']!)
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0]));
      const indexedIndices = document
        .createAccessor()
        .setBuffer(buffer)
        .setType(Accessor.Type['SCALAR']!)
        .setArray(new Uint32Array([0, 1]));
      const indexedPrimitive = document
        .createPrimitive()
        .setMode(primitiveModeLines)
        .setAttribute('POSITION', indexedPositions)
        .setIndices(indexedIndices);
      const indexedMesh = document.createMesh().addPrimitive(indexedPrimitive);
      requireScene(document).addChild(document.createNode().setMesh(indexedMesh));

      // Non-indexed primitive: one edge (2,2,2) → (3,2,2)
      const nonIndexedPositions = document
        .createAccessor()
        .setBuffer(buffer)
        .setType(Accessor.Type['VEC3']!)
        .setArray(new Float32Array([2, 2, 2, 3, 2, 2]));
      const nonIndexedPrimitive = document
        .createPrimitive()
        .setMode(primitiveModeLines)
        .setAttribute('POSITION', nonIndexedPositions);
      const nonIndexedMesh = document.createMesh().addPrimitive(nonIndexedPrimitive);
      requireScene(document).addChild(document.createNode().setMesh(nonIndexedMesh));

      const result = mergeGltfLineSegments(document);

      expect(result.merged).toBe(true);
      expect(result.segmentCount).toBe(2);

      const merged = readMergedPositions(document);
      expect(merged).toBeDefined();
      expect(merged ? [...merged] : []).toEqual([0, 0, 0, 1, 0, 0, 2, 2, 2, 3, 2, 2]);
    });

    it('preserves triangle primitives on source meshes (only LINES are merged)', () => {
      const document = createDocumentWithScene();
      const buffer = document.createBuffer();

      const trianglePrimitive = document
        .createPrimitive()
        .setMode(primitiveModeTriangles)
        .setAttribute(
          'POSITION',
          document
            .createAccessor()
            .setBuffer(buffer)
            .setType(Accessor.Type['VEC3']!)
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
        );
      const linePrimitive = document
        .createPrimitive()
        .setMode(primitiveModeLines)
        .setAttribute(
          'POSITION',
          document
            .createAccessor()
            .setBuffer(buffer)
            .setType(Accessor.Type['VEC3']!)
            .setArray(new Float32Array([0, 0, 0, 1, 0, 0])),
        )
        .setIndices(
          document
            .createAccessor()
            .setBuffer(buffer)
            .setType(Accessor.Type['SCALAR']!)
            .setArray(new Uint32Array([0, 1])),
        );
      const mesh = document.createMesh().addPrimitive(trianglePrimitive).addPrimitive(linePrimitive);
      requireScene(document).addChild(document.createNode().setMesh(mesh));

      mergeGltfLineSegments(document);

      // Original mesh keeps its triangle primitive; LINES primitive removed.
      const originalMesh = document
        .getRoot()
        .listMeshes()
        .find((m) => m.getName() !== mergedEdgesNodeName);
      expect(originalMesh).toBeDefined();
      const remainingModes = originalMesh?.listPrimitives().map((p) => p.getMode()) ?? [];
      expect(remainingModes).toEqual([primitiveModeTriangles]);
    });
  });

  describe('material handling', () => {
    it('attaches the tau-edge-material when present on a source primitive', () => {
      const document = createDocumentWithScene();
      const buffer = document.createBuffer();
      const material = document.createMaterial('tau-edge-material').setBaseColorFactor([0, 0, 0, 1]);
      const positionAccessor = document
        .createAccessor()
        .setBuffer(buffer)
        .setType(Accessor.Type['VEC3']!)
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0]));
      const indexAccessor = document
        .createAccessor()
        .setBuffer(buffer)
        .setType(Accessor.Type['SCALAR']!)
        .setArray(new Uint32Array([0, 1]));
      const primitive = document
        .createPrimitive()
        .setMode(primitiveModeLines)
        .setMaterial(material)
        .setAttribute('POSITION', positionAccessor)
        .setIndices(indexAccessor);
      const mesh = document.createMesh().addPrimitive(primitive);
      requireScene(document).addChild(document.createNode().setMesh(mesh));

      mergeGltfLineSegments(document);

      const mergedMesh = document
        .getRoot()
        .listMeshes()
        .find((m) => m.getName() === mergedEdgesNodeName);
      expect(mergedMesh).toBeDefined();
      const mergedPrimitive = mergedMesh?.listPrimitives()[0];
      expect(mergedPrimitive).toBeDefined();
      const mergedMaterial = mergedPrimitive?.getMaterial();
      expect(mergedMaterial).not.toBeNull();
      expect(mergedMaterial?.getName()).toBe('tau-edge-material');
    });
  });

  describe('round-trip stability', () => {
    it('survives binary serialisation + read back without losing positions', async () => {
      const document = createDocumentWithScene();
      attachIndexedLinePrimitive({
        document,
        positions: new Float32Array([0, 0, 0, 1, 0, 0]),
        indices: new Uint32Array([0, 1]),
        translation: [5, 0, 0],
      });

      mergeGltfLineSegments(document);
      const reloaded = await roundTripDocument(document);

      const merged = readMergedPositions(reloaded);
      expect(merged).toBeDefined();
      expect(merged ? [...merged] : []).toEqual([5, 0, 0, 6, 0, 0]);
    });
  });
});
