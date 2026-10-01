import * as THREE from 'three';
import { TextureLoader } from 'three';

/**
 * Cached matcap texture singleton.
 * Loaded once and reused across all calls to avoid redundant I/O and GPU uploads.
 */
let cachedMatcapTexture: THREE.Texture | undefined;
let loaded = false;
const loadListeners = new Set<() => void>();

export const matcapMaterial = (): THREE.Texture => {
  if (cachedMatcapTexture) {
    return cachedMatcapTexture;
  }

  const textureLoader = new TextureLoader();
  const matcapTexture = textureLoader.load('/textures/matcap-soft.png', () => {
    loaded = true;
    for (const listener of loadListeners) {
      listener();
    }
    loadListeners.clear();
  });
  matcapTexture.colorSpace = THREE.SRGBColorSpace;
  cachedMatcapTexture = matcapTexture;
  return matcapTexture;
};

/** Demand renderers must draw again when the initially empty texture receives its pixels. */
export const subscribeToMatcapLoad = (invalidate: () => void): (() => void) => {
  matcapMaterial();
  const listener = (): void => {
    invalidate();
  };
  if (!loaded) {
    loadListeners.add(listener);
  }
  return () => {
    loadListeners.delete(listener);
  };
};
