// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { Texture } from 'three';
import type * as Three from 'three';

it('should repaint current consumers once the shared matcap loads and release removed consumers', async () => {
  vi.resetModules();
  let loaded: (() => void) | undefined;
  const texture = new Texture();
  const load = vi.fn((_url: string, onLoad: () => void) => {
    loaded = onLoad;
    return texture;
  });
  vi.doMock('three', async (original) => ({
    ...(await original<typeof Three>()),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Match Three's exported constructor.
    TextureLoader: class {
      public load = load;
    },
  }));
  try {
    const { matcapMaterial, subscribeToMatcapLoad } =
      await import('#components/geometry/graphics/three/materials/matcap-material.js');
    const current = vi.fn();
    const removed = vi.fn();
    const release = subscribeToMatcapLoad(removed);
    const releaseShared = subscribeToMatcapLoad(current);
    subscribeToMatcapLoad(current);
    releaseShared();
    release();
    expect(matcapMaterial()).toBe(texture);
    expect(load).toHaveBeenCalledOnce();
    expect(current).not.toHaveBeenCalled();
    loaded?.();
    expect(current).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    subscribeToMatcapLoad(current);
    expect(current).toHaveBeenCalledOnce();
  } finally {
    vi.doUnmock('three');
  }
});
