import type { ToolpathProgram } from '@taucad/slicer/toolpath';

/** Immutable CPU geometry shared by panes; units are millimetres in the plate frame. */
export type BeadChunk = Readonly<{
  group: number;
  segments: Uint32Array<ArrayBuffer>;
  positions: Float32Array<ArrayBuffer>;
  dimensions: Float32Array<ArrayBuffer>;
  joins: Float32Array<ArrayBuffer>;
  metrics: Float32Array<ArrayBuffer>;
  roles: Uint8Array<ArrayBuffer>;
  min: [number, number, number];
  max: [number, number, number];
}>;
export type BeadData = Readonly<{ chunks: readonly BeadChunk[]; bytes: number }>;
const chunkCapacity = 16_384;
const continuityTolerance = 0.0001;

/** Bounded miter of two unit lateral normals; reversal is a capped path break. */
export const beadJoin = (
  before: readonly [number, number],
  after: readonly [number, number],
): readonly [number, number] => {
  const denominator = 1 + before[0] * after[0] + before[1] * after[1];
  if (denominator < 0.5) {
    return after;
  }
  return [(before[0] + after[0]) / denominator, (before[1] + after[1]) / denominator];
};

/** Build compact instances, never one object or a duplicated profile per move. */
export const createBeadData = (program: ToolpathProgram, groupOf: Uint8Array<ArrayBuffer>): BeadData => {
  const { deposition } = program;
  if (!deposition) {
    return { chunks: [], bytes: 0 };
  }
  const normal = (segment: number): readonly [number, number] => {
    const offset = segment * 6;
    const x = program.positions[offset + 3]! - program.positions[offset]!;
    const y = program.positions[offset + 4]! - program.positions[offset + 1]!;
    const length = Math.hypot(x, y);
    return length > 0 ? [-y / length, x / length] : [0, 1];
  };
  const connects = (before: number, after: number): boolean => {
    if (
      before < 0 ||
      after >= program.segmentCount ||
      !deposition.widths[before] ||
      !deposition.widths[after] ||
      deposition.starts[after]! > 0 ||
      program.tools[before] !== program.tools[after] ||
      groupOf[before] !== groupOf[after] ||
      program.layers[before] !== program.layers[after] ||
      Math.abs(deposition.widths[before] - deposition.widths[after]) > continuityTolerance ||
      Math.abs(deposition.heights[before]! - deposition.heights[after]!) > continuityTolerance
    ) {
      return false;
    }
    const a = before * 6 + 3;
    const b = after * 6;
    return (
      Math.hypot(
        program.positions[a]! - program.positions[b]!,
        program.positions[a + 1]! - program.positions[b + 1]!,
        program.positions[a + 2]! - program.positions[b + 2]!,
      ) < continuityTolerance
    );
  };
  const joins = new Float32Array(program.segmentCount * 4);
  const counts = new Uint32Array(8);
  let first = 0;
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    if (!deposition.widths[segment]) {
      continue;
    }
    const side = normal(segment);
    const before = connects(segment - 1, segment);
    if (!before) {
      first = segment;
    }
    const start = before ? beadJoin(normal(segment - 1), side) : side;
    const after = connects(segment, segment + 1);
    const end = after ? beadJoin(side, normal(segment + 1)) : side;
    joins.set([...start, ...end], segment * 4);
    // A closed loop joins its first ring to its last without joining across travel or tool changes.
    if (!after && first !== segment && connects(segment, first)) {
      const closed = beadJoin(side, normal(first));
      joins.set(closed, segment * 4 + 2);
      joins.set(closed, first * 4);
    }
    counts[groupOf[segment]!]! += 1;
  }
  const chunks: BeadChunk[] = [];
  const current: Array<{ chunk: BeadChunk; used: number } | undefined> = [];
  let bytes = 0;
  for (let segment = 0; segment < program.segmentCount; segment += 1) {
    const width = deposition.widths[segment]!;
    if (width <= 0) {
      continue;
    }
    const group = groupOf[segment]!;
    let active = current[group];
    if (!active || active.used === active.chunk.segments.length) {
      const count = Math.min(chunkCapacity, counts[group]!);
      counts[group]! -= count;
      const chunk: BeadChunk = {
        group,
        segments: new Uint32Array(count),
        positions: new Float32Array(count * 6),
        dimensions: new Float32Array(count * 4),
        joins: new Float32Array(count * 4),
        metrics: new Float32Array(count * 2),
        roles: new Uint8Array(count),
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      bytes += count * 69;
      chunks.push(chunk);
      active = { chunk, used: 0 };
      current[group] = active;
    }
    const { chunk } = active;
    const index = active.used++;
    const offset = segment * 6;
    const begin = deposition.starts[segment]!;
    chunk.segments[index] = segment;
    for (let axis = 0; axis < 3; axis += 1) {
      const start = program.positions[offset + axis]!;
      const end = program.positions[offset + 3 + axis]!;
      chunk.positions[index * 6 + axis] = start + (end - start) * begin;
      chunk.positions[index * 6 + 3 + axis] = end;
      // Bound the miter as well as the supported bead's lower face.
      chunk.min[axis] = Math.min(chunk.min[axis]!, start - width * 2, end - width * 2);
      chunk.max[axis] = Math.max(chunk.max[axis]!, start + width * 2, end + width * 2);
    }
    chunk.dimensions.set(
      [width, deposition.heights[segment]!, program.layers[segment]!, program.tools[segment]!],
      index * 4,
    );
    chunk.joins.set(joins.subarray(segment * 4, segment * 4 + 4), index * 4);
    const length =
      Math.hypot(
        program.positions[offset + 3]! - program.positions[offset]!,
        program.positions[offset + 4]! - program.positions[offset + 1]!,
        program.positions[offset + 5]! - program.positions[offset + 2]!,
      ) *
      (1 - begin);
    chunk.metrics.set(
      [
        program.feedrates[segment]!,
        length > 0 ? (deposition.volumes[segment]! / length) * program.feedrates[segment]! : 0,
      ],
      index * 2,
    );
    chunk.roles[index] = program.kinds[segment]!;
  }
  return { chunks, bytes };
};

/** Cross-section oracle: a supported stadium, top at Z, bottom Z-height. */
export const beadProfilePoint = (width: number, height: number, angle: number): readonly [number, number] => [
  (Math.sign(Math.cos(angle)) * Math.max(0, width - height)) / 2 + (Math.cos(angle) * Math.min(width, height)) / 2,
  (Math.sin(angle) * height) / 2 - height / 2,
];
