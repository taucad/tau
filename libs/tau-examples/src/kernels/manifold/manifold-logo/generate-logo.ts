/**
 * Writes the Manifold brandmark.
 *
 *   tsx generate-logo.ts            # write the assets
 *   tsx generate-logo.ts --check    # fail if they have drifted
 *
 * Nothing here is traced. The sponge is axis-aligned boxes, so every visible
 * surface is a rectangle in a grid plane, and both the face pattern and the
 * tunnel walls seen through it come out of the same recursion `main.ts`
 * builds the solid with. The camera and the lighting are fitted to the
 * published mark by least squares; the constants live in `fitted` below and
 * the README records how each was measured.
 *
 * The output is the UI's `manifold` icon, so it also lands in the sprite's
 * raw icon directory; run `pnpm nx run ui:generate-svg-sprite` afterwards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams, type Params } from './main.js';

const p: Params = defaultParams;

/* ---------------------------------------------------------------------- *
 * The face pattern: the Sierpinski carpet the fractal leaves behind.
 * ---------------------------------------------------------------------- */

/**
 * The holes of one face, in the unit square, with the recursion level that
 * cut each — `1` is the middle ninth, `2` the middle of each survivor, and so
 * on. Depth 3 leaves `1 + 8 + 64 = 73`, the pattern the published mark shows.
 */
export type Hole = {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly level: number;
};

export const carpetHoles = (depth: number): Hole[] => {
  const holes: Hole[] = [];
  const carve = ({ x, y, size, level }: Hole): void => {
    const third = size / 3;
    holes.push({ x: x + third, y: y + third, size: third, level });

    if (level === depth) {
      return;
    }

    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        if (row !== 1 || column !== 1) {
          carve({
            x: x + column * third,
            y: y + row * third,
            size: third,
            level: level + 1,
          });
        }
      }
    }
  };

  carve({ x: 0, y: 0, size: 1, level: 1 });

  return holes;
};

const holes = carpetHoles(p.depth);

/* ---------------------------------------------------------------------- *
 * Camera, measured from the published mark.
 * ---------------------------------------------------------------------- */

/*
 * Fitted, not chosen. The published icon's silhouette is a hexagon that is
 * neither symmetric nor regular, so it is neither an isometric nor any
 * parallel projection: opposite edges of a cube stay equal under one, and
 * these do not. Six silhouette corners were extracted from `mengerSponge512`
 * by fitting lines to its convex hull, then azimuth, elevation, roll and
 * distance were solved to project a cube onto them — focal length and centre
 * eliminated by least squares, since they enter linearly. The result matches
 * to 0.79px on a 512px mark.
 *
 * The roll matters as much as the angles. A cube's silhouette is invariant
 * under its 24 rotations, so the silhouette alone cannot say which face is
 * which; the orientation was picked by fitting colour, not shape.
 */
const azimuth = (308.037 * Math.PI) / 180;
const elevation = (51.561 * Math.PI) / 180;
const roll = (58.603 * Math.PI) / 180;
/** Eye distance from the centre, in half-edges of the cube. */
const eyeDistance = 4.774;

export type Vector3 = readonly [number, number, number];
export type Point = readonly [number, number];
type Axis = 0 | 1 | 2;

