import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { encodeSectionedPayload, typedArrayBytes } from '#cache/section-codec.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import type { GeometrySubject } from '#mesh/types.js';
import { loadStep } from '#step/index.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');
const meshOptions = { linearDeflection: 0.1, angularDeflectionDegrees: 15 };

describe('occurrence-mesh evidence family (R4)', () => {
  const subjects: GeometrySubject[] = [];

  const loadFixture = async (): Promise<GeometrySubject> => {
    const subject = await loadStep({ source: fixturePath, name: 'two-cube-assembly.step' });
    subjects.push(subject);
    if (!subject.occurrenceMesh) {
      throw new Error('two-cube fixture must expose occurrenceMeshTriangles.');
    }
    return subject;
  };

  beforeAll(async () => {
    await loadFixture();
  }, 120_000);

  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  afterAll(() => {
    for (const subject of subjects) {
      subject.nativeXde?.delete?.();
    }
  });

  it('should memoize repeated fetches of one tessellation on the same subject', () => {
    const subject = subjects[0]!;

    const first = subject.occurrenceMesh!(0, meshOptions);
    const second = subject.occurrenceMesh!(0, meshOptions);

    expect('error' in first).toBe(false);
    // Same reference: the soup is fetched once per (occurrence, deflection)
    // and shared under the immutability contract.
    expect(second).toBe(first);
    if (!('error' in first)) {
      expect(first.triangles.length).toBeGreaterThan(0);
      expect(first.triangles.length % 9).toBe(0);
    }
  });

  it('should return byte-identical soups from the family, a fresh fetch, and the direct path', async () => {
    setGeoSpecEvidenceStore(undefined);
    const directSubject = await loadFixture();
    const direct = directSubject.occurrenceMesh!(0, meshOptions);

    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const coldSubject = await loadFixture();
    const cold = coldSubject.occurrenceMesh!(0, meshOptions);
    expect(store.families()).toContain('occurrence-mesh');
    const warmSubject = await loadFixture();
    const warm = warmSubject.occurrenceMesh!(0, meshOptions);

    if ('error' in direct || 'error' in cold || 'error' in warm) {
      throw new Error('two-cube occurrence tessellation must succeed.');
    }
    expect(cold.triangles).toEqual(direct.triangles);
    expect(warm.triangles).toEqual(direct.triangles);
    expect(warm.deflection).toBe(direct.deflection);
  });

  it('should serve a fresh subject from the persisted family instead of re-tessellating', async () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const seeded = await loadFixture();
    seeded.occurrenceMesh!(0, meshOptions);

    // Read-through proof: replace the stored soup with a distinguishable
    // valid payload — a fetch that re-tessellated could never observe it.
    const entryKey = [...store.entries.keys()].find((key) => key.startsWith('occurrence-mesh:'))!;
    expect(entryKey).toBeDefined();
    store.entries.set(entryKey, encodeSectionedPayload({ deflection: 999 }, [typedArrayBytes(new Float64Array(0))]));

    const fresh = await loadFixture();
    const replayed = fresh.occurrenceMesh!(0, meshOptions);
    expect(replayed).toEqual({ triangles: new Float64Array(0), deflection: 999 });
  });
});
