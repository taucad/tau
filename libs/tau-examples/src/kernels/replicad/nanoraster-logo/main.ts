/**
 * nanoraster brandmark.
 *
 * A sphere — the canonical render-test subject — resolved the way a
 * rasteriser resolves it: one scanline at a time. Each row spans the
 * sphere's chord at its own height, so the curve of the silhouette is
 * described entirely by the changing length of straight lines.
 *
 * The shading is the library's own model rather than a stand-in: glTF
 * metallic-roughness, evaluated per bar with a GGX distribution, Smith
 * visibility, Schlick Fresnel, an analytic environment, a Reinhard tone map
 * and 2.2 gamma. A specular lobe is a two-dimensional feature and a flat
 * fill can only vary with height, so every bar carries a gradient sampled
 * across its own chord. Nothing is drawn by hand: bar lengths come from the
 * circle equation, bar colours from the BRDF.
 */
import { draw, type Drawing, type Point2D } from 'replicad';

export const defaultParams = {
  /** Scanlines across the sphere. The mark's whole rhythm is this number. */
  rows: 13,
  /** Blank left between neighbouring scanlines, in brand units. */
  gap: 7,
};

/** Brand coordinate system, shared with the Tau logo. */
const brandBox = 512;

/**
 * The mark is the sphere alone, on no ground of its own, so it takes the
 * colour of whatever it is placed on. The radius leaves a safe area of
 * roughly 6% rather than the wider margin a tile would have wanted.
 */
const sphere = { centre: brandBox / 2, radius: 240 };

/** Samples taken across each chord to build that bar's gradient. */
const stopCount = 11;

type Vector3 = readonly [number, number, number];

const normalise = ([x, y, z]: Vector3): Vector3 => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};
const dot = (a: Vector3, b: Vector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vector3, b: Vector3): Vector3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const scaled = (a: Vector3, k: number): Vector3 => [
  a[0] * k,
  a[1] * k,
  a[2] * k,
];
const product = (a: Vector3, b: Vector3): Vector3 => [
  a[0] * b[0],
  a[1] * b[1],
  a[2] * b[2],
];
const mix = (a: Vector3, b: Vector3, k: number): Vector3 =>
  add(scaled(a, 1 - k), scaled(b, k));

/**
 * Polished dielectric: no metal, and smooth enough for a tight highlight.
 * Base colour is linear, not sRGB — the tone map and gamma come later.
 */
const material = {
  base: [0.04, 0.66, 0.92] as Vector3,
  metallic: 0,
  roughness: 0.15,
};

/** Screen space is y-down, so a key light from above has a negative y. */
const light = normalise([-0.45, -0.6, 0.66]);
const view: Vector3 = [0, 0, 1];
const lightColour: Vector3 = [6.6, 6.4, 6.1];

/**
 * Stand-in environment: bright sky above fading to a dimmer floor below.
 * The metallic-roughness model assumes image-based lighting, so even a
 * dielectric wants ambient reflection to sit properly against its ground.
 *
 * The floor carries real bounce rather than going black. The mark ships with
 * no ground of its own, so a near-black bottom row would disappear against a
 * dark page and cost the sphere its silhouette.
 */
const sky: Vector3 = [0.22, 0.4, 0.55];
const floor: Vector3 = [0.06, 0.17, 0.23];

const environment = (direction: Vector3): Vector3 =>
  mix(floor, sky, Math.min(1, Math.max(0, 0.5 - direction[1] * 0.5)));

