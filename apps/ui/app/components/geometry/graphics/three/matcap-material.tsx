import React from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export const MatcapMaterial = React.memo(function (properties: React.ComponentProps<'meshMatcapMaterial'>) {
  const [matcap] = useTexture(['/textures/matcap-1.png']);
  matcap.colorSpace = THREE.SRGBColorSpace;
  // eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter
  return <meshMatcapMaterial matcap={matcap} {...properties} />;
});
