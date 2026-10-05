/**
 * The hero camera, shared by the renderer and by the drafting drawn on the floor beneath the model,
 * so the dial and the dimension register with the rendered gearbox at every size. World units are
 * millimetres with y up; the floor is the ring's base plane. The lens shift lifts the image by a
 * fraction of the view height, leaving room for the dimension below without tilting the camera.
 */
export const heroCamera = /** @type {const} */ ({
  fov: 30,
  distance: 440,
  elevation: 0.78,
  azimuth: -0.45,
  floorY: -1,
  shift: 0.1,
});

/**
 * Floor dial beneath the hero model, in millimetres: the input arc runs on the dial line and the
 * ticks point outward from it; the rim is the ring's 174 mm outer edge and its height above the floor.
 */
export const heroDial = /** @type {const} */ ({ radius: 118, tick: 3, longTick: 6, rim: 87, rimHeight: 16 });

const { fov, distance, elevation, azimuth, floorY, shift } = heroCamera;
/** @type {[number, number, number]} */
const eye = [
  distance * Math.sin(azimuth) * Math.cos(elevation),
  floorY + distance * Math.sin(elevation),
  distance * Math.cos(azimuth) * Math.cos(elevation),
];
// Camera basis as three.js lookAt builds it for the floor centre: back, right and up.
const back = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
const right = [Math.cos(azimuth), 0, -Math.sin(azimuth)];
const up = [
  back[1] * right[2] - back[2] * right[1],
  back[2] * right[0] - back[0] * right[2],
  back[0] * right[1] - back[1] * right[0],
];
const focal = 1 / Math.tan((fov * Math.PI) / 360);

/**
 * Project a world point into the square hero view, 0–1000 on both axes with y down, matching an SVG
 * viewBox of 0 0 1000 1000 laid over the square canvas.
 * @type {(point: readonly [number, number, number]) => [number, number]}
 */
const project = ([x, y, z]) => {
  const dx = x - eye[0];
  const dy = y - eye[1];
  const dz = z - eye[2];
  const depth = -(dx * back[0] + dy * back[1] + dz * back[2]);
  return [
    500 + (500 * focal * (dx * right[0] + dy * right[1] + dz * right[2])) / depth,
    500 - 1000 * shift - (500 * focal * (dx * up[0] + dy * up[1] + dz * up[2])) / depth,
  ];
};

/**
 * A point at a height above the floor in dial terms: angle 0 is the far side and angles grow
 * anticlockwise seen from above, the way the sun gear turns for a positive input.
 * @type {(radius: number, degrees: number, height?: number) => [number, number, number]}
 */
const dialPoint = (radius, degrees, height = 0) => {
  const a = (degrees * Math.PI) / 180;
  const toward = -radius * Math.cos(a);
  const side = -radius * Math.sin(a);
  return [toward * Math.sin(azimuth) + side * right[0], floorY + height, toward * Math.cos(azimuth) + side * right[2]];
};

/** @type {(points: Array<[number, number]>) => string} */
const polyline = (points) =>
  points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/**
 * An arc of a floor circle, projected into the hero view as an SVG path.
 * @internal
 * @param radius - Circle radius in millimetres.
 * @param from - Start angle in dial degrees.
 * @param to - End angle in dial degrees.
 * @returns Path data, empty when the arc has no length.
 * @type {(radius: number, from: number, to: number) => string}
 */
export const floorArc = (radius, from, to) => {
  if (to <= from) {
    return '';
  }
  const steps = Math.max(1, Math.ceil((to - from) / 3));
  return polyline(
    Array.from({ length: steps + 1 }, (_, index) => project(dialPoint(radius, from + ((to - from) * index) / steps))),
  );
};

/** @type {(from: [number, number], to: [number, number]) => string} */
const segment = ([x1, y1], [x2, y2]) => `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;

/**
 * The construction drawing beneath the hero model as SVG path data in hero view coordinates: the
 * floor's centre lines, the dial with one tick per ring tooth, and the rim dimension. The dimension
 * spans the rim's projected silhouette and hangs below the dial, so it measures what the eye sees.
 * @internal
 * @returns Path data, plus where the 0° label and the dimension line sit.
 * @type {() => {axes: string, ring: string, ticks: string, longTicks: string, extensions: string, dimension: string, zero: [number, number], line: number}}
 */
export const heroDrafting = () => {
  const { radius, tick, longTick, rim, rimHeight } = heroDial;
  const [centreX, centreY] = project(dialPoint(0, 0));
  const degrees = Array.from({ length: 72 }, (_, index) => index * 5);
  /** @type {(angle: number, length: number) => string} */
  const tickPath = (angle, length) =>
    segment(project(dialPoint(radius, angle)), project(dialPoint(radius + length, angle)));
  // The rim's widest points on screen sit on its top edge.
  const outline = Array.from({ length: 360 }, (_, angle) => project(dialPoint(rim, angle, rimHeight)));
  let [left, right] = outline;
  for (const point of outline) {
    left = point[0] < left[0] ? point : left;
    right = point[0] > right[0] ? point : right;
  }
  const line = project(dialPoint(radius + longTick, 180))[1] + 40;
  const terminators = [left, right].map(([x]) => segment([x - 7, line + 7], [x + 7, line - 7])).join('');
  return {
    axes: segment([centreX, -1500], [centreX, 2500]) + segment([-1500, centreY], [2500, centreY]),
    ring: floorArc(radius, 0, 360),
    ticks: degrees
      .filter((angle) => angle % 30)
      .map((angle) => tickPath(angle, tick))
      .join(''),
    longTicks: degrees
      .filter((angle) => !(angle % 30))
      .map((angle) => tickPath(angle, longTick))
      .join(''),
    extensions: [left, right].map(([x, y]) => segment([x, y + 16], [x, line + 12])).join(''),
    dimension: segment([left[0], line], [right[0], line]) + terminators,
    zero: project(dialPoint(radius + longTick + 10, 0)),
    line,
  };
};
