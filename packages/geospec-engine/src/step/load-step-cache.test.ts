/* eslint-disable @typescript-eslint/naming-convention -- `HEAPF64` and `GeoSpecXdeReader` are the kernel's own embind names. */
import { afterEach, describe, expect, it } from 'vitest';
import { GeoSpecModelLoadError } from 'geospec/model';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { loadStep } from '#step/load-step.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult } from '#step/types.js';

const stepText = [
  'ISO-10303-21;',
  'HEADER;',
  "FILE_NAME('part.step','2026-01-01T00:00:00',(''),(''),'','','');",
  "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF'));",
  'ENDSEC;',
  'DATA;',
  "#1=PRODUCT('cubeA','cubeA','',(#2));",
  'ENDSEC;',
  'END-ISO-10303-21;',
].join('\n');

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** The same model re-exported an hour later: only the timestamp differs. */
const reExportedText = stepText.replace('2026-01-01T00:00:00', '2026-01-01T01:00:00');

const readResultJson = JSON.stringify({
  occurrences: [{ path: 'cubeA', productName: 'cubeA', transform: [], shapeIndex: 0 }],
});

const heap = new Float64Array(64);
heap.set([0, 0, 0, 1, 0, 0, 0, 1, 0], 10);

type Trace = { calls: string[] };

const fakeBackend = (trace: Trace, options: { isSuccess?: boolean } = {}): GeoSpecNativeStepBackend => {
  const native: GeoSpecNativeXdeReadResult = {
    isSuccess: () => options.isSuccess ?? true,
    resultJson: () => readResultJson,
    extrema: () => '{}',
    classifyPoints: () => '{}',
    commonVolume: () => '{}',
    faceFacts: () => '{"faces":[]}',
    analysisSummaryJson: () => {
      trace.calls.push('summary');
      return '{"topologyCounts":{"faces":6}}';
    },
    analysisMassPropertiesJson: () => '{}',
    analysisFaceFeaturesJson: () => '{}',
    analysisValidityJson: () => '{}',
    analysisWallThicknessJson: () => '{}',
    meshTriangles: () => {
      trace.calls.push('meshTriangles');
      return '{"triangleCount":1}';
    },
    meshTrianglePointer: () => 80,
    meshTriangleCount: () => 1,
    occurrenceMeshTriangles: () => '{}',
    delete: () => trace.calls.push('delete'),
  };
  return {
    HEAPF64: heap,
    GeoSpecXdeReader: {
      readText: () => {
        trace.calls.push('readText');
        return native;
      },
      readFile: () => {
        trace.calls.push('readFile');
        return native;
      },
    },
  } as unknown as GeoSpecNativeStepBackend;
};

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

describe('xde-read cache temperature', () => {
  it('should perform no reader work at all on a warm load whose claims stay off geometry (B15)', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold: Trace = { calls: [] };
    const coldSubject = await loadStep({
      source: encode(stepText),
      name: 'part',
      nativeStepBackend: fakeBackend(cold),
    });
    expect(cold.calls).toContain('readText');

    const warm: Trace = { calls: [] };
    const warmSubject = await loadStep({
      source: encode(stepText),
      name: 'part',
      nativeStepBackend: fakeBackend(warm),
    });

    expect(warm.calls).toEqual([]);
    expect(warmSubject.step?.xde).toEqual(coldSubject.step?.xde);
    expect(warmSubject.mesh.stats.triangleCount).toBe(coldSubject.mesh.stats.triangleCount);
    expect(warmSubject.mesh.stats.meshQuality.triangles).toEqual(coldSubject.mesh.stats.meshQuality.triangles);
    expect(warmSubject.step?.readStrategy).toEqual(coldSubject.step?.readStrategy);
    expect(warmSubject.provenance).toEqual(coldSubject.provenance);
  });

  it('should tessellate before the first BRep facet on a deferred read, exactly as a cold load does (D-3)', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold: Trace = { calls: [] };
    await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend(cold) });
    void (await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend(cold) }));

    const warm: Trace = { calls: [] };
    const subject = await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend(warm) });
    // Forcing a facet materializes the read — and the mesh must precede it, or
    // BRepBndLib answers analytic bounds where the cold load answered
    // tessellated ones.
    expect(subject.brep?.topologyCounts).toEqual({ faces: 6 });
    expect(warm.calls).toEqual(['readText', 'meshTriangles', 'summary']);
  });

  it('should ignore a re-export that only changed the Part 21 timestamp', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend({ calls: [] }) });

    const warm: Trace = { calls: [] };
    await loadStep({ source: encode(reExportedText), name: 'part', nativeStepBackend: fakeBackend(warm) });
    expect(warm.calls).toEqual([]);
  });

  it('should key mesh-bearing and BRep-only reads separately', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend({ calls: [] }) });

    const brepOnly: Trace = { calls: [] };
    await loadStep({ source: encode(stepText), name: 'part', mesh: false, nativeStepBackend: fakeBackend(brepOnly) });
    expect(brepOnly.calls).toEqual(['readText']);
    expect(store.entries.size).toBe(2);
  });

  it('should never store a failed read — a hit therefore proves the read succeeded', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    await expect(
      loadStep({
        source: encode(stepText),
        name: 'part',
        nativeStepBackend: fakeBackend({ calls: [] }, { isSuccess: false }),
      }),
    ).rejects.toBeInstanceOf(GeoSpecModelLoadError);
    expect(store.entries.size).toBe(0);
  });

  it('should expose an occurrence-mesh fetcher bound to the retained read', async () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const trace: Trace = { calls: [] };
    const subject = await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend(trace) });

    expect(subject.occurrenceMesh?.(0)?.triangleCount).toBe(1);
  });

  it('should stay cold when no store is installed', async () => {
    setGeoSpecEvidenceStore(undefined);
    const first: Trace = { calls: [] };
    await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend(first) });
    const second: Trace = { calls: [] };
    await loadStep({ source: encode(stepText), name: 'part', nativeStepBackend: fakeBackend(second) });
    expect(second.calls).toContain('readText');
  });
});