const unit = (v: Vector3): Vector3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};
const dot = (a: Vector3, b: Vector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const eye: Vector3 = [
  eyeDistance * Math.cos(elevation) * Math.cos(azimuth),
  eyeDistance * Math.cos(elevation) * Math.sin(azimuth),
  eyeDistance * Math.sin(elevation),
];
const forward = unit([-eye[0], -eye[1], -eye[2]]);
const level = unit(cross(forward, [0, 0, 1]));
const levelUp = cross(level, forward);
const right: Vector3 = [
  level[0] * Math.cos(roll) + levelUp[0] * Math.sin(roll),
  level[1] * Math.cos(roll) + levelUp[1] * Math.sin(roll),
  level[2] * Math.cos(roll) + levelUp[2] * Math.sin(roll),
];
const up: Vector3 = [
  -level[0] * Math.sin(roll) + levelUp[0] * Math.cos(roll),
  -level[1] * Math.sin(roll) + levelUp[1] * Math.cos(roll),
  -level[2] * Math.sin(roll) + levelUp[2] * Math.cos(roll),
];

/**
 * World point to screen, with `y` down as SVG counts it. Scaled so the mark
 * spans ~480 units: whole units are then finer than a third of a pixel at any
 * size a kernel icon is drawn, and coordinates can be written as integers.
 */
export const project = (point: Vector3): Point => {
  const offset: Vector3 = [
    point[0] - eye[0],
    point[1] - eye[1],
    point[2] - eye[2],
  ];
  const depth = dot(offset, forward);
  const scale = 100 * eyeDistance;

  return [
    (scale * dot(offset, right)) / depth,
    (-scale * dot(offset, up)) / depth,
  ];
};

const round = (value: number): string => String(Math.round(value));
const fixed = (value: number, digits = 3): string =>
  String(Number(value.toFixed(digits)));

/* ---------------------------------------------------------------------- *
 * Faces, holes and the walls seen through them.
 * ---------------------------------------------------------------------- */

/**
 * A face, named by the axis it faces along. `u` and `v` are the other two
 * axes in ascending order, each running `0` to `1` across the face.
 */
export type Face = {
  readonly axis: Axis;
  readonly sign: 1 | -1;
  readonly u: Axis;
  readonly v: Axis;
  readonly id: string;
};

const others = (axis: Axis): [Axis, Axis] =>
  ([0, 1, 2] as const).filter((k) => k !== axis) as [Axis, Axis];

const faceOf = (axis: Axis, sign: 1 | -1): Face => {
  const [u, v] = others(axis);
  return { axis, sign, u, v, id: `${axis}${sign > 0 ? '+' : '-'}` };
};

/** Point on a face at `(u, v)`, in cube-normalised world axes (`-1 … 1`). */
export const facePoint = (face: Face, u: number, v: number): Vector3 => {
  const point: [number, number, number] = [0, 0, 0];
  point[face.axis] = face.sign;
  point[face.u] = -1 + 2 * u;
  point[face.v] = -1 + 2 * v;

  return point;
};

/** A face is visible when its outward normal points back towards the eye. */
const visible = (face: Face): boolean =>
  face.sign * (eye[face.axis] - face.sign) > 0;

export const faces = ([0, 1, 2] as const)
  .flatMap((axis) => ([1, -1] as const).map((sign) => faceOf(axis, sign)))
  .filter((face) => visible(face));

export type Polygon = readonly Point[];

const signedArea = (polygon: Polygon): number => {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const [x0, y0] = polygon[index]!;
    const [x1, y1] = polygon[(index + 1) % polygon.length]!;
    area += x0 * y1 - x1 * y0;
  }

  return area / 2;
};

/** Where the segment `a`–`b` crosses the line, given the two signed sides. */
const intersect = (a: Point, b: Point, [sa, sb]: Point): Point => {
  const t = sa / (sa - sb);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
};

/**
 * Sutherland–Hodgman: `subject` clipped to the convex `clip`. Every polygon
 * here is the projection of a planar rectangle, so both are convex and the
 * result is too — which is what lets a wall be trimmed to the hole it is
 * seen through without a `clipPath`.
 */
export const clipConvex = (subject: Polygon, clip: Polygon): Polygon => {
  const inward = signedArea(clip) >= 0 ? 1 : -1;
  let output: Point[] = [...subject];

  for (let index = 0; index < clip.length && output.length > 0; index += 1) {
    const [ax, ay] = clip[index]!;
    const [bx, by] = clip[(index + 1) % clip.length]!;
    const side = ([x, y]: Point): number =>
      inward * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    const input = output;
    output = [];

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index + input.length - 1) % input.length]!;
      const currentSide = side(current);
      const previousSide = side(previous);

      if (currentSide >= 0) {
        if (previousSide < 0) {
          output.push(
            intersect(previous, current, [previousSide, currentSide]),
          );
        }
        output.push(current);
      } else if (previousSide >= 0) {
        output.push(intersect(previous, current, [previousSide, currentSide]));
      }
    }
  }

  return output;
};

