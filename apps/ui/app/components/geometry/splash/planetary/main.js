import { booleans, extrusions, geometries, measurements, primitives, transforms } from '@jscad/modeling';

export const defaultParams = { module: 3, backlash: 0.15, gearWidth: 12, angle: 0, part: 'assembly', printPose: false };
const { subtract, union } = booleans;
const { circle, polygon, rectangle } = primitives;
const { extrudeLinear } = extrusions;
const { translate, rotateZ } = transforms;
const radians = (degrees) => (degrees * Math.PI) / 180;
const polar = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];
// Bound circular chord error to 0.05 mm without oversampling straight walls.
const segments = (radius) => Math.max(64, Math.ceil(Math.PI / Math.acos(1 - 0.05 / radius) / 4) * 4);
const disc = (radius) => circle({ radius, segments: segments(radius) });
const extrude = (profile, height, base) => translate([0, 0, base], extrudeLinear({ height }, profile));
const named = (shape, name) => Object.assign(shape, { name });
// These holes are wholly inside their outline: retain exact shared vertices.
const cut = (outline, ...holes) =>
  geometries.geom2.create([
    ...geometries.geom2.toSides(outline),
    ...holes.flatMap((hole) => geometries.geom2.toSides(hole).map(([a, b]) => [b, a])),
  ]);

// Join constant-section layers by their exposed planar faces. No 3D boolean
// fragments: shared interfaces disappear and the authored boundaries stay exact.
const stack = (layers) => {
  const faces = [];
  const onPlane = (face, z) => face.vertices.every((vertex) => Math.abs(vertex[2] - z) < 1e-7);
  for (const [index, layer] of layers.entries()) {
    const [profile, bottom, top, shoulders] = layer;
    const shell = geometries.geom3.toPolygons(extrude(profile, top - bottom, bottom));
    faces.push(...shell.filter((face) => !onPlane(face, bottom) && !onPlane(face, top)));
    const cap = (profiles, z, upward) => {
      const boundaries = new Map();
      for (const [profileIndex, shape] of profiles.entries())
        for (const original of geometries.geom2.toSides(shape)) {
          const side = profileIndex === 0 ? original : [original[1], original[0]];
          const key = side
            .map((point) => point.join(','))
            .sort()
            .join('/');
          if (boundaries.has(key)) boundaries.delete(key);
          else boundaries.set(key, side);
        }
      const slice = extrusions.slice.fromSides([...boundaries.values()]);
      for (const face of extrusions.slice.toPolygons(slice)) {
        const vertices = face.vertices.map(([x, y]) => [x, y, z]);
        if (!upward) vertices.reverse();
        faces.push(geometries.poly3.create(vertices));
      }
    };
    if (index === 0) cap([profile], bottom, false);
    const next = layers[index + 1];
    const upward = !next || measurements.measureArea(profile) > measurements.measureArea(next[0]);
    if (shoulders) for (const shoulder of shoulders) cap([shoulder], top, true);
    else cap(next ? (upward ? [profile, next[0]] : [next[0], profile]) : [profile], top, upward);
  }
  return geometries.geom3.create(faces);
};

// Exact involute samples; internal spaces reverse backlash and addendum.
const gearProfile = ({ module, teeth, backlash, internal = false }) => {
  const pitchRadius = (module * teeth) / 2;
  const pressure = radians(20);
  const base = pitchRadius * Math.cos(pressure);
  const tip = pitchRadius + module * (internal ? 1.25 : 1);
  const root = pitchRadius - module * (internal ? 1 : 1.25);
  const start = Math.max(root, base);
  const halfBase = Math.PI / (2 * teeth) + Math.tan(pressure) - pressure - backlash / (2 * pitchRadius);
  const halfWidth = (radius) => {
    const alpha = Math.acos(Math.min(1, base / radius));
    return halfBase - (Math.tan(alpha) - alpha);
  };
  const points = [];
  const rootHalf = halfWidth(start);
  const tipHalf = halfWidth(tip);
  for (let tooth = 0; tooth < teeth; tooth++) {
    const center = (tooth * 2 * Math.PI) / teeth;
    points.push(polar(root, center - rootHalf));
    for (let sample = root < base ? 0 : 1; sample <= 12; sample++) {
      const radius = start + ((tip - start) * sample) / 12;
      points.push(polar(radius, center - halfWidth(radius)));
    }
    for (let sample = 1; sample <= 4; sample++) {
      points.push(polar(tip, center - tipHalf + (2 * tipHalf * sample) / 4));
    }
    for (let sample = 11; sample >= 0; sample--) {
      const radius = start + ((tip - start) * sample) / 12;
      points.push(polar(radius, center + halfWidth(radius)));
    }
    if (root < base) points.push(polar(root, center + rootHalf));
    for (let sample = 1; sample < 4; sample++) {
      points.push(polar(root, center + rootHalf + (((2 * Math.PI) / teeth - 2 * rootHalf) * sample) / 4));
    }
  }
  return polygon({ points });
};

