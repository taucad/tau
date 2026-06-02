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
      expect(result.subject.mesh.stats.triangleCount).toBe(2);
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
});
