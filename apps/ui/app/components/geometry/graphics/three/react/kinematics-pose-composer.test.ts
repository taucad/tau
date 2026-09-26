import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Mesh } from 'three';
import type { Object3D } from 'three';
import type { Mechanism, Pose } from '@taucad/kinematics';
import { createKinematicsPoseComposer } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import { setModelComponentOwner } from '#components/geometry/graphics/three/utils/model-component-owner.js';

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: {
    base: { components: ['component:base'] },
    arm: { components: ['component:arm'] },
  },
  joints: {
    hinge: { type: 'revolute', parent: 'base', child: 'arm', origin: [1, 0, 0], axis: [0, 1, 0] },
  },
};

/** Delta = T(origin) × R_y(90°) × T(−origin): a quarter turn about +Y through (1, 0, 0). */
const hingeQuarterTurn = new Matrix4()
  .makeTranslation(1, 0, 0)
  .multiply(new Matrix4().makeRotationY(Math.PI / 2))
  .multiply(new Matrix4().makeTranslation(-1, 0, 0));

const poseOf = (arm: Matrix4): Pose => ({
  linkTransforms: {
    base: new Matrix4().toArray(),
    arm: arm.toArray(),
  },
  coordinates: { hinge: Math.PI / 2 },
});

/** A replicad-shaped node: an owned group at identity with a surface mesh child. */
const addNode = (parent: Object3D, componentId: string): Group => {
  const node = new Group();
  setModelComponentOwner(node, { unitId: 'file:main.ts', componentId });
  const mesh = new Mesh();
  setModelComponentOwner(mesh, { unitId: 'file:main.ts', componentId });
  node.add(mesh);
  parent.add(node);
  return node;
};

const expectMatrix = (actual: Matrix4, expected: Matrix4): void => {
  for (const [index, value] of expected.elements.entries()) {
    expect(actual.elements[index]).toBeCloseTo(value, 12);
  }
};

describe('createKinematicsPoseComposer', () => {
  it('should set each linked node to its link delta and leave unlinked components at identity', () => {
    const root = new Group();
    const base = addNode(root, 'component:base');
    const arm = addNode(root, 'component:arm');
    const bolt = addNode(root, 'component:bolt');
    const composer = createKinematicsPoseComposer(root);

    const changed = composer.update({ mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) });

    expect(changed).toBe(true);
    expectMatrix(arm.matrix, hingeQuarterTurn);
    expect(arm.matrixAutoUpdate).toBe(false);
    // The primitive follows its node; its own local matrix is untouched.
    expect(arm.children[0]?.matrix.equals(new Matrix4())).toBe(true);
    expectMatrix(arm.children[0]!.matrixWorld, hingeQuarterTurn);
    expect(base.matrix.equals(new Matrix4())).toBe(true);
    expect(bolt.matrix.equals(new Matrix4())).toBe(true);
    expect(bolt.matrixAutoUpdate).toBe(true);
  });

  it('should skip work when the revision is unchanged and apply the next revision', () => {
    const root = new Group();
    const arm = addNode(root, 'component:arm');
    const composer = createKinematicsPoseComposer(root);
    composer.update({ mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) });

    const unchanged = composer.update({ mechanism, revision: 1, pose: poseOf(new Matrix4()) });
    expectMatrix(arm.matrix, hingeQuarterTurn);

    const changed = composer.update({ mechanism, revision: 2, pose: poseOf(new Matrix4()) });

    expect(unchanged).toBe(false);
    expect(changed).toBe(true);
    expect(arm.matrix.equals(new Matrix4())).toBe(true);
  });

  it('should restore the as-built placement and matrix auto-update when the mechanism clears', () => {
    const root = new Group();
    const arm = addNode(root, 'component:arm');
    const composer = createKinematicsPoseComposer(root);
    composer.update({ mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) });

    composer.update({ mechanism: undefined, revision: 2, pose: undefined });

    expect(arm.matrix.equals(new Matrix4())).toBe(true);
    expect(arm.matrixAutoUpdate).toBe(true);
    // The node answers to its own transform again, as after an in-place update that keeps it.
    arm.position.set(1, 0, 0);
    root.updateMatrixWorld(true);
    expect(arm.matrixWorld.elements[12]).toBe(1);
  });

  it('should restore the matrix auto-update each object had on reset and pose again on the next update', () => {
    const root = new Group();
    const arm = addNode(root, 'component:arm');
    arm.matrixAutoUpdate = false;
    const composer = createKinematicsPoseComposer(root);
    composer.update({ mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) });

    composer.reset();

    expect(arm.matrix.equals(new Matrix4())).toBe(true);
    expect(arm.matrixAutoUpdate).toBe(false);

    expect(composer.update({ mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) })).toBe(true);
    expectMatrix(arm.matrix, hingeQuarterTurn);
  });

  it('should conjugate the delta by a node parent placement so the motion stays in the GLB frame', () => {
    const root = new Group();
    const offset = new Group();
    offset.position.set(0, 0, 5);
    root.add(offset);
    const arm = addNode(offset, 'component:arm');
    const composer = createKinematicsPoseComposer(root);

    composer.update({ mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) });

    // In the GLB frame the node sits at delta × P; relative to its parent that is P⁻¹ × delta × P.
    const parentPlacement = new Matrix4().makeTranslation(0, 0, 5);
    expectMatrix(arm.matrix, parentPlacement.clone().invert().multiply(hingeQuarterTurn).multiply(parentPlacement));
    expectMatrix(
      root.matrixWorld.clone().invert().multiply(arm.matrixWorld),
      hingeQuarterTurn.clone().multiply(parentPlacement),
    );
  });
});
