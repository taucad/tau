/* eslint-disable @typescript-eslint/naming-convention -- `HEAPF64` is the kernel's own embind name. */
import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore, writeEvidenceBytes } from '#cache/evidence-cache.js';
import { encodeSections } from '#cache/section-codec.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { createOccurrenceMeshFetchers } from '#step/occurrence-mesh.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult } from '#step/types.js';

const heap = new Float64Array(64);
heap.set([0, 0, 0, 1, 0, 0, 0, 1, 0], 10);
const backend = { HEAPF64: heap } as unknown as GeoSpecNativeStepBackend;

const fakeNative = (options: { error?: string } = {}): GeoSpecNativeXdeReadResult & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    isSuccess: () => true,
    resultJson: () => '{}',
    extrema: () => '{}',
    classifyPoints: () => '{}',
    commonVolume: () => '{}',
    faceFacts: () => '{}',
    analysisSummaryJson: () => '{}',
    analysisMassPropertiesJson: () => '{}',
    analysisFaceFeaturesJson: () => '{}',
    analysisValidityJson: () => '{}',
    analysisWallThicknessJson: () => '{}',
    meshTriangles: () => '{}',
    meshTrianglePointer: () => 80,
    meshTriangleCount: () => 1,
    occurrenceMeshTriangles: (occurrence: number) => {
      calls.push(`occurrence:${occurrence}`);
      return options.error === undefined ? '{"triangleCount":1}' : `{"error":"${options.error}"}`;
    },
  };
};

const fetchers = (native: GeoSpecNativeXdeReadResult): ReturnType<typeof createOccurrenceMeshFetchers> =>
  createOccurrenceMeshFetchers({ native, backend, contentHash: 'sha256:abc', optionsJson: '{"mesh":true}' });

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

describe('occurrence mesh fetchers', () => {
  it('should copy the retained soup out of the shared heap', () => {
    const native = fakeNative();
    const mesh = fetchers(native).occurrenceMesh(2);
    expect(mesh?.triangleCount).toBe(1);
    expect([...mesh!.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(native.calls).toEqual(['occurrence:2']);
  });

  it('should replay an occurrence from the cache without tessellating again', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cold = fakeNative();
    fetchers(cold).occurrenceMesh(2);
    expect(cold.calls).toEqual(['occurrence:2']);

    const warm = fakeNative();
    const warmFetchers = fetchers(warm);
    expect([...warmFetchers.occurrenceMesh(2)!.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(warm.calls).toEqual([]);
  });

  it('should key each occurrence separately', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const native = fakeNative();
    const bound = fetchers(native);
    bound.occurrenceMesh(1);
    bound.occurrenceMesh(2);
    expect(native.calls).toEqual(['occurrence:1', 'occurrence:2']);
  });

  it('should key a deflection override into its own entry', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const native = fakeNative();
    const fetch = fetchers(native);
    fetch.occurrenceMesh(0);
    fetch.occurrenceMesh(0, { deflection: 0.5 });
    fetch.occurrenceMesh(0, { deflection: 0.5 });
    // The coarse soup is a different payload, so it gets its own key — and
    // replays under it.
    expect(native.calls).toEqual(['occurrence:0', 'occurrence:0']);
  });

  it('should ask the kernel to tessellate even when the subject was loaded with mesh: false', () => {
    // The kernel's soup extractor returns immediately on `!options.mesh`, so
    // forwarding the load-time flag turned an explicit per-occurrence request
    // into an empty soup — and the occupancy hybrid into a no-op.
    const asked: string[] = [];
    const native = {
      ...fakeNative(),
      occurrenceMeshTriangles: (_occurrence: number, json: string) => {
        asked.push(json);
        return '{"triangleCount":1}';
      },
    } as unknown as GeoSpecNativeXdeReadResult;
    const fetch = createOccurrenceMeshFetchers({
      native,
      backend,
      contentHash: 'sha256:abc',
      optionsJson: '{"mesh":false,"meshLinearTolerance":0.1}',
    });

    fetch.occurrenceMesh(0);
    fetch.occurrenceMesh(1, { deflection: 0.02 });
    expect(asked).toEqual(['{"mesh":true,"meshLinearTolerance":0.1}', '{"mesh":true,"meshLinearTolerance":0.02}']);
  });

  it('should leave a mesh: true subject byte-identical in the key', () => {
    // The fetch options are part of the persisted key, so rebuilding them must
    // not churn every existing entry.
    const asked: string[] = [];
    const native = {
      ...fakeNative(),
      occurrenceMeshTriangles: (_occurrence: number, json: string) => {
        asked.push(json);
        return '{"triangleCount":1}';
      },
    } as unknown as GeoSpecNativeXdeReadResult;
    const optionsJson = '{"mesh":true,"meshLinearTolerance":0.1,"meshAngularToleranceDegrees":20}';
    createOccurrenceMeshFetchers({ native, backend, contentHash: 'sha256:abc', optionsJson }).occurrenceMesh(0);
    expect(asked).toEqual([optionsJson]);
  });

  it('should never store a failed tessellation', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    expect(fetchers(fakeNative({ error: 'degenerate face' })).occurrenceMesh(0)).toBeUndefined();
    expect(store.entries.size).toBe(0);
  });

  it('should re-tessellate when the stored frame is not the one-section shape', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    writeEvidenceBytes(
      'occurrence-mesh',
      { contentHash: 'sha256:abc', occurrence: 3, optionsJson: '{"mesh":true}' },
      encodeSections({ triangleCount: 1 }, []),
    );
    const native = fakeNative();
    expect(fetchers(native).occurrenceMesh(3)?.triangleCount).toBe(1);
    expect(native.calls).toEqual(['occurrence:3']);
  });

  it('should default a missing triangle count in a stored frame to zero', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    writeEvidenceBytes(
      'occurrence-mesh',
      { contentHash: 'sha256:abc', occurrence: 4, optionsJson: '{"mesh":true}' },
      encodeSections({}, [new Uint8Array(0)]),
    );
    expect(fetchers(fakeNative()).occurrenceMesh(4)).toEqual({
      positions: new Float32Array(0),
      triangleCount: 0,
    });
  });
});

describe('the in-memory resident cache', () => {
  it('should answer a repeated fetch from memory, with the SAME buffer identity', () => {
    const native = fakeNative();
    const fetch = fetchers(native);

    const first = fetch.occurrenceMesh(2);
    const second = fetch.occurrenceMesh(2);

    expect(native.calls).toEqual(['occurrence:2']);
    // Identity, not just equality: the downstream Barnes-Hut tree is memoized
    // on this buffer, so a fresh copy would silently rebuild it.
    expect(second?.positions).toBe(first?.positions);
  });

  it('should keep a failed tessellation failed without asking again', () => {
    const native = fakeNative({ error: 'no such occurrence' });
    const fetch = fetchers(native);

    expect(fetch.occurrenceMesh(2)).toBeUndefined();
    expect(fetch.occurrenceMesh(2)).toBeUndefined();
    expect(native.calls).toEqual(['occurrence:2']);
  });

  it('should keep a deflection override on its own key', () => {
    const native = fakeNative();
    const fetch = fetchers(native);

    fetch.occurrenceMesh(2);
    fetch.occurrenceMesh(2, { deflection: 0.05 });

    expect(native.calls).toEqual(['occurrence:2', 'occurrence:2']);
  });
});
