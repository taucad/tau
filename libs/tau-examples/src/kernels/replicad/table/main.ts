/**
 * Parametric Table
 * A customizable table with adjustable dimensions, leg style options, and optional features.
 */
import {
  drawRoundedRectangle,
  drawCircle,
  draw,
} from 'replicad';

export const defaultParams = {
  // Table dimensions
  width: 800, // Width of the table in mm
  length: 1200, // Length of the table in mm
  height: 750, // Height of the table in mm

  // Table top
  topThickness: 25, // Thickness of the tabletop in mm
  roundedCorners: true, // Whether to create rounded corners on the tabletop
  cornerRadius: 50, // Radius for rounded corners (if enabled)

  // Legs
  legStyle: 'square', // "square" or "round"
  legWidth: 50, // Width/diameter of the legs in mm
  legInset: 25, // Distance from edge to OUTER edge of leg

  // Apron (the frame under the tabletop)
  includeApron: true, // Whether to include an apron
  apronHeight: 80, // Height of the apron in mm
  apronThickness: 20, // Thickness of the apron in mm

  // Additional features
  includeShelf: false, // Whether to include a lower shelf
  shelfHeight: 150, // Height from floor to shelf in mm
  shelfThickness: 15, // Thickness of the shelf in mm
  shelfInset: 50, // Inset of shelf from edges
};

/**
 * Creates the tabletop of the table
 * @param p - Parameters for the table
 * @returns The tabletop 3D shape
 */
function createTabletop(
  p = defaultParams,
) {
  // Create tabletop at the exact final height
  if (p.roundedCorners) {
    return drawRoundedRectangle(
      p.width,
      p.length,
      p.cornerRadius,
    )
      .sketchOnPlane()
      .extrude(p.topThickness)
      .translate([
        0,
        0,
        p.height - p.topThickness,
      ]);
  }

  return draw([
    -p.width / 2,
    -p.length / 2,
  ])
    .hLine(p.width)
    .vLine(p.length)
    .hLine(-p.width)
    .close()
    .sketchOnPlane()
    .extrude(p.topThickness)
    .translate([
      0,
      0,
      p.height - p.topThickness,
    ]);
}

/**
 * Creates a single leg for the table
 * @param p - Parameters for the table
 * @param x - X position of the leg
 * @param y - Y position of the leg
 * @returns The leg 3D shape
 */
function createLeg(
  p: typeof defaultParams,
  x: number,
  y: number,
) {
  // Start legs from Z=0 and extrude up to meet the apron
  const legHeight =
    p.height - p.topThickness;

  if (p.legStyle === 'round') {
    return drawCircle(p.legWidth / 2)
      .sketchOnPlane()
      .extrude(legHeight)
      .translate([x, y, 0]);
  }

  return draw([
    x - p.legWidth / 2,
    y - p.legWidth / 2,
  ])
    .hLine(p.legWidth)
    .vLine(p.legWidth)
    .hLine(-p.legWidth)
    .close()
    .sketchOnPlane()
    .extrude(legHeight)
    .translate([0, 0, 0]);
}

/**
 * Creates all four legs for the table
 * @param p - Parameters for the table
 * @returns The combined legs 3D shape
 */
function createLegs(p = defaultParams) {
  // Calculate leg positions - now include legWidth for proper inset
  // For each leg, position the center so the outer edge is exactly legInset from table edge
  const legXPos =
    p.width / 2 -
    p.legInset -
    p.legWidth / 2;
  const legYPos =
    p.length / 2 -
    p.legInset -
    p.legWidth / 2;

  // Create all four legs
  const leg1 = createLeg(
    p,
    -legXPos,
    -legYPos,
  );
  const leg2 = createLeg(
    p,
    legXPos,
    -legYPos,
  );
  const leg3 = createLeg(
    p,
    legXPos,
    legYPos,
  );
  const leg4 = createLeg(
    p,
    -legXPos,
    legYPos,
  );

  // Combine legs into a single shape
  return leg1
    .fuse(leg2)
    .fuse(leg3)
    .fuse(leg4);
}

