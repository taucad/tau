/**
 * Isometric illustrations for the Design, Verify and Make principles. All three draw the same
 * flanged bearing housing, a rounded plate with two mounting holes and a bored boss, so the strip
 * reads as one part moving from parametric source, through measurement, onto a machine bed.
 * Geometry is projected at render time; colour comes from the site tokens in principle-diagrams.css.
 */

/** @typedef {[number, number]} Point */
/** @typedef {{p: (x: number, y: number, z: number) => Point, s: number}} View */

const COS30 = Math.sqrt(3) / 2;
/** An isometric circle is an ellipse whose radii are the circle radius times these factors. */
const RX = Math.SQRT2 * COS30;
const RY = Math.SQRT2 / 2;
const ARC_STEPS = 8;

/** @type {(value: number) => string} */
const n = (value) => String(Math.round(value * 10) / 10);
/** @type {(points: Point[]) => string} */
const polyline = (points) => points.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ');
/** @type {(points: Point[], className: string) => string} */
const polygon = (points, className) => `<path d="M ${polyline(points)} Z" class="${className}"/>`;
/** @type {(from: Point, to: Point, className: string) => string} */
const line = ([x1, y1], [x2, y2], className) =>
  `<path d="M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}" class="${className}"/>`;

/**
 * Isometric view: model x runs down-right, y down-left and z up the screen.
 * @param originX - Screen x of the model origin.
 * @param originY - Screen y of the model origin.
 * @param scale - Screen units per model unit.
 * @type {(originX: number, originY: number, scale: number) => View}
 */
const view = (originX, originY, scale) => ({
  p: (x, y, z) => [originX + (x - y) * COS30 * scale, originY + (x + y) * 0.5 * scale - z * scale],
  s: scale,
});

/**
 * Corner arcs of a rounded rectangle in the model plane, in screen clockwise order:
 * left, front, right, back. Consecutive arcs join along the straight edges.
 * @param a - Half length along x.
 * @param b - Half width along y.
 * @param r - Corner radius.
 * @type {(a: number, b: number, r: number) => Point[][]}
 */
const roundedCorners = (a, b, r) =>
  [
    [-1, 1, 180, 90],
    [1, 1, 90, 0],
    [1, -1, 0, -90],
    [-1, -1, -90, -180],
  ].map(([sx, sy, from, to]) =>
    Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
      const angle = ((from + ((to - from) * i) / ARC_STEPS) * Math.PI) / 180;
      return /** @type {Point} */ ([sx * (a - r) + r * Math.cos(angle), sy * (b - r) + r * Math.sin(angle)]);
    }),
  );

/**
 * Index of the point with the smallest (or largest) screen x: the slab's silhouette.
 * @type {(points: Point[], largest?: boolean) => number}
 */
const extremeIndex = (points, largest = false) => {
  let index = 0;
  for (const [i, [x]] of points.entries()) {
    if (largest ? x > points[index][0] : x < points[index][0]) {
      index = i;
    }
  }
  return index;
};

/**
 * A rounded slab standing on z0: shaded left, fillet and right walls, a top face and visible edges.
 * @type {(v: View, slab: {a: number, b: number, r: number, z0: number, z1: number}) => string}
 */
const slab = (v, { a, b, r, z0, z1 }) => {
  const [left, front, right, back] = roundedCorners(a, b, r);
  /** @type {(z: number) => (points: Point[]) => Point[]} */
  const at = (z) => (points) => points.map(([x, y]) => v.p(x, y, z));
  const indexLeft = extremeIndex(at(z1)(left));
  const indexRight = extremeIndex(at(z1)(right), true);
  const rightArc = [...front.slice(-1), ...right.slice(0, indexRight + 1)];
  const frontEdge = [...left.slice(indexLeft), ...front, ...right.slice(0, indexRight + 1)];
  /** @type {(arc: Point[], className: string) => string} */
  const wall = (arc, className) => polygon([...at(z0)(arc), ...at(z1)(arc).reverse()], className);
  return (
    wall(frontEdge, 'pd-face-left') +
    wall(front, 'pd-face-fillet') +
    wall(rightArc, 'pd-face-right') +
    polygon(at(z1)([...left, ...front, ...right, ...back]), 'pd-face-top') +
    `<path d="M ${polyline(at(z0)(frontEdge))}"/>` +
    line(v.p(...left[indexLeft], z0), v.p(...left[indexLeft], z1), 'pd-edge') +
    line(v.p(...right[indexRight], z0), v.p(...right[indexRight], z1), 'pd-edge')
  );
};

