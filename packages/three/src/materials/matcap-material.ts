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

/**
 * Ensure the matcap texture is fully loaded before use.
 *
 * The synchronous `matcapMaterial()` returns a texture object immediately but
 * loads pixel data asynchronously. This async variant guarantees the texture
 * image is available, which is required for offline rendering (screenshots)
 * where the GPU must sample real texels on the first draw call.
 *
 * Uses the same singleton cache — subsequent calls resolve instantly.
 */
export async function ensureMatcapTextureLoaded(): Promise<THREE.Texture> {
  if (cachedMatcapTexture?.image) {
    return cachedMatcapTexture;
  }

  const textureLoader = new TextureLoader();
  const texture = await textureLoader.loadAsync('/textures/matcap-soft.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  cachedMatcapTexture = texture;
  return texture;
}
