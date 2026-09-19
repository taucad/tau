import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';

const withSearch = (search: string): void => {
  vi.stubGlobal('window', { location: { search } });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readGraphicsBackendQueryOverride', () => {
  it('reads a valid override', () => {
    withSearch('?graphicsBackend=webgpu');
    expect(readGraphicsBackendQueryOverride()).toBe('webgpu');
  });

  it('ignores the parameter when absent, empty or outside the vocabulary', () => {
    for (const search of ['', '?graphicsBackend=', '?graphicsBackend=auto', '?graphicsBackend=vulkan']) {
      withSearch(search);
      expect(readGraphicsBackendQueryOverride()).toBeUndefined();
    }
  });

  it('is undefined without a window', () => {
    expect(readGraphicsBackendQueryOverride()).toBeUndefined();
  });
});
