/**
 * Writes the JSCAD brandmark.
 *
 *   tsx generate-logo.ts            # write the assets
 *   tsx generate-logo.ts --check    # fail if they have drifted
 *
 * Nothing here is traced. The mark is planes and spheres only, so under a
 * parallel projection every boundary it has is a straight line or a conic,
 * and every one of them is solved from the model in `main.ts` rather than
 * measured off a raster.
 *
 * The output is the UI's `jscad` icon, so it also lands in the sprite's raw
 * icon directory; run `pnpm nx run ui:generate-svg-sprite` afterwards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultParams,
  facetRadius,
  windowRadius,
  type Params,
} from './main.js';

const p: Params = defaultParams;
const half = p.cube / 2;
const window = windowRadius(p);
const facet = facetRadius(p);

/* ---------------------------------------------------------------------- *
 * Camera, measured from the published mark.
 * ---------------------------------------------------------------------- */

/*
 * The published mark is not isometric — its silhouette is a hexagon, but not
 * a regular one. Its upper corners sit `217px` from the axis and its lower
 * corners only `185px`, and no parallel projection can do that: under one,
 * opposite edges of a cube stay the same length. The mark has perspective.
 *
 * So the camera is fitted rather than chosen. Taking the six silhouette
 * corners of `icon_512.png` and solving for the elevation and distance that
 * project a cube onto them — with focal length and centre eliminated by least
 * squares, since they enter linearly — lands here, to a residual of 2.6px on
 * a 512px mark. The azimuth is not fitted: the mark is mirror-symmetric to
 * within half a pixel, which puts the camera exactly on the cube's diagonal.
 */
const azimuth = Math.PI / 4;
const elevation = (25.218 * Math.PI) / 180;
/** Eye distance from the centre, in half-edges of the cube. */
const eyeDistance = 6.319;

type Vector3 = readonly [number, number, number];
type Point = readonly [number, number];

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

const distance = eyeDistance * half;
const eye: Vector3 = [
  distance * Math.cos(elevation) * Math.cos(azimuth),
  distance * Math.cos(elevation) * Math.sin(azimuth),
  distance * Math.sin(elevation),
];
const forward = unit([-eye[0], -eye[1], -eye[2]]);
const right = unit(cross(forward, [0, 0, 1]));
const up = cross(right, forward);

/**
 * World point to screen, with `y` down as SVG counts it.
 *
 * Screen units are arbitrary — the view box is fitted afterwards — so there
 * is no focal length here. Only distance over size shapes the projection.
 */
const project = (point: Vector3): Point => {
  const offset: Vector3 = [
    point[0] - eye[0],
    point[1] - eye[1],
    point[2] - eye[2],
  ];
  const depth = dot(offset, forward);

  return [
    (distance * dot(offset, right)) / depth,
    (-distance * dot(offset, up)) / depth,
  ];
};

const round = (value: number): string => String(Number(value.toFixed(3)));
const at = ([x, y]: Point): string => `${round(x)} ${round(y)}`;

/* ---------------------------------------------------------------------- *
 * Circles, as the ellipses perspective makes of them.
 * ---------------------------------------------------------------------- */
type Ellipse = {
  readonly centre: Point;
  readonly major: number;
  readonly minor: number;
  readonly angle: number;
};

/** Gaussian elimination on a small dense system. */
const solve = (matrix: number[][], rhs: number[]): number[] => {
  const n = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]!]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;

    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) {
        pivot = row;
      }
    }

    [a[column], a[pivot]] = [a[pivot]!, a[column]!];

    for (let row = 0; row < n; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = a[row]![column]! / a[column]![column]!;

      for (let k = column; k <= n; k += 1) {
        a[row]![k]! -= factor * a[column]![k]!;
      }
    }
  }

  return a.map((row, index) => row[n]! / row[index]!);
};

/**
 * A circle in 3D, as the ellipse it projects to.
 *
 * Under a parallel projection this was closed form — semi-major along
 * `normal × view`, foreshortened by `|normal · view|`. Perspective breaks
 * both halves of that: the near side of the circle is magnified more than the
 * far side, so the ellipse is not centred on the projected centre, and its
 * axes no longer align with anything nameable.
 *
 * A projected circle is still exactly a conic though, so the honest way is to
 * project points of it and recover the conic they satisfy. Fitting
 * `Ax² + Bxy + Cy² + Dx + Ey + F = 0` under `A + C = 1` — which excludes only
 * the degenerate all-zero solution — is a linear least squares in five
 * unknowns, and the ellipse's centre, axes and rotation drop out of it.
 */
