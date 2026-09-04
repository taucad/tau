import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it, vi } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { analyzeMesh, loadMesh, loadMeshObserved, unitScale } from '#mesh/load-mesh.js';

const boxCorners = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const boxIndices = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

const glbBytes = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array(boxCorners));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array(boxIndices));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('box').addPrimitive(primitive);
  document.createScene('scene').addChild(document.createNode('box').setMesh(mesh));
  return new WebIO().writeBinary(document);
};

describe('unitScale', () => {
  it('should convert between known length units and pass unknown units through', () => {
    expect(unitScale('mm', 'm')).toBeCloseTo(0.001, 12);
    expect(unitScale('m', 'mm')).toBeCloseTo(1000, 9);
    expect(unitScale('in', 'mm')).toBeCloseTo(25.4, 9);
    expect(unitScale('mm', 'mm')).toBe(1);
    expect(unitScale('furlong', 'mm')).toBe(1);
    expect(unitScale('mm', 'furlong')).toBe(1);
  });
});

describe('loadMesh', () => {
  it('should load GLB bytes and publish the mesh capability surface', async () => {
    const result = await loadMesh({
      source: await glbBytes(),
      path: '/fixtures/box.glb',
      sourceUnit: 'mm',
      unit: 'mm',
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.subject.mesh.format).toBe('glb');
    expect(result.subject.mesh.stats.triangleCount).toBe(12);
    expect(result.subject.mesh.stats.meshQuality.triangles[0]?.primitive).toBe('box#0');
    expect(result.subject.provenance).toMatchObject({
      unit: 'mm',
      loader: 'gltf-transform',
      source: { kind: 'bytes', format: 'glb', path: '/fixtures/box.glb' },
    });
    expect(result.subject.capabilities).toContainEqual({ kind: 'mesh', feature: 'component-overlap' });
  });

  it('should scale a metre document into millimetres', async () => {
    const result = await loadMesh({ source: await glbBytes(), unit: 'mm' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subject.mesh.stats.boundingBox?.size).toEqual([1000, 1000, 1000]);
    }
  });

  it('should accept every source form', async () => {
    const bytes = await glbBytes();
    const directory = await mkdtemp(join(tmpdir(), 'geospec-load-mesh-'));
    const path = join(directory, 'box.glb');
    await writeFile(path, bytes);

    const arrayBuffer = await loadMesh({ source: Uint8Array.from(bytes).buffer });
    const fromPath = await loadMesh({ source: path });
    const blob = await loadMesh({ source: new Blob([bytes as BlobPart]) });
    const file = await loadMesh({ source: new File([bytes as BlobPart], 'box.glb') });

    expect([arrayBuffer, fromPath, blob, file].map((result) => result.success)).toEqual([true, true, true, true]);
    expect(arrayBuffer.success && arrayBuffer.subject.provenance.source.kind).toBe('array-buffer');
    expect(fromPath.success && fromPath.subject.provenance.source.kind).toBe('path');
    expect(blob.success && blob.subject.provenance.source.kind).toBe('blob');
    expect(file.success && file.subject.provenance.source).toMatchObject({ kind: 'file', name: 'box.glb' });
  });

  it('should load an in-memory mesh buffer, indexed or not', async () => {
    const indexed = await loadMesh({
      source: {
        format: 'mesh-buffer',
        positions: new Float32Array(boxCorners),
        indices: new Uint32Array(boxIndices),
        name: 'buffer-box',
      },
    });
    const soup = await loadMesh({
      source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      parameters: { stage: 'test' },
    });

    expect(indexed.success && indexed.subject.mesh.stats.triangleCount).toBe(12);
    expect(indexed.success && indexed.subject.provenance).toMatchObject({ loader: 'in-memory', unit: 'mm' });
    expect(indexed.success && indexed.subject.mesh.stats.meshQuality.triangles[0]?.primitive).toBe('buffer-box#0');
    expect(soup.success && soup.subject.mesh.stats.triangleCount).toBe(1);
    expect(soup.success && soup.subject.mesh.stats.meshQuality.triangles[0]?.primitive).toBe('mesh-buffer#0');
    expect(soup.success && soup.subject.provenance.parameters).toEqual({ stage: 'test' });
  });

  it('should infer the format from the path extension, defaulting to glb', async () => {
    const bytes = await glbBytes();
    const gltf = await loadMesh({ source: bytes, path: '/fixtures/box.gltf' });
    const unknown = await loadMesh({ source: bytes, path: '/fixtures/box.bin' });

    expect(gltf.success && gltf.subject.mesh.format).toBe('gltf');
    expect(unknown.success && unknown.subject.mesh.format).toBe('glb');
  });

  it('should report a structured failure instead of throwing', async () => {
    const result = await loadMesh({ source: '/definitely/missing.glb' });

    expect(result).toMatchObject({ success: false, diagnostics: [{ code: 'GEOSPEC_MESH_LOAD_FAILED' }] });
  });

  it('should fetch a URL source', async () => {
    const bytes = await glbBytes();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bytes as BodyInit) as unknown as Response);
    try {
      const result = await loadMesh({ source: new URL('https://example.test/box.glb') });

      expect(result.success && result.subject.provenance.source).toMatchObject({
        kind: 'url',
        path: 'https://example.test/box.glb',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('should describe a thrown non-Error', async () => {
    // A source whose reader rejects with a bare string: the loader must
    // describe it rather than let a non-Error escape.
    const hostile = { arrayBuffer: vi.fn().mockRejectedValue('not an Error') } as unknown as Blob;

    const result = await loadMesh({ source: hostile });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [{ message: 'GeoSpec could not load mesh evidence: not an Error' }],
    });
  });

  it('should carry an explicit name onto the provenance', async () => {
    const result = await loadMesh({ source: await glbBytes(), name: 'assembly' });

    expect(result.success && result.subject.provenance.source.name).toBe('assembly');
  });

  it('should reuse the authenticated mesh record without changing evidence', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const events: string[] = [];
    const source = await glbBytes();
    try {
      const cold = await loadMeshObserved({ source, unit: 'mm' }, ({ name }) => events.push(name));
      const warm = await loadMeshObserved({ source, unit: 'mm' }, ({ name }) => events.push(name));

      expect(cold.success && cold.subject.mesh.stats.triangleCount).toBe(12);
      expect(warm.success && warm.subject.mesh.stats.triangleCount).toBe(12);
      expect(store.families()).toEqual(['mesh-record']);
      expect(events.filter((name) => name.startsWith('cache.mesh-record'))).toEqual([
        'cache.mesh-record.miss',
        'cache.mesh-record.hit',
      ]);
    } finally {
      setGeoSpecEvidenceStore(undefined);
    }
  });
});

describe('analyzeMesh', () => {
  it('should return the stats alongside the subject', async () => {
    const result = await analyzeMesh({ source: await glbBytes() });

    expect(result.success && result.stats.triangleCount).toBe(12);
  });

  it('should pass a load failure through unchanged', async () => {
    const result = await analyzeMesh({ source: '/definitely/missing.glb' });

    expect(result.success).toBe(false);
  });
});
