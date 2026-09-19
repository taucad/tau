/**
 * Cache-independent geometry oracle for the compute-reuse baselines (T7/G-B7/U41).
 *
 * The oracle reads only the rendered GLB. It never touches the compute store,
 * the session, the probe counters or any cache identity, so an arm that
 * returned a wrong cached shape cannot pass it by agreeing with itself.
 *
 * Per the qualification blueprint, topology plus volume alone is insufficient:
 * every occurrence contributes its label, its world placement and its
 * world-space bounds, and the volume is computed by the divergence theorem over
 * the world-space triangles rather than read from metadata.
 */
import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';

/** One rendered occurrence, described independently of how it was produced. */
export type Occurrence = {
  readonly name: string;
  /** World-space translation of the occurrence node. */
  readonly placement: readonly [number, number, number];
  readonly triangles: number;
  /** Signed volume of the closed world-space triangle soup (model units cubed). */
  readonly volume: number;
  /** World-space axis-aligned bounds as `[minX, minY, minZ, maxX, maxY, maxZ]`. */
  readonly bounds: readonly [number, number, number, number, number, number];
};

export type Geometry = {
  readonly occurrences: readonly Occurrence[];
  readonly totalTriangles: number;
  readonly totalVolume: number;
  readonly bounds: readonly [number, number, number, number, number, number];
};

const transform = (matrix: readonly number[], point: readonly [number, number, number]): [number, number, number] => {
  const [x, y, z] = point;
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  ];
};

/** Extend axis-aligned bounds in place to contain one world-space point. */
const grow = (bounds: number[], point: readonly [number, number, number]): void => {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds[axis] = Math.min(bounds[axis]!, point[axis]!);
    bounds[axis + 3] = Math.max(bounds[axis + 3]!, point[axis]!);
  }
};

/** Read every triangle of a document in world space, grouped by the node that owns it. */
const readOccurrences = (document: Document): Occurrence[] => {
  const occurrences: Occurrence[] = [];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) {
      continue;
    }
    const matrix = node.getWorldMatrix();
    let volume = 0;
    let triangles = 0;
    const bounds: [number, number, number, number, number, number] = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const primitive of mesh.listPrimitives()) {
      // Mode 4 is TRIANGLES; line/point primitives (replicad's edge overlay) carry no volume.
      if ((primitive.getMode() as number) !== 4) {
        continue;
      }
      const position = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      if (!position) {
        continue;
      }
      const points = position.getArray()!;
      const order = indices?.getArray();
      const count = order ? order.length : position.getCount();
      const at = (slot: number): [number, number, number] => {
        const vertex = order ? Number(order[slot]) : slot;
        return transform(matrix, [points[vertex * 3]!, points[vertex * 3 + 1]!, points[vertex * 3 + 2]!]);
      };
      for (let slot = 0; slot + 2 < count; slot += 3) {
        const a = at(slot);
        const b = at(slot + 1);
        const c = at(slot + 2);
        // Divergence theorem: the signed volume of the tetrahedron on the origin.
        volume +=
          (a[0] * (b[1] * c[2] - b[2] * c[1]) -
            a[1] * (b[0] * c[2] - b[2] * c[0]) +
            a[2] * (b[0] * c[1] - b[1] * c[0])) /
          6;
        triangles += 1;
        grow(bounds, a);
        grow(bounds, b);
        grow(bounds, c);
      }
    }
    if (triangles === 0) {
      continue;
    }
    const [x, y, z] = node.getWorldTranslation();
    occurrences.push({ name: node.getName(), placement: [x, y, z], triangles, volume: Math.abs(volume), bounds });
  }
  return occurrences.sort((left, right) => left.name.localeCompare(right.name));
};

const merge = (occurrences: readonly Occurrence[]): Geometry['bounds'] => {
  const bounds: [number, number, number, number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const occurrence of occurrences) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds[axis] = Math.min(bounds[axis]!, occurrence.bounds[axis]!);
      bounds[axis + 3] = Math.max(bounds[axis + 3]!, occurrence.bounds[axis + 3]!);
    }
  }
  return bounds;
};

/** Describe a rendered GLB in cache-independent terms. */
export const describeGlb = async (bytes: Uint8Array<ArrayBuffer>): Promise<Geometry> => {
  const document = await new NodeIO().readBinary(bytes);
  const occurrences = readOccurrences(document);
  return {
    occurrences,
    totalTriangles: occurrences.reduce((total, occurrence) => total + occurrence.triangles, 0),
    totalVolume: occurrences.reduce((total, occurrence) => total + occurrence.volume, 0),
    bounds: merge(occurrences),
  };
};

/**
 * A geometric expectation independent of the producing arm. Near-zero
 * quantities carry absolute tolerances in model units, per the blueprint.
 */
