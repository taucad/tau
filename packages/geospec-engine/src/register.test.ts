import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearGeoSpecEngine,
  describeGeoSpecEngine,
  geoSpecEngineProtocolVersion,
  geoSpecMatcherDescriptors,
} from 'geospec/engine';
import type { LoadMeshOptions, MeshBufferSource } from 'geospec/mesh';
// oxlint-disable-next-line no-restricted-imports -- registration must be tested against this package's own publish metadata.
import packageMetadata from '../package.json' with { type: 'json' };
import { clearEngineSubjects } from '#engine/subject-store.js';

const stepFixture = join(import.meta.dirname, '../fixtures/xde/two-cube-assembly.step');
const triangle: MeshBufferSource = {
  format: 'mesh-buffer',
  name: 'triangle',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
};

afterEach(() => {
  clearGeoSpecEngine();
  clearEngineSubjects();
});

describe('engine registration', () => {
  it('registers this release build with the substrate', async () => {
    clearGeoSpecEngine();
    const { geoSpecEngineImplementation } = await import('#register.js');

    expect(geoSpecEngineImplementation.protocolVersion).toBe(geoSpecEngineProtocolVersion);
    expect(geoSpecEngineImplementation.engine).toBe('@taucad/geospec-engine');
    expect(geoSpecEngineImplementation.version).toBe(packageMetadata.version);
    expect(describeGeoSpecEngine()?.engine).toBe('@taucad/geospec-engine');
  });

  it('advertises exactly the 23 matchers and three protocol operations it implements', async () => {
    const { geoSpecEngineImplementation } = await import('#register.js');
    const initialized = geoSpecEngineImplementation.protocol.initialize({
      protocolVersion: geoSpecEngineProtocolVersion,
      client: { name: 'registration-test', version: '1' },
    });

    expect(initialized.engine.version).toBe(packageMetadata.version);
    expect(initialized.capabilities.map(({ name }) => name).sort()).toStrictEqual(
      [...Object.keys(geoSpecMatcherDescriptors), 'analyzeBrep', 'inspectGeometry', 'analyzeMeshOverlap'].sort(),
    );
  });

  it('keeps neutral host bindings free of Node-only capabilities', async () => {
    const { geoSpecEngineImplementation } = await import('#register.js');
    const host = geoSpecEngineImplementation.host ?? {};

    expect(Object.keys(host).sort()).toStrictEqual([
      'analyzeMesh',
      'createGeoSpecWebPoolRunner',
      'createGeoSpecWebRunner',
      'flushEvidenceStore',
      'loadMesh',
      'loadModel',
      'loadStep',
      'startGeoSpecPoolWorkerHost',
    ]);
    expect(host).not.toHaveProperty('createNodeVmFileSystem');
    expect(host).not.toHaveProperty('createGeoSpecNodeRunner');
    expect(host).not.toHaveProperty('createGeoSpecNodePoolRunner');
  });

  it('adds exactly the three Node hosts on the node entry', async () => {
    clearGeoSpecEngine();
    const { geoSpecEngineImplementation } = await import('#register.js');
    const { geoSpecNodeEngineImplementation } = await import('#register-node.js');
    const neutral = Object.keys(geoSpecEngineImplementation.host ?? {});
    const node = Object.keys(geoSpecNodeEngineImplementation.host ?? {});

    expect(node.filter((name) => !neutral.includes(name)).sort()).toStrictEqual([
      'createGeoSpecNodePoolRunner',
      'createGeoSpecNodeRunner',
      'createNodeVmFileSystem',
    ]);
    expect(geoSpecNodeEngineImplementation.protocol).toBe(geoSpecEngineImplementation.protocol);
    expect(describeGeoSpecEngine()?.engine).toBe('@taucad/geospec-engine');
  });

  it('projects every neutral loader result across the data-only seam', async () => {
    const { geoSpecEngineImplementation } = await import('#register.js');
    const host = geoSpecEngineImplementation.host!;
    if (!host.loadMesh || !host.analyzeMesh || !host.loadStep || !host.loadModel) {
      throw new Error('neutral loader bindings are missing');
    }

    const loaded = await host.loadMesh({ source: triangle });
    const analyzed = await host.analyzeMesh({ source: triangle });
    const step = await host.loadStep({ source: stepFixture, mesh: false });
    const model = await host.loadModel({ source: triangle, format: 'mesh-buffer' });

    expect(loaded.success).toBe(true);
    if (loaded.success) {
      expect(loaded.subject.subjectId).toBeTypeOf('string');
    }
    expect(analyzed.success).toBe(true);
    if (analyzed.success) {
      expect(analyzed.subject.subjectId).toBeTypeOf('string');
      expect(analyzed.stats.triangleCount).toBe(1);
    }
    expect(step.subjectId).toBeTypeOf('string');
    expect(model.subjectId).toBeTypeOf('string');
  }, 120_000);

  it('passes mesh loader failures through unchanged', async () => {
    const { geoSpecEngineImplementation } = await import('#register.js');
    const host = geoSpecEngineImplementation.host!;
    if (!host.loadMesh || !host.analyzeMesh) {
      throw new Error('neutral mesh bindings are missing');
    }
    const invalid: LoadMeshOptions = { source: new Uint8Array([1, 2, 3]), format: 'glb' };

    expect(await host.loadMesh(invalid)).toMatchObject({ success: false });
    expect(await host.analyzeMesh(invalid)).toMatchObject({ success: false });
  });
});