/**
 * A vertical cylinder standing on z0, its wall shaded by a horizontal gradient. A different top
 * radius makes a frustum. The gradient id must be unique within the document.
 * @type {(v: View, c: {x: number, y: number, r: number, r1?: number, z0: number, z1: number}, id: string) => string}
 */
const cylinder = (v, { x, y, r, r1 = r, z0, z1 }, id) => {
  const [rx0, ry0, rx1, ry1] = [r * v.s * RX, r * v.s * RY, r1 * v.s * RX, r1 * v.s * RY];
  const [bx, by] = v.p(x, y, z0);
  const [tx, ty] = v.p(x, y, z1);
  const spread = Math.max(rx0, rx1);
  const wall = `M ${n(tx - rx1)} ${n(ty)} L ${n(bx - rx0)} ${n(by)} A ${n(rx0)} ${n(ry0)} 0 0 0 ${n(bx + rx0)} ${n(by)} L ${n(tx + rx1)} ${n(ty)}`;
  return (
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(tx - spread)}" x2="${n(tx + spread)}" y1="0" y2="0"><stop offset="0" class="pd-shade-dark"/><stop offset="0.6" class="pd-shade-light"/><stop offset="1" class="pd-shade-mid"/></linearGradient></defs>` +
    `<path d="${wall} A ${n(rx1)} ${n(ry1)} 0 0 1 ${n(tx - rx1)} ${n(ty)} Z" fill="url(#${id})" class="pd-wall"/>` +
    `<path d="${wall}"/>` +
    `<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="${n(rx1)}" ry="${n(ry1)}" class="pd-face-top"/>`
  );
};

/**
 * A round hole in a horizontal face: the back wall catches light near the rim and the bore falls
 * away to the page, which is how a through hole reads in either theme. The gradient id must be
 * unique within the document.
 * @type {(v: View, h: {x: number, y: number, r: number, z: number}, id: string) => string}
 */
