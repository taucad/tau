/**
 * Parametric Pot Plant Holder
 * A customizable pot plant holder with an optional attached saucer and drainage holes.
 */
import type { Edge, Shape3D, ShapeConfig } from 'replicad';
import { drawCircle } from 'replicad';

export const defaultParams = {
  potInnerDiameter: 100, // Mm - Inner diameter for the plant pot
  potInnerHeight: 90, // Mm - Inner height for the plant pot
  wallThickness: 3, // Mm - Wall thickness of the pot holder
  baseThickness: 5, // Mm - Base thickness of the pot holder

  includeSaucer: true, // Boolean - Whether to include an attached saucer
  saucerLipHeight: 15, // Mm - Height of the saucer's lip from its base plate
  saucerBaseThickness: 3, // Mm - Thickness of the saucer's base plate
  saucerWallThickness: 3, // Mm - Wall thickness of the saucer's lip
  saucerGap: 5, // Mm - Gap between pot holder outer wall and saucer inner lip

  addDrainageHoles: true, // Boolean - Whether to add drainage holes to the pot holder
  drainageHoleDiameter: 8, // Mm - Diameter of each drainage hole
  drainageHoleCount: 5, // Integer - Number of drainage holes (if 1 and offset 0, it's a center hole)
  drainageHoleOffset: 20, // Mm - Radial distance of drainage holes from the center of the pot base

  filletOuterRim: true, // Boolean - Fillet the top outer rim of the pot holder
  filletInnerRim: true, // Boolean - Fillet the top inner rim of the pot holder
  filletOuterBase: true, // Boolean - Fillet the outer base of the pot holder (or saucer if present)
  filletSaucerRim: true, // Boolean - Fillet the top rim of the saucer (if present)
  filletRadius: 1, // Mm - General radius for fillets (should be less than wallThickness)
};

const isCloseToRadiusInXYPlane = (
  edge: Edge,
  expectedRadius: number,
  tolerance: number,
): boolean => {
  const midPoint = edge.pointAt(0.5);
  const R = Math.hypot(midPoint.x, midPoint.y);
  return Math.abs(R - expectedRadius) < tolerance;
};

function createPotHolder(p = defaultParams): Shape3D {
  const potOuterRadius = p.potInnerDiameter / 2 + p.wallThickness;
  const potPartTotalHeight = p.potInnerHeight + p.baseThickness;

  const outerShape = drawCircle(potOuterRadius)
    .sketchOnPlane('XY')
    .extrude(potPartTotalHeight);

  const potCavity = drawCircle(p.potInnerDiameter / 2)
    .sketchOnPlane('XY')
    .extrude(p.potInnerHeight)
    .translateZ(p.baseThickness);

  return outerShape.cut(potCavity);
}

function addDrainageHoles(potHolderShape: Shape3D, p = defaultParams): Shape3D {
  if (
    !p.addDrainageHoles ||
    p.drainageHoleCount <= 0 ||
    p.drainageHoleDiameter <= 0
  ) {
    return potHolderShape;
  }

  let shape = potHolderShape;
  const holeRadius = p.drainageHoleDiameter / 2;

  if (p.drainageHoleCount === 1 && p.drainageHoleOffset === 0) {
    if (holeRadius < p.potInnerDiameter / 2) {
      const holeCylinder = drawCircle(holeRadius)
        .sketchOnPlane('XY')
        .extrude(p.baseThickness);
      shape = shape.cut(holeCylinder);
    }
    return shape;
  }

  for (let index = 0; index < p.drainageHoleCount; index++) {
    const angle = ((2 * Math.PI) / p.drainageHoleCount) * index;
    if (
      p.drainageHoleOffset + holeRadius < p.potInnerDiameter / 2 &&
      p.drainageHoleOffset >= 0
    ) {
      const x = p.drainageHoleOffset * Math.cos(angle);
      const y = p.drainageHoleOffset * Math.sin(angle);
      const holeCylinder = drawCircle(holeRadius)
        .sketchOnPlane('XY')
        .extrude(p.baseThickness)
        .translate([x, y, 0]);
      shape = shape.cut(holeCylinder);
    } else if (p.drainageHoleOffset > 0) {
      console.warn(
        'Drainage hole configuration invalid (offset too large or negative), skipping a peripheral hole.',
      );
    }
  }

  if (p.drainageHoleOffset > 0 && holeRadius < p.potInnerDiameter / 4) {
    const centerHole = drawCircle(Math.min(holeRadius, p.potInnerDiameter / 4))
      .sketchOnPlane('XY')
      .extrude(p.baseThickness);
    shape = shape.cut(centerHole);
  }

  return shape;
}