const projectCircle = (
  normal: Vector3,
  offset: number,
  radius: number,
): Ellipse => {
  const axisU = unit(
    Math.abs(normal[2]) > 0.9
      ? cross(normal, [0, 1, 0])
      : cross(normal, [0, 0, 1]),
  );
  const axisV = cross(normal, axisU);
  const samples = 32;
  const points = Array.from({ length: samples }, (_, index) => {
    const t = (2 * Math.PI * index) / samples;
    return project([
      normal[0] * offset +
        radius * (axisU[0] * Math.cos(t) + axisV[0] * Math.sin(t)),
      normal[1] * offset +
        radius * (axisU[1] * Math.cos(t) + axisV[1] * Math.sin(t)),
      normal[2] * offset +
        radius * (axisU[2] * Math.cos(t) + axisV[2] * Math.sin(t)),
    ]);
  });

  // Normal equations for [A, B, D, E, F] with C = 1 - A, target -y².
  const basis = points.map(([x, y]) => [x * x - y * y, x * y, x, y, 1]);
  const target = points.map(([, y]) => -y * y);
  const matrix = Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, column) =>
      basis.reduce((sum, entry) => sum + entry[row]! * entry[column]!, 0),
    ),
  );
  const rhs = Array.from({ length: 5 }, (_, row) =>
    basis.reduce((sum, entry, index) => sum + entry[row]! * target[index]!, 0),
  );
  const [quadX, quadXY, linearX, linearY, constantTerm] = solve(
    matrix,
    rhs,
  ) as [number, number, number, number, number];
  const quadY = 1 - quadX;

  // Centre solves the conic's gradient; the rotation diagonalises its
  // quadratic part; the axes follow from the conic's value at the centre.
  const [cx, cy] = solve(
    [
      [2 * quadX, quadXY],
      [quadXY, 2 * quadY],
    ],
    [-linearX, -linearY],
  ) as [number, number];
  const constant =
    quadX * cx * cx +
    quadXY * cx * cy +
    quadY * cy * cy +
    linearX * cx +
    linearY * cy +
    constantTerm;
  const angle = 0.5 * Math.atan2(quadXY, quadX - quadY);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const alongU = quadX * cos * cos + quadXY * cos * sin + quadY * sin * sin;
  const alongV = quadX * sin * sin - quadXY * cos * sin + quadY * cos * cos;

  return {
    centre: [cx, cy],
    major: Math.sqrt(-constant / alongU),
    minor: Math.sqrt(-constant / alongV),
    angle: (angle * 180) / Math.PI,
  };
};

/* ---------------------------------------------------------------------- *
 * The six faces, and the circle the cavity opens in each.
 * ---------------------------------------------------------------------- */
const axes: Vector3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const faces: Vector3[] = axes.flatMap((axis) => [
  axis,
  [-axis[0], -axis[1], -axis[2]],
]);

/**
 * A face is towards the camera when its outward normal is — measured against
 * the eye, not a fixed view axis, because under perspective the direction to
 * the camera differs across the subject.
 */
const isVisible = (normal: Vector3): boolean =>
  dot(normal, [
    eye[0] - normal[0] * half,
    eye[1] - normal[1] * half,
    eye[2] - normal[2] * half,
  ]) > 0;

const ellipseElement = (
  { centre, major, minor, angle }: Ellipse,
  attributes = '',
): string =>
  `<ellipse cx="${round(centre[0])}" cy="${round(centre[1])}" rx="${round(major)}" ry="${round(minor)}" transform="rotate(${round(angle)} ${at(centre)})"${attributes}/>`;

/** The same ellipse as a closed sub-path, for use inside a filled path. */
const ellipseSubPath = ({ centre, major, minor, angle }: Ellipse): string => {
  const radians = (angle * Math.PI) / 180;
  const start: Point = [
    centre[0] - major * Math.cos(radians),
    centre[1] - major * Math.sin(radians),
  ];
  const end: Point = [
    centre[0] + major * Math.cos(radians),
    centre[1] + major * Math.sin(radians),
  ];
  const arc = `A${round(major)} ${round(minor)} ${round(angle)} 0 1`;

  return `M${at(start)}${arc} ${at(end)}${arc} ${at(start)}Z`;
};