const pathOf = (polygon: Polygon): string =>
  polygon.length < 3
    ? ''
    : `M${polygon.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;

/** A rectangle on a face, projected. */
type Rect = {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
};
const faceQuad = (face: Face, { u0, v0, u1, v1 }: Rect): Polygon => [
  project(facePoint(face, u0, v0)),
  project(facePoint(face, u1, v0)),
  project(facePoint(face, u1, v1)),
  project(facePoint(face, u0, v1)),
];

/** The projected carpet of a face: its outline, then every hole. */
export const carpetPath = (face: Face): string =>
  pathOf(faceQuad(face, { u0: 0, v0: 0, u1: 1, v1: 1 })) +
  holes
    .map(({ x, y, size }) =>
      pathOf(faceQuad(face, { u0: x, v0: y, u1: x + size, v1: y + size })),
    )
    .join('');

/**
 * A wall of the tunnel behind a hole.
 *
 * Every hole is the mouth of a tunnel through the whole cube. From this
 * camera no tunnel can be seen through — the eye is more than three widths
 * off every axis — so what shows in a hole is exactly two of its four walls:
 * the ones on the far side from the eye along each of the face's two axes.
 * They meet along the tunnel's far corner, whose projection splits the hole
 * between them, so each wall is drawn as its full projected rectangle
 * clipped to the hole and they neither overlap nor leave a gap.
 *
 * A wall lies in a grid plane, so it carries the carpet of the face parallel
 * to it, restricted to the wall's strip: those are the tunnels that cross
 * this one, seen as holes in its wall. Where a bigger tunnel crosses, the
 * strip is void for its whole width, which is also what the intersection
 * says.
 */
export type Wall = {
  readonly face: Face;
  readonly hole: Hole;
  /** The axis the wall faces along, and the sign of its outward normal. */
  readonly axis: Axis;
  readonly sign: 1 | -1;
  /** Projected and clipped to the hole: the outline, then any holes. */
  readonly outline: Polygon;
  readonly holes: Polygon[];
  /** Points at the wall's front edge and its visible depth, for shading. */
  readonly world: (depth: number, along: number) => Vector3;
};

/** A hole's edges in world units, along the face's `u` and `v`. */
const span = (
  hole: Hole,
): { u0: number; u1: number; v0: number; v1: number } => ({
  u0: -1 + 2 * hole.x,
  u1: -1 + 2 * (hole.x + hole.size),
  v0: -1 + 2 * hole.y,
  v1: -1 + 2 * (hole.y + hole.size),
});

export const wallsOf = (face: Face, hole: Hole): Wall[] => {
  const mouth = faceQuad(face, {
    u0: hole.x,
    v0: hole.y,
    u1: hole.x + hole.size,
    v1: hole.y + hole.size,
  });
  const edges = span(hole);

  return ([face.u, face.v] as const).map((axis) => {
    const across = axis === face.u ? face.v : face.u;
    const range = axis === face.u ? [edges.u0, edges.u1] : [edges.v0, edges.v1];
    const width = axis === face.u ? [edges.v0, edges.v1] : [edges.u0, edges.u1];
    // The far wall: at the hole's low edge when the eye sits high on this
    // axis, else its high edge. Its outward normal points back to the eye.
    const sign: 1 | -1 = eye[axis] > 0 ? 1 : -1;
    const at = sign > 0 ? range[0]! : range[1]!;

    const point = (a: number, c: number): Vector3 => {
      const q: [number, number, number] = [0, 0, 0];
      q[axis] = at;
      q[face.axis] = a;
      q[across] = c;
      return q;
    };
    const rect = ({
      a0,
      a1,
      c0,
      c1,
    }: Record<'a0' | 'a1' | 'c0' | 'c1', number>): Polygon =>
      clipConvex(
        [
          project(point(a0, c0)),
          project(point(a1, c0)),
          project(point(a1, c1)),
          project(point(a0, c1)),
        ],
        mouth,
      );

    // The wall's own carpet: the holes of the face along `axis`, in that
    // face's `(u, v)` order, intersected with the strip this wall occupies.
    const [wu] = others(axis);
    const wallHoles: Polygon[] = [];
    for (const h of holes) {
      const lo = [-1 + 2 * h.x, -1 + 2 * h.y];
      const hi = [-1 + 2 * (h.x + h.size), -1 + 2 * (h.y + h.size)];
      const aIndex = wu === face.axis ? 0 : 1;
      const cIndex = 1 - aIndex;
      const a0 = Math.max(lo[aIndex]!, -1);
      const a1 = Math.min(hi[aIndex]!, 1);
      const c0 = Math.max(lo[cIndex]!, width[0]!);
      const c1 = Math.min(hi[cIndex]!, width[1]!);
      if (a1 - a0 > 1e-9 && c1 - c0 > 1e-9) {
        const clipped = rect({ a0, a1, c0, c1 });
        if (clipped.length >= 3) {
          wallHoles.push(clipped);
        }
      }
    }

    return {
      face,
      hole,
      axis,
      sign,
      outline: rect({
        a0: face.sign,
        a1: -face.sign,
        c0: width[0]!,
        c1: width[1]!,
      }),
      holes: wallHoles,
      world: (depth, along) =>
        point(
          face.sign * (1 - depth),
          width[0]! + along * (width[1]! - width[0]!),
        ),
    };
  });
};

/* ---------------------------------------------------------------------- *
 * Shading, fitted to the published mark.
 * ---------------------------------------------------------------------- */

/*
 * The published mark is a metallic render: the sample's GLB carries vertex
 * colours and a roughness of 0.2 with glTF's default metalness of 1, so what
 * each face shows is the environment reflected in it, tinted by the colour
 * law. A reflection is not something a gradient can be derived from, so the
 * shading is fitted to the mark instead, per face, in the one family SVG can
 * paint exactly:
 *
 *   channel  = a + b·x + c·y                (one linear gradient each, screened
 *                                            together — exact addition, since
 *                                            the three never share a channel)
 *   colour   = channel + s·(1 − channel)    (a radial gradient screened on top,
 *                                            colour and opacity per stop)
 *
 * The highlight `s` is an elliptical radial profile — `centre`, `axes` (the
 * image of the unit circle under a 2×2 matrix, column-major, is its 1σ
 * ellipse) and a colour at each of `r = 0, 0.5 … 3` — fitted freely rather
 * than as a Gaussian, because the reflection's fall-off is not Gaussian: on
 * the largest face a Gaussian leaves an rms of 0.138 and the free profile
 * 0.093, against 0.074 for an unconstrained quartic. The channels are
 * constrained to stay non-negative over the face, since a negative channel
 * cannot be painted and the fit will otherwise use one to cancel the
 * highlight's tint.
 *
 * `walls` is per axis a wall faces along: `first` is the same affine family
 * for the walls of the largest tunnel, drawn as gradients; `second` is a
 * quadratic per channel for the walls of the next level down, which are
 * drawn flat at their centre — a quadratic reaches the same rms as a
 * measured mean per wall, an affine does not. `shadow` is what the smallest
 * holes read as and `wallShadow` the holes in the walls, both measured means.
 */
/**
 * `a + b·x + c·y`, with `x` and `y` in hundreds of projected units — which
 * keeps every coefficient to four decimals.
 */
export type Affine = readonly [number, number, number];
export type Channels = readonly [Affine, Affine, Affine];
/** `a + b·x + c·y + d·x² + e·xy + f·y²`, one per channel. */
export type Quadratic = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];
export type FaceShading = {
  readonly channels: Channels;
  readonly highlight: {
    /** The highlight's colour at `r = 0, 0.5 … 3` in units of its 1σ ellipse. */
    readonly profile: ReadonlyArray<readonly [number, number, number]>;
    readonly centre: Point;
    readonly axes: readonly [number, number, number, number];
  };
  readonly walls: Readonly<
    Record<
      string,
      {
        readonly first: Channels;
        readonly second: readonly [Quadratic, Quadratic, Quadratic];
      }
    >
  >;
  readonly shadow: readonly [number, number, number];
  readonly wallShadow: readonly [number, number, number];
};

export const fitted: Readonly<Record<string, FaceShading>> = {
  '0+': {
    channels: [
      [0.1868, 0.1485, 0.0513],
      [-0.1453, -0.0075, 0.3801],
      [0.0633, 0.0423, 0.0741],
    ],
    highlight: {
      profile: [
        [1, 0.212, 0.342],
        [0.054, 0.038, 0.014],
        [0, 0.013, 0],
        [0.051, 0.031, 0],
        [0.015, 0, 0.008],
        [0.074, 0.073, 0.061],
        [0, 0.014, 0.016],
      ],
      centre: [-6.1, 60.6],
      axes: [52.78, -7.92, 3.93, 26.2],
    },
    walls: {
      '1': {
        first: [
          [0.4163, 0.0203, -0.2326],
          [0.417, -0.1635, -0.2168],
          [0.7325, 0.029, -0.7042],
        ],
        second: [
          [1.5428, 0.1572, -3.2595, 0.1487, -0.0878, 1.8284],
          [1.0037, 0.241, -2.2782, 0.0848, -0.3284, 1.4198],
          [0.5187, 0.2238, -0.9739, 0.0501, -0.2438, 0.4981],
        ],
      },
      '2': {
        first: [
          [0.5118, 0.4856, 0.2407],
          [0.285, 0.2532, 0.4753],
          [2.2359, 0.3806, -1.8836],
        ],
        second: [
          [-0.8561, 0.1971, 3.1136, -0.4647, -0.0597, -1.5401],
          [-1.0565, -0.1498, 3.1911, -0.4029, 0.0232, -1.4326],
          [1.1372, 0.0798, -1.5381, -0.179, -0.0765, 0.6245],
        ],
      },
    },
    shadow: [0.166, 0.137, 0.128],
    wallShadow: [0.405, 0.418, 0.213],
  },
  '1-': {
    channels: [
      [-0.0331, -0.1702, -0.0406],
      [-0.199, -0.5405, -0.061],
      [0.0126, -0.2777, -0.1954],
    ],
    highlight: {
      profile: [
        [1, 0, 0],
        [0.516, 0.642, 0.65],
        [0.227, 0.352, 0.368],
        [0.014, 0.035, 0.048],
        [0, 0, 0],
        [0.048, 0.062, 0.059],
        [0, 0, 0],
      ],
      centre: [-134.1, -108.1],
      axes: [43.64, -0.1, 0.24, 104.63],
    },
    walls: {
      '0': {
        first: [
          [0.7143, 0.5024, 0.4821],
          [0.4078, -0.0644, 0.3245],
          [0.3628, 0.02, -0.0059],
        ],
        second: [
          [0.1225, 0.0879, 0.1145, 0.0162, 0.0492, 0.021],
          [-0.0181, -0.1946, 0.1225, 0.0944, 0.2502, 0.006],
          [0.1104, -0.0949, -0.1182, 0.0353, 0.1152, 0.0225],
        ],
      },
      '2': {
        first: [
          [2.5986, 2.0164, 0.0319],
          [1.49, 0.6241, 0.0186],
          [1.605, 0.8008, -0.1252],
        ],
        second: [
          [1.2184, 0.8568, 0.0406, 0.1958, 0.2346, -0.6081],
          [0.6017, -0.7378, -0.0042, -0.4294, 0.0891, -0.4159],
          [1.4273, 1.0184, 0.1007, 0.3462, 0.4304, -0.3149],
        ],
      },
    },
    shadow: [0.255, 0.507, 0.524],
    wallShadow: [0.403, 0.586, 0.563],
  },
  '2+': {
    channels: [
      [0.1578, 0.1177, 0.0915],
      [0.0782, -0.0675, 0.0341],
      [0.2728, -0.1016, -0.1586],
    ],
    highlight: {
      profile: [
        [0.998, 0.767, 0.965],
        [0.975, 0.648, 0.966],
        [0.856, 0.375, 0.8],
        [0.463, 0, 0.37],
        [0.062, 0, 0.012],
        [0, 0, 0],
        [0, 0, 0.043],
      ],
      centre: [7.6, -10.9],
      axes: [54.95, -18.48, 19.94, 59.28],
    },
    walls: {
      '0': {
        first: [
          [0.3155, 0.0947, 0.1389],
          [0.4357, -0.159, 0.4128],
          [0.2932, -0.0342, -0.1042],
        ],
        second: [
          [0.3196, 0.0291, 0.2187, -0.0164, -0.1938, 0.0665],
          [0.2141, -0.1996, 0.2046, 0.0607, -0.1076, 0.0583],
          [0.3378, -0.1034, 0.0445, 0.0054, -0.1457, 0.0976],
        ],
      },
      '1': {
        first: [
          [0.1729, 0.0231, 0.0614],
          [0.1961, -0.206, 0.0348],
          [0.1595, -0.0389, -0.073],
        ],
        second: [
          [0.1143, -0.3268, -0.0233, 0.5259, 0.1526, -0.0119],
          [0.0555, -0.1461, 0.0523, 0.1011, 0.0051, 0.0425],
          [0.1551, -0.2735, -0.1784, 0.3289, 0.0824, -0.0643],
        ],
      },
    },
    shadow: [0.265, 0.075, 0.281],
    wallShadow: [0.462, 0.318, 0.459],
  },
};

const encode = (value: number): string =>
  Math.round(255 * Math.min(1, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0');

const hex = (channels: readonly number[]): string =>
  `#${channels.map((channel) => encode(channel)).join('')}`;

