import { draw, makeBox, makeCylinder } from 'replicad';
import type { Shape3D } from 'replicad';

export const defaultParams = {
  length: 100, // Length of the door stopper wedge in mm
  width: 40, // Width in mm
  height: 25, // Maximum height at the back in mm
  tipHeight: 3, // Height at the thin tip in mm
  wallThickness: 4, // Wall thickness of the hollow slot loop in mm
  rBack: 15, // Outer back curve radius in mm
  rFront: 1.5, // Outer front tip radius in mm
  outerFilletRadius: 1, // Fillet radius for the outer side perimeter edges
  innerFilletRadius: 1, // Fillet radius for the inner slot perimeter edges
  patternPadding: 3, // Padding around the bottom concentric grooves in mm
  ridgeSpacing: 2, // Pitch of the side concentric ridges in mm
  ridgeWidth: 1, // Width of each side groove in mm
  ridgeDepth: 1, // Depth of each side groove in mm
  ridgeFilletRadius: 0.2, // Fillet radius for the concentric ridges in mm
};

export default function main(p = defaultParams): Shape3D {
  const {
    length,
    width,
    height,
    tipHeight,
    wallThickness,
    rBack,
    rFront,
    outerFilletRadius,
    innerFilletRadius,
    patternPadding,
    ridgeSpacing,
    ridgeWidth,
    ridgeDepth,
    ridgeFilletRadius,
  } = p;

  // The top-slope fillet naturally sits slightly below the sharp corner.
  // Compensate the sharp profile so the rounded peak lands at the requested height.
  const sharpHeight = height + 4.28;

  const sharpWedge = draw([rBack, 0])
    .lineTo([length, 0])
    .lineTo([length, tipHeight])
    .lineTo([0, sharpHeight])
    .lineTo([0, rBack])
    .tangentArcTo([rBack, 0])
    .close();

  const outerProfile = sharpWedge.fillet(rFront, (cornerFinder) =>
    cornerFinder.inBox([length - 5, -1], [length + 1, tipHeight + 1]),
  );

  const outerWedge = outerProfile
    .sketchOnPlane('XZ', -width / 2)
    .extrude(width);

  let filletedOuter = outerWedge;
  try {
    filletedOuter = outerWedge.fillet(outerFilletRadius);
  } catch {
    // Keep the core wedge if a small cosmetic fillet cannot be applied.
  }

  const xSlotEnd = length - 35;
  const alpha = Math.atan((sharpHeight - tipHeight) / length);
  const cosAlpha = Math.cos(alpha);

  const zInnerTop = (x: number) => {
    const zOuterTop = sharpHeight - (sharpHeight - tipHeight) * (x / length);
    return zOuterTop - wallThickness / cosAlpha;
  };

  const zInnerBottom = wallThickness;
  const zInnerTopAtSlotEnd = zInnerTop(xSlotEnd);
  const slotHeightAtEnd = zInnerTopAtSlotEnd - zInnerBottom;
  const activeSlotFrontRadius = Math.max(0.1, slotHeightAtEnd / 2);
  const activeSlotBackRadius = Math.max(0.1, rBack - wallThickness);

  const innerStart: [number, number] = [
    wallThickness + activeSlotBackRadius,
    zInnerBottom,
  ];
  const sharpInner = draw(innerStart)
    .lineTo([xSlotEnd, zInnerBottom])
    .lineTo([xSlotEnd, zInnerTopAtSlotEnd])
    .lineTo([wallThickness, zInnerTop(wallThickness)])
    .lineTo([wallThickness, zInnerBottom + activeSlotBackRadius])
    .tangentArcTo(innerStart)
    .close();

  const innerProfile = sharpInner.fillet(
    activeSlotFrontRadius,
    (cornerFinder) =>
      cornerFinder.inBox(
        [xSlotEnd - 5, zInnerBottom - 1],
        [xSlotEnd + 1, zInnerTopAtSlotEnd + 1],
      ),
  );

  const innerSlot = innerProfile
    .sketchOnPlane('XZ', -width / 2 - 5)
    .extrude(width + 10);

  const hollowWedge = filletedOuter.cut(innerSlot);

  let filletedWedge = hollowWedge;
  try {
    filletedWedge = hollowWedge.fillet(innerFilletRadius, (edgeFinder) =>
      edgeFinder.inBox(
        [wallThickness - 2, -width / 2 - 1, zInnerBottom - 2],
        [xSlotEnd + 2, width / 2 + 1, sharpHeight + 1],
      ),
    );
  } catch {
    // Keep the hollow wedge if the inner opening fillet cannot be applied.
  }

  const boundaryBox = makeBox(
    [patternPadding, -width / 2 + patternPadding, -ridgeDepth - 1],
    [
      length - rFront - patternPadding,
      width / 2 - patternPadding,
      wallThickness - 0.1,
    ],
  );

  const translatedWedge = filletedWedge.clone().translate([0, 0, -ridgeDepth]);
  const bottomSkin = translatedWedge.cut(filletedWedge);
  const paddedSkin = bottomSkin.intersect(boundaryBox);

  let currentWedge = filletedWedge;
  const maxRadius = length - rFront - 2 * patternPadding;

  for (let radius = ridgeSpacing; radius <= maxRadius; radius += ridgeSpacing) {
    const rOuter = radius + ridgeWidth / 2;
    const rInner = radius - ridgeWidth / 2;
    const outerCylinder = makeCylinder(
      rOuter,
      height + 5,
      [patternPadding, 0, -ridgeDepth - 1],
      [0, 0, 1],
    );
    const innerCylinder = makeCylinder(
      rInner,
      height + 7,
      [patternPadding, 0, -ridgeDepth - 2],
      [0, 0, 1],
    );
    const tallRing = outerCylinder.cut(innerCylinder);
    const raisedRidge = tallRing.intersect(paddedSkin);

    currentWedge = currentWedge.fuse(raisedRidge);
  }

  if (ridgeFilletRadius > 0) {
    currentWedge = currentWedge.fillet(ridgeFilletRadius, (edgeFinder) =>
      edgeFinder.inBox(
        [
          patternPadding - 0.1,
          -width / 2 + patternPadding - 0.1,
          -ridgeDepth - 0.1,
        ],
        [
          length - rFront - patternPadding + 0.1,
          width / 2 - patternPadding + 0.1,
          0.1,
        ],
      ),
    );
  }

  return currentWedge;
}
