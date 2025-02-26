import React from 'react';
import { MeshMatcapMaterialProps } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';

export const MatcapMaterial = React.memo(function MatcapMaterial(properties: MeshMatcapMaterialProps) {
  const [matcap] = useTexture(['/textures/matcap-1.png']);
  return <meshMatcapMaterial matcap={matcap} {...properties} />;
});