/** Three-planet, fixed-ring gearbox. All dimensions are millimetres, Z-up. */
export default function main(input = {}) {
  const p = { ...defaultParams, ...input };
  if (
    ![p.module, p.backlash, p.gearWidth, p.angle].every(Number.isFinite) ||
    p.module < 1.5 ||
    p.module > 3.5 ||
    p.backlash <= 0 ||
    p.backlash > 0.5 ||
    p.gearWidth < 8 ||
    p.gearWidth > 20
  ) {
    throw new Error('Expected module 1.5–3.5 mm, backlash >0–0.5 mm, width 8–20 mm and a finite angle.');
  }
  const orbit = p.module * 18;
  const bore = p.module * 32;
  const outer = bore + 6;
  const flange = outer + 8;
  const boltCircle = outer + 3;
  const wallTop = p.gearWidth + 20;
  const coverTop = wallTop + 6;
  const gearTop = 13 + p.gearWidth;
  const ringOuter = bore - 0.05;
  const holes = (radius, offset = 0) =>
    Array.from({ length: 6 }, (_, index) => translate(polar(boltCircle, radians(index * 60 + offset)), disc(radius)));
  const lugs = (radius, depth, width) =>
    Array.from({ length: 3 }, (_, index) =>
      rotateZ(radians(index * 120), translate([radius + depth / 2, 0], rectangle({ size: [depth + 0.5, width] }))),
    );

  const slots = lugs(bore, 3.2, 8.4);
  const slottedBore = union(disc(bore), ...slots);
  const housing = stack([
    [
      cut(disc(flange), disc(7.4), ...holes(2.75, 30)),
      0,
      6,
      [cut(disc(flange), disc(outer), ...holes(2.75, 30)), cut(disc(bore - 4), disc(7.4))],
    ],
    [cut(disc(outer), disc(bore - 4)), 6, 11],
    [cut(disc(outer), slottedBore), 11, wallTop - 6],
    [cut(disc(flange), slottedBore, ...holes(2.5)), wallTop - 6, wallTop],
  ]);
  if (p.part === 'housing') {
    return named(p.printPose ? translate([128, 128, 0], housing) : housing, 'Housing');
  }
  const ringHole = rotateZ(
    Math.PI / 54,
    gearProfile({ module: p.module, teeth: 54, backlash: -p.backlash, internal: true }),
  );
  const ring = extrude(subtract(union(disc(ringOuter), ...lugs(ringOuter, 3, 8)), ringHole), p.gearWidth + 4, 11);
  const sun = stack([
    [gearProfile({ module: p.module, teeth: 18, backlash: p.backlash }), 13, gearTop],
    [disc(5), gearTop, coverTop + 6],
  ]);
  const planet = extrude(
    subtract(gearProfile({ module: p.module, teeth: 18, backlash: p.backlash }), disc(4.25)),
    p.gearWidth,
    13,
  );
  const lighteningHoles = Array.from({ length: 3 }, (_, index) =>
    translate(polar(15, radians(60 + index * 120)), disc(5)),
  );
  const carrier = stack([
    [disc(7), -12, 7],
    [cut(disc(orbit + 6), ...lighteningHoles), 7, 12],
    [
      geometries.geom2.create(
        Array.from({ length: 3 }, (_, index) =>
          geometries.geom2.toSides(translate(polar(orbit, radians(index * 120)), disc(4))),
        ).flat(),
      ),
      12,
      gearTop + 0.8,
    ],
  ]);
  const cover = stack([
    [cut(disc(bore - 0.15), disc(5.5)), wallTop - 2, wallTop],
    [cut(disc(flange), disc(5.5), ...holes(2.75)), wallTop, coverTop],
    [cut(disc(9), disc(5.5)), coverTop, coverTop + 3],
  ]);
  const shank = 11;
  const bolt = stack([
    [disc(2.4), 0, shank],
    [disc(4.25), shank, shank + 2.3],
    [cut(disc(4.25), circle({ radius: 2.6, segments: 6 })), shank + 2.3, shank + 4.5],
  ]);
  const parts = { ring, sun, planet, carrier, cover, bolt };
  if (p.part !== 'assembly') {
    if (!(p.part in parts)) throw new Error(`Unknown gearbox part: ${p.part}`);
    return named(parts[p.part], p.part);
  }
  const carrierAngle = radians(p.angle / 4);
  return [
    named(housing, 'Housing'),
    named(translate([0, 0, 0.05], ring), 'Ring'),
    named(rotateZ(radians(p.angle), sun), 'Sun'),
    ...Array.from({ length: 3 }, (_, index) =>
      named(
        translate(
          [...polar(orbit, radians(index * 120) + carrierAngle), 0],
          rotateZ(radians(170 - p.angle / 2), planet),
        ),
        `Planet ${index + 1}`,
      ),
    ),
    named(rotateZ(carrierAngle, carrier), 'Carrier'),
    named(translate([0, 0, 0.05], cover), 'Cover'),
    // 0.05 mm presentation clearance avoids coincident head/lid mesh faces.
    ...Array.from({ length: 6 }, (_, index) =>
      named(translate([...polar(boltCircle, radians(index * 60)), wallTop - 4.9], bolt), `Bolt ${index + 1}`),
    ),
  ];
}
