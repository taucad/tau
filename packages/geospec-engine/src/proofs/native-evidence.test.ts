import { afterEach, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import { boxWorld } from '#proofs/testing/box-world.js';
import { classifyPoints, commonVolume, measureExtrema, replayable } from '#proofs/native-evidence.js';
import type { Box } from '#proofs/testing/box-world.js';

const boxes: Box[] = [
  { min: [0, 0, 0], max: [10, 10, 10] },
  { min: [30, 0, 0], max: [40, 10, 10] },
];

afterEach(() => {
  setGeoSpecEvidenceStore(undefined);
});

describe('the relationship-verdict payload layer', () => {
  it('should compute without a content hash and never persist', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const native = boxWorld(boxes);
    measureExtrema({ native, a: { occurrence: 0, face: -1 }, b: { occurrence: 1, face: -1 } });
    measureExtrema({ native, a: { occurrence: 0, face: -1 }, b: { occurrence: 1, face: -1 } });
    expect(native.calls.extrema).toBe(2);
    expect(store.families()).toEqual([]);
  });

  it('should replay a stored payload instead of crossing again', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const native = boxWorld(boxes);
    const key = { native, contentHash: 'sha256:a', a: { occurrence: 0, face: -1 }, b: { occurrence: 1, face: -1 } };
    const cold = measureExtrema(key);
    const warm = measureExtrema(key);
    expect(native.calls.extrema).toBe(1);
    expect(warm).toEqual(cold);
  });

  it('should peek without computing when the caller asks for the stored payload only', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const native = boxWorld(boxes);
    const peek = measureExtrema({
      native,
      contentHash: 'sha256:a',
      a: { occurrence: 0, face: -1 },
      b: { occurrence: 1, face: -1 },
      compute: false,
    });
    expect(peek).toBeUndefined();
    expect(native.calls.extrema).toBe(0);
  });

  it('should never store a failed crossing', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const native = boxWorld(boxes, { fail: true });
    expect(
      measureExtrema({
        native,
        contentHash: 'sha256:a',
        a: { occurrence: 0, face: -1 },
        b: { occurrence: 1, face: -1 },
      }),
    ).toBeUndefined();
    expect(classifyPoints({ native, contentHash: 'sha256:a', occurrence: 0, points: [[1, 1, 1]] })).toBeUndefined();
    expect(commonVolume({ native, contentHash: 'sha256:a', a: 0, b: 1 })).toBeUndefined();
    expect(store.families()).toEqual([]);
  });

  it('should answer an empty point batch without crossing', () => {
    const native = boxWorld(boxes);
    expect(classifyPoints({ native, occurrence: 0, points: [] })).toEqual({ states: [] });
    expect(native.calls.classifyPoints).toBe(0);
  });

  it('should classify and intersect through the same replay path', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const native = boxWorld(boxes);
    const points = [
      [5, 5, 5],
      [0, 5, 5],
      [50, 5, 5],
    ] as const;
    const first = classifyPoints({ native, contentHash: 'sha256:a', occurrence: 0, points: [...points] });
    expect(first?.states).toEqual(['in', 'on', 'out']);
    expect(classifyPoints({ native, contentHash: 'sha256:a', occurrence: 0, points: [...points] })).toEqual(first);
    expect(native.calls.classifyPoints).toBe(1);
    expect(commonVolume({ native, contentHash: 'sha256:a', a: 0, b: 1 })?.volume).toBe(0);
    expect(commonVolume({ native, contentHash: 'sha256:a', a: 0, b: 1 })?.volume).toBe(0);
    expect(native.calls.commonVolume).toBe(1);
  });

  it('should leave `replayable` a pure compute when nothing is stored', () => {
    expect(replayable(undefined, { kind: 'unit' }, () => ({ value: 1 }))).toEqual({ value: 1 });
  });
});