/**
 * Creates the apron frame under the tabletop
 * @param p - Parameters for the table
 * @returns The apron 3D shape or null if apron is disabled
 */
function createApron(
  p = defaultParams,
) {
  if (!p.includeApron) {
    return null;
  }

  // Calculate leg positions
  const legXPos =
    p.width / 2 -
    p.legInset -
    p.legWidth / 2;
  const legYPos =
    p.length / 2 -
    p.legInset -
    p.legWidth / 2;

  // Position the apron to meet exactly with the bottom of the tabletop
  const apronZ =
    p.height -
    p.topThickness -
    p.apronHeight;

  // Calculate the positions of the leg corners that the apron should connect to
  const legHalfWidth = p.legWidth / 2;

  // Front apron (Y-) - extends from left leg to right leg
  const frontApron = draw([
    -legXPos - legHalfWidth,
    -legYPos - legHalfWidth,
  ])
    .hLine(2 * legXPos + p.legWidth) // Full width between outer edges of legs
    .vLine(p.apronThickness)
    .hLine(-(2 * legXPos + p.legWidth))
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);

  // Back apron (Y+) - extends from left leg to right leg
  const backApron = draw([
    -legXPos - legHalfWidth,
    legYPos +
      legHalfWidth -
      p.apronThickness,
  ])
    .hLine(2 * legXPos + p.legWidth)
    .vLine(p.apronThickness)
    .hLine(-(2 * legXPos + p.legWidth))
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);

  // Left apron (X-) - extends from front leg to back leg
  const leftApron = draw([
    -legXPos - legHalfWidth,
    -legYPos -
      legHalfWidth +
      p.apronThickness,
  ])
    .hLine(p.apronThickness)
    .vLine(
      2 * legYPos +
        p.legWidth -
        p.apronThickness,
    )
    .hLine(-p.apronThickness)
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);

  // Right apron (X+) - extends from front leg to back leg
  const rightApron = draw([
    legXPos +
      legHalfWidth -
      p.apronThickness,
    -legYPos -
      legHalfWidth +
      p.apronThickness,
  ])
    .hLine(p.apronThickness)
    .vLine(
      2 * legYPos +
        p.legWidth -
        p.apronThickness,
    )
    .hLine(-p.apronThickness)
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);

  // Combine apron sides
  return frontApron
    .fuse(backApron)
    .fuse(leftApron)
    .fuse(rightApron);
}

/**
 * Creates an optional lower shelf for the table
 * @param p - Parameters for the table
 * @returns The shelf 3D shape or null if shelf is disabled
 */
function createShelf(
  p = defaultParams,
) {
  if (!p.includeShelf) {
    return null;
  }

  // Calculate shelf dimensions with inset
  const shelfWidth =
    p.width - 2 * p.shelfInset;
  const shelfLength =
    p.length - 2 * p.shelfInset;

  // Create the shelf shape at exact specified height
  if (p.roundedCorners) {
    const shelfRadius = Math.min(
      p.cornerRadius * 0.8,
      Math.min(
        shelfWidth,
        shelfLength,
      ) * 0.2,
    );

    return drawRoundedRectangle(
      shelfWidth,
      shelfLength,
      shelfRadius,
    )
      .sketchOnPlane()
      .extrude(p.shelfThickness)
      .translate([0, 0, p.shelfHeight]);
  }

  return draw([
    -shelfWidth / 2,
    -shelfLength / 2,
  ])
    .hLine(shelfWidth)
    .vLine(shelfLength)
    .hLine(-shelfWidth)
    .close()
    .sketchOnPlane()
    .extrude(p.shelfThickness)
    .translate([0, 0, p.shelfHeight]);
}

export default function main(
  p = defaultParams,
) {
  // Create table components
  const tabletop = createTabletop(p);
  const legs = createLegs(p);
  let table = tabletop.fuse(legs);

  // Add optional apron
  if (p.includeApron) {
    const apron = createApron(p);
    if (apron) {
      table = table.fuse(apron);
    }
  }

  // Add optional shelf
  if (p.includeShelf) {
    const shelf = createShelf(p);
    if (shelf) {
      table = table.fuse(shelf);
    }
  }

  return table;
}
