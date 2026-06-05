import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { analyzeMesh, loadMesh } from '#mesh/index.js';

const createSquareDocument = (): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array([0, 1, 2, 3, 4, 5]));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('unwelded-square').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('unwelded-square').setMesh(mesh));
  return document;
};

const createUnitCubeDocument = (): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(
      new Uint32Array([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
      ]),
    );
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('unit-cube').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('unit-cube').setMesh(mesh));
  return document;
};

const createNonIndexedTriangleDocument = (): Document => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions);
  const mesh = document.createMesh('non-indexed-triangle').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('non-indexed-triangle').setMesh(mesh));
  return document;
};

describe('loadMesh', () => {
  it('should load GLB bytes into a GeoSpec geometry subject with provenance', async () => {
    const bytes = await new WebIO().writeBinary(createSquareDocument());

    const result = await loadMesh({
      source: bytes,
      path: '/fixtures/square.glb',
      parameters: { width: 10 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subject.kind).toBe('geometry-subject');
      expect(result.subject.provenance.source.path).toBe('/fixtures/square.glb');
      expect(result.subject.provenance.parameters).toEqual({ width: 10 });
      expect(result.subject.provenance.contentHash).toMatch(/^sha256:/);
      expect(result.subject.provenance.unit).toBe('m');
      expect(result.subject.mesh.stats.triangleCount).toBe(2);
    }
  });

  it('should normalize direct GLB coordinates only when source and target units are requested', async () => {
    const bytes = await new WebIO().writeBinary(createUnitCubeDocument());

    const raw = await loadMesh({
      source: bytes,
      path: '/fixtures/unit-cube.glb',
    });
    const normalized = await loadMesh({
      source: bytes,
      path: '/fixtures/unit-cube.glb',
      sourceUnit: 'm',
      unit: 'mm',
    });

    expect(raw.success).toBe(true);
    expect(normalized.success).toBe(true);
    if (raw.success && normalized.success) {
      expect(raw.subject.provenance.unit).toBe('m');
      expect(raw.subject.mesh.stats.boundingBox?.size).toEqual([1, 1, 1]);
      expect(Math.abs(raw.subject.mesh.stats.meshQuality.signedVolume)).toBeCloseTo(1, 5);

      expect(normalized.subject.provenance.unit).toBe('mm');
      expect(normalized.subject.mesh.stats.boundingBox?.size).toEqual([1000, 1000, 1000]);
      expect(normalized.subject.mesh.stats.meshQuality.surfaceArea).toBeCloseTo(6_000_000, 1);
      expect(Math.abs(normalized.subject.mesh.stats.meshQuality.signedVolume)).toBeCloseTo(1_000_000_000, 1);
      expect(normalized.subject.mesh.stats.meshQuality.centerOfMass?.[0]).toBeCloseTo(500, 5);
      expect(normalized.subject.mesh.stats.meshQuality.centerOfMass?.[1]).toBeCloseTo(500, 5);
      expect(normalized.subject.mesh.stats.meshQuality.centerOfMass?.[2]).toBeCloseTo(500, 5);
    }
  });

  it('should analyze in-memory mesh buffers without runtime geometry objects', async () => {
    const result = await analyzeMesh({
      source: {
        format: 'mesh-buffer',
        name: 'open-strip',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        indices: [0, 1, 2, 3, 4, 5],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stats.triangleCount).toBe(2);
      expect(result.stats.connectedComponents(0.1)).toBe(1);
      expect(result.stats.watertight).toBe(false);
    }
  });

  it('should report unsupported glTF JSON inputs as typed diagnostics', async () => {
    const result = await loadMesh({
      source: new Uint8Array([123, 125]),
      format: 'gltf',
    });

    expect(result).toEqual({
      success: false,
      diagnostics: [
        {
          code: 'UNSUPPORTED_MESH_FORMAT',
          severity: 'error',
          message: 'GeoSpec P0 mesh loading supports GLB bytes and in-memory mesh buffers; received gltf.',
          suggestion: 'Export or provide the model as GLB for mesh assertions in this slice.',
        },
      ],
    });
  });

  it('should report unknown file extensions as typed diagnostics', async () => {
    const result = await loadMesh({
      source: new Uint8Array([1, 2, 3]),
      path: '/fixtures/part.mesh',
    });

    expect(result).toEqual({
      success: false,
      diagnostics: [
        {
          code: 'UNSUPPORTED_MESH_FORMAT',
          severity: 'error',
          message: 'GeoSpec could not infer a supported mesh format from /fixtures/part.mesh.',
          suggestion:
            'Pass format: "glb" for GLB bytes, format: "mesh-buffer" for triangle buffers, or use loadModel({ format: "step" }) for STEP/BRep evidence.',
        },
      ],
    });
  });

  it('should analyze non-indexed triangle primitives instead of skipping them', async () => {
    const bytes = await new WebIO().writeBinary(createNonIndexedTriangleDocument());

    const result = await loadMesh({
      source: bytes,
      path: '/fixtures/non-indexed.glb',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subject.mesh.stats.triangleCount).toBe(1);
      expect(result.subject.mesh.stats.watertight).toBe(false);
      expect(result.subject.mesh.stats.analyseWatertight().openBoundaryEdges).toBeGreaterThan(0);
    }
  });
});
