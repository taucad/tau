import { afterEach, describe, expect, it } from 'vitest';
import { boxSoup } from '#mesh/testing/overlap-subjects.js';
import { clearOccurrenceSolidCache, getOccurrenceSolid } from '#proofs/occurrence-solids.js';
import type { OccurrenceMesh } from '#mesh/types.js';

const mesh = (): OccurrenceMesh => {
  const soup = boxSoup([0, 0, 0], [10, 10, 10]);
  return { positions: Float32Array.from(soup), triangleCount: soup.length / 9 };
};

afterEach(() => {
  clearOccurrenceSolidCache();
});

describe('the content-keyed prepared-solid cache', () => {
  it('should build once and replay for the same content and occurrence', () => {
    let fetches = 0;
    const fetch = (): OccurrenceMesh => {
      fetches += 1;
      return mesh();
    };
    const first = getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch });
    const second = getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch });
    expect(fetches).toBe(1);
    expect(second).toBe(first);
  });

  it('should key on the occurrence as well as the content', () => {
    let fetches = 0;
    const fetch = (): OccurrenceMesh => {
      fetches += 1;
      return mesh();
    };
    getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch });
    getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 1, fetch });
    expect(fetches).toBe(2);
  });

  it('should never cache a subject with no content provenance', () => {
    let fetches = 0;
    const fetch = (): OccurrenceMesh => {
      fetches += 1;
      return mesh();
    };
    getOccurrenceSolid({ occurrence: 0, fetch });
    getOccurrenceSolid({ occurrence: 0, fetch });
    expect(fetches).toBe(2);
  });

  it('should answer nothing for a missing or empty tessellation', () => {
    expect(getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch: () => undefined })).toBeUndefined();
    expect(
      getOccurrenceSolid({
        contentHash: 'sha256:a',
        occurrence: 0,
        fetch: () => ({ positions: new Float32Array(0), triangleCount: 0 }),
      }),
    ).toBeUndefined();
  });

  it('should evict the least recently used entry, keeping the refreshed one', () => {
    for (let occurrence = 0; occurrence < 17; occurrence++) {
      getOccurrenceSolid({ contentHash: 'sha256:a', occurrence, fetch: mesh });
      // Touch occurrence 0 on every round so recency, not build order, decides.
      getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch: mesh });
    }
    let refetched = 0;
    getOccurrenceSolid({
      contentHash: 'sha256:a',
      occurrence: 0,
      fetch: () => {
        refetched += 1;
        return mesh();
      },
    });
    expect(refetched).toBe(0);
  });

  it('should build the winding tree lazily and answer membership', () => {
    const solid = getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch: mesh })!;
    expect(Math.abs(solid.winding([5, 5, 5]))).toBeCloseTo(1, 3);
    expect(Math.abs(solid.winding([50, 5, 5]))).toBeCloseTo(0, 3);
  });

  it('should drop everything on demand', () => {
    getOccurrenceSolid({ contentHash: 'sha256:a', occurrence: 0, fetch: mesh });
    clearOccurrenceSolidCache();
    let refetched = 0;
    getOccurrenceSolid({
      contentHash: 'sha256:a',
      occurrence: 0,
      fetch: () => {
        refetched += 1;
        return mesh();
      },
    });
    expect(refetched).toBe(1);
  });
});
