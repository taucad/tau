import React from 'react';
import { useTexture } from '@react-three/drei';
import { Color } from 'three';

type MatcapMaterialProperties = {
  color?: Color;
  name?: string;
  opacity?: number;
  transparent?: boolean;
};

export const MatcapMaterial = React.memo(function MatcapMaterial(properties: MatcapMaterialProperties) {
  const [matcap] = useTexture(['/textures/matcap-1.png']);
  return <meshMatcapMaterial matcap={matcap} {...properties} />;
});
