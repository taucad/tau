import * as THREE from 'three';

export type SectionOpenBackFaces = Readonly<{
  /** Draws both sides of these meshes' materials, and only these: any other material returns to its own side. */
  show: (meshes: readonly THREE.Mesh[]) => void;
  /** Returns every material to its own side. */
  dispose: () => void;
}>;

/**
 * The back faces of sources capped per loop, while Section is on. Such a source is open somewhere, so the cut shows its
 * inside through the region it leaves uncapped; single-sided materials would cull that inside and leave a hole into
 * the background. Each material is switched to double-sided in place, with its own shading, once per change of the
 * set: one program or pipeline build per material, never per frame.
 * @internal
 */
export const createSectionOpenBackFaces = (): SectionOpenBackFaces => {
  const ownSides = new Map<THREE.Material, THREE.Side>();
  const restore = (material: THREE.Material): void => {
    material.side = ownSides.get(material)!;
    material.needsUpdate = true;
    ownSides.delete(material);
  };
  return {
    show(meshes) {
      const wanted = new Set<THREE.Material>();
      for (const { material } of meshes) {
        for (const entry of Array.isArray(material) ? material : [material]) {
          wanted.add(entry);
        }
      }
      for (const material of ownSides.keys()) {
        if (!wanted.has(material)) {
          restore(material);
        }
      }
      for (const material of wanted) {
        if (!ownSides.has(material) && material.side !== THREE.DoubleSide) {
          ownSides.set(material, material.side);
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        }
      }
    },
    dispose() {
      for (const material of ownSides.keys()) {
        restore(material);
      }
    },
  };
};