export type Expectation = {
  readonly names: readonly string[];
  readonly volume: number;
  /** Relative tolerance on volume (tessellation of a curved bore is not exact). */
  readonly volumeTolerance: number;
  readonly bounds: readonly [number, number, number, number, number, number];
  /** Absolute tolerance in model units for bounds and placements. */
  readonly boundsTolerance: number;
  /**
   * Per-occurrence world bounds, keyed by label. Required whenever a model has
   * more than one body: without it a swapped assembly keeps the same label set
   * and the same union bounds, and passes (U41).
   */
  readonly occurrenceBounds?: Readonly<Record<string, readonly [number, number, number, number, number, number]>>;
};

/** Every way the geometry violates the expectation; empty means it passes. */
export const violations = (geometry: Geometry, expected: Expectation): string[] => {
  const failures: string[] = [];
  const names = geometry.occurrences.map((occurrence) => occurrence.name);
  if (names.join('|') !== [...expected.names].sort((a, b) => a.localeCompare(b)).join('|')) {
    failures.push(`occurrence labels ${JSON.stringify(names)} != ${JSON.stringify(expected.names)}`);
  }
  const volumeError = Math.abs(geometry.totalVolume - expected.volume) / expected.volume;
  if (volumeError > expected.volumeTolerance) {
    failures.push(
      `volume ${geometry.totalVolume.toFixed(3)} != ${expected.volume.toFixed(3)} (${(volumeError * 100).toFixed(2)}%)`,
    );
  }
  for (let axis = 0; axis < 6; axis += 1) {
    const delta = Math.abs(geometry.bounds[axis]! - expected.bounds[axis]!);
    if (delta > expected.boundsTolerance) {
      failures.push(
        `bounds[${axis}] ${geometry.bounds[axis]!.toFixed(3)} != ${expected.bounds[axis]!.toFixed(3)} (delta ${delta.toFixed(3)})`,
      );
    }
  }
  if (expected.occurrenceBounds) {
    for (const occurrence of geometry.occurrences) {
      const wanted = expected.occurrenceBounds[occurrence.name];
      if (!wanted) {
        failures.push(`occurrence ${occurrence.name} has no expected placement`);
        continue;
      }
      for (let axis = 0; axis < 6; axis += 1) {
        const delta = Math.abs(occurrence.bounds[axis]! - wanted[axis]!);
        if (delta > expected.boundsTolerance) {
          failures.push(
            `${occurrence.name} bounds[${axis}] ${occurrence.bounds[axis]!.toFixed(3)} != ${wanted[axis]!.toFixed(3)}`,
          );
        }
      }
    }
  }
  return failures;
};

/** Reflect axis-aligned bounds about the X axis, keeping min/max ordering. */
const mirrorX = (bounds: Geometry['bounds']): Geometry['bounds'] => [
  -bounds[3],
  bounds[1],
  bounds[2],
  -bounds[0],
  bounds[4],
  bounds[5],
];

/**
 * Wrong-geometry attacks (U41). Each returns geometry with the SAME occurrence
 * count, triangle count and volume as the honest render, so a scalar-only
 * oracle passes them and a real one must not.
 */
export const attacks = {
  /** Whole part shifted; volume and triangle count unchanged. */
  translated: (geometry: Geometry, delta: readonly [number, number, number]): Geometry => ({
    ...geometry,
    occurrences: geometry.occurrences.map((occurrence) => ({
      ...occurrence,
      placement: [
        occurrence.placement[0] + delta[0],
        occurrence.placement[1] + delta[1],
        occurrence.placement[2] + delta[2],
      ] as const,
      bounds: occurrence.bounds.map((value, axis) => value + delta[axis % 3]!) as unknown as Occurrence['bounds'],
    })),
    bounds: geometry.bounds.map((value, axis) => value + delta[axis % 3]!) as unknown as Geometry['bounds'],
  }),
  /** Mirrored about X: identical scalars, geometrically a different part. */
  mirrored: (geometry: Geometry): Geometry => ({
    ...geometry,
    occurrences: geometry.occurrences.map((occurrence) => ({
      ...occurrence,
      placement: [-occurrence.placement[0], occurrence.placement[1], occurrence.placement[2]] as const,
      bounds: mirrorX(occurrence.bounds),
    })),
    bounds: mirrorX(geometry.bounds),
  }),
  /** Occurrence labels rotated between bodies: assemblies swapped, scalars identical. */
  swapped: (geometry: Geometry): Geometry => ({
    ...geometry,
    occurrences: geometry.occurrences.map((occurrence, index, all) => ({
      ...occurrence,
      name: all[(index + 1) % all.length]!.name,
    })),
  }),
} as const;
