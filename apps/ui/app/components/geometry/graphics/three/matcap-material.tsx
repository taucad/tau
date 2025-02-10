import React from 'react';
import { useTexture } from '@react-three/drei';

export const MatcapMaterial = React.memo(function MatcapMaterial(properties) {
  const [matcap] = useTexture(['/textures/matcap-1.png']);
  return <meshMatcapMaterial matcap={matcap} {...properties} />;
});