/** Cook-Torrance, returning linear radiance. */
const shade = (normal: Vector3): Vector3 => {
  const { base, metallic, roughness } = material;
  const nDotL = Math.max(0, dot(normal, light));
  const nDotV = Math.max(1e-4, dot(normal, view));
  const half = normalise(add(light, view));
  const nDotH = Math.max(0, dot(normal, half));
  const vDotH = Math.max(0, dot(view, half));

  // GGX / Trowbridge-Reitz normal distribution.
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  const denominator = nDotH * nDotH * (alphaSquared - 1) + 1;
  const distribution = alphaSquared / (Math.PI * denominator * denominator);

  // Smith visibility, Schlick-GGX form.
  const k = alpha / 2;
  const visibility =
    (nDotV / (nDotV * (1 - k) + k)) * (nDotL / (nDotL * (1 - k) + k));

  // Schlick Fresnel. A dielectric reflects 4% head-on and rises to 100% at
  // grazing angles, which is what brightens both ends of every bar.
  const f0 = mix([0.04, 0.04, 0.04], base, metallic);
  const fresnel = add(
    f0,
    scaled(add([1, 1, 1], scaled(f0, -1)), (1 - vDotH) ** 5),
  );

  const specular = scaled(
    fresnel,
    (distribution * visibility) / (4 * nDotV * nDotL + 1e-4),
  );
  const diffuse = scaled(
    product(add([1, 1, 1], scaled(fresnel, -1)), base),
    (1 - metallic) / Math.PI,
  );
  const direct = product(scaled(add(diffuse, specular), nDotL), lightColour);

  const reflection = add(
    scaled(normal, 2 * dot(normal, view)),
    scaled(view, -1),
  );
  const ambientDiffuse = scaled(
    product(environment(normal), base),
    (1 - metallic) * 0.55,
  );
  const ambientSpecular = product(
    mix(environment(reflection), mix(floor, sky, 0.5), roughness),
    scaled(f0, 0.9 + (1 - roughness) * 0.6),
  );

  return add(direct, add(ambientDiffuse, ambientSpecular));
};

/** Reinhard tone map then 2.2 gamma, matching the renderer's own output. */
const encode = (linear: Vector3): string =>
  `#${linear
    .map((channel) => {
      const mapped = channel / (1 + channel);
      return Math.round(255 * Math.min(1, mapped ** (1 / 2.2)))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;

/** The sphere's surface normal at a point given in normalised offsets. */
const normalAt = (dx: number, dy: number): Vector3 =>
  normalise([dx, dy, Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))]);

/** Design space is y-down like SVG; Replicad is y-up, so y is negated. */
const at = (x: number, y: number): Point2D => [x, -y];

const bar = (x: number, y: number, width: number, height: number): Drawing =>
  draw(at(x, y))
    .lineTo(at(x + width, y))
    .lineTo(at(x + width, y + height))
    .lineTo(at(x, y + height))
    .close();

export type LogoTile = {
  readonly shape: Drawing;
  /** Flat fill: the BRDF at the bar's midpoint, for solid-fill consumers. */
  readonly color: string;
  /** Left-to-right gradient across the bar. */
  readonly stops: readonly string[];
  /** Horizontal extent of the gradient, in brand units. */
  readonly span: readonly [number, number];
  readonly name: string;
};

/**
 * The mark: one scanline per row, ordered top to bottom the way a rasteriser
 * would emit them. Nothing else — the mark carries no ground.
 */
export const createNanorasterLogo = (p = defaultParams): LogoTile[] => {
  const pitch = (sphere.radius * 2) / p.rows;
  const height = pitch - p.gap;
  const tiles: LogoTile[] = [];

  for (let row = 0; row < p.rows; row += 1) {
    const y = sphere.centre - sphere.radius + (row + 0.5) * pitch;
    const dy = (y - sphere.centre) / sphere.radius;
    // Half the chord the sphere subtends at this height.
    const halfChord = Math.sqrt(Math.max(0, 1 - dy * dy)) * sphere.radius;
    if (halfChord < p.gap) {
      continue;
    }

    const reach = halfChord / sphere.radius;
    const stops: string[] = [];
    for (let step = 0; step < stopCount; step += 1) {
      const t = step / (stopCount - 1);
      stops.push(encode(shade(normalAt((-1 + 2 * t) * reach, dy))));
    }

    tiles.push({
      shape: bar(
        sphere.centre - halfChord,
        y - height / 2,
        halfChord * 2,
        height,
      ),
      color: encode(shade(normalAt(0, dy))),
      stops,
      span: [sphere.centre - halfChord, sphere.centre + halfChord],
      name: `Scanline ${row + 1}`,
    });
  }

  return tiles;
};

export default createNanorasterLogo;
