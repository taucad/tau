/**
 * PicoVoxel brandmark.
 *
 * One cube, seen down the isometric axis, subdivided as an octree that only
 * ever refines the octant nearest the viewer. The three visible faces are
 * therefore tiled coarse at the silhouette and `pico` at the core, where the
 * three refinements meet at the near corner — the sparse-hierarchy grid a
 * voxel kernel actually stores, drawn as the mark itself.
 */
import { draw, type Drawing, type Point2D } from 'replicad';

export const defaultParams = {
  /**
   * Width of the channel cut between neighbouring voxels, in units of the
   * finest voxel. Only the channels are cut — every side lying on the cube's
   * own boundary stays flush, so the silhouette is an unbroken hexagon.
   */
  channel: 0.2,
};

/** Brand coordinate system, shared with the Tau logo. */
const brandBox = 512;
const cos30 = Math.sqrt(3) / 2;

/**
 * Peacock plumage, one entry per octree level, coarse first.
 *
 * PicoGK is "a nod to the peacocks that roam the streets of Dubai" — so the
 * mark wears them: deep neck blue out at the silhouette, iridescent teal
 * mid-scale, and the gold of the tail feather's eye at the pico core. The
 * table length is the octree depth.
 */
const levels = [
  { hue: 205, saturation: 0.85, lightness: 0 },
  { hue: 186, saturation: 0.95, lightness: 0.04 },
  { hue: 41, saturation: 0.92, lightness: 0.1 },
] as const;

/** The three camera-facing box sides, darkest to lightest. */
const faces = [
  { axis: 2, name: 'Top', lightness: 0.46 },
  { axis: 1, name: 'Left', lightness: 0.23 },
  { axis: 0, name: 'Right', lightness: 0.34 },
] as const;

/** The eight octants of a cube, as unit corner offsets. */
const octants = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
] as const satisfies ReadonlyArray<readonly [number, number, number]>;

type Vector3 = readonly [number, number, number];

type Voxel = {
  readonly origin: Vector3;
  readonly size: number;
  readonly level: number;
};

/** CSS Color 4 HSL. */
const hex = (hue: number, saturation: number, lightness: number): string => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (offset: number): string => {
    const k = (offset + hue / 30) % 12;
    const value =
      lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

/**
 * Splits a cube into eight, keeping seven children as leaves and recursing
 * only into the octant at the near corner — the octree of an adaptive grid
 * that spends its resolution where the eye lands.
 */
const subdivide = (
  { origin, size, level }: Voxel,
  depth: number,
): readonly Voxel[] => {
  const half = size / 2;

  return octants.flatMap(([ox, oy, oz]) => {
    const child: Voxel = {
      origin: [
        origin[0] + ox * half,
        origin[1] + oy * half,
        origin[2] + oz * half,
      ],
      size: half,
      level,
    };

    const isNearCorner = ox === 1 && oy === 1 && oz === 1;

    return isNearCorner && level < depth
      ? subdivide({ ...child, level: level + 1 }, depth)
      : [child];
  });
};

/**
 * Isometric projection into the brand box: `+x` right-down, `+y` left-down,
 * `+z` up, with the cube fitted to the full brand height.
 */
const projector = (grid: number) => {
  const unit = brandBox / (2 * grid);

  return ([x, y, z]: Vector3): Point2D => [
    brandBox / 2 + (x - y) * cos30 * unit,
    (z - (x + y) / 2 - grid) * unit,
  ];
};

/**
 * The four corners of a voxel's `axis`-facing side.
 *
 * Half a channel is taken off each side that meets another voxel, and nothing
 * at all off a side lying on the cube's boundary: neighbours of any two sizes
 * stay aligned on the shared grid line, and the silhouette stays flush.
 */
const facePolygon = (
  { origin, size }: Voxel,
  axis: number,
  { channel, grid }: { channel: number; grid: number },
): readonly Vector3[] => {
  const across = (axis + 1) % 3;
  const along = (axis + 2) % 3;
  const trim = (index: number): readonly [number, number] => [
    origin[index] === 0 ? 0 : channel / 2,
    origin[index] + size === grid ? size : size - channel / 2,
  ];
  const [acrossLow, acrossHigh] = trim(across);
  const [alongLow, alongHigh] = trim(along);

  return (
    [
      [acrossLow, alongLow],
      [acrossHigh, alongLow],
      [acrossHigh, alongHigh],
      [acrossLow, alongHigh],
    ] as const
  ).map(([u, v]) => {
    const offset = [0, 0, 0];
    offset[axis] = size;
    offset[across] = u;
    offset[along] = v;
    return [
      origin[0] + offset[0]!,
      origin[1] + offset[1]!,
      origin[2] + offset[2]!,
    ] as const;
  });
};

const polygon = (points: readonly Point2D[]): Drawing => {
  const pen = draw(points[0]);

  for (const point of points.slice(1)) {
    pen.lineTo(point);
  }

  return pen.close();
};

export type LogoTile = {
  readonly shape: Drawing;
  readonly color: string;
  readonly name: string;
};

/**
 * The mark, as one drawing per face and octree level: coarse tiles at the
 * silhouette, the bright pico core where the three refinements meet.
 */
export const createPicoVoxelLogo = (p = defaultParams): LogoTile[] => {
  const depth = levels.length;
  const grid = 2 ** depth;
  const project = projector(grid);
  const leaves = subdivide({ origin: [0, 0, 0], size: grid, level: 1 }, depth);
  const tiles: LogoTile[] = [];

  for (const { axis, name, lightness } of faces) {
    for (const [index, tone] of levels.entries()) {
      const level = index + 1;
      // Only sides on the box boundary are exposed; the rest are interior
      // walls the camera can never reach.
      const exposed = leaves.filter(
        (leaf) =>
          leaf.level === level && leaf.origin[axis] + leaf.size === grid,
      );

      let shape: Drawing | undefined;

      for (const leaf of exposed) {
        const tile = polygon(
          facePolygon(leaf, axis, { channel: p.channel, grid }).map((corner) =>
            project(corner),
          ),
        );
        shape = shape === undefined ? tile : shape.fuse(tile);
      }

      if (shape === undefined) {
        continue;
      }

      tiles.push({
        shape,
        color: hex(tone.hue, tone.saturation, lightness + tone.lightness),
        name: `${name} ${grid / 2 ** level}u`,
      });
    }
  }

  return tiles;
};

export default createPicoVoxelLogo;
