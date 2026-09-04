import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeMesh, loadMesh } from 'geospec/mesh';
import type { AnalyzeMeshOptions, MeshBufferSource } from 'geospec/mesh';
import { createGeoSpec } from 'geospec';
import { createCollector, runGeoSpecModule } from 'geospec/runner';
import { clearGeoSpecEngine, isGeoSpecJsonValue, registerGeoSpecEngine } from 'geospec/engine';
import { geoSpecEngineImplementation } from '#register.js';
import {
  clearEngineSubjects,
  exposeEngineSubject,
  releaseEngineSubject,
  resolveEngineSubject,
} from '#engine/subject-store.js';
import { memoryFileSystem } from '#runner/testing/memory-filesystem.js';

const source: MeshBufferSource = { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] };

beforeEach(() => {
  registerGeoSpecEngine(geoSpecEngineImplementation);
});
afterEach(() => {
  vi.restoreAllMocks();
  clearEngineSubjects();
  clearGeoSpecEngine();
});

describe('public full mesh analysis', () => {
  it('deeply isolates concurrent full snapshots, including bounds and quality failure lists', async () => {
    const loaded = await loadMesh({
      source: { ...source, positions: [...source.positions, ...source.positions, 0, 0, 0, 0, 0, 0, 1, 0, 0] },
    });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    const [first, second] = await Promise.all([
      analyzeMesh({ subject: loaded.subject }),
      analyzeMesh({ subject: loaded.subject }),
    ]);
    if (!first.success || !second.success) {
      throw new Error('analysis failed');
    }
    expect(first).toStrictEqual(second);
    first.stats.boundingBox!.primitives[0]!.aabb.min[0] = -999;
    first.stats.meshQuality.duplicateFaces[0]!.triangleIndex = 999;
    first.stats.meshQuality.degenerateTriangles[0]!.center[0] = 999;
    first.stats.meshQuality.triangles.length = 0;
    expect(await analyzeMesh({ subject: loaded.subject })).toStrictEqual(second);
  });

  it('returns detached plain statistics, never live cached methods or arrays', async () => {
    const result = await analyzeMesh({ source });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('analysis failed');
    }
    expect(isGeoSpecJsonValue(result)).toBe(true);
    expect(structuredClone(result)).toStrictEqual(result);
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- Verify JSON transport independently of structured cloning.
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    expect(result.stats.meshQuality.surfaceArea).toBe(0.5);
    result.stats.meshQuality.triangles[0]!.a[0] = 123;
    expect(resolveEngineSubject(result.subject.subjectId)?.mesh.stats.meshQuality.triangles[0]!.a[0]).toBe(0);
  });

  it('analyzes a retained subject without trusting mutable public metadata', async () => {
    const loaded = await loadMesh({ source });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    const original = structuredClone(loaded.subject);
    loaded.subject.mesh.stats.triangleCount = 99;
    const result = await analyzeMesh({ subject: loaded.subject });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('analysis failed');
    }
    expect(result.subject).toStrictEqual(original);
    expect(result.stats.triangleCount).toBe(1);
    result.stats.meshQuality.triangles[0]!.a[0] = 123;
    const repeated = await analyzeMesh({ subject: original });
    expect(repeated.success && repeated.stats.meshQuality.triangles[0]!.a[0]).toBe(0);
    expect(releaseEngineSubject(original.subjectId)).toBe(true);
    expect(releaseEngineSubject(original.subjectId)).toBe(false);
    expect(await analyzeMesh({ subject: original })).toMatchObject({ success: false });
    expect(result.stats.triangleCount).toBe(1);
  });

  it('keeps loading and a narrow matcher lazy, memoizes full facets and preserves matcher evidence', async () => {
    const loaded = await loadMesh({ source });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    const internal = resolveEngineSubject(loaded.subject.subjectId)!;
    const quality = vi.spyOn(internal.mesh.stats, 'meshQuality', 'get');
    const watertight = vi.spyOn(internal.mesh.stats, 'watertight', 'get');
    exposeEngineSubject(internal);
    const collector = createCollector();
    collector.it('bounds', () =>
      collector.expectGeo(loaded.subject).toHaveBoundingBox({ size: { x: 1 }, tolerance: 0.001 }),
    );
    await collector.waitForCompletion();
    expect(collector.tests[0]?.status).toBe('passed');
    expect(quality).not.toHaveBeenCalled();
    expect(watertight).not.toHaveBeenCalled();
    quality.mockRestore();
    watertight.mockRestore();
    const analysis = await createGeoSpec().analyzeMesh({ subject: loaded.subject });
    if (!analysis.success) {
      throw new Error(JSON.stringify(analysis.diagnostics));
    }
    const cached = internal.mesh.stats.meshQuality;
    const repeated = await analyzeMesh({ subject: loaded.subject });
    expect(internal.mesh.stats.meshQuality).toBe(cached);
    expect(repeated).toStrictEqual(analysis);
    analysis.stats.meshQuality.surfaceArea = 999;
    const afterMutation = createCollector();
    afterMutation.it('area', () =>
      afterMutation.expectGeo(loaded.subject).toHaveSurfaceArea({ value: 0.5, tolerance: 0.001 }),
    );
    await afterMutation.waitForCompletion();
    expect(afterMutation.tests[0]?.status).toBe('passed');
  });

  it('preserves source units and analyzes retained evidence after source buffers change', async () => {
    const positions = [...source.positions];
    const loaded = await loadMesh({
      source: { ...source, positions },
      sourceUnit: 'm',
      unit: 'mm',
      path: 'original.glb',
    });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    positions.fill(999);
    const result = await analyzeMesh({ subject: loaded.subject });
    expect(result.success && result.stats.boundingBox?.size).toEqual([1000, 1000, 0]);
    expect(result.success && result.subject.provenance).toEqual(loaded.subject.provenance);
    expect(result.success && result.subject.subjectId).toBe(loaded.subject.subjectId);
  });

  it.each([
    ['empty', []],
    ['degenerate', [0, 0, 0, 0, 0, 0, 1, 0, 0]],
    ['duplicate', [...source.positions, ...source.positions]],
    ['open 2D', source.positions],
  ])('returns finite data for %s geometry without claiming validity', async (_name, positions) => {
    const result = await analyzeMesh({ source: { ...source, positions } });
    expect(result.success).toBe(true);
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- Verify JSON transport independently of structured cloning.
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    if (!result.success) {
      throw new Error('analysis failed');
    }
    expect(result.stats.watertight).toBe(resolveEngineSubject(result.subject.subjectId)?.mesh.stats.watertight);
    if (_name === 'degenerate') {
      expect(result.stats.meshQuality.degenerateTriangles).toHaveLength(1);
    }
    if (_name === 'duplicate') {
      expect(result.stats.meshQuality.duplicateFaces).toHaveLength(1);
    }
  });

  it('refuses non-finite full statistics but preserves the subject for diagnostic matchers', async () => {
    const loaded = await loadMesh({ source: { ...source, positions: [Number.NaN, 0, 0, 1, 0, 0, 0, 1, 0] } });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    const result = await analyzeMesh({ subject: loaded.subject });
    expect(result).toMatchObject({
      success: false,
      diagnostics: [
        { code: 'GEOSPEC_MESH_ANALYSIS_FAILED', details: { nonFiniteVertices: [{ position: ['NaN', 0, 0] }] } },
      ],
    });
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- Verify JSON transport independently of structured cloning.
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    const collector = createCollector();
    collector.it('invalid', () => collector.expectGeo(loaded.subject).toHaveMeshIntegrity({ finitePositions: true }));
    await collector.waitForCompletion();
    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics[0]?.code).not.toBe('TEST_FAILED');
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { source, subject: {} },
    { subject: {}, unit: 'mm' },
    { subject: {}, format: 'glb' },
    { subject: {} },
  ])('rejects invalid analysis inputs %#', async (input) => {
    expect(await analyzeMesh(input as AnalyzeMeshOptions)).toMatchObject({
      success: false,
      diagnostics: [{ severity: 'error' }],
    });
  });

  it('does not recycle released IDs across resets or accept foreign engine IDs', async () => {
    const first = await loadMesh({ source });
    if (!first.success) {
      throw new Error('load failed');
    }
    clearEngineSubjects();
    const second = await loadMesh({ source });
    if (!second.success) {
      throw new Error('load failed');
    }
    expect(second.subject.subjectId).not.toBe(first.subject.subjectId);
    expect(await analyzeMesh({ subject: first.subject })).toMatchObject({ success: false });
    expect(await analyzeMesh({ subject: { ...second.subject, subjectId: 'foreign-engine' } })).toMatchObject({
      success: false,
    });
  });

  it('runs source and retained analysis through the real VM and releases only VM-owned subjects', async () => {
    const release = vi.spyOn(geoSpecEngineImplementation.protocol, 'releaseSubject');
    const loaded = await loadMesh({ source });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    const entryPath = 'analysis.geospec.ts';
    const result = await runGeoSpecModule({
      entryPath,
      modelLoader: async () => loaded.subject,
      filesystem: memoryFileSystem({
        [entryPath]: `
        import { it } from 'geospec';
        import { loadModel } from 'geospec/model';
        import { analyzeMesh } from 'geospec/mesh';
        it('source and subject', async () => {
          for (const invalid of [null, undefined, [], {}]) {
            const failure = await analyzeMesh(invalid);
            if (failure.success || failure.diagnostics.length === 0) throw new Error('invalid input was accepted');
          }
          const subject = await loadModel({ file: 'model.ts' });
          const retained = await analyzeMesh({ subject });
          const direct = await analyzeMesh({ source: ${JSON.stringify(source)} });
          if (!retained.success || !direct.success || JSON.stringify(retained.stats) !== JSON.stringify(direct.stats)) throw new Error('analysis mismatch');
        });
      `,
      }),
    });
    expect(result.success && result.passed).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(resolveEngineSubject(release.mock.calls[0]![0].subjectId)).toBeUndefined();
    expect(resolveEngineSubject(loaded.subject.subjectId)).toBeDefined();
  });

  it('finishes every VM subject release even when a host disposer fails', async () => {
    const original = geoSpecEngineImplementation.protocol.releaseSubject;
    const release = vi.spyOn(geoSpecEngineImplementation.protocol, 'releaseSubject').mockImplementation((request) => {
      original(request);
      throw new Error('native cleanup failed');
    });
    const entryPath = 'cleanup.geospec.ts';
    const result = await runGeoSpecModule({
      entryPath,
      filesystem: memoryFileSystem({
        [entryPath]: `import { it } from 'geospec'; import { analyzeMesh } from 'geospec/mesh';
      it('two owned subjects', async () => { await analyzeMesh({ source: ${JSON.stringify(source)} }); await analyzeMesh({ source: ${JSON.stringify(source)} }); throw new Error('body failed'); });`,
      }),
    });
    expect(result.success && result.passed).toBe(false);
    expect(release).toHaveBeenCalledTimes(2);
    for (const [request] of release.mock.calls) {
      expect(resolveEngineSubject(request.subjectId)).toBeUndefined();
    }
  });

  it('releases analysis that finishes after its VM test timed out', async () => {
    const pending = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const originalRelease = geoSpecEngineImplementation.protocol.releaseSubject;
    const release = vi.spyOn(geoSpecEngineImplementation.protocol, 'releaseSubject').mockImplementation((request) => {
      const result = originalRelease(request);
      released.resolve();
      return result;
    });
    registerGeoSpecEngine({
      ...geoSpecEngineImplementation,
      host: {
        ...geoSpecEngineImplementation.host,
        analyzeMesh: async (input) => {
          await pending.promise;
          return geoSpecEngineImplementation.host!.analyzeMesh!(input);
        },
      },
    });
    const entryPath = 'late.geospec.ts';
    const result = await runGeoSpecModule({
      entryPath,
      testTimeout: 5,
      filesystem: memoryFileSystem({
        [entryPath]: `import { it } from 'geospec'; import { analyzeMesh } from 'geospec/mesh'; it('late analysis', async () => { await analyzeMesh({ source: ${JSON.stringify(source)} }); });`,
      }),
    });
    expect(result.success && result.passed).toBe(false);
    pending.resolve();
    await released.promise;
    expect(release).toHaveBeenCalledTimes(1);
    expect(resolveEngineSubject(release.mock.calls[0]![0].subjectId)).toBeUndefined();
  });

  it('reports missing capabilities, malformed evidence, and rejected asynchronous claims as failures', async () => {
    const loaded = await loadMesh({ source });
    if (!loaded.success) {
      throw new Error('load failed');
    }
    const { subject } = loaded;
    clearGeoSpecEngine();
    expect(await analyzeMesh({ subject })).toMatchObject({
      success: false,
      diagnostics: [{ code: 'GEOSPEC_ENGINE_UNAVAILABLE' }],
    });
    const submitClaims = vi.fn(geoSpecEngineImplementation.protocol.submitClaims);
    registerGeoSpecEngine({
      ...geoSpecEngineImplementation,
      protocol: {
        ...geoSpecEngineImplementation.protocol,
        initialize: (request) => ({ ...geoSpecEngineImplementation.protocol.initialize(request), capabilities: [] }),
        submitClaims,
      },
    });
    expect(await analyzeMesh({ subject })).toMatchObject({ success: false });
    expect(submitClaims).not.toHaveBeenCalled();
    registerGeoSpecEngine({
      ...geoSpecEngineImplementation,
      protocol: {
        ...geoSpecEngineImplementation.protocol,
        submitClaims: async () => {
          throw new Error('transport disconnected');
        },
      },
    });
    expect(await analyzeMesh({ subject })).toMatchObject({
      success: false,
      diagnostics: [{ message: 'transport disconnected' }],
    });
    registerGeoSpecEngine({
      ...geoSpecEngineImplementation,
      protocol: {
        ...geoSpecEngineImplementation.protocol,
        submitClaims: (request) => ({
          requestId: request.requestId,
          results: [
            {
              claimId: 'test',
              status: 'passed',
              diagnostics: [],
              evidence: { success: true, stats: {}, subject: {} },
              provenance: {},
            },
          ],
        }),
      },
    });
    expect(await analyzeMesh({ subject })).toMatchObject({
      success: false,
      diagnostics: [{ code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION' }],
    });
  });
});
