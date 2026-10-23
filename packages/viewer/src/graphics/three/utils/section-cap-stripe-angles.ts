import * as THREE from 'three';
import { getBvhGeometryBounds } from '#graphics/three/utils/bvh-cache.js';

/**
 * The hatch angles a part's cap can take, in the order they are handed out: the drafting pair 45°/135° first, then
 * angles 30° from both, then the rest. 0° and 90° are left out, since plane coordinates follow the model axes and
 * those lines would run parallel to most edges of a prismatic part.
 */
export const sectionCapStripeAnglesDegrees: readonly number[] = [45, 135, 75, 165, 15, 105, 60, 150, 30, 120];

/**
 * The spacing a part takes, as a share of the cap spacing, when every angle is taken by a neighbour: drafting's other
 * way of telling adjacent parts apart (ISO 128-50). Denser rather than sparser, so the part still reads as cut.
 */
export const sectionCapAlternateSpacingScale = 0.6;

/** How one part is hatched: its angle in plane coordinates, in radians, and its spacing as a share of the cap's. */
export type SectionCapHatch = Readonly<{ angle: number; spacingScale: number }>;

/** One part to hatch: the key every cap of the part shares, and the part's bounds in any one frame. */
export type SectionCapStripeAngleOwner = Readonly<{
  ownerKey: string;
  box: THREE.Box3;
}>;

/** Bounds grown by this share of their diagonal, so parts that touch count as neighbours. */
const neighbourMargin = 0.01;

const degreesToRadians = Math.PI / 180;

/** Every angle at the cap spacing, then every angle again at the alternate spacing. */
const hatches: readonly SectionCapHatch[] = [1, sectionCapAlternateSpacingScale].flatMap((spacingScale) =>
  sectionCapStripeAnglesDegrees.map((degrees) => ({ angle: degrees * degreesToRadians, spacingScale })),
);
const angleCount = sectionCapStripeAnglesDegrees.length;

/**
 * A hatch per part, so that parts whose bounds meet are hatched differently wherever the palette allows, as drafting
 * hatches adjacent parts (ISO 128-50, ASME Y14.3): by angle first, and by spacing once every angle is taken.
 *
 * Greedy colouring of the bounds-adjacency graph, most neighbours first (Welsh–Powell), ties by key: each part takes the
 * hatch its hatched neighbours use least; among those, one at the cap spacing before one at the alternate spacing,
 * then the one fewest parts use, in palette order, so parts that do not touch still spread over the angles. The
 * alternate spacing is used only where every angle at the cap spacing is already a neighbour's. Deterministic for the
 * same parts, and independent of the camera, the cuts and emphasis, so a cut can move, and a part be highlighted,
 * without its hatch changing.
 * @param owners - The parts, each with its bounds.
 * @returns The hatch of each part, by owner key.
 */
export const assignSectionCapStripeAngles = (
  owners: readonly SectionCapStripeAngleOwner[],
): Map<string, SectionCapHatch> => {
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

  const hatchIndexByOwner: Array<number | undefined> = owners.map(() => undefined);
  const totalUseCount = hatches.map(() => 0);
  /** Neighbours' use, then cap spacing before alternate, then overall use; palette order breaks the rest. */
  const rank = (candidate: number, neighbourUseCount: readonly number[]): readonly number[] => [
    neighbourUseCount[candidate]!,
    candidate < angleCount ? 0 : 1,
    totalUseCount[candidate]!,
  ];
  for (const index of order) {
    const neighbourUseCount = hatches.map(() => 0);
    for (const neighbour of neighbours[index]!) {
      const taken = hatchIndexByOwner[neighbour];
      if (taken !== undefined) {
        neighbourUseCount[taken]!++;
      }
    }
    let chosen = 0;
    for (let candidate = 1; candidate < hatches.length; candidate++) {
      const candidateRank = rank(candidate, neighbourUseCount);
      const chosenRank = rank(chosen, neighbourUseCount);
      const difference = candidateRank.map((value, key) => value - chosenRank[key]!).find((value) => value !== 0);
      if (difference !== undefined && difference < 0) {
        chosen = candidate;
      }
    }
    hatchIndexByOwner[index] = chosen;
    totalUseCount[chosen]!++;
  }

  const assigned = new Map<string, SectionCapHatch>();
  for (const [index, { ownerKey }] of owners.entries()) {
    assigned.set(ownerKey, hatches[hatchIndexByOwner[index]!]!);
  }
  return assigned;
};

const scratchBox = new THREE.Box3();

/**
 * A hatch per part of the given sources, from the bounds of each part's meshes where they are now drawn.
 * @param sources - The cap sources, each with its owner key and meshes.
 * @returns The hatch of each part, by owner key.
 */
export const assignSectionCapStripeAnglesForSources = (
  sources: ReadonlyArray<Readonly<{ ownerKey: string; meshes: readonly THREE.Mesh[] }>>,
): Map<string, SectionCapHatch> => {
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
