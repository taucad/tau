/**
 * Applies a kinematic pose to the viewer's Three objects as object matrices; geometry buffers are never touched.
 *
 * Frames. The viewer's graph is, outermost first:
 *
 *   Stage outer group        createThreeRenderMatrix: anchor metres → render units (origin shift + scale)
 *   GltfMesh wrapper group   createCanonicalGltfToTauMatrix: glTF (+Y up, +Z forward) → Tau (+Z up, −Y forward)
 *   gltf.scene               loader root; its local frame is the GLB vertex space ("GLB frame")
 *   node objects             replicad writes one node per named shape with no matrix (identity, baked vertices)
 *   meshes / fat edges       the node's primitives, identity
 *
 * The mechanism is authored in the as-built model frame and the kernel converts it into GLB vertex space
 * (blueprint A1/A2), so a link delta D maps an as-built GLB point p to its posed GLB point D·p. A posed
 * object with parent GLB placement P (ancestors below the scene root) and as-built local matrix L0 sits at
 * P·L0; posed it must sit at D·P·L0, so its local matrix becomes P⁻¹·D·P·L0. Replicad nodes hang directly
 * under the scene root with no matrix (P = L0 = I), so the local matrix is exactly D; the general form costs
 * two multiplies and stays right for any loader-introduced node transform. The wrapper and render-frame
 * matrices apply afterwards through Three's world-matrix update, so neither is inverted or duplicated here
 * (`applyCanonicalGltfWorld` premultiplies a scene root only in the landing demo, never in this viewer).
 *
 * Only the top-most object owning a linked component is posed; its primitives follow as children. Objects
 * of components outside every link are never touched.
 */
import { useEffect } from 'react';
import { Matrix4 } from 'three';
import type { Object3D } from 'three';
import { useThree } from '@react-three/fiber';
import type { Mechanism, Pose } from '@taucad/kinematics';
import { getModelComponentId } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { useKinematicsRef } from '#hooks/use-graphics.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';

export type KinematicsPoseUnit = Readonly<{
  mechanism: Mechanism | undefined;
  pose: Pose | undefined;
  revision: number;
}>;

export type KinematicsPoseComposer = Readonly<{
  /** Applies the unit's pose when its mechanism or revision changed; returns whether the scene changed. */
  update: (unit: KinematicsPoseUnit) => boolean;
  /** Returns every posed object to its as-built placement and matrix update mode, and forgets the mechanism. */
  reset: () => void;
}>;

type PoseTarget = Readonly<{
  object: Object3D;
  linkId: string;
  pre: Matrix4;
  post: Matrix4;
  /** The object's own setting, restored when it stops being posed. */
  matrixAutoUpdate: boolean;
}>;

const delta = new Matrix4();

function collectPoseTargets(root: Object3D, mechanism: Mechanism): PoseTarget[] {
  const linkByComponent = new Map<string, string>();
  for (const [linkId, link] of Object.entries(mechanism.links)) {
    for (const componentId of link.components) {
      linkByComponent.set(componentId, linkId);
    }
  }

  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const targets: PoseTarget[] = [];
  const visit = (object: Object3D): void => {
    const componentId = getModelComponentId(object);
    const linkId = componentId === undefined ? undefined : linkByComponent.get(componentId);
    if (linkId === undefined) {
      for (const child of object.children) {
        visit(child);
      }
      return;
    }

    const parentPlacement = rootInverse.clone().multiply(object.parent?.matrixWorld ?? root.matrixWorld);
    targets.push({
      object,
      linkId,
      pre: parentPlacement.clone().invert(),
      post: parentPlacement.multiply(object.matrix),
      matrixAutoUpdate: object.matrixAutoUpdate,
    });
    object.matrixAutoUpdate = false;
  };
  for (const child of root.children) {
    visit(child);
  }
  return targets;
}

function applyPose(targets: readonly PoseTarget[], pose: Pose | undefined): void {
  for (const { object, linkId, pre, post } of targets) {
    const linkTransform = pose?.linkTransforms[linkId];
    if (linkTransform) {
      delta.fromArray(linkTransform);
    } else {
      delta.identity();
    }
    object.matrix.multiplyMatrices(pre, delta).multiply(post);
    object.updateMatrixWorld(true);
  }
}

/**
 * Creates the composer for one presented glTF scene root.
 *
 * @param root - The loader's scene root (`gltf.scene`), whose local frame is GLB vertex space.
 */
export function createKinematicsPoseComposer(root: Object3D): KinematicsPoseComposer {
  let mechanism: Mechanism | undefined;
  let revision: number | undefined;
  let targets: PoseTarget[] = [];

  const reset = (): void => {
    applyPose(targets, undefined);
    for (const target of targets) {
      target.object.matrixAutoUpdate = target.matrixAutoUpdate;
    }
    targets = [];
    mechanism = undefined;
    revision = undefined;
  };

  return {
    update(unit) {
      if (unit.mechanism === mechanism && unit.revision === revision) {
        return false;
      }
      if (unit.mechanism !== mechanism) {
        reset();
        mechanism = unit.mechanism;
        targets = mechanism ? collectPoseTargets(root, mechanism) : [];
      }
      revision = unit.revision;
      applyPose(targets, unit.pose);
      return true;
    },
    reset,
  };
}

/**
 * Keeps a presented scene posed from the kinematics actor. Subscribes imperatively so a playback or drag
 * frame costs one matrix pass and one `invalidate()`, never a React render.
 */
export function useKinematicsPoseComposer(unitId: string, scene: Object3D | undefined): void {
  const kinematicsRef = useKinematicsRef();
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!scene) {
      return undefined;
    }

    const composer = createKinematicsPoseComposer(scene);
    const sync = (): void => {
      if (composer.update(getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId))) {
        invalidate();
      }
    };
    sync();
    const subscription = kinematicsRef.subscribe(sync);
    return () => {
      subscription.unsubscribe();
      composer.reset();
      invalidate();
    };
  }, [invalidate, kinematicsRef, scene, unitId]);
}
