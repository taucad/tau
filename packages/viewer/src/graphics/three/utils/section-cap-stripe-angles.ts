import * as THREE from 'three';
import { getBvhGeometryBounds } from '#graphics/three/utils/bvh-cache.js';

/**
 * The hatch angles a part's cap can take, in the order they are handed out: the drafting pair 45°/135° first, then
 * angles 30° from both, then the rest. 0° and 90° are left out, since plane coordinates follow the model axes and
 * those lines would run parallel to most edges of a prismatic part.
 */
export const sectionCapStripeAnglesDegrees: readonly number[] = [45, 135, 75, 165, 15, 105, 60, 150, 30, 120];

/** One part to hatch: the key every cap of the part shares, and the part's bounds in any one frame. */
export type SectionCapStripeAngleOwner = Readonly<{
  ownerKey: string;
  box: THREE.Box3;
}>;

/** Bounds grown by this share of their diagonal, so parts that touch count as neighbours. */
const neighbourMargin = 0.01;

const degreesToRadians = Math.PI / 180;

/**
 * A hatch angle per part, in radians, so that parts whose bounds meet are hatched at different angles wherever the
 * palette allows, as drafting hatches adjacent parts (ISO 128-50, ASME Y14.3).
 *
 * Greedy colouring of the bounds-adjacency graph, most neighbours first (Welsh–Powell), ties by key: each part takes the
 * palette angle its hatched neighbours use least, and of those the one fewest parts use, in palette order, so parts
 * that do not touch still spread over the palette. Deterministic for the same parts, and independent of the camera and
 * the cuts, so a cut can move without the hatch changing.
 * @param owners - The parts, each with its bounds.
 * @returns The angle of each part, by owner key.
 */
export const assignSectionCapStripeAngles = (owners: readonly SectionCapStripeAngleOwner[]): Map<string, number> => {
  const boxes = owners.map(({ box }) =>
    box.isEmpty() ? box.clone() : box.clone().expandByScalar(box.min.distanceTo(box.max) * neighbourMargin),
  );
  const neighbours = owners.map(() => [] as number[]);
  for (let first = 0; first < owners.length; first++) {
    for (let second = first + 1; second < owners.length; second++) {
      if (!boxes[first]!.isEmpty() && boxes[first]!.intersectsBox(boxes[second]!)) {
        neighbours[first]!.push(second);
        neighbours[second]!.push(first);
      }
    }
  }

  const order = owners
    .map((_, index) => index)
    .toSorted(
      (first, second) =>
        neighbours[second]!.length - neighbours[first]!.length ||
        (owners[first]!.ownerKey < owners[second]!.ownerKey ? -1 : 1),
    );

  const paletteIndexByOwner: Array<number | undefined> = owners.map(() => undefined);
  const totalUseCount = sectionCapStripeAnglesDegrees.map(() => 0);
  for (const index of order) {
    const neighbourUseCount = sectionCapStripeAnglesDegrees.map(() => 0);
    for (const neighbour of neighbours[index]!) {
      const taken = paletteIndexByOwner[neighbour];
      if (taken !== undefined) {
        neighbourUseCount[taken]!++;
      }
    }
    // Fewest neighbours first, so neighbours differ; then fewest parts overall, so parts apart differ too.
    let chosen = 0;
    for (let candidate = 1; candidate < neighbourUseCount.length; candidate++) {
      const byNeighbours = neighbourUseCount[candidate]! - neighbourUseCount[chosen]!;
      if (byNeighbours < 0 || (byNeighbours === 0 && totalUseCount[candidate]! < totalUseCount[chosen]!)) {
        chosen = candidate;
      }
    }
    paletteIndexByOwner[index] = chosen;
    totalUseCount[chosen]!++;
  }

  const angles = new Map<string, number>();
  for (const [index, { ownerKey }] of owners.entries()) {
    angles.set(ownerKey, sectionCapStripeAnglesDegrees[paletteIndexByOwner[index]!]! * degreesToRadians);
  }
  return angles;
};

const scratchBox = new THREE.Box3();

/**
 * A hatch angle per part of the given sources, from the bounds of each part's meshes where they are now drawn.
 * @param sources - The cap sources, each with its owner key and meshes.
 * @returns The angle of each part, by owner key.
 */
export const assignSectionCapStripeAnglesForSources = (
  sources: ReadonlyArray<Readonly<{ ownerKey: string; meshes: readonly THREE.Mesh[] }>>,
): Map<string, number> => {
  const boxByOwner = new Map<string, THREE.Box3>();
  for (const { ownerKey, meshes } of sources) {
    let box = boxByOwner.get(ownerKey);
    if (!box) {
      box = new THREE.Box3();
      boxByOwner.set(ownerKey, box);
    }
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      box.union(scratchBox.copy(getBvhGeometryBounds(mesh.geometry)).applyMatrix4(mesh.matrixWorld));
    }
  }
  return assignSectionCapStripeAngles([...boxByOwner].map(([ownerKey, box]) => ({ ownerKey, box })));
};