function createSaucer(p = defaultParams): Shape3D {
  const potHolderOuterDiameter = p.potInnerDiameter + 2 * p.wallThickness;
  const saucerInnerDiameter = potHolderOuterDiameter + 2 * p.saucerGap;
  const saucerOuterDiameter = saucerInnerDiameter + 2 * p.saucerWallThickness;
  const saucerOuterRadius = saucerOuterDiameter / 2;

  const saucerBasePlate = drawCircle(saucerOuterRadius)
    .sketchOnPlane('XY')
    .extrude(p.saucerBaseThickness);

  const saucerLipOuterShape = drawCircle(saucerOuterRadius)
    .sketchOnPlane('XY')
    .extrude(p.saucerLipHeight)
    .translateZ(p.saucerBaseThickness);
  const saucerLipInnerCutShape = drawCircle(saucerInnerDiameter / 2)
    .sketchOnPlane('XY')
    .extrude(p.saucerLipHeight)
    .translateZ(p.saucerBaseThickness);
  const saucerLip = saucerLipOuterShape.cut(saucerLipInnerCutShape);

  return saucerBasePlate.fuse(saucerLip);
}

function applyFillets(
  shape: Shape3D,
  options: {
    radius: number;
    targets: Array<{ radius: number; z: number }>;
    tolerance: number;
  },
): Shape3D {
  if (options.radius <= 0 || options.targets.length === 0) {
    return shape;
  }

  return shape.fillet(options.radius, (edgeFinder) =>
    edgeFinder.when(({ element }) => {
      const point = element.pointAt(0.5);
      return options.targets.some(
        ({ radius, z }) =>
          Math.abs(point.z - z) < options.tolerance &&
          isCloseToRadiusInXYPlane(element, radius, options.tolerance),
      );
    }),
  );
}

export default function main(p = defaultParams): Shape3D | ShapeConfig[] {
  if (
    p.filletRadius >= p.wallThickness ||
    (p.includeSaucer && p.filletRadius >= p.saucerWallThickness)
  ) {
    console.warn(
      'Fillet radius might be too large compared to wall thickness, potentially causing issues.',
    );
  }

  if (
    p.potInnerDiameter <= 0 ||
    p.potInnerHeight <= 0 ||
    p.wallThickness <= 0 ||
    p.baseThickness <= 0
  ) {
    throw new Error('Pot dimensions and thicknesses must be positive.');
  }

  if (
    p.includeSaucer &&
    (p.saucerLipHeight <= 0 ||
      p.saucerBaseThickness <= 0 ||
      p.saucerWallThickness <= 0 ||
      p.saucerGap < 0)
  ) {
    throw new Error(
      'Saucer dimensions and thicknesses must be positive, and gap non-negative.',
    );
  }

  const tolerance = p.wallThickness * 0.2;
  const potOuterRadius = p.potInnerDiameter / 2 + p.wallThickness;
  const potOffset = p.includeSaucer ? p.saucerBaseThickness : 0;
  const potTopZ = potOffset + p.potInnerHeight + p.baseThickness;
  const potTargets: Array<{ radius: number; z: number }> = [];
  if (p.filletOuterRim) {
    potTargets.push({ radius: potOuterRadius, z: potTopZ });
  }
  if (p.filletInnerRim) {
    potTargets.push({ radius: p.potInnerDiameter / 2, z: potTopZ });
  }
  if (!p.includeSaucer && p.filletOuterBase) {
    potTargets.push({ radius: potOuterRadius, z: 0 });
  }

  const potHolder = applyFillets(
    addDrainageHoles(createPotHolder(p), p).translateZ(potOffset),
    { radius: p.filletRadius, targets: potTargets, tolerance },
  );
  if (!p.includeSaucer) {
    return potHolder;
  }

  const saucerOuterRadius =
    (p.potInnerDiameter +
      2 * p.wallThickness +
      2 * p.saucerGap +
      2 * p.saucerWallThickness) /
    2;
  const saucerTargets: Array<{ radius: number; z: number }> = [];
  if (p.filletSaucerRim) {
    saucerTargets.push({
      radius: saucerOuterRadius,
      z: p.saucerBaseThickness + p.saucerLipHeight,
    });
  }
  if (p.filletOuterBase) {
    saucerTargets.push({ radius: saucerOuterRadius, z: 0 });
  }
  const saucer = applyFillets(createSaucer(p), {
    radius: p.filletRadius,
    targets: saucerTargets,
    tolerance,
  });

  return [
    { shape: potHolder, name: 'Pot holder' },
    { shape: saucer, name: 'Saucer' },
  ];
}
