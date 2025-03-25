import React from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export const MatcapMaterial = React.memo(function MatcapMaterial(
  properties: React.ComponentProps<'meshMatcapMaterial'>,
) {
  const [matcap] = useTexture(['/textures/matcap-1.png']);
  matcap.colorSpace = THREE.SRGBColorSpace;
  return <meshMatcapMaterial matcap={matcap} {...properties} />;
});