/* ---------------------------------------------------------------------- *
 * The mark.
 * ---------------------------------------------------------------------- */

const bounds = (polygons: readonly Polygon[]) => {
  const xs = polygons.flat().map(([x]) => x);
  const ys = polygons.flat().map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

/**
 * One affine channel as a linear gradient over a region. The gradient runs
 * along the field's own gradient direction, so the field is exact: an affine
 * function is constant across that direction. Only this channel is painted;
 * the others are zero, so stacking three of them with `screen` — which is
 * exact addition for channels that do not overlap — sums to the colour.
 */
const channelGradient = ({
  id,
  channel,
  affine,
  region,
}: {
  readonly id: string;
  readonly channel: number;
  readonly affine: Affine;
  readonly region: ReturnType<typeof bounds>;
}): string => {
  const a = affine[0];
  let [, b, c] = affine;
  const rgb = (value: number): string => {
    const parts = [0, 0, 0];
    parts[channel] = value;
    return hex(parts);
  };
  // Coefficients are per hundred units.
  b /= 100;
  c /= 100;
  const magnitude = Math.hypot(b, c);
  if (magnitude < 1e-9) {
    return `<linearGradient id="${id}"><stop stop-color="${rgb(a)}"/></linearGradient>`;
  }
  // Run along (b, c) across the region, with extra stops wherever the field
  // crosses 0 or 1: a stop's colour is clamped, so without them the gradient
  // would interpolate from the clamped end and bend the slope.
  const corners: Point[] = [
    [region.minX, region.minY],
    [region.maxX, region.minY],
    [region.maxX, region.maxY],
    [region.minX, region.maxY],
  ];
  const along = corners.map(([x, y]) => (b * x + c * y) / magnitude);
  const t0 = Math.min(...along);
  const t1 = Math.max(...along);
  const ts = [t0, t1];
  for (const bound of [0, 1]) {
    const t = (bound - a) / magnitude;
    if (t > t0 && t < t1) {
      ts.push(t);
    }
  }
  ts.sort((p, q) => p - q);
  const direction: Point = [b / magnitude, c / magnitude];
  const start: Point = [direction[0] * t0, direction[1] * t0];
  const end: Point = [direction[0] * t1, direction[1] * t1];
  const stops = ts
    .map(
      (t) =>
        `<stop offset="${fixed((t - t0) / (t1 - t0), 3)}" stop-color="${rgb(a + magnitude * t)}"/>`,
    )
    .join('');

  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${round(start[0])}" y1="${round(start[1])}" x2="${round(end[0])}" y2="${round(end[1])}">${stops}</linearGradient>`;
};

/** The highlight as a radial gradient of white with Gaussian opacity, to 3σ. */
const highlightGradient = (
  id: string,
  { profile, centre, axes }: FaceShading['highlight'],
): string => {
  // A screened layer of colour `k` at opacity `α` adds `α·k·(1 − c)` to a
  // channel `c`, so a stop's fitted colour `s` is written as `k = s / max s`
  // at `α = max s`.
  const stops = profile.map((s, index) => {
    const peak = Math.max(...s);
    const tint = peak > 0 ? hex(s.map((channel) => channel / peak)) : '#000';
    return `<stop offset="${fixed(index / (profile.length - 1), 3)}" stop-color="${tint}" stop-opacity="${fixed(peak, 3)}"/>`;
  });
  const [a, b, c, d] = axes;
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="3" gradientTransform="matrix(${[a, b, c, d].map((v) => fixed(v, 2)).join(' ')} ${round(centre[0])} ${round(centre[1])})">${stops.join('')}</radialGradient>`;
};

const evaluate = (
  channels: ReadonlyArray<readonly number[]>,
  [x, y]: Point,
): number[] =>
  channels.map(([a = 0, b = 0, c = 0, d = 0, cross = 0, f = 0]) => {
    const u = x / 100;
    const v = y / 100;
    return a + b * u + c * v + d * u * u + cross * u * v + f * v * v;
  });

export const render = (): string => {
  const defs: string[] = [];
  const body: string[] = [];

  for (const face of faces) {
    const shading = fitted[face.id]!;
    const outline = faceQuad(face, { u0: 0, v0: 0, u1: 1, v1: 1 });
    const region = bounds([outline]);
    const id = `mf${face.id[0]}`;

    // Beneath everything on this face: what the smallest holes and the holes
    // in the walls read as.
    body.push(`<path d="${pathOf(outline)}" fill="${hex(shading.shadow)}"/>`);

    // The walls of the tunnels behind the two larger hole levels, deepest
    // level first so nothing depends on order. Third-level tunnels are a
    // pixel wide at icon sizes and are left to the shadow tone.
    const walls = holes
      .filter((hole) => hole.level < p.depth)
      .flatMap((hole) => wallsOf(face, hole))
      .filter((wall) => wall.outline.length >= 3);

    for (const wall of walls) {
      const d = pathOf(wall.outline) + wall.holes.map(pathOf).join('');
      const fields = shading.walls[String(wall.axis)]!;
      if (wall.hole.level === 1) {
        const wid = `${id}w${wall.axis}`;
        const wallRegion = bounds([wall.outline]);
        defs.push(`<path id="${wid}" d="${d}" fill-rule="evenodd"/>`);
        // What the wall's own holes read as, beneath it.
        if (wall.holes.length > 0) {
          body.push(
            `<path d="${pathOf(wall.outline)}" fill="${hex(shading.wallShadow)}"/>`,
          );
        }
        for (const [channel, affine] of fields.first.entries()) {
          defs.push(
            channelGradient({
              id: `${wid}c${channel}`,
              channel,
              affine,
              region: wallRegion,
            }),
          );
          body.push(
            `<use href="#${wid}" fill="url(#${wid}c${channel})"${channel ? ' style="mix-blend-mode:screen"' : ''}/>`,
          );
        }
      } else {
        // Flat: the fitted second-level field, at the wall's centre.
        const centre: [number, number] = [0, 0];
        for (const [x, y] of wall.outline) {
          centre[0] += x / wall.outline.length;
          centre[1] += y / wall.outline.length;
        }
        body.push(
          `<path d="${d}" fill-rule="evenodd" fill="${hex(evaluate(fields.second, centre))}"/>`,
        );
      }
    }

    // The face itself: three channel gradients and the highlight, screened
    // together, through the carpet.
    defs.push(
      `<clipPath id="${id}"><path d="${carpetPath(face)}" clip-rule="evenodd"/></clipPath>`,
    );
    for (const [channel, affine] of shading.channels.entries()) {
      defs.push(
        channelGradient({ id: `${id}c${channel}`, channel, affine, region }),
      );
    }
    defs.push(highlightGradient(`${id}h`, shading.highlight));
    const rect = `x="${round(region.minX)}" y="${round(region.minY)}" width="${round(region.maxX - region.minX)}" height="${round(region.maxY - region.minY)}"`;
    body.push(
      `<g clip-path="url(#${id})" style="isolation:isolate">` +
        [0, 1, 2]
          .map(
            (channel) =>
              `<rect ${rect} fill="url(#${id}c${channel})"${channel ? ' style="mix-blend-mode:screen"' : ''}/>`,
          )
          .join('') +
        `<rect ${rect} fill="url(#${id}h)" style="mix-blend-mode:screen"/></g>`,
    );
  }

  const frame = bounds(
    faces.map((face) => faceQuad(face, { u0: 0, v0: 0, u1: 1, v1: 1 })),
  );
  const pad = (frame.maxX - frame.minX) * 0.03;
  const viewBox = [
    frame.minX - pad,
    frame.minY - pad,
    frame.maxX - frame.minX + pad * 2,
    frame.maxY - frame.minY + pad * 2,
  ]
    .map((value) => round(value))
    .join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">
<defs>${defs.join('')}</defs>
${body.join('')}
</svg>
`;
};

/* ---------------------------------------------------------------------- *
 * Entry point.
 * ---------------------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url));
export const targets: readonly string[] = [
  join(here, 'manifold.svg'),
  // The UI sprite's raw icon: one source, so the mark cannot drift from the
  // part it is rendered from.
  join(here, '../../../../../../apps/ui/app/components/icons/raw/manifold.svg'),
];

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const svg = render();
  if (process.argv.includes('--check')) {
    for (const path of targets) {
      if (readFileSync(path, 'utf8') !== svg) {
        throw new Error(`Generated asset differs: ${path}`);
      }
    }
  } else {
    for (const path of targets) {
      writeFileSync(path, svg);
    }
  }
}
