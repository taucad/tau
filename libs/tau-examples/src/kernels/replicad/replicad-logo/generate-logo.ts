/**
 * Writes the replicad brandmark.
 *
 *   tsx generate-logo.ts            # write the assets
 *   tsx generate-logo.ts --check    # fail if they have drifted
 *
 * Two vases, orthographic, shaded with a Cook-Torrance evaluation rather than
 * hand-picked stops. Nothing here is traced: the silhouette is the exact
 * envelope of the revolved meridian in `main.ts`, fitted as one smooth cubic
 * path, and every tone is a BRDF sample at the normal the surface has there.
 *
 * The output is the UI's `replicad` icon, so it also lands in the sprite's
 * raw icon directory; run `pnpm nx run ui:generate-svg-sprite` afterwards.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultParams, profilePoles, type Params } from './main.js';

const p: Params = defaultParams;

const filletRadius = p.wallThickness / 3;
const topRadius = p.baseWidth * p.topRadius;
const boreRadius = topRadius - p.wallThickness;

/* ---------------------------------------------------------------------- *
 * The outer surface, as circles of revolution.
 * ---------------------------------------------------------------------- */
type Circle = { readonly radius: number; readonly height: number };

/** Cubic Bezier value at `t`, per axis. */
const bezier = (
  poles: ReadonlyArray<readonly [number, number]>,
  t: number,
  axis: 0 | 1,
): number => {
  const u = 1 - t;
  const [a, b, c, d] = poles.map((pole) => pole[axis]) as [
    number,
    number,
    number,
    number,
  ];

  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/**
 * Every circle on the outer surface: up the wall, over the outer fillet, in
 * across the top land. Only what the silhouette can touch — the inner fillet
 * and the bore lie inside the outer rim's projection and never reach it.
 */
const surface = ((): Circle[] => {
  const circles: Circle[] = [];

  for (const segment of profilePoles(p)) {
    const poles = [
      segment.start,
      segment.startControl,
      segment.endControl,
      segment.end,
    ] as const;

    for (let step = 0; step <= 512; step += 1) {
      const t = step / 512;
      const height = bezier(poles, t, 1);

      if (height > p.height - filletRadius) {
        break;
      }

      circles.push({ radius: bezier(poles, t, 0), height });
    }
  }

  // The outer fillet: a quarter round from the wall onto the top land.
  for (let step = 0; step <= 24; step += 1) {
    const angle = (step / 24) * (Math.PI / 2);
    circles.push({
      radius: topRadius - filletRadius * (1 - Math.cos(angle)),
      height: p.height - filletRadius * (1 - Math.sin(angle)),
    });
  }

  return circles;
})();

/* ---------------------------------------------------------------------- *
 * Camera, matching the runtime's thumbnail framing.
 * ---------------------------------------------------------------------- */

/*
 * The runtime renders example thumbnails through the image transcoder, whose
 * defaults are a 45° perspective camera at `phi = 60` — a polar angle from
 * the up axis, so 30° of elevation — placed at
 * `radius · 2·tan(30°) / tan(22.5°)` from the subject centre, where `radius`
 * is the bounding sphere's. Those two numbers are the whole difference
 * between a vase that reads as an egg and one that reads as flat-bottomed:
 * at 30° the base circle opens up, and the perspective divide opens it
 * further, because the base sits well below the camera axis.
 *
 * `theta` is not needed. A surface of revolution has the same silhouette from
 * every azimuth — which is also what lets this be checked against a reference
 * render made at the transcoder's default `theta`.
 */
const elevation = (30 * Math.PI) / 180;
const fitRatio = (2 * Math.tan(Math.PI / 6)) / Math.tan(Math.PI / 8);

const widest = Math.max(...surface.map(({ radius }) => radius));
const centre = p.height / 2;
/** The subject's bounding sphere, as the renderer measures it. */
const boundingRadius = Math.hypot(widest, widest, centre);
const distance = boundingRadius * fitRatio;

const eye = [
  0,
  -distance * Math.cos(elevation),
  centre + distance * Math.sin(elevation),
] as const;
/*
 * Camera basis: `forward` into the scene, `right` across the screen (the
 * world `x` axis), `up` their cross product. The camera sits in the plane
 * `x = 0`, so the scene's mirror symmetry survives projection and every
 * circle lands as an ellipse with its axes on the screen axes.
 */
const forward = [0, Math.cos(elevation), -Math.sin(elevation)] as const;
const upAxis = [0, Math.sin(elevation), Math.cos(elevation)] as const;
/*
 * Screen units are arbitrary — the view box is fitted afterwards — so the
 * projection carries no field of view. Only distance over radius shapes it.
 */
const magnify = distance;

type Screen = readonly [number, number];

const project = (point: readonly [number, number, number]): Screen => {
  const offset = [
    point[0] - eye[0],
    point[1] - eye[1],
    point[2] - eye[2],
  ] as const;
  const depth =
    offset[0] * forward[0] + offset[1] * forward[1] + offset[2] * forward[2];
  const along =
    offset[0] * upAxis[0] + offset[1] * upAxis[1] + offset[2] * upAxis[2];

  return [(magnify * offset[0]) / depth, (-magnify * along) / depth];
};

/** A circle of revolution, as the ellipse it projects to. */
type Ellipse = {
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
};

/**
 * Under perspective a circle still projects to an ellipse, but no longer one
 * centred on the projected centre — the near half is magnified more than the
 * far half. Three points pin it down: front and back give the centre and the
 * semi-minor axis, and a third solves the semi-major from the ellipse
 * equation.
 */
const projectCircle = ({ radius, height }: Circle): Ellipse => {
  if (radius <= 0) {
    const [, y] = project([0, 0, height]);
    return { cy: y, rx: 0, ry: 0 };
  }

  const [, front] = project([0, -radius, height]);
  const [, back] = project([0, radius, height]);
  const [sideX, sideY] = project([radius, 0, height]);
  const cy = (front + back) / 2;
  const ry = (front - back) / 2;
  const offset = (sideY - cy) / ry;

  return {
    cy,
    rx: Math.abs(sideX) / Math.sqrt(Math.max(1 - offset * offset, 1e-9)),
    ry,
  };
};

const projected = surface.map((circle) => projectCircle(circle));

const round = (value: number): string => String(Number(value.toFixed(2)));

/* ---------------------------------------------------------------------- *
 * Silhouette: the envelope of the projected circles, as one smooth path.
 * ---------------------------------------------------------------------- */

/**
 * Half-width of the silhouette at screen row `y`.
 *
 * Every circle of the surface projects to an ellipse, so the outline is the
 * boundary of their union: at each row, the widest ellipse crossing it.
 * Taking the envelope rather than mirroring the meridian is what keeps the
 * base and the top fillet smooth — where the surface turns away from the
 * camera the outline hands over between neighbouring circles tangentially,
 * instead of cornering into a lip.
 */
const halfWidthAt = (y: number): number => {
  let reach = 0;

  for (const { cy, rx, ry } of projected) {
    const offset = y - cy;

    if (ry > 0 && Math.abs(offset) < ry) {
      reach = Math.max(reach, rx * Math.sqrt(1 - (offset / ry) ** 2));
    }
  }

  return reach;
};

const topY = Math.min(...projected.map(({ cy, ry }) => cy - ry));
const bottomY = Math.max(...projected.map(({ cy, ry }) => cy + ry));
const halfWidth = Math.max(...projected.map(({ rx }) => rx));

type Point = readonly [number, number];

/**
 * The right half of the outline, resampled at even arc length.
 *
 * The scan is dense so the envelope is exact; the resample is what the path
 * is built from. Even arc length rather than even height is what keeps the
 * base smooth: the outline runs nearly horizontal there, so stepping in
 * height would put almost no vertices across the widest, most sharply
 * turning part of the curve.
 */
const rightHalf = ((): Point[] => {
  const scanRows = 2000;
  const dense: Point[] = Array.from({ length: scanRows + 1 }, (_, index) => {
    const y = topY + ((bottomY - topY) * index) / scanRows;
    return [halfWidthAt(y), y];
  });

  const along = [0];

  for (let index = 1; index < dense.length; index += 1) {
    const [x0, y0] = dense[index - 1]!;
    const [x1, y1] = dense[index]!;
    along.push(along[index - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }

  const total = along.at(-1)!;
  const vertices = 40;

  return Array.from({ length: vertices + 1 }, (_, index) => {
    const target = (total * index) / vertices;
    const at = along.findIndex((distance) => distance >= target);
    return dense[at === -1 ? dense.length - 1 : at]!;
  });
})();

/**
 * The closed outline as cubic Beziers through the vertices, Catmull-Rom
 * tangents. Going down the right half then back up the mirrored left, each
 * tangent sees its neighbours on both sides — including across the top and
 * bottom apex, where the mirror supplies them — so the path is C1 everywhere.
 */
const outline = ((): string => {
  const down = rightHalf;
  const up = [...rightHalf].reverse().map(([x, y]): Point => [-x, y]);
  // Drop the duplicated apexes where the halves meet.
  const loop = [...down, ...up.slice(1, -1)];
  const count = loop.length;
  const at = (index: number): Point => loop[(index + count) % count]!;

  const segments = loop.map((_, index) => {
    const previous = at(index - 1);
    const start = at(index);
    const end = at(index + 1);
    const next = at(index + 2);
    const control1: Point = [
      start[0] + (end[0] - previous[0]) / 6,
      start[1] + (end[1] - previous[1]) / 6,
    ];
    const control2: Point = [
      end[0] - (next[0] - start[0]) / 6,
      end[1] - (next[1] - start[1]) / 6,
    ];

    return `C${round(control1[0])} ${round(control1[1])} ${round(control2[0])} ${round(control2[1])} ${round(end[0])} ${round(end[1])}`;
  });

  return `M${round(at(0)[0])} ${round(at(0)[1])}${segments.join('')}Z`;
})();

/* ---------------------------------------------------------------------- *
 * Shading: Cook-Torrance GGX, evaluated per surface normal.
 * ---------------------------------------------------------------------- */
type Vector3 = readonly [number, number, number];

const albedo: Vector3 = [0.8, 0.81, 0.82];
const roughness = 0.38;
const reflectance = 0.04;
const exposure = 0.62;

const unit = (v: Vector3): Vector3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};
const dot = (a: Vector3, b: Vector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/*
 * Lighting is in world axes: `+x` right, `+y` away from the camera, `+z` up.
 * The camera looks down from `elevation`, so the direction from a surface
 * back to it is `[0, -cos elevation, sin elevation]`.
 */
const light = unit([-0.42, -0.62, 0.66]);
const fill = unit([0.7, -0.1, 0.6]);
const view: Vector3 = [0, -Math.cos(elevation), Math.sin(elevation)];

/**
 * Radiance leaving a surface with normal `n`, as an sRGB hex triple.
 *
 * `bounce` scales the ambient term to stand in for interreflection. A direct,
 * single-bounce model leaves the bore black, because its walls face away from
 * every light; in a real render the neck is filled almost entirely by light
 * bouncing off the bright rim opposite.
 */
const shade = (n: Vector3, bounce = 1): string => {
  const normal = unit(n);
  const half = unit([
    light[0] + view[0],
    light[1] + view[1],
    light[2] + view[2],
  ]);
  const nl = Math.max(dot(normal, light), 0);
  const nv = Math.max(dot(normal, view), 1e-4);
  const nh = Math.max(dot(normal, half), 0);
  const vh = Math.max(dot(view, half), 0);

  const alpha = roughness ** 2;
  const alpha2 = alpha ** 2;
  const denominator = nh * nh * (alpha2 - 1) + 1;
  const distribution = alpha2 / (Math.PI * denominator * denominator);
  const k = (roughness + 1) ** 2 / 8;
  const geometry = (nl / (nl * (1 - k) + k)) * (nv / (nv * (1 - k) + k));
  const fresnel = reflectance + (1 - reflectance) * (1 - vh) ** 5;
  const specular =
    ((distribution * geometry * fresnel) / (4 * nv * nl + 1e-4)) * nl;

  // Hemisphere ambient, plus a soft fill from the right.
  const ambient =
    (0.2 +
      0.16 * (normal[2] * 0.5 + 0.5) +
      0.14 * Math.max(dot(normal, fill), 0)) *
    bounce;

  const channels = albedo.map((channel) => {
    const linear = (channel * (nl * 0.9 + ambient) + specular * 1.6) * exposure;
    const encoded = Math.min(1, Math.max(0, linear)) ** (1 / 2.2);
    return Math.round(255 * encoded)
      .toString(16)
      .padStart(2, '0');
  });

  return `#${channels.join('')}`;
};

/**
 * Normal of a surface of revolution at azimuth `u = sin(azimuth)`, running
 * from the left silhouette to the right, and meridian `slope` — `0` on a
 * vertical wall, `+90°` on a face pointing straight up. `facing` flips it
 * inward, for the bore and the inner fillet.
 */
const surfaceNormal = (u: number, slope = 0, facing: 1 | -1 = 1): Vector3 => {
  const sine = Math.max(-1, Math.min(1, u));
  const cosine = Math.sqrt(Math.max(0, 1 - sine * sine));
  const radial = Math.cos(slope) * facing;

  return [sine * radial, -cosine * radial, Math.sin(slope)];
};

/**
 * Azimuthal shading, across the belly's width.
 *
 * A revolve shades as a function of screen `x`, because `x / radius` is the
 * sine of the azimuth — which is exactly what one horizontal gradient
 * carries. Every azimuthal gradient here spans the same user-space width,
 * the belly's, so the neck and the rim inside it are shaded on one scale
 * and meet without a seam. That reads the neck as turning away a little
 * less than it does; a per-circle scale would be truer, but cannot be
 * carried by a single fill without leaving exactly the seam this avoids.
 */
const azimuthal = (
  id: string,
  { slope = 0, facing = 1 as 1 | -1, bounce = 1 } = {},
): string => {
  const stops = 17;
  const entries = Array.from({ length: stops }, (_, index) => {
    const t = index / (stops - 1);
    const colour = shade(surfaceNormal(t * 2 - 1, slope, facing), bounce);
    return `<stop offset="${round(t * 100)}%" stop-color="${colour}"/>`;
  }).join('');

  return `<linearGradient id="${id}" x1="${round(-halfWidth)}" y1="0" x2="${round(halfWidth)}" y2="0" gradientUnits="userSpaceOnUse">${entries}</linearGradient>`;
};

/**
 * Radial roll-over, across a fillet.
 *
 * A fillet only reads as round if the shading varies across it, and that
 * variation is radial: the normal rotates from one edge of the quarter round
 * to the other. That is the axis a `radialGradient` runs on. In bounding-box
 * units on the fillet's own ellipse it is elliptical to match.
 *
 * It is painted *over* the azimuthal gradient of the surface it rolls away
 * from, fading to transparent at that surface's edge, rather than carrying
 * the whole tone itself. A fillet has both variations at once — round the
 * rim and across it — and one gradient can only carry one. Overlaying gives
 * the fillet the wall's tone at every azimuth where they meet, so there is
 * no step at the sides, and the radial term only adds the roll-over.
 */
const rollover = (
  id: string,
  {
    from,
    to,
    facing,
    bounce = 1,
    fadeAt,
  }: {
    /** Slope at the fillet edge that meets the surface being overlaid. */
    readonly from: number;
    /** Slope at the other edge. */
    readonly to: number;
    readonly facing: 1 | -1;
    readonly bounce?: number;
    /** `'inner'` when the overlaid surface is inside the fillet ellipse. */
    readonly fadeAt: 'inner' | 'outer';
  },
): string => {
  const stops = 7;
  const entries = Array.from({ length: stops }, (_, index) => {
    const t = index / (stops - 1);
    // Sweep from the far edge (fully painted) to the meeting edge (faded).
    const slope = to + (from - to) * t;
    const colour = shade(surfaceNormal(0, slope, facing), bounce);
    const opacity = 1 - t;
    const offset = fadeAt === 'outer' ? t : 1 - t;
    return `<stop offset="${round(offset * 100)}%" stop-color="${colour}" stop-opacity="${round(opacity)}"/>`;
  });

  if (fadeAt === 'inner') {
    entries.reverse();
  }

  return `<radialGradient id="${id}">${entries.join('')}</radialGradient>`;
};

/* ---------------------------------------------------------------------- *
 * The rim, as the four surfaces the shelling and fillets make.
 * ---------------------------------------------------------------------- */
const ring = (radius: number, height: number, paint: string): string => {
  const { cy, rx, ry } = projectCircle({ radius, height });

  return `<ellipse cy="${round(cy)}" rx="${round(rx)}" ry="${round(ry)}" fill="${paint}"/>`;
};

const landTone = shade([0, 0, 1]);

const defs = [
  azimuthal('rcWall'),
  // Outer fillet: over the wall's azimuthal shading, rolling from the land
  // at its inner edge (opaque) out and down to the wall at its outer edge
  // (transparent, so the wall's own tone carries through at every azimuth).
  rollover('rcOuter', {
    from: 0,
    to: Math.PI / 2,
    facing: 1,
    fadeAt: 'outer',
  }),
  // Bore: the far wall, facing back towards the camera.
  azimuthal('rcBore', { facing: -1, bounce: 1.45 }),
  // Inner fillet: over the bore's shading, rolling from the vertical bore at
  // its inner edge (transparent) up and out to the land at its outer edge.
  rollover('rcInner', {
    from: 0,
    to: Math.PI / 2,
    facing: -1,
    bounce: 1.1,
    fadeAt: 'inner',
  }),
  // The visible hole. Each inner circle sits at its own height, so their
  // projections are not concentric: the bore's front arc lands lower than
  // the fillet's, where in reality it is hidden under the land. What can be
  // seen through the opening is the intersection of the inner circles.
  `<clipPath id="rcHole">${ring(boreRadius + filletRadius, p.height, 'none')}</clipPath>`,
  // The silhouette. The rim's ellipses are exact while the outline is a
  // smooth fit to the envelope, so at the sides an ellipse edge can sit a
  // hair outside the path; clipping the mark to its own outline keeps them
  // agreeing to the pixel.
  `<clipPath id="rcBody"><use href="#rcOutline"/></clipPath>`,
].join('');

const rim = [
  ring(topRadius, p.height - filletRadius, 'url(#rcWall)'),
  ring(topRadius, p.height - filletRadius, 'url(#rcOuter)'),
  ring(topRadius - filletRadius, p.height, landTone),
  ring(boreRadius + filletRadius, p.height, 'url(#rcBore)'),
  ring(boreRadius + filletRadius, p.height, 'url(#rcInner)'),
  // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
  // ponytail: `ring` has no attribute slot, so the intended
  // ` clip-path="url(#rcHole)"` argument was dropped at runtime and no shipped
  // render ever carried it. Give `ring` the slot when `replicad.svg`, the UI
  // raw icon, and the UI sprite can be re-rendered together.
  ring(boreRadius, p.height - filletRadius, 'url(#rcBore)'),
].join('');

/* ---------------------------------------------------------------------- *
 * Layout: two marks, spaced as `main.ts` places the solids.
 * ---------------------------------------------------------------------- */
const markWidth = halfWidth * 2;
const gap = halfWidth * (p.spacing - 2);
const padding = markWidth * 0.05;
const width = markWidth * 2 + gap + padding * 2;
const height = bottomY - topY + padding * 2;

const mark = (index: number): string => {
  const x = padding + halfWidth + index * (markWidth + gap);
  const y = padding - topY;

  return `<use href="#rcVase" x="${round(x)}" y="${round(y)}"/>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" fill="none">
<defs><path id="rcOutline" d="${outline}"/>${defs}<g id="rcVase" clip-path="url(#rcBody)"><use href="#rcOutline" fill="url(#rcWall)"/>${rim}</g></defs>
${mark(0)}
${mark(1)}
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const targets: ReadonlyArray<readonly [string, string]> = [
  [join(here, 'replicad.svg'), svg],
  // The UI sprite's raw icon: one source, so the mark cannot drift from the
  // part it is rendered from.
  [
    join(
      here,
      '../../../../../../apps/ui/app/components/icons/raw/replicad.svg',
    ),
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
