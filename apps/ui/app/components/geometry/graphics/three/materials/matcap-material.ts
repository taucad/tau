import * as THREE from 'three';
import { TextureLoader } from 'three';

export const matcapMaterial = (): THREE.Texture => {
  const textureLoader = new TextureLoader();
  const matcapTexture = textureLoader.load('/textures/matcap-soft.png');
  matcapTexture.colorSpace = THREE.SRGBColorSpace;
  return matcapTexture;
};
