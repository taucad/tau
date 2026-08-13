import { describe, expect, it, vi } from 'vitest';
import { createNativeXdeFacade } from '#step/native-xde-facade.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';

const fakeRead = (): GeoSpecNativeXdeReadResult & { deletes: number } => {
  const read = {
    deletes: 0,
    isSuccess: () => true,
    resultJson: () => '{"native":true}',
    // oxlint-disable-next-line max-params -- Mirrors the kernel's embind signature.
    extrema: (a: number, b: number, c: number, d: number) => `extrema:${a}:${b}:${c}:${d}`,
    classifyPoints: (occurrence: number, points: string) => `classify:${occurrence}:${points}`,
    commonVolume: (a: number, b: number) => `common:${a}:${b}`,
    faceFacts: (occurrence: number) => `facts:${occurrence}`,
    analysisSummaryJson: () => 'summary',
    analysisMassPropertiesJson: () => 'mass',
    analysisFaceFeaturesJson: () => 'faces',
    analysisValidityJson: (json: string) => `validity:${json}`,
    analysisWallThicknessJson: (json: string) => `wall:${json}`,
    meshTriangles: (json: string) => `mesh:${json}`,
    meshTrianglePointer: () => 80,
    meshTriangleCount: () => 3,
    occurrenceMeshTriangles: (occurrence: number, json: string) => `occ:${occurrence}:${json}`,
    delete: () => {
      read.deletes += 1;
    },
  };
  return read;
};

describe('native XDE façade — eager path', () => {
  it('should forward every binding to the read it materialized', () => {
    const read = fakeRead();
    const { facade, materialize, materialized } = createNativeXdeFacade({ read: () => read, occurrenceCount: 2 });
    materialize();

    expect(materialized()).toBe(true);
    expect(facade.isSuccess()).toBe(true);
    expect(facade.resultJson()).toBe('{"native":true}');
    expect(facade.extrema(1, 2, 3, 4)).toBe('extrema:1:2:3:4');
    expect(facade.classifyPoints(1, '[]')).toBe('classify:1:[]');
    expect(facade.commonVolume(1, 2)).toBe('common:1:2');
    expect(facade.faceFacts(7)).toBe('facts:7');
    expect(facade.analysisSummaryJson()).toBe('summary');
    expect(facade.analysisMassPropertiesJson()).toBe('mass');
    expect(facade.analysisFaceFeaturesJson()).toBe('faces');
    expect(facade.analysisValidityJson('{}')).toBe('validity:{}');
    expect(facade.analysisWallThicknessJson('{}')).toBe('wall:{}');
    expect(facade.meshTriangles('{}')).toBe('mesh:{}');
    expect(facade.meshTrianglePointer()).toBe(80);
    expect(facade.meshTriangleCount()).toBe(3);
    expect(facade.occurrenceMeshTriangles(1, '{}')).toBe('occ:1:{}');
  });

  it('should read once no matter how many bindings are called', () => {
    const read = vi.fn(fakeRead);
    const { facade } = createNativeXdeFacade({ read, occurrenceCount: 1 });
    facade.analysisSummaryJson();
    facade.analysisMassPropertiesJson();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('should delete the handle exactly once and flip the ledger handle', () => {
    const read = fakeRead();
    const { facade, handle, materialize } = createNativeXdeFacade({ read: () => read, occurrenceCount: 1 });
    materialize();

    expect(handle.disposed).toBe(false);
    expect(handle.native).toBe(facade);
    expect(handle.occurrenceCount).toBe(1);

    facade.delete?.();
    facade.delete?.();
    expect(read.deletes).toBe(1);
    expect(handle.disposed).toBe(true);
  });

  it('should tolerate a read whose handle exposes no delete', () => {
    const read = fakeRead();
    const { facade, materialize } = createNativeXdeFacade({
      read: () => ({ ...read, delete: undefined }),
      occurrenceCount: 1,
    });
    materialize();
    expect(() => facade.delete?.()).not.toThrow();
  });
});

describe('native XDE façade — deferred path (R8)', () => {
  it('should answer success and the result JSON from the cache without reading', () => {
    const read = vi.fn(fakeRead);
    const { facade, materialized } = createNativeXdeFacade({
      read,
      occurrenceCount: 1,
      cachedResultJson: '{"cached":true}',
    });

    expect(facade.isSuccess()).toBe(true);
    expect(facade.resultJson()).toBe('{"cached":true}');
    expect(materialized()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it('should materialize on the first call that genuinely needs geometry', () => {
    const read = vi.fn(fakeRead);
    const { facade, materialized } = createNativeXdeFacade({
      read,
      occurrenceCount: 1,
      cachedResultJson: '{"cached":true}',
    });

    expect(facade.analysisSummaryJson()).toBe('summary');
    expect(materialized()).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    // Once materialized, the live read answers — including its own result JSON.
    expect(facade.resultJson()).toBe('{"native":true}');
    expect(facade.isSuccess()).toBe(true);
  });

  it('should never materialize just to be disposed', () => {
    const read = vi.fn(fakeRead);
    const { facade, handle, materialized } = createNativeXdeFacade({
      read,
      occurrenceCount: 1,
      cachedResultJson: '{"cached":true}',
    });

    facade.delete?.();
    expect(read).not.toHaveBeenCalled();
    expect(materialized()).toBe(false);
    expect(handle.disposed).toBe(true);
  });

  it('should report failure while deferred only when nothing was cached', () => {
    const read = vi.fn(fakeRead);
    const { facade } = createNativeXdeFacade({ read, occurrenceCount: 0 });
    expect(facade.isSuccess()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