/** The four corners of a cube face, in projection. */
const faceCorners = (normal: Vector3): Point[] => {
  const [across, along] = axes.filter(
    (axis) => Math.abs(dot(axis, normal)) < 0.5,
  );

  return [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([u, v]) =>
    project([
      normal[0] * half + across![0] * u! * half + along![0] * v! * half,
      normal[1] * half + across![1] * u! * half + along![1] * v! * half,
      normal[2] * half + across![2] * u! * half + along![2] * v! * half,
    ]),
  );
};

/* ---------------------------------------------------------------------- *
 * Shading.
 * ---------------------------------------------------------------------- */

/*
 * Every surface of the shell is flat, so a Lambert term at its normal is the
 * whole of its shading — there is no curvature for a microfacet model to
 * resolve, and the three cube faces differing by exactly their normals is what
 * reads as a cube.
 *
 * The light is not chosen by eye. The published mark is flat-shaded in three
 * tones per material, in the ratio `231 : 164 : 97` — top, right, then left —
 * on a mid tone that is the albedo itself. Fixing ambient at `0.3` and solving
 * `ambient + diffuse · (normal · light)` for those three targets gives exactly
 * one light direction and one diffuse weight, and reproduces all three tones
 * to the byte.
 */
const light = unit([0.5212, 0.217, 0.8254]);
const ambient = 0.3;
const diffuse = 1.3431;
/**
 * The cavity wall faces inward and takes no direct light, but the published
 * mark still gives it `76 / 164` of the albedo rather than the `0.3` a purely
 * direct model would. That is the light bouncing around a concave cavity,
 * which one term stands in for well enough at this size.
 */
const cavityBounce = 0.463;

const parse = (hex: string): Vector3 => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];

/** An albedo at a given brightness, as an sRGB hex triple. */
const tone = (albedo: Vector3, brightness: number): string => {
  const channels = albedo.map((channel) => {
    const value = Math.min(1, Math.max(0, channel * brightness));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  });

  return `#${channels.join('')}`;
};

const lit = (normal: Vector3): number =>
  ambient + diffuse * Math.max(dot(normal, light), 0);

const shellAlbedo = parse(p.shellColor);
const ballAlbedo = parse(p.ballColor);
const faceTone = (normal: Vector3): string => tone(shellAlbedo, lit(normal));

/* ---------------------------------------------------------------------- *
 * The mark.
 * ---------------------------------------------------------------------- */
const visibleFaces = faces.filter((normal) => isVisible(normal));
const hiddenFaces = faces.filter((normal) => !isVisible(normal));

const windowOf = (normal: Vector3): Ellipse =>
  projectCircle(normal, half, window);

/*
 * Each visible face is its quadrilateral with its own window punched out.
 * The window circle is smaller than the face's half-edge, so it always lies
 * wholly inside the face and `evenodd` resolves the hole with no clipping and
 * no boolean geometry.
 */
const faceElements = visibleFaces
  .map((normal) => {
    const corners = faceCorners(normal);
    const outline = `M${corners.map((corner) => at(corner)).join('L')}Z`;

    return `<path d="${outline}${ellipseSubPath(windowOf(normal))}" fill-rule="evenodd" fill="${faceTone(normal)}"/>`;
  })
  .join('');

/*
 * Behind each window is the cavity wall, except where the ray leaves through
 * a window on the far side. Under a parallel projection a ray is one screen
 * point, so it escapes exactly where that point lies inside a far window's
 * projected ellipse — which makes the see-through a mask, not a calculation.
 *
 * The wall is concave and faces inward, so it takes the ambient term alone.
 */
const cavityTone = tone(shellAlbedo, cavityBounce);
const cavityElements = visibleFaces
  .map((normal) => ellipseElement(windowOf(normal), ` fill="${cavityTone}"`))
  .join('');
const escapeElements = hiddenFaces
  .map((normal) => ellipseElement(windowOf(normal), ' fill="#000"'))
  .join('');

