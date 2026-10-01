import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readGraphicsBackendQueryOverride,
  resolveViewerGraphicsBackend,
} from '#components/geometry/graphics/graphics-backend.js';

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

describe('resolveViewerGraphicsBackend', () => {
  it('should keep WebGL as the default and enable WebGPU only with an adapter', () => {
    withSearch('');
    expect(resolveViewerGraphicsBackend(false, true)).toBe('webgl');
    expect(resolveViewerGraphicsBackend(true, true)).toBe('webgpu');
    expect(resolveViewerGraphicsBackend(true, false)).toBe('webgl');
    expect(resolveViewerGraphicsBackend(false, false)).toBe('webgl');
  });

  it('should preserve the internal query override independently of the flag', () => {
    withSearch('?graphicsBackend=webgl');
    expect(resolveViewerGraphicsBackend(true, true)).toBe('webgl');
    withSearch('?graphicsBackend=webgpu');
    expect(resolveViewerGraphicsBackend(false, true)).toBe('webgpu');
    expect(resolveViewerGraphicsBackend(false, false)).toBe('webgl');
    withSearch('?graphicsBackend=invalid');
    expect(resolveViewerGraphicsBackend(true, true)).toBe('webgpu');
  });
});
