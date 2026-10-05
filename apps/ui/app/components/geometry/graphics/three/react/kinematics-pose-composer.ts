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
import { useLayoutEffect } from 'react';
import { Matrix4 } from 'three';
import type { Object3D } from 'three';
import { useThree } from '@react-three/fiber';
import type { Mechanism, Pose } from '@taucad/kinematics';
import { getModelComponentId } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { syncGltfSurfaceBatchMatrices } from '#components/geometry/graphics/three/utils/gltf-surface-batches.js';
import { useKinematicsRef } from '#hooks/use-graphics.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import type { getGltfAssemblySource } from '#components/geometry/graphics/three/use-geometry-bounds.js';
import type { PublishedAssemblyComponentPlacement } from '@taucad/runtime/types';

export type KinematicsPoseUnit = Readonly<{
  mechanism: Mechanism | undefined;
  pose: Pose | undefined;
  revision: number;
}>;

/** Capture placement-only native overlays from shared admission identity, excluding intrinsic source and render transforms. */
export function captureGltfAssemblyPlacements(
  source: NonNullable<ReturnType<typeof getGltfAssemblySource>>,
  componentIds: readonly string[],
  unit: KinematicsPoseUnit,
): readonly PublishedAssemblyComponentPlacement[] | undefined {
  const components = new Map(source.metadata.components.map((entry) => [entry.component.id, entry]));
  const occurrences = new Map(source.metadata.occurrences.map((entry) => [JSON.stringify(entry.ancestry), entry]));
  const linkByComponent = new Map<string, string>();
  for (const [linkId, link] of Object.entries(unit.mechanism?.links ?? {})) {
    for (const componentId of link.components) {
      linkByComponent.set(componentId, linkId);
    }
  }
  const placements: PublishedAssemblyComponentPlacement[] = [];
  for (const componentId of componentIds) {
    const entry = components.get(componentId);
    const occurrence = entry && occurrences.get(JSON.stringify(entry.ancestry));
    if (!entry?.sourceComponentId || !occurrence?.definition) {
      return undefined;
    }
    let current: string | undefined = componentId;
    let linkId: string | undefined;
    while (current && !linkId) {
      linkId = linkByComponent.get(current);
      current = components.get(current)?.component.parentId;
    }
    const transform = new Matrix4().fromArray(occurrence.worldTransform);
    if (linkId) {
      const displacement = unit.pose?.linkTransforms[linkId];
      if (!displacement) {
        return undefined;
      }
      transform.premultiply(new Matrix4().fromArray(displacement));
    }
    placements.push({ componentId, worldTransform: transform.toArray() });
  }
  return placements;
}

export type KinematicsPoseComposer = Readonly<{
  /** Applies the unit's pose when its mechanism or revision changed; returns whether the scene changed. */
  update: (unit: KinematicsPoseUnit) => boolean;
  /** Replaces as-built transforms synchronously, then reapplies the current kinematic pose. */
  updateSource: (update: () => boolean, unit: KinematicsPoseUnit) => boolean;
  /** Returns every posed object to its as-built placement and matrix update mode, and forgets the mechanism. */
  reset: () => void;
}>;

type PoseTarget = Readonly<{
  object: Object3D;
  linkId: string;
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
  const visit = (object: Object3D, inheritedLinkId?: string): void => {
    const componentId = getModelComponentId(object);
    const linkId = componentId === undefined ? undefined : linkByComponent.get(componentId);
    if (linkId === undefined || linkId === inheritedLinkId) {
      for (const child of object.children) {
        visit(child, inheritedLinkId);
      }
      return;
    }

    const parentPlacement = rootInverse.clone().multiply(object.parent?.matrixWorld ?? root.matrixWorld);
    targets.push({
      object,
      linkId,
      post: parentPlacement.multiply(object.matrix),
      matrixAutoUpdate: object.matrixAutoUpdate,
    });
    object.matrixAutoUpdate = false;
    for (const child of object.children) {
      visit(child, linkId);
    }
  };
  for (const child of root.children) {
    visit(child);
  }
  return targets;
}

function applyPose(root: Object3D, targets: readonly PoseTarget[], pose: Pose | undefined): void {
  root.updateWorldMatrix(true, false);
  const rootInverse = root.matrixWorld.clone().invert();
  const targetByObject = new Map(targets.map((target) => [target.object, target]));
  root.traverse((object) => {
    if (object === root) {
      return;
    }
    const target = targetByObject.get(object);
    if (target) {
      const linkTransform = pose?.linkTransforms[target.linkId];
      if (linkTransform) {
        delta.fromArray(linkTransform);
      } else {
        delta.identity();
      }
      // Traversal applies ancestors first. A differently linked child receives its own global
      // delta relative to its parent's current placement, rather than inheriting it twice.
      const parentPlacement = rootInverse.clone().multiply(object.parent?.matrixWorld ?? root.matrixWorld);
      object.matrix.multiplyMatrices(parentPlacement.invert(), delta).multiply(target.post);
    }
    // Updating only this object's world matrix keeps nested links linear. Its children are
    // visited once afterwards, including unlinked nodes between separately linked ancestors.
    object.updateWorldMatrix(false, false);
  });
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
  let targetObjects: Object3D[] = [];

  const reset = (): void => {
    applyPose(root, targets, undefined);
    syncGltfSurfaceBatchMatrices(root, targetObjects);

    for (const target of targets) {
      target.object.matrixAutoUpdate = target.matrixAutoUpdate;
    }
    targets = [];
    targetObjects = [];
    mechanism = undefined;
    revision = undefined;
  };

  const applyUnit = (unit: KinematicsPoseUnit): boolean => {
    if (unit.mechanism === mechanism && unit.revision === revision) {
      return false;
    }
    if (unit.mechanism !== mechanism) {
      reset();
      mechanism = unit.mechanism;
      targets = mechanism ? collectPoseTargets(root, mechanism) : [];
      targetObjects = targets.map(({ object }) => object);
    }
    revision = unit.revision;
    applyPose(root, targets, unit.pose);
    syncGltfSurfaceBatchMatrices(root, targetObjects);
    return true;
  };

  return {
    update: applyUnit,
    updateSource(update, unit) {
      // The old targets must restore their old base before source transforms are
      // written. Recapturing afterwards also makes later effect cleanup restore
      // the new base instead of overwriting it with the previous publication.
      reset();
      try {
        return update();
      } finally {
        applyUnit(unit);
      }
    },
    reset,
  };
}

/** One atomic source-transform update around the active kinematic pose. @internal */
export type KinematicsSourceUpdater = (update: () => boolean) => boolean;

/**
 * Keeps a presented scene posed from the kinematics actor. Subscribes imperatively so a playback or drag
 * frame costs one matrix pass and one `invalidate()`, never a React render.
 */
export function useKinematicsPoseComposer(
  unitId: string,
  scene: Object3D | undefined,
  onSourceUpdater?: (updater: KinematicsSourceUpdater | undefined) => void,
): void {
  const kinematicsRef = useKinematicsRef();
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
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
    onSourceUpdater?.((update) => {
      const changed = composer.updateSource(
        update,
        getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId),
      );
      invalidate();
      return changed;
    });
    const subscription = kinematicsRef.subscribe(sync);
    return () => {
      subscription.unsubscribe();
      onSourceUpdater?.(undefined);
      composer.reset();
      invalidate();
    };
  }, [invalidate, kinematicsRef, onSourceUpdater, scene, unitId]);
}
