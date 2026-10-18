import { NoBlending } from 'three';
import type { Side } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { positionWorld, uniform, vec4 } from 'three/tsl';
import { getModelPickId } from '#graphics/three/materials/model-pick.material.js';

/**
 * The WebGPU pick material for one face side, mirroring `model-pick.material.ts`: the output node writes the pick
 * record `(id, world position)` unclamped and unconverted. The ID is an object-scope uniform read from the drawn
 * object, so one material serves every object of a pass.
 */
export const createModelPickNodeMaterial = (side: Side): MeshBasicNodeMaterial => {
  const pickId = uniform(0).onObjectUpdate(({ object }) => (object ? getModelPickId(object) : 0));
  const material = new MeshBasicNodeMaterial({
    name: 'TauModelPick',
    side,
    blending: NoBlending,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
    fog: false,
  });
  material.lights = false;
  material.outputNode = vec4(pickId, positionWorld);
  return material;
};
