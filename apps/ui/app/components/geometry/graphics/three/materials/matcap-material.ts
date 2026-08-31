import * as THREE from 'three';
import { TextureLoader } from 'three';

/**
 * Cached matcap texture singleton.
 * Loaded once and reused across all calls to avoid redundant I/O and GPU uploads.
 */
let cachedMatcapTexture: THREE.Texture | undefined;

export const matcapMaterial = (): THREE.Texture => {
  if (cachedMatcapTexture) {
    return cachedMatcapTexture;
  }

  const textureLoader = new TextureLoader();
  const matcapTexture = textureLoader.load('/textures/matcap-soft.png');
  matcapTexture.colorSpace = THREE.SRGBColorSpace;
  cachedMatcapTexture = matcapTexture;
  return matcapTexture;
};