const hole = (v, { x, y, r, z }, id) => {
  const rx = r * v.s * RX;
  const ry = r * v.s * RY;
  const [cx, cy] = v.p(x, y, z);
  return (
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${n(cy - ry)}" y2="${n(cy + ry)}"><stop offset="0" class="pd-shade-dark"/><stop offset="1" class="pd-shade-clear"/></linearGradient></defs>` +
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="url(#${id})" class="pd-fine"/>`
  );
};

/**
 * An open arrowhead pointing at `to`.
 * @type {(from: Point, to: Point, className: string) => string}
 */
const arrowhead = ([x1, y1], [x2, y2], className) => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
  const size = 4;
  return `<path d="M ${n(x2 - ux * size - uy * size * 0.55)} ${n(y2 - uy * size + ux * size * 0.55)} L ${n(x2)} ${n(y2)} L ${n(x2 - ux * size + uy * size * 0.55)} ${n(y2 - uy * size - ux * size * 0.55)}" class="${className}"/>`;
};

/**
 * A text label; the consumer's `.diagram text` rule sets the mono face and muted colour.
 * @type {(at: Point, content: string, anchor?: 'start' | 'middle' | 'end') => string}
 */
const label = ([x, y], content, anchor = 'middle') =>
  `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}">${content}</text>`;

/** The shared part: a 44 × 30 × 6 flange with R6 corners, two Ø6.6 holes and a Ø16 boss bored Ø9. */
const part = { a: 22, b: 15, r: 6, t: 6, holeX: 15, holeR: 3.3, bossR: 8, bossH: 9, boreR: 4.5 };

/**
 * The housing at the origin of a view, with gradient ids prefixed per diagram. `onFlange` markup
 * is drawn on the flange's top face, beneath the boss.
 * @type {(v: View, id: string, onFlange?: string) => string}
 */
const housing = (v, id, onFlange = '') => {
  const { a, b, r, t, holeX, holeR, bossR, bossH, boreR } = part;
  return (
    slab(v, { a, b, r, z0: 0, z1: t }) +
    hole(v, { x: -holeX, y: 0, r: holeR, z: t }, `${id}-h1`) +
    hole(v, { x: holeX, y: 0, r: holeR, z: t }, `${id}-h2`) +
    onFlange +
    cylinder(v, { x: 0, y: 0, r: bossR, z0: t, z1: t + bossH }, `${id}-boss`) +
    hole(v, { x: 0, y: 0, r: boreR, z: t + bossH }, `${id}-bore`)
  );
};

/** @type {(body: string) => string} */
const svg = (body) => `<svg viewBox="0 0 240 140" class="diagram pd" aria-hidden="true">${body}</svg>`;

/** Design: the housing as editable features, with its fillet radius and boss height called out. */
const design = () => {
  const v = view(114, 82, 1.9);
  const { a, b, r, t, bossR, bossH } = part;
  const top = t + bossH;
  const ghost = top + 7;
  const rx = bossR * v.s * RX;
  const ry = bossR * v.s * RY;
  const [tx, ty] = v.p(0, 0, top);
  const [gx, gy] = v.p(0, 0, ghost);
  const corner = v.p(a - r + r * Math.SQRT1_2, b - r + r * Math.SQRT1_2, t);
  /** @type {Point} */
  const leaderEnd = [corner[0] + 26, corner[1] + 2];
  const arrowX = gx + rx + 10;
  return svg(
    // Construction centrelines through the holes and the boss.
    housing(
      v,
      'pd-design',
      `<path d="M ${polyline([v.p(-a + 2, 0, t), v.p(a - 2, 0, t)])} M ${polyline([v.p(0, -b + 2, t), v.p(0, b - 2, t)])}" class="faint pd-dash pd-fine"/>`,
    ) +
      // The boss height as a parameter: a dashed ghost at a taller value and the dimension between them.
      `<ellipse cx="${n(gx)}" cy="${n(gy)}" rx="${n(rx)}" ry="${n(ry)}" class="pd-ghost"/>` +
      `<path d="M ${n(tx - rx)} ${n(ty)} V ${n(gy)} M ${n(tx + rx)} ${n(ty)} V ${n(gy)}" class="pd-ghost"/>` +
      `<path d="M ${n(arrowX)} ${n(ty)} V ${n(gy)}" pathLength="1" class="pd-accent draw"/>` +
      arrowhead([arrowX, ty], [arrowX, gy], 'pd-accent') +
      arrowhead([arrowX, gy], [arrowX, ty], 'pd-accent') +
      label([arrowX + 6, (ty + gy) / 2 + 4], 'h', 'start') +
      // Fillet radius leader.
      `<path d="M ${polyline([corner, [corner[0] + 10, corner[1] + 8], leaderEnd])}" class="faint pd-fine"/>` +
      `<circle cx="${n(corner[0])}" cy="${n(corner[1])}" r="1.6" class="pd-accent-fill"/>` +
      label([leaderEnd[0] + 4, leaderEnd[1] + 4], 'R6', 'start'),
  );
};

/** Verify: the same housing inside its declared envelope, hole pitch measured between centres. */
const verify = () => {
  const v = view(118, 82, 1.9);
  const { a, b, t, holeX, bossH } = part;
  const gap = 2;
  const [ex, ey, ez] = [a + gap, b + gap, t + bossH + gap];
  const zDim = ez + 7;
  const left = v.p(-holeX, 0, zDim);
  const right = v.p(holeX, 0, zDim);
  /** The nine envelope edges that face the viewer; the three meeting at the hidden back corner are omitted. */
  const envelope = [
    [v.p(-ex, ey, 0), v.p(ex, ey, 0)],
    [v.p(ex, ey, 0), v.p(ex, -ey, 0)],
    [v.p(-ex, ey, 0), v.p(-ex, ey, ez)],
    [v.p(ex, ey, 0), v.p(ex, ey, ez)],
    [v.p(ex, -ey, 0), v.p(ex, -ey, ez)],
    [v.p(-ex, ey, ez), v.p(ex, ey, ez)],
    [v.p(ex, ey, ez), v.p(ex, -ey, ez)],
    [v.p(ex, -ey, ez), v.p(-ex, -ey, ez)],
    [v.p(-ex, -ey, ez), v.p(-ex, ey, ez)],
  ];
  /** @type {(x: number) => string} */
  const cross = (x) =>
    `<path d="M ${polyline([v.p(x - 3, 0, t), v.p(x + 3, 0, t)])} M ${polyline([v.p(x, -3, t), v.p(x, 3, t)])}" class="pd-accent pd-fine"/>`;
  return svg(
    housing(v, 'pd-verify') +
      `<path d="${envelope.map(([from, to]) => `M ${polyline([from, to])}`).join(' ')}" class="faint pd-dash pd-fine"/>` +
      // Extension lines rise from the hole centres to the dimension line.
      `<path d="M ${polyline([v.p(-holeX, 0, t), v.p(-holeX, 0, zDim + 2)])} M ${polyline([v.p(holeX, 0, t), v.p(holeX, 0, zDim + 2)])}" class="faint pd-fine"/>` +
      cross(-holeX) +
      cross(holeX) +
      `<path d="M ${polyline([left, right])}" pathLength="1" class="pd-accent draw"/>` +
      arrowhead(right, left, 'pd-accent') +
      arrowhead(left, right, 'pd-accent') +
      label([(left[0] + right[0]) / 2, (left[1] + right[1]) / 2 - 7], '30') +
      label([236, 134], '44 × 30 × 15', 'end'),
  );
};

/**
 * Make: the housing bolted to a base, with its two cap screws and the bearing it carries dropping
 * into place along dashed assembly axes. The finished part is shown becoming a working assembly.
 */
const make = () => {
  const v = view(118, 89, 1.9);
  const { t, holeX, bossH, boreR } = part;
  const base = { a: 28, b: 19, r: 2 };
  const screw = { r: 2.8, headR: 5, length: 8, z: t + 13, head: 4.5 };
  const bearing = { r: boreR, bore: 2.6, width: 4, z: t + bossH + 11 };
  /** A dashed axis from the hole up to the floating part, with an arrowhead pointing in. */
  const axis = (/** @type {number} */ x, /** @type {number} */ z0, /** @type {number} */ z1) => {
    const bottom = v.p(x, 0, z0);
    const top = v.p(x, 0, z1);
    /** @type {Point} */
    const tip = [bottom[0], bottom[1] - 3];
    return (
      `<path d="M ${polyline([top, [tip[0], tip[1] - 5]])}" class="pd-ghost"/>` +
      `<path d="M ${polyline([[tip[0], tip[1] - 5], tip])}" class="pd-accent pd-fine"/>` +
      arrowhead(top, tip, 'pd-accent')
    );
  };
  /** A socket-head cap screw floating above a flange hole. */
  const capScrew = (/** @type {number} */ x, /** @type {string} */ id) => {
    const headTop = screw.z + screw.length + screw.head;
    const socket = Array.from({ length: 6 }, (_, i) => {
      const angle = (i * Math.PI) / 3;
      return v.p(x + 2.3 * Math.cos(angle), 2.3 * Math.sin(angle), headTop);
    });
    return (
      cylinder(v, { x, y: 0, r: screw.r, z0: screw.z, z1: screw.z + screw.length }, `${id}-shank`) +
      cylinder(v, { x, y: 0, r: screw.headR, z0: screw.z + screw.length, z1: headTop }, `${id}-head`) +
      polygon(socket, 'pd-face-left pd-fine')
    );
  };
  return svg(
    slab(v, { ...base, z0: -3, z1: 0 }) +
      housing(v, 'pd-make') +
      axis(-holeX, t, screw.z) +
      axis(holeX, t, screw.z) +
      axis(0, t + bossH, bearing.z) +
      capScrew(-holeX, 'pd-make-s1') +
      cylinder(v, { x: 0, y: 0, r: bearing.r, z0: bearing.z, z1: bearing.z + bearing.width }, 'pd-make-bearing') +
      `<ellipse cx="${n(v.p(0, 0, bearing.z + bearing.width)[0])}" cy="${n(v.p(0, 0, bearing.z + bearing.width)[1])}" rx="${n(3.6 * v.s * RX)}" ry="${n(3.6 * v.s * RY)}" class="pd-fine"/>` +
      hole(v, { x: 0, y: 0, r: bearing.bore, z: bearing.z + bearing.width }, 'pd-make-bore') +
      capScrew(holeX, 'pd-make-s2'),
  );
};

/** SVG markup for the three principles, keyed by principle id. */
export const diagrams = { design: design(), verify: verify(), make: make() };
