// ZA worm: straight flanks in the axial section. All lengths are millimetres.
export function gearDimensions(
  module: number,
  teeth: number,
  axialPressureAngle: number,
  backlash: number,
) {
  const alpha = (axialPressureAngle * Math.PI) / 180;
  const wormRadius = 5 * module;
  const wheelRadius = (module * teeth) / 2;
  const hobTip = wormRadius + 1.25 * module;
  const tipFillet = 0.2 * module;
  const halfThickness = (Math.PI * module) / 4 + backlash / 2;
  const filletCenterR = hobTip - tipFillet;
  const filletCenterX =
    halfThickness -
    (hobTip - wormRadius) * Math.tan(alpha) -
    tipFillet * (1 / Math.cos(alpha) - Math.tan(alpha));
  return {
    module,
    teeth,
    alpha,
    backlash,
    wormRadius,
    wheelRadius,
    centerDistance: wormRadius + wheelRadius,
    lead: Math.PI * module,
    h: module / 2,
    leadAngle: Math.atan(module / (2 * wormRadius)),
    hobTip,
    tipFillet,
    halfThickness,
    filletCenterR,
    filletCenterX,
    filletStartR: filletCenterR + tipFillet * Math.sin(alpha),
  };
}
export type GearDimensions = ReturnType<typeof gearDimensions>;
export type Point3 = [number, number, number];

export function hobHalfWidth(d: GearDimensions, radius: number) {
  if (radius <= d.filletStartR) {
    return d.halfThickness - (radius - d.wormRadius) * Math.tan(d.alpha);
  }
  return (
    d.filletCenterX +
    Math.sqrt(Math.max(0, d.tipFillet ** 2 - (radius - d.filletCenterR) ** 2))
  );
}

// Envelope of the screw surface under synchronized 1:teeth rotation.
// For F = x + h(q + phase) - side*H(r), impose dF/dphase = 0.
// The wheel is returned in its own frame (axis Z); the worm is above +Y.
export function envelopePoint(
  d: GearDimensions,
  radius: number,
  z: number,
  side: number,
) {
  const c = Math.sqrt(radius ** 2 - z ** 2);
  const q = Math.atan2(z, c);
  const height = hobHalfWidth(d, radius);
  const filletRise = radius - d.filletCenterR;
  const slope =
    radius >= d.hobTip - 1e-10
      ? Infinity
      : radius <= d.filletStartR
        ? Math.tan(d.alpha)
        : filletRise / Math.sqrt(d.tipFillet ** 2 - filletRise ** 2);
  const fy = (d.h * z) / radius ** 2 - (side * slope * c) / radius;
  const x = Number.isFinite(slope) ? (d.wormRadius - c) / fy : 0;
  const y = d.centerDistance - c;
  const phase = (side * height - x) / d.h - q;
  const beta = phase / d.teeth;
  return {
    point: [
      x * Math.cos(beta) + y * Math.sin(beta),
      -x * Math.sin(beta) + y * Math.cos(beta),
      z,
    ] as Point3,
    phase,
  };
}

export function gapFlank(
  d: GearDimensions,
  z: number,
  side: number,
  outerRadius: number,
) {
  let low = d.filletStartR;
  // Find the first outside-blank intersection on the regular flank branch.
  while (
    Math.hypot(...envelopePoint(d, low, z, side).point.slice(0, 2)) <
    outerRadius
  ) {
    low -= 0.05;
    if (low <= Math.abs(z) + 0.05)
      throw new Error('Wheel face exceeds the supported generating envelope.');
  }
  let high = d.filletStartR;
  for (let i = 0; i < 45; i++) {
    const middle = (low + high) / 2;
    if (
      Math.hypot(...envelopePoint(d, middle, z, side).point.slice(0, 2)) >
      outerRadius
    )
      low = middle;
    else high = middle;
  }
  const fillet = Array.from({ length: 9 }, (_, i) => {
    const angle = Math.PI / 2 + ((d.alpha - Math.PI / 2) * i) / 8;
    return envelopePoint(
      d,
      d.filletCenterR + d.tipFillet * Math.sin(angle),
      z,
      side,
    ).point;
  });
  const flank = Array.from(
    { length: 13 },
    (_, i) =>
      envelopePoint(
        d,
        d.filletStartR + ((high - d.filletStartR) * i) / 12,
        z,
        side,
      ).point,
  );
  return { fillet, flank };
}
