import { describe, expect, it, vi } from 'vitest';
import { Group, Matrix4, Mesh, Object3D, Vector3, InstancedMesh, BoxGeometry, MeshBasicMaterial, Vector2 } from 'three';
import type { Mechanism, Pose } from '@taucad/kinematics';
import {
  captureGltfAssemblyPlacements,
  createKinematicsPoseComposer,
} from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import {
  setModelComponentOwner,
  setModelComponentInstanceSlots,
  getModelComponentWorldMatrix,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';
import {
  createGltfFatLineMaterial,
  createGltfOccurrenceEdgeBatch,
  getGltfFatLinePositions,
} from '#components/geometry/graphics/three/materials/gltf-edges.js';
import { writeGlb, validateAdmittedAssemblyGlb } from '@taucad/geometry-core';
import { contentDigest } from '@taucad/cache-core';
import { sha256Bytes } from '@taucad/utils/hash';
import { mock } from 'vitest-mock-extended';
import type { AdmittedAssembly, PublishedPartAsset, PublishedPartVariant } from '@taucad/runtime/types';
import {
  setGltfAssemblyBounds,
  getGltfAssemblySource,
} from '#components/geometry/graphics/three/use-geometry-bounds.js';

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
  it('should pose hundred actual cell-link batch groups without instance uploads or edge endpoint derivation', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const template = new Mesh(geometry, material);
    const edgeMaterial = createGltfFatLineMaterial({ backend: 'webgl', resolution: new Vector2(800, 600) });
    const links: Record<string, Mechanism['links'][string]> = {};
    const transforms: Record<string, Pose['linkTransforms'][string]> = {};
    const batches: InstancedMesh[] = [];
    const edgeBatches: Array<NonNullable<ReturnType<typeof createGltfOccurrenceEdgeBatch>>> = [];
    for (let index = 0; index < 100; index++) {
      const id = `link:${index}`;
      const componentId = `component:${index}`;
      links[id] = { components: [componentId] };
      transforms[id] = new Matrix4().makeTranslation(0, index * 0.1, 0).toArray();
      const parent = new Group();
      parent.matrix.makeTranslation(index * 100, 0, 0);
      parent.matrixAutoUpdate = false;
      setModelComponentOwner(parent, { unitId: 'u', componentId });
      root.add(parent);
      const mesh = new InstancedMesh(geometry, material, 10);
      for (let slot = 0; slot < 10; slot++) {
        mesh.setMatrixAt(slot, new Matrix4().makeTranslation(slot * 2, 0, 0));
      }
      mesh.instanceMatrix.needsUpdate = true;
      setModelComponentInstanceSlots(
        mesh,
        Array.from({ length: 10 }, (_, slot) => ({
          owner: { unitId: 'u', componentId: `${componentId}:${slot}` },
          sourceObject: template,
        })),
      );
      parent.add(mesh);
      batches.push(mesh);
      const edge = createGltfOccurrenceEdgeBatch({
        backend: 'webgl',
        material: edgeMaterial,
        occurrences: Array.from({ length: 10 }, (_, slot) => ({
          componentId: `${componentId}:${slot}`,
          positions: new Float32Array([0, 0, 0, 1, 0, 0]),
          localToBatch: new Matrix4().makeTranslation(slot * 2, 0, 0),
        })),
      });
      if (!edge) {
        throw new Error('Expected actual edge batch');
      }
      parent.add(edge.object);
      edgeBatches.push(edge);
    }
    const mechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'link:0',
      links,
      joints: {},
    };
    const pose: Pose = { coordinates: {}, linkTransforms: transforms };
    const versions = batches.map((batch) => batch.instanceMatrix.version);
    const arrays = batches.map((batch) => batch.instanceMatrix.array);
    const positions = edgeBatches.map((batch) => getGltfFatLinePositions(batch.object));
    const composer = createKinematicsPoseComposer(root);
    try {
      for (let revision = 1; revision <= 100; revision++) {
        composer.update({ mechanism, pose, revision });
      }
      for (const [index, batch] of batches.entries()) {
        expect(batch.instanceMatrix.version).toBe(versions[index]);
        expect(batch.instanceMatrix.array).toBe(arrays[index]);
        const world = getModelComponentWorldMatrix(batch, 9, new Matrix4());
        expect(world?.elements[12]).toBeCloseTo(index * 100 + 18);
        expect(world?.elements[13]).toBeCloseTo(index * 0.1);
        expect(getGltfFatLinePositions(edgeBatches[index]!.object)).toBe(positions[index]);
      }
      composer.reset();
      expect(getModelComponentWorldMatrix(batches[99]!, 9, new Matrix4())?.elements[13]).toBe(0);
    } finally {
      composer.reset();
      for (const batch of batches) {
        batch.dispose();
      }
      for (const edge of edgeBatches) {
        edge.dispose();
      }
      geometry.dispose();
      material.dispose();
      edgeMaterial.dispose();
    }
  });
  it('updates a hundred differently linked nested nodes and their unlinked children in one world-matrix pass', () => {
    const root = new Group();
    const links: Record<string, Mechanism['links'][string]> = {};
    const transforms: Record<string, Pose['linkTransforms'][string]> = {};
    const nodes: Group[] = [];
    let parent: Object3D = root;
    for (let index = 0; index < 100; index += 1) {
      const id = `link-${index}`;
      const componentId = `component:${index}`;
      links[id] = { components: [componentId] };
      const node = addNode(parent, componentId);
      node.position.x = 1;
      nodes.push(node);
      parent = node;
      transforms[id] = new Matrix4().makeTranslation(index * 2, 0, 0).toArray();
    }
    const nestedMechanism: Mechanism = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'link-0',
      links,
      joints: {},
    };
    const composer = createKinematicsPoseComposer(root);
    const pose: Pose = { coordinates: {}, linkTransforms: transforms };
    composer.update({ mechanism: nestedMechanism, pose, revision: 1 });
    const ownUpdates = vi.spyOn(Object3D.prototype, 'updateWorldMatrix');
    const subtreeUpdates = vi.spyOn(Object3D.prototype, 'updateMatrixWorld');
    try {
      expect(composer.update({ mechanism: nestedMechanism, pose, revision: 2 })).toBe(true);
      expect(ownUpdates).toHaveBeenCalledTimes(201);
      expect(subtreeUpdates).not.toHaveBeenCalled();
      for (const [index, node] of nodes.entries()) {
        expect(node.matrixWorld.elements[12]).toBeCloseTo(index + 1 + index * 2);
        expect(node.children[0]!.matrixWorld.elements[12]).toBeCloseTo(index + 1 + index * 2);
      }
      ownUpdates.mockClear();
      expect(composer.update({ mechanism: nestedMechanism, pose, revision: 2 })).toBe(false);
      expect(ownUpdates).not.toHaveBeenCalled();
    } finally {
      ownUpdates.mockRestore();
      subtreeUpdates.mockRestore();
      composer.reset();
    }
  });

  it.each([0, Math.PI / 2])(
    'captures E*O from real canonical metadata and excludes baked intrinsic S (rotation %s)',
    async (angle) => {
      const bytes = writeGlb({
        nodes: [
          {
            extras: { tauComponentId: 'component:source', tauComponentKind: 'part' },
            primitives: [
              { mode: 4, positions: Float32Array.from([0.01, 0, 0, 0.011, 0, 0, 0.01, 0.001, 0]), material: {} },
            ],
          },
        ],
      });
      const digest = contentDigest({ value: `sha256:${await sha256Bytes(bytes)}` });
      const asset = { path: 'source.glb', digest, byteLength: bytes.byteLength };
      const occurrenceTransform = new Matrix4()
        .makeTranslation(0.03, 0, 0)
        .multiply(new Matrix4().makeRotationZ(angle));
      const publication: AdmittedAssembly['publication'] = {
        schemaVersion: 1,
        parts: { source: { schemaVersion: 1, variants: { default: mock<PublishedPartVariant>({ glb: asset }) } } },
        occurrences: [{ id: 'one', part: 'source', variant: 'default', transform: occurrenceTransform.toArray() }],
      };
      const admitted = mock<AdmittedAssembly>({ publication });
      const metadata = await validateAdmittedAssemblyGlb({ ...publication, readAsset: async () => bytes });
      const componentId = metadata.components.find((entry) => entry.sourceComponentId === 'component:source')?.component
        .id;
      if (!componentId) {
        throw new Error('Expected shared canonical source identity');
      }
      const root = new Group();
      const child = new Mesh();
      root.add(child);
      setGltfAssemblyBounds(root, {
        bounds: metadata.bounds,
        unitId: 'unit',
        components: [],
        source: { display: { root: mock<PublishedPartAsset>(), admitted, document: mock() }, metadata },
      });
      const source = getGltfAssemblySource(child);
      if (!source) {
        throw new Error('Missing actual scene admission descriptor');
      }
      const placements = captureGltfAssemblyPlacements(source, [componentId], {
        revision: 1,
        mechanism: {
          schemaVersion: 1,
          units: { length: 'm', angle: 'rad' },
          root: 'moving',
          links: { moving: { components: [componentId] } },
          joints: {},
        },
        pose: { coordinates: {}, linkTransforms: { moving: new Matrix4().makeTranslation(0.002, 0, 0).toArray() } },
      });
      expect(placements).toHaveLength(1);
      const point = new Vector3(0.01, 0, 0).applyMatrix4(new Matrix4().fromArray(placements![0]!.worldTransform));
      expect(point.x).toBeCloseTo(angle === 0 ? 0.042 : 0.032, 12);
      expect(point.y).toBeCloseTo(angle === 0 ? 0 : 0.01, 12);
      expect(placements![0]!.worldTransform[12]).toBeCloseTo(0.032, 12);
      expect(
        captureGltfAssemblyPlacements(source, ['unknown'], { revision: 1, mechanism: undefined, pose: undefined }),
      ).toBeUndefined();
      const imported = new Mesh();
      imported.userData['admittedAssemblyBounds'] = { source };
      expect(getGltfAssemblySource(imported)).toBeUndefined();
    },
  );

  it('poses differently linked nested children once in the model frame and restores both placements', () => {
    const root = new Group();
    const base = addNode(root, 'component:base');
    base.position.set(3, 0, 0);
    const arm = addNode(base, 'component:arm');
    arm.position.set(0, 2, 0);
    const unlinked = addNode(arm, 'component:bolt');
    unlinked.position.set(0, 0, 4);
    root.updateMatrixWorld(true);
    const baseSource = base.matrixWorld.clone();
    const armSource = arm.matrixWorld.clone();
    const boltSource = unlinked.matrix.clone();
    const composer = createKinematicsPoseComposer(root);
    const baseDelta = new Matrix4().makeTranslation(5, 0, 0);
    const armDelta = new Matrix4().makeRotationZ(Math.PI / 2);
    composer.update({
      mechanism,
      revision: 1,
      pose: {
        coordinates: {},
        linkTransforms: { base: baseDelta.toArray(), arm: armDelta.toArray() },
      },
    });
    expectMatrix(base.matrixWorld, baseDelta.clone().multiply(baseSource));
    expectMatrix(arm.matrixWorld, armDelta.clone().multiply(armSource));
    expectMatrix(unlinked.matrix, boltSource);
    composer.reset();
    expectMatrix(base.matrixWorld, baseSource);
    expectMatrix(arm.matrixWorld, armSource);
    expectMatrix(arm.matrix, new Matrix4().makeTranslation(0, 2, 0));
    expect(arm.matrixAutoUpdate).toBe(true);
  });

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
  it('should recapture a changed occurrence base before reposing and preserve unrelated occurrences', () => {
    const root = new Group();
    const arm = addNode(root, 'component:arm');
    const sibling = addNode(root, 'component:other-occurrence');
    sibling.position.x = 20;
    root.updateMatrixWorld(true);
    const composer = createKinematicsPoseComposer(root);
    const unit = { mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) };
    composer.update(unit);
    const { geometry } = arm.children[0] as Mesh;
    const changed = composer.updateSource(() => {
      expectMatrix(arm.matrix, new Matrix4());
      arm.position.x = 6;
      arm.updateMatrix();
      return true;
    }, unit);
    expect(changed).toBe(true);
    expectMatrix(arm.matrix, hingeQuarterTurn.clone().multiply(new Matrix4().makeTranslation(6, 0, 0)));
    expectMatrix(sibling.matrixWorld, new Matrix4().makeTranslation(20, 0, 0));
    expect((arm.children[0] as Mesh).geometry).toBe(geometry);
    composer.reset();
    expectMatrix(arm.matrix, new Matrix4().makeTranslation(6, 0, 0));
    expect(arm.matrixAutoUpdate).toBe(true);
  });

  it('should restore the current kinematic pose after an atomic source update refuses the candidate', () => {
    const root = new Group();
    const arm = addNode(root, 'component:arm');
    const composer = createKinematicsPoseComposer(root);
    const unit = { mechanism, revision: 1, pose: poseOf(hingeQuarterTurn) };
    composer.update(unit);
    expect(composer.updateSource(() => false, unit)).toBe(false);
    expectMatrix(arm.matrix, hingeQuarterTurn);
    const failure = new Error('Source candidate rejected');
    expect(() =>
      composer.updateSource(() => {
        throw failure;
      }, unit),
    ).toThrow(failure);
    expectMatrix(arm.matrix, hingeQuarterTurn);
    composer.reset();
    expectMatrix(arm.matrix, new Matrix4());
  });
});