/*
 * The ball shows only through the windows, so it is clipped to their union.
 * Its silhouette is the full sphere: the cube it is intersected with is wider
 * than the sphere in this view, so the intersection never reaches the
 * outline, only flats off the poles.
 *
 * Under perspective a sphere's outline is not its central circle. The tangent
 * lines from the eye touch it around a smaller circle, pulled toward the
 * camera by `r²/d` and shrunk to `r·√(1 − r²/d²)` — which is then projected
 * like any other circle. Ignoring this draws the ball slightly too small.
 */
const eyeToBall = Math.hypot(...eye);
const ballSilhouette = projectCircle(
  unit(eye),
  (p.ball * p.ball) / eyeToBall,
  p.ball * Math.sqrt(1 - (p.ball * p.ball) / (eyeToBall * eyeToBall)),
);
const windowClip = visibleFaces
  .map((normal) => ellipseElement(windowOf(normal)))
  .join('');
const facetElements = visibleFaces
  .map((normal) =>
    ellipseElement(
      projectCircle(normal, p.facet / 2, facet),
      ` fill="${tone(ballAlbedo, lit(normal))}"`,
    ),
  )
  .join('');

/*
 * A sphere's shading runs from its lit point outwards, which is what a radial
 * gradient carries. The focus sits where the light meets the surface, so the
 * falloff follows the terminator rather than the outline.
 *
 * The range is clamped to the ends of the mark's own tone ladder — brightest
 * face down to cavity — so the ball reads as curved without introducing a
 * colour the published mark does not have. Unclamped, the highlight runs past
 * the albedo into pure yellow.
 */
const brightest = lit([0, 0, 1]);
const ballStops = Array.from({ length: 5 }, (_, index) => {
  const t = index / 4;
  // Cosine of the angle from the lit point, across the visible hemisphere.
  const falloff = Math.max(Math.cos((t * Math.PI) / 2.2), 0);

  return `<stop offset="${round(t * 100)}%" stop-color="${tone(ballAlbedo, cavityBounce + (brightest - cavityBounce) * falloff)}"/>`;
}).join('');
const ballHighlight = project([
  light[0] * p.ball,
  light[1] * p.ball,
  light[2] * p.ball,
]);

/* ---------------------------------------------------------------------- *
 * Frame.
 * ---------------------------------------------------------------------- */
const corners = faces.flatMap((normal) => faceCorners(normal));
const silhouette = {
  minX: Math.min(...corners.map(([x]) => x)),
  maxX: Math.max(...corners.map(([x]) => x)),
  minY: Math.min(...corners.map(([, y]) => y)),
  maxY: Math.max(...corners.map(([, y]) => y)),
};
const pad = (silhouette.maxX - silhouette.minX) * 0.04;
const viewBox = [
  round(silhouette.minX - pad),
  round(silhouette.minY - pad),
  round(silhouette.maxX - silhouette.minX + pad * 2),
  round(silhouette.maxY - silhouette.minY + pad * 2),
].join(' ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">
<defs>
<clipPath id="jsWindows">${windowClip}</clipPath>
<mask id="jsEscape"><rect x="${round(silhouette.minX - pad)}" y="${round(silhouette.minY - pad)}" width="${round(silhouette.maxX - silhouette.minX + pad * 2)}" height="${round(silhouette.maxY - silhouette.minY + pad * 2)}" fill="#fff"/>${escapeElements}</mask>
<radialGradient id="jsBall" gradientUnits="userSpaceOnUse" cx="${round(ballHighlight[0])}" cy="${round(ballHighlight[1])}" r="${round(p.ball * 1.9)}">${ballStops}</radialGradient>
</defs>
<g mask="url(#jsEscape)">${cavityElements}</g>
${faceElements}
<g clip-path="url(#jsWindows)">${ellipseElement(ballSilhouette, ' fill="url(#jsBall)"')}${facetElements}</g>
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const targets: ReadonlyArray<readonly [string, string]> = [
  [join(here, 'jscad.svg'), svg],
  // The UI sprite's raw icon: one source, so the mark cannot drift from the
  // part it is rendered from.
  [
    join(here, '../../../../../../apps/ui/app/components/icons/raw/jscad.svg'),
    svg,
  ],
];

if (process.argv.includes('--check')) {
  for (const [path, contents] of targets) {
    if (readFileSync(path, 'utf8') !== contents) {
      throw new Error(`Generated asset differs: ${path}`);
    }
  }
} else {
  for (const [path, contents] of targets) {
    writeFileSync(path, contents);
  }
}
