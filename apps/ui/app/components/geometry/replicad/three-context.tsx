import { Suspense } from 'react';
import { Canvas, CanvasProps } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

export type ThreeContextProperties = CanvasProps;

// We change the default orientation - threejs tends to use Y are the height,
// while replicad uses Z. This is mostly a representation default.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// This is the basics to render a nice looking model user react-three-fiber
//
// The camera is positioned for the model we present (that cannot change size.
// You might need to adjust this with something like the autoadjust from the
// `Stage` component of `drei`
//
// Depending on your needs I would advice not using a light and relying on
// a matcap material instead of the meshStandardMaterial used here.
export default function ThreeContext({ children, ...properties }: ThreeContextProperties) {
  const dpr = Math.min(window.devicePixelRatio, 2);

  return (
    <Suspense fallback={<div>Rendering model...</div>}>
      <Canvas
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#f5f5f5',
        }}
        dpr={dpr}
        frameloop="demand"
        camera={{ position: [20, 40, 50] }}
        {...properties}
      >
        <OrbitControls />
        <ambientLight intensity={4} />
        <pointLight position={[100, 100, 100]} />
        {children}
      </Canvas>
    </Suspense>
  );
}
