import React from 'react';
import { MeshMatcapMaterialProps } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export const MatcapMaterial = React.memo(function MatcapMaterial(properties: MeshMatcapMaterialProps) {
  const [matcap] = useTexture(['/textures/matcap-1.png']);
  matcap.colorSpace = THREE.SRGBColorSpace;
  return <meshMatcapMaterial matcap={matcap} {...properties} />;
});
