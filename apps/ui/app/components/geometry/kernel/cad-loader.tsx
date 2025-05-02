import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useGLTF, useAnimations, useTexture } from '@react-three/drei';
import type { Group, MeshBasicMaterial } from 'three';
import { Mesh, MeshMatcapMaterial, LoopRepeat } from 'three';
import { useFrame } from '@react-three/fiber';
import { useColor } from '@/hooks/use-color.js';

type Action =
  | 'Dance'
  | 'Death'
  | 'Idle'
  | 'Jump'
  | 'No'
  | 'Punch'
  | 'Running'
  | 'Sitting'
  | 'Standing'
  | 'ThumbsUp'
  | 'Walking'
  | 'WalkJump'
  | 'Wave'
  | 'Yes';

type CadLoaderProperties = {
  readonly action?: Action;
};

export function CadLoader({ action = 'Idle' }: CadLoaderProperties): JSX.Element {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF('/robot.glb');
  const { actions, mixer } = useAnimations(animations, group);
  const [matcapTexture] = useTexture(['/textures/matcap-1.png']);
  const color = useColor();

  // Setup animation only once
  useEffect(() => {
    const selectedAction = actions[action];
    if (selectedAction) {
      selectedAction.reset().fadeIn(0.5).play();
      selectedAction.setLoop(LoopRepeat, Infinity);
      selectedAction.timeScale = 0.5;
    }

    return () => {
      mixer.stopAllAction();
    };
  }, [actions, mixer, action]);

  // Update materials when color changes
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof Mesh) {
        const originalMaterial = child.material as MeshBasicMaterial;

        // Create new matcap material while preserving original material properties
        child.material = new MeshMatcapMaterial({
          matcap: matcapTexture,
          color: originalMaterial.color.clone(), // Clone the color to prevent reference issues
          name: originalMaterial.name,
          // Map specific colors for different parts
          ...(originalMaterial.name.includes('Main') && { color: color.serialized.hex }), // Main parts
          // ...(originalMaterial.name.includes('Black') && { color: color.serialized.hex }), // black parts
          // ...(originalMaterial.name.includes('Grey') && { color: color.serialized.hex }), // grey parts
        });
      }
    });
  }, [scene, matcapTexture, color.serialized.hex]);

  useFrame((_, delta) => {
    // Ensure the mixer updates on each frame
    mixer.update(delta);
  });

  return (
    <group
      ref={group}
      // eslint-disable-next-line react/no-unknown-property -- TODO: fix three.js types for linter
      position={[0, 0, 0]}
      // eslint-disable-next-line react/no-unknown-property -- TODO: fix three.js types for linter
      rotation={[Math.PI / 2, 0, 0]} // Changed rotation to fix orientation
    >
      {/* eslint-disable-next-line react/no-unknown-property -- TODO: fix three.js types for linter */}
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload('/robot.glb');
