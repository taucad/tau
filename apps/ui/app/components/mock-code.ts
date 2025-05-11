/* eslint-disable max-lines -- mocks */
type Model = {
  id: string;
  name: string;
  code: string;
};

export const cubeCode = `/**
 * Parametric Cube with Filleted Edges
 * A simple cube with adjustable dimensions and rounded edges.
 */
const { sketchRectangle, EdgeFinder } = replicad;

const defaultParams = {
  length: 100,    // Length of cube sides in mm
  filletRadius: 5, // Radius for rounded edges in mm
};

/**
 * Creates a cube with filleted edges
 * @param _ Unused parameter (required by replicad)
 * @param params Custom parameters to override defaults
 * @returns The complete cube model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
  // Create base cube shape
  let shape = sketchRectangle(p.length, p.length)
    .extrude(p.length)
    .fillet({
      radius: p.filletRadius,
      filter: new EdgeFinder(),
    });

  return shape;
}
`;

export const hollowBoxCode = `/**
 * Parametric Box with Rounded Corners
 * A customizable box with adjustable dimensions and corner radii.
 */
const defaultParams = {
  width: 100,     // Width of the box in mm
  length: 150,    // Length of the box in mm
  height: 50,     // Height of the box in mm
  thickness: 2,   // Wall thickness in mm
  cornerRadius: 5, // Radius for rounded corners
};

const { drawRoundedRectangle } = replicad;

/**
 * Creates a parametric box with rounded corners
 * @param _ Unused parameter (required by replicad)
 * @param params Custom parameters to override defaults
 * @returns The complete box model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
  // Create outer shape
  const outer = drawRoundedRectangle(p.width, p.length, p.cornerRadius)
    .sketchOnPlane()
    .extrude(p.height);
  
  // Hollow out the box using the shell function
  const hollowBox = outer.shell(p.thickness, (f) => f.inPlane("XY", p.height));

  return hollowBox;
}
`;

export const birdhouseCode = `/**
 * Parametric Birdhouse
 * A customizable birdhouse with adjustable dimensions and features.
 */
const defaultParams = {
  height: 85.0, // Overall height of the birdhouse
  width: 120.0, // Width of the birdhouse
  thickness: 2.0, // Wall thickness
  holeDiameter: 50.0, // Diameter of entrance hole
  hookHeight: 10.0, // Height of the hanging hook
  filletEdges: true, // Whether to add rounded edges
};

const { drawCircle, draw, makePlane } = replicad;

/**
 * Creates a parametric birdhouse with a triangular prism shape
 * @param _ - Unused parameter
 * @param params - Custom parameters to override defaults
 * @returns The complete birdhouse model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  const length = p.width;
  const width = p.width * 0.9;

  // Create triangular prism house shape
  let tobleroneShape = draw([-width / 2, 0])
    .lineTo([0, p.height])
    .lineTo([width / 2, 0])
    .close()
    .sketchOnPlane("XZ", -length / 2)
    .extrude(length)
    .shell(p.thickness, (f) => f.parallelTo("XZ")); // Shell to create hollow interior

  // Add fillets to edges if requested
  if (p.filletEdges) {
    tobleroneShape = tobleroneShape.fillet(p.thickness / 2, (e) =>
      e
        .inDirection("Y")
        .either([(f) => f.inPlane("XY"), (f) => f.inPlane("XY", p.height)])
    );
  }

  // Create entrance hole
  const hole = drawCircle(p.holeDiameter / 2)
    .sketchOnPlane(makePlane("YZ").translate([-length / 2, 0, p.height / 3]))
    .extrude(length);

  // Cut hole from house
  const base = tobleroneShape.cut(hole);
  // Create complete body by duplicating and rotating
  const body = base.clone().fuse(base.rotate(90));

  // Create hook for hanging
  const hookWidth = length / 2;
  const hook = draw([0, p.hookHeight / 2])
    .smoothSplineTo([p.hookHeight / 2, 0], -45)
    .lineTo([hookWidth / 2, 0])
    .line(-hookWidth / 4, p.hookHeight / 2)
    .smoothSplineTo([0, p.hookHeight], {
      endTangent: 180,
      endFactor: 0.6,
    })
    .closeWithMirror()
    .sketchOnPlane("XZ")
    .extrude(p.thickness)
    .translate([0, p.thickness / 2, p.height - p.thickness / 2]);

  return body.fuse(hook);
}
`;

export const drinkingGlassCode = `/**
 * Parametric Drinking Glass
 * A customizable glass with adjustable dimensions for height, radii, and thickness.
 */
const defaultParams = {
  height: 140.0, // Overall height of the glass in mm
  topRadius: 45.0, // Radius of the top opening in mm
  baseRadius: 80.0, // Radius of the base in mm
  wallThickness: 1.0, // Thickness of the glass walls and base in mm

  filletRim: true, // Whether to add a fillet to the rim
  rimFilletRadius: 1.0, // Radius for the rim fillet
  filletBase: true, // Whether to add a fillet to the outer base edge
  baseFilletRadius: 40, // Radius for the base fillet
};

const { draw, FaceFinder, EdgeFinder } = replicad;

/**
 * Creates a parametric drinking glass.
 * @param _ Unused Replicad API object
 * @param params Custom parameters to override defaults.
 * @returns The 3D model of the glass.
 */
function main(_, params) {
  const p = { ...defaultParams, ...params };

  // Validate parameters to prevent common issues
  if (p.topRadius <= 0) {
    console.warn("topRadius should be greater than 0 for a valid opening.");
    // Fallback to a minimum radius if invalid to avoid errors
    p.topRadius = Math.max(p.topRadius, p.wallThickness * 1.1); 
  }
  if (p.topRadius < p.wallThickness) {
    console.warn("topRadius is less than wallThickness, shelling may fail or produce unexpected results.");
  }
  if (p.baseRadius < 0) {
    console.warn("baseRadius cannot be negative. Setting to 0.");
    p.baseRadius = 0;
  }
  if (p.baseRadius < p.wallThickness && p.baseRadius > 0) {
    console.warn("baseRadius is less than wallThickness, shelling may produce unexpected results for the base.");
  }
  if (p.height <= 0) {
    console.warn("Height must be positive.");
    p.height = 10; // Fallback height
  }
  if (p.wallThickness <= 0) {
    console.warn("Wall thickness must be positive.");
    p.wallThickness = 0.5; // Fallback thickness
  }


  // Create the 2D profile for revolution.
  // The sketch is on the XZ plane, so points are [x, z].
  // The glass will be revolved around the Z-axis.
  const profile = draw([0, 0]) // Start at the center of the base
    .lineTo([p.baseRadius, 0]) // Outer edge of the base
    .lineTo([p.topRadius, p.height]) // Outer edge of the top rim
    .lineTo([0, p.height]) // Center of the top (this line forms the top surface to be removed by shell)
    .close(); // Close the profile by connecting back to [0,0]

  // Revolve the profile to create a solid shape.
  let glassSolid = profile
    .sketchOnPlane("XZ")
    .revolve();



  // Hollow out the glass using the shell operation.
  // We remove the top face to create the opening.
  try {
    glassSolid = glassSolid.shell(p.wallThickness, (f) =>
      f.inPlane("XY", p.height) // Find faces in the XY plane at the specified height
    );
  } catch (e) {
    console.error("Shell operation failed. This might be due to thickness or geometry constraints.", e);
    // Return the solid un-shelled shape if shelling fails
    return glassSolid;
  }

  // Apply fillet to the rim if enabled
  if (p.filletRim && p.rimFilletRadius > 0) {
    try {
      glassSolid = glassSolid.fillet(p.rimFilletRadius, (e) =>
        e.inPlane("XY", p.height) // Select edges on the top plane (inner and outer rim)
      );
    } catch (e) {
      console.warn("Rim fillet operation failed.", e);
    }
  }

  // Apply fillet to the base if enabled and baseRadius is positive
  if (p.baseRadius > 0 && p.filletBase && p.baseFilletRadius > 0) {
    try {
      glassSolid = glassSolid.fillet(p.baseFilletRadius, (e) =>
        e.inPlane("XY", p.wallThickness) // Select edges on the bottom plane
      ).fillet(p.baseFilletRadius, (e) =>
        e.inPlane("XY", 0) // Select edges on the bottom plane
      );
    } catch (e) {
      console.warn("Base fillet operation failed.", e);
    }
  }

  return glassSolid;
}
`;

export const trayCode = `const { makeSolid, makeFace, assembleWire, EdgeFinder, genericSweep, Plane } =
  replicad;

const defaultParams = {
  baseWidth: 30,
  baseDepth: 20,
  cornerRadius: 5,
  profileLine1X: 5,
  profileLine1Y: 5,
  profileLine2X: 2,
  profileLine2Y: 3,
  brimWidth: 2,
  brimHeight: 1,
  profileBulgeArcX: 0,
  profileBulgeArcY: 1,
  profileBulgeFactor: 0.2,
};

function profileBox(inputProfile, base) {
  const start = inputProfile.blueprint.firstPoint;
  const profile = inputProfile.translate(-start[0], -start[1]);

  const end = profile.blueprint.lastPoint;

  const baseSketch = base.sketchOnPlane();

  // We create the side of the box
  const side = baseSketch.clone().sweepSketch(
    (plane) => {
      return profile.sketchOnPlane(plane);
    },
    {
      withContact: true,
    }
  );

  // We put all the pieces together
  return makeSolid([
    side,
    // The face generated by sweeping the end of the profile
    makeFace(assembleWire(new EdgeFinder().inPlane("XY", end[1]).find(side))),
    // The face generated by the base
    baseSketch.face(),
  ]);
}

const { draw, drawRoundedRectangle } = replicad;

function main(
  r,
  {
    baseWidth,
    baseDepth,
    cornerRadius,
    profileLine1X,
    profileLine1Y,
    profileLine2X,
    profileLine2Y,
    brimWidth,
    brimHeight,
    profileBulgeArcX,
    profileBulgeArcY,
    profileBulgeFactor,
  } = defaultParams
) {
  const base = drawRoundedRectangle(baseWidth, baseDepth, cornerRadius);

  const profile = draw()
    .line(profileLine1X, profileLine1Y)
    .line(profileLine2X, profileLine2Y)
    .hLine(-brimWidth)
    .vLine(-brimHeight)
    .bulgeArcTo([profileBulgeArcX, profileBulgeArcY], profileBulgeFactor)
    .done();

  return profileBox(profile, base);
}`;

export const vaseCode = `const { draw } = replicad;

const defaultParams = {
  height: 100,
  baseWidth: 20,
  wallThickness: 5,
  lowerCircleRadius: 1.5,
  lowerCirclePosition: 0.25,
  higherCircleRadius: 0.75,
  higherCirclePosition: 0.75,
  topRadius: 0.9,
  topFillet: true,
  bottomHeavy: true,
};

const main = (
  r,
  {
    height,
    baseWidth,
    wallThickness,
    lowerCirclePosition,
    lowerCircleRadius,
    higherCircleRadius,
    higherCirclePosition,
    topRadius,
    topFillet,
    bottomHeavy,
  }
) => {
  const splinesConfig = [
    { position: lowerCirclePosition, radius: lowerCircleRadius },
    {
      position: higherCirclePosition,
      radius: higherCircleRadius,
      startFactor: bottomHeavy ? 3 : 1,
    },
    { position: 1, radius: topRadius, startFactor: bottomHeavy ? 3 : 1 },
  ];

  const sketchVaseProfile = draw().hLine(baseWidth);

  splinesConfig.forEach(({ position, radius, startFactor, endFactor }) => {
    sketchVaseProfile.smoothSplineTo([baseWidth * radius, height * position], {
      endTangent: [0, 1],
      startFactor,
      endFactor,
    });
  });

  let vase = sketchVaseProfile
    .lineTo([0, height])
    .close()
    .sketchOnPlane("XZ")
    .revolve();

  if (wallThickness) {
    vase = vase.shell(wallThickness, (f) => f.containsPoint([0, 0, height]));
  }

  if (topFillet) {
    vase = vase.fillet(wallThickness / 3, (e) => e.inPlane("XY", height));
  }

  return vase;
};
`;

export const wavyVase = `const { drawCircle, drawPolysides, polysideInnerRadius } = replicad;

const defaultParams = {
  height: 150,
  radius: 40,
  sidesCount: 12,
  sideRadius: -2,
  sideTwist: 6,
  endFactor: 1.5,
  topFillet: 0,
  bottomFillet: 5,

  holeMode: 1,
  wallThickness: 2,
};

const main = (
  r,
  {
    height,
    radius,
    sidesCount,
    sideRadius,
    sideTwist,
    endFactor,
    topFillet,
    bottomFillet,
    holeMode,
    wallThickness,
  }
) => {
  const extrusionProfile = endFactor
    ? { profile: "s-curve", endFactor }
    : undefined;
  const twistAngle = (360 / sidesCount) * sideTwist;

  let shape = drawPolysides(radius, sidesCount, -sideRadius)
    .sketchOnPlane()
    .extrude(height, {
      twistAngle,
      extrusionProfile,
    });

  if (bottomFillet) {
    shape = shape.fillet(bottomFillet, (e) => e.inPlane("XY"));
  }

  if (holeMode === 1 || holeMode === 2) {
    const holeHeight = height - wallThickness;

    let hole;
    if (holeMode === 1) {
      const insideRadius =
        polysideInnerRadius(radius, sidesCount, sideRadius) - wallThickness;

      hole = drawCircle(insideRadius).sketchOnPlane().extrude(holeHeight, {
        extrusionProfile,
      });

      shape = shape.cut(
        hole
          .fillet(
            Math.max(wallThickness / 3, bottomFillet - wallThickness),
            (e) => e.inPlane("XY")
          )
          .translate([0, 0, wallThickness])
      );
    } else if (holeMode === 2) {
      shape = shape.shell(wallThickness, (f) => f.inPlane("XY", height));
    }
  }

  if (topFillet) {
    shape = shape.fillet(topFillet, (e) => e.inPlane("XY", height));
  }
  return shape;
};
`;

export const cycloidalGear = `/**
 * Parametric Cycloidal Gear
 * A customizable gear using hypocycloid and epicycloid curves.
 */
const defaultParams = {
  height: 40, // Height of the gear
  r1: 12, // Primary radius
  r2: 1, // Secondary radius
  circleDiameter: 2, // Diameter of the center hole
  twistAngle: 90, // Angle of twist for extrusion
};

const { drawCircle, drawParametricFunction } = replicad;

/**
 * Creates a hypocycloid curve
 * @param t - Parameter value (angle)
 * @param r1 - Radius of fixed circle
 * @param r2 - Radius of rolling circle
 * @returns Coordinates [x, y] of point on curve
 */
function hypocycloid(t, r1, r2) {
  return [
    (r1 - r2) * Math.cos(t) + r2 * Math.cos((r1 / r2) * t - t),
    (r1 - r2) * Math.sin(t) + r2 * Math.sin(-((r1 / r2) * t - t)),
  ];
}

/**
 * Creates an epicycloid curve
 * @param t - Parameter value (angle)
 * @param r1 - Radius of fixed circle
 * @param r2 - Radius of rolling circle
 * @returns Coordinates [x, y] of point on curve
 */
function epicycloid(t, r1, r2) {
  return [
    (r1 + r2) * Math.cos(t) - r2 * Math.cos((r1 / r2) * t + t),
    (r1 + r2) * Math.sin(t) - r2 * Math.sin((r1 / r2) * t + t),
  ];
}

/**
 * Creates a combined gear profile using both curves
 * @param t - Parameter value (angle)
 * @param r1 - Primary radius
 * @param r2 - Secondary radius
 * @returns Coordinates [x, y] of point on curve
 */
function gear(t, r1 = defaultParams.r1, r2 = defaultParams.r2) {
  if ((-1) ** (1 + Math.floor((t / 2 / Math.PI) * (r1 / r2))) < 0)
    return epicycloid(t, r1, r2);
  else return hypocycloid(t, r1, r2);
}

/**
 * Creates a cycloidal gear with customizable parameters
 * @param _ - Unused parameter
 * @param params - Custom parameters to override defaults
 * @returns The complete gear model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
  // Create gear using parametric function
  const base = drawParametricFunction((t) => gear(2 * Math.PI * t, p.r1, p.r2))
    .sketchOnPlane()
    .extrude(p.height, { twistAngle: p.twistAngle });

  // Create center hole
  const hole = drawCircle(p.circleDiameter).sketchOnPlane().extrude(p.height);

  // Cut hole from gear
  return base.cut(hole);
}
`;

export const bottle = `const defaultParams = {
  width: 50,
  height: 70,
  thickness: 30,
};

const { draw, makeCylinder, makeOffset, FaceFinder } = replicad;

const main = (
  r,
  { width: myWidth, height: myHeight, thickness: myThickness }
) => {
  let shape = draw([-myWidth / 2, 0])
    .vLine(-myThickness / 4)
    .threePointsArc(myWidth, 0, myWidth / 2, -myThickness / 4)
    .vLine(myThickness / 4)
    .closeWithMirror()
    .sketchOnPlane()
    .extrude(myHeight)
    .fillet(myThickness / 12);

  const myNeckRadius = myThickness / 4;
  const myNeckHeight = myHeight / 10;
  const neck = makeCylinder(
    myNeckRadius,
    myNeckHeight,
    [0, 0, myHeight],
    [0, 0, 1]
  );

  shape = shape.fuse(neck);

  shape = shape.shell(myThickness / 50, (f) =>
    f.inPlane("XY", [0, 0, myHeight + myNeckHeight])
  );

  const neckFace = new FaceFinder()
    .containsPoint([0, myNeckRadius, myHeight])
    .ofSurfaceType("CYLINDRE")
    .find(shape.clone(), { unique: true });

  const bottomThreadFace = makeOffset(neckFace, -0.01 * myNeckRadius).faces[0];
  const baseThreadSketch = draw([0.75, 0.25])
    .halfEllipse(2, 0.5, 0.1)
    .close()
    .sketchOnFace(bottomThreadFace, "bounds");

  const topThreadFace = makeOffset(neckFace, 0.05 * myNeckRadius).faces[0];
  const topThreadSketch = draw([0.75, 0.25])
    .halfEllipse(2, 0.5, 0.05)
    .close()
    .sketchOnFace(topThreadFace, "bounds");

  const thread = baseThreadSketch.loftWith(topThreadSketch);

  return shape.fuse(thread);
};
`;

export const gridfinityBox = `/**
 * Parametric Gridfinity Box
 * A customizable storage box compatible with the Gridfinity system.
 */
const defaultParams = {
  xSize: 2, // Width in Gridfinity units
  ySize: 1, // Length in Gridfinity units
  height: 0.5, // Height in Gridfinity units
  withMagnet: false, // Include magnet holes
  withScrew: false, // Include screw holes
  magnetRadius: 3.25, // Radius of magnet holes
  magnetHeight: 2, // Depth of magnet holes
  screwRadius: 1.5, // Radius of screw holes
  keepFull: false, // Whether to keep box solid or hollow
  wallThickness: 1.2, // Wall thickness
};

const {
  draw,
  drawRoundedRectangle,
  drawCircle,
  makeSolid,
  assembleWire,
  makeFace,
  EdgeFinder,
} = replicad;

// Gridfinity magic numbers
const SIZE = 42.0;
const CLEARANCE = 0.5;
const AXIS_CLEARANCE = (CLEARANCE * Math.sqrt(2)) / 4;

const CORNER_RADIUS = 4;
const TOP_FILLET = 0.6;

const SOCKET_HEIGHT = 5;
const SOCKET_SMALL_TAPER = 0.8;
const SOCKET_BIG_TAPER = 2.4;
const SOCKET_VERTICAL_PART =
  SOCKET_HEIGHT - SOCKET_SMALL_TAPER - SOCKET_BIG_TAPER;
const SOCKET_TAPER_WIDTH = SOCKET_SMALL_TAPER + SOCKET_BIG_TAPER;

/**
 * Creates a socket profile for the Gridfinity base
 * @param _ - Unused parameter
 * @param startPoint - Start position for the profile
 * @returns The socket profile sketch
 */
function socketProfile(_, startPoint) {
  const full = draw([-CLEARANCE / 2, 0])
    .vLine(-CLEARANCE / 2)
    .lineTo([-SOCKET_BIG_TAPER, -SOCKET_BIG_TAPER])
    .vLine(-SOCKET_VERTICAL_PART)
    .line(-SOCKET_SMALL_TAPER, -SOCKET_SMALL_TAPER)
    .done()
    .translate(CLEARANCE / 2, 0);

  return full.sketchOnPlane("XZ", startPoint);
}

/**
 * Creates a socket for the Gridfinity base
 * @param options - Socket construction options
 * @returns The socket solid
 */
function buildSocket({
  magnetRadius = 3.25,
  magnetHeight = 2,
  screwRadius = 1.5,
  withScrew = true,
  withMagnet = true,
} = {}) {
  const baseSocket = drawRoundedRectangle(
    SIZE - CLEARANCE,
    SIZE - CLEARANCE,
    CORNER_RADIUS
  ).sketchOnPlane();

  const slotSide = baseSocket.sweepSketch(socketProfile, {
    withContact: true,
  });

  let slot = makeSolid([
    slotSide,
    makeFace(
      assembleWire(
        new EdgeFinder().inPlane("XY", -SOCKET_HEIGHT).find(slotSide)
      )
    ),
    makeFace(assembleWire(new EdgeFinder().inPlane("XY", 0).find(slotSide))),
  ]);

  if (withScrew || withMagnet) {
    const magnetCutout = withMagnet
      ? drawCircle(magnetRadius).sketchOnPlane().extrude(magnetHeight)
      : null;
    const screwCutout = withScrew
      ? drawCircle(screwRadius).sketchOnPlane().extrude(SOCKET_HEIGHT)
      : null;

    const cutout =
      magnetCutout && screwCutout
        ? magnetCutout.fuse(screwCutout)
        : magnetCutout || screwCutout;

    slot = slot
      .cut(cutout.clone().translate([-13, -13, -5]))
      .cut(cutout.clone().translate([-13, 13, -5]))
      .cut(cutout.clone().translate([13, 13, -5]))
      .cut(cutout.clone().translate([13, -13, -5]));
  }

  return slot;
}

/**
 * Creates an array with sequential numbers
 * @param i - Number of elements
 * @returns Array of sequential numbers
 */
function range(i) {
  return [...Array(i).keys()];
}

/**
 * Clones a shape in a grid pattern
 * @param shape - Shape to clone
 * @param options - Grid configuration options
 * @returns Array of cloned shapes with translations
 */
function cloneOnGrid(
  shape,
  { xSteps = 1, ySteps = 1, span = 10, xSpan = null, ySpan = null }
) {
  const xCorr = ((xSteps - 1) * (xSpan || span)) / 2;
  const yCorr = ((ySteps - 1) * (ySpan || xSpan || span)) / 2;

  const translations = range(xSteps).flatMap((i) => {
    return range(ySteps).map((j) => [i * SIZE - xCorr, j * SIZE - yCorr, 0]);
  });
  return translations.map((translation) =>
    shape.clone().translate(translation)
  );
}

/**
 * Creates the top shape for the Gridfinity box
 * @param options - Top shape configuration options
 * @returns The top shape solid
 */
function buildTopShape({
  xSize,
  ySize,
  includeLip = true,
  wallThickness = 1.2,
}) {
  const topShape = (basePlane, startPosition) => {
    const sketcher = draw([-SOCKET_TAPER_WIDTH, 0])
      .line(SOCKET_SMALL_TAPER, SOCKET_SMALL_TAPER)
      .vLine(SOCKET_VERTICAL_PART)
      .line(SOCKET_BIG_TAPER, SOCKET_BIG_TAPER);

    if (includeLip) {
      sketcher
        .vLineTo(-(SOCKET_TAPER_WIDTH + wallThickness))
        .lineTo([-SOCKET_TAPER_WIDTH, -wallThickness]);
    } else {
      sketcher.vLineTo(0);
    }

    const basicShape = sketcher.close();

    const shiftedShape = basicShape
      .translate(AXIS_CLEARANCE, -AXIS_CLEARANCE)
      .intersect(
        drawRoundedRectangle(10, 10).translate(-5, includeLip ? 0 : 5)
      );

    // We need to shave off the clearance
    let topProfile = shiftedShape
      .translate(CLEARANCE / 2, 0)
      .intersect(drawRoundedRectangle(10, 10).translate(-5, 0));

    if (includeLip) {
      // We remove the wall if we add a lip
      topProfile = topProfile.cut(
        drawRoundedRectangle(1.2, 10).translate(-0.6, -5)
      );
    }

    return topProfile.sketchOnPlane("XZ", startPosition);
  };

  const boxSketch = drawRoundedRectangle(
    xSize * SIZE - CLEARANCE,
    ySize * SIZE - CLEARANCE,
    CORNER_RADIUS
  ).sketchOnPlane();

  return boxSketch
    .sweepSketch(topShape, { withContact: true })
    .fillet(TOP_FILLET, (e) =>
      e.inBox(
        [-xSize * SIZE, -ySize * SIZE, SOCKET_HEIGHT],
        [xSize * SIZE, ySize * SIZE, SOCKET_HEIGHT - 1]
      )
    );
}

/**
 * Creates a Gridfinity-compatible storage box with customizable parameters
 * @param _ - Unused parameter
 * @param params - Custom parameters to override defaults
 * @returns The complete Gridfinity box model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
  const stdHeight = p.height * SIZE;

  let box = drawRoundedRectangle(
    p.xSize * SIZE - CLEARANCE,
    p.ySize * SIZE - CLEARANCE,
    CORNER_RADIUS
  )
    .sketchOnPlane()
    .extrude(stdHeight);

  if (!p.keepFull) {
    box = box.shell(p.wallThickness, (f) => f.inPlane("XY", stdHeight));
  }

  const top = buildTopShape({
    xSize: p.xSize,
    ySize: p.ySize,
    includeLip: !p.keepFull,
    wallThickness: p.wallThickness,
  }).translateZ(stdHeight);

  const socket = buildSocket({
    withMagnet: p.withMagnet,
    withScrew: p.withScrew,
    magnetRadius: p.magnetRadius,
    magnetHeight: p.magnetHeight,
    screwRadius: p.screwRadius,
  });

  let base = null;
  cloneOnGrid(socket, { xSteps: p.xSize, ySteps: p.ySize, span: SIZE }).forEach(
    (movedSocket) => {
      if (base) base = base.fuse(movedSocket, { optimisation: "commonFace" });
      else base = movedSocket;
    }
  );
  return base
    .fuse(box, { optimisation: "commonFace" })
    .fuse(top, { optimisation: "commonFace" });
}
`;

export const decoratedBox = `const { sketchRectangle, EdgeFinder, FaceFinder } = replicad;
import { addVoronoi, addGrid, addHoneycomb } from "https://cdn.jsdelivr.net/npm/replicad-decorate/dist/studio/replicad-decorate.js";

export const defaultParams = {
  height: 30,
  depth: 80,
  width: 120,
  filletRadius: 5,
  shellThickness: 2,
  decorationStyle: "voronoi",
  decorationMargin: 2,
  decorationPadding: 2,
  decorationRadius: 5,
  decorationCellCount: 20,
  decorationSeed: 5,
};

export const main = (r, { height, depth, width, filletRadius, shellThickness, decorationStyle, decorationMargin, decorationPadding, decorationRadius, decorationCellCount, decorationSeed }) => {
  let shape = sketchRectangle(depth, width)
    .extrude(height)
    .fillet({
      radius: filletRadius,
      filter: new EdgeFinder().inDirection("Z"),
    })
    .shell({
      thickness: shellThickness,
      filter: new FaceFinder().inPlane("XY", height),
    });

  const face = new FaceFinder().inPlane("XY", height)[0];

  const decorateParams = { faceIndex: 18, depth: -shellThickness, radius: decorationRadius, margin: decorationMargin, padding: decorationPadding, cellCount: decorationCellCount, seed: decorationSeed }

  if (decorationStyle === "voronoi") {
    shape = addVoronoi(shape, decorateParams);
  } else if (decorationStyle === "grid") {
    shape = addGrid(shape, decorateParams);
  } else if (decorationStyle === "honeycomb") {
    shape = addHoneycomb(shape, decorateParams);
  } else {
    shape = addHoneycomb(shape, decorateParams);
  }

  return shape;
};
`;

const cardHolderCode = `//home/lee/Code/lee/ScreenDoorHandle/main.rcad:1.1,58.1
// All measurements are in millimeters.

/** @typedef { typeof import("replicad") } replicadLib */
/** @type {function(replicadLib, typeof defaultParams): any} */

const defaultParams = {
};

const main = ({ Sketcher, sketchRectangle, sketchCircle, Plane, makeSphere,FaceFinder }, {}) => {
  const handleBase = new Sketcher("XY")
    .vLine(89.0)
    .hLine(20.5)
    .line( 57.0 - 20.5, -3.5)
    .vLine(-82.0)
    .line(-57.0 + 20.5, -3.5)
    .hLine(-20.5)
    .close()
    .extrude(9.0)
    .fillet(5.0, e => e.inDirection('Z').containsPoint([57, 3.5, 0]))
    .fillet(5.0, e => e.inDirection('Z').containsPoint([57, 89.0 - 3.5, 0]))
    .fillet(1.0, e => e.inBox([0,0,9], [20.5, 89.0, 0]))
   
  const border = 3.0;

  const fingerAreaNegative = new Sketcher("XY")
    .line( 57.0 - 20.5 - border, -3.5)
    .vLine(-82.0 + (border * 2))
    .line(-57.0 + 20.5 + border, -3.5)
    .close()
    .extrude(30.0)  // =RD= increased this to 30 mm as example
    .fillet(5.0, edgeFilter => edgeFilter.inDirection('Z'))
    .fillet(1.5);   // =RD= added a fillet here

  const lockNegative = sketchRectangle(25.0, 7.0)
    .extrude(20.0)
    .rotate(90, undefined, [1, 0, 0])
    .rotate(90, undefined, [0, 0, 1])
    .translate([0, 0, 3.5]);

  const lockSmallTabSpaceNegative = sketchRectangle(15.0, 5.0)
    .extrude(3.0)
    .rotate(90, undefined, [1, 0, 0])
    .rotate(90, undefined, [0, 0, 1])
    .translate([0, 0, 2.5]);

  const screwHole = sketchCircle(4.0, new Plane([0, 0, 0]))
    .loftWith([
      sketchCircle(1.5, new Plane([0, 0, -3.0])),
      sketchCircle(1.5, new Plane([0, 0, -9.0]))
    ])
    .translate([0.0, 0.0, 9.0]);

  const cutFingerArea = handleBase.cut(fingerAreaNegative.translate([20.5, 89 - border, 2.0]));
  const filletFingerArea = cutFingerArea.fillet(1.4) // Here
  // const filletFingerArea = cutFingerArea // Here
  const cutLock = filletFingerArea.cut(lockNegative.translate([2.0, 89.0 / 2, 0]));
  const cutLockTab = cutLock.cut(lockSmallTabSpaceNegative.translate([57 - 3, 89.0 / 2, 0]));
  const cutScrewHoleTop = cutLockTab.cut(screwHole.clone().translate([10.0, 6.0, 0.0]));
  const cutScrewHoleBottom = cutScrewHoleTop.cut(screwHole.translate([10.0, 89.0 - 6.0, 0.0]));
  
  const handle = cutScrewHoleBottom
 //  let marker = makeSphere(1).translate([57.0 - 20, 89 / 2, 2.0]);
 //  const handle = cutScrewHoleBottom.fuse(marker);
  return {shape: handle,  highlight: new FaceFinder().inPlane("XY", 9)};
}
`;

export const staircaseCode = `/**
 * Parametric Staircase Model
 * A customizable staircase with adjustable dimensions, stringers, handrails, and balusters.
 */
const { draw, drawRoundedRectangle, drawCircle } = replicad;

const defaultParams = {
  // Main staircase dimensions
  totalHeight: 2700, // mm - typical floor-to-floor height
  totalRun: 3600,    // mm - horizontal length of staircase
  width: 1200,       // mm - width of stairs
  numSteps: 15,      // number of steps
  
  // Step customization
  stepThickness: 50, // mm - thickness of each step
  nosing: 25,        // mm - step overhang
  roundedSteps: true, // whether to use rounded corners on steps
  cornerRadius: 10,  // mm - radius for rounded corners on steps
  
  // Stringer options
  includeStringers: true, // whether to include side stringers
  stringerWidth: 50, // mm - width of stringer boards
  stringerThickness: 25, // mm - thickness of stringer boards
  
  // Handrail options
  includeHandrails: true, // whether to include handrails
  handrailHeight: 900, // mm - height from step to top of handrail
  handrailDiameter: 60, // mm - diameter of handrail
  balusters: true, // whether to include vertical balusters
  balusterSpacing: 200, // mm - spacing between balusters
  balusterDiameter: 20, // mm - diameter of balusters
};

/**
 * Creates a single baluster at the specified position
 * @param x X coordinate of baluster
 * @param y Y coordinate of baluster
 * @param z Z coordinate of baluster
 * @param p Parameters object containing dimensions
 * @returns The baluster 3D shape
 */
function createBaluster(x, y, z, p) {
  return drawCircle(p.balusterDiameter / 2)
    .sketchOnPlane("XY")
    .extrude(p.handrailHeight)
    .translate([x, y, z]);
}

/**
 * Creates a handrail segment between two points
 * @param x1 Start X coordinate
 * @param y1 Start Y coordinate
 * @param z1 Start Z coordinate
 * @param x2 End X coordinate
 * @param y2 End Y coordinate
 * @param z2 End Z coordinate
 * @param p Parameters object containing dimensions
 * @returns The handrail segment 3D shape
 */
function createHandrailSegment(x1, y1, z1, x2, y2, z2, p) {
  // Calculate segment length and angles
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // Create basic cylinder
  const segment = drawCircle(p.handrailDiameter / 2)
    .sketchOnPlane("XY")
    .extrude(length);
  
  // If the segment is perfectly vertical, no rotation needed
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return segment.translate([x1, y1, z1]);
  }
  
  // Otherwise we need to rotate to align with the segment direction
  const angleX = 90 - Math.atan2(dz, Math.sqrt(dx * dx + dy * dy)) * (180 / Math.PI);
  
  return segment
    .rotate(angleX, [0, 1, 0], [0, 1, 0]) // Rotate around Y axis for X-Z angle
    .translate([x1, y1, z1]); // Move to start position
}

/**
 * Creates a parametric staircase model
 * @param _ Unused parameter (required by replicad)
 * @param params Custom parameters to override defaults
 * @returns The complete staircase model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
  // Calculate derived dimensions
  const stepRise = p.totalHeight / p.numSteps; // Height of each step
  const stepRun = p.totalRun / p.numSteps;     // Depth of each step
  
  // Validation of dimensions against typical building codes
  // Most codes require:
  // - Rise: 150-220mm (5.9-8.7")
  // - Run: minimum 240mm (9.5")
  // - 2R + T = 550-700mm (where R=rise, T=tread)
  if (stepRise < 150 || stepRise > 220) {
    console.warn(\`Warning: Step rise (\${stepRise.toFixed(1)}mm) outside recommended range (150-220mm)\`);
  }
  if (stepRun < 240) {
    console.warn(\`Warning: Step run (\${stepRun.toFixed(1)}mm) below recommended minimum (240mm)\`);
  }
  const walkingFormula = 2 * stepRise + stepRun;
  if (walkingFormula < 550 || walkingFormula > 700) {
    console.warn(\`Warning: Walking formula (2R + T = \${walkingFormula.toFixed(1)}mm) outside recommended range (550-700mm)\`);
  }
  
  // Build individual steps
  let staircase = null;
  
  for (let i = 0; i < p.numSteps; i++) {
    // Calculate step position
    const x = i * stepRun;
    const z = i * stepRise;
    
    // Create basic step shape
    let step;
    if (p.roundedSteps) {
      // For rounded rectangle, we need width, height, and corner radius
      step = drawRoundedRectangle(stepRun + p.nosing, p.width, p.cornerRadius)
        .sketchOnPlane("XY") // Steps are in XY plane
        .extrude(p.stepThickness) // Extrude to create 3D step
        .translate([x - p.nosing, 0, z]); // Position step
    } else {
      // For regular rectangle using draw
      step = draw([x - p.nosing, -p.width / 2])
        .hLine(stepRun + p.nosing) // Horizontal line to the right
        .vLine(p.width)            // Vertical line up
        .hLine(-(stepRun + p.nosing)) // Horizontal line to the left
        .close()
        .sketchOnPlane("XY")
        .extrude(p.stepThickness)
        .translate([-p.nosing, 0, z]);
    }
    
    // Add step to staircase
    if (staircase === null) {
      staircase = step;
    } else {
      staircase = staircase.fuse(step);
    }
  }
  
  // Add stringers if requested
  if (p.includeStringers) {
    // Create left stringer shape
    // First create the profile in XZ plane
    const leftStringerProfile = [];
    
    // Add points for the stringer profile
    leftStringerProfile.push([-p.nosing, 0]); // Bottom front
    leftStringerProfile.push([p.totalRun, 0]); // Bottom back
    leftStringerProfile.push([p.totalRun, p.totalHeight]); // Top back
    leftStringerProfile.push([p.totalRun - stepRun, p.totalHeight]); // Top step
    
        // Add sawtooth pattern for steps
    for (let i = p.numSteps - 1; i >= 0; i--) {
      leftStringerProfile.push([i * stepRun, i * stepRise + p.stepThickness]);
      leftStringerProfile.push([i * stepRun, i * stepRise]);
    }
    
    // Create the stringer profile using these points
    let leftStringerPen = draw(leftStringerProfile[0]);
    for (let i = 1; i < leftStringerProfile.length; i++) {
      leftStringerPen = leftStringerPen.lineTo(leftStringerProfile[i]);
    }
    
    // Create left stringer
    const leftStringerSketch = leftStringerPen.close().sketchOnPlane("XZ");
    const leftStringer = leftStringerSketch.extrude(p.stringerWidth)
      .translate([0, -p.width / 2 + p.stringerWidth, 0]);
    
    // Create right stringer
    const rightStringer = leftStringer.clone()
      .translate([0, p.width - p.stringerWidth, 0]);
    
    // Add stringers to staircase
    staircase = staircase.fuse(leftStringer).fuse(rightStringer);
  }
  
  // Add handrails if requested
  if (p.includeHandrails) {
    // Create handrails on both sides
    
    // Create left and right handrails
    let leftHandrail = null;
    let rightHandrail = null;
    
    // Left and right Y positions
    const leftY = -p.width / 2 + p.stringerWidth / 2;
    const rightY = p.width / 2 - p.stringerWidth / 2;
    
    // Create segments for each step section
    for (let i = 0; i < p.numSteps; i++) {
      const x1 = i * stepRun;
      const z1 = i * stepRise;
      const x2 = (i + 1) * stepRun;
      const z2 = (i + 1) * stepRise;
      
      // Create handrail segments with proper height offset
      const leftSegment = createHandrailSegment(
        x1, leftY, z1 + p.handrailHeight,
        x2, leftY, z2 + p.handrailHeight,
        p
      );
      
      const rightSegment = createHandrailSegment(
        x1, rightY, z1 + p.handrailHeight,
        x2, rightY, z2 + p.handrailHeight,
        p
      );
      
      // Add segments to respective handrails
      if (leftHandrail === null) {
        leftHandrail = leftSegment;
      } else {
        leftHandrail = leftHandrail.fuse(leftSegment);
      }
      
      if (rightHandrail === null) {
        rightHandrail = rightSegment;
      } else {
        rightHandrail = rightHandrail.fuse(rightSegment);
      }
      
      // Add balusters if requested
      if (p.balusters) {
        // Place balusters at start of each step
        const leftBaluster = createBaluster(x1, leftY, z1, p);
        const rightBaluster = createBaluster(x1, rightY, z1, p);
        
        staircase = staircase.fuse(leftBaluster).fuse(rightBaluster);
        
        // Add intermediate balusters if step is wide enough
        if (stepRun > p.balusterSpacing * 1.5) {
          const numIntermediateBalusters = Math.floor(stepRun / p.balusterSpacing) - 1;
          
          for (let j = 1; j <= numIntermediateBalusters; j++) {
            const balusterX = x1 + (j * stepRun) / (numIntermediateBalusters + 1);
            const balusterZ = z1 + (j * stepRise) / (numIntermediateBalusters + 1);
            
            const intermediateLeftBaluster = createBaluster(balusterX, leftY, balusterZ, p);
            const intermediateRightBaluster = createBaluster(balusterX, rightY, balusterZ, p);
            
            staircase = staircase
              .fuse(intermediateLeftBaluster)
              .fuse(intermediateRightBaluster);
          }
        }
      }
    }
    
    // Add final balusters at the top
    if (p.balusters) {
      const topLeftBaluster = createBaluster(p.totalRun, leftY, p.totalHeight, p);
      const topRightBaluster = createBaluster(p.totalRun, rightY, p.totalHeight, p);
      staircase = staircase.fuse(topLeftBaluster).fuse(topRightBaluster);
    }
    
    // Add handrails to staircase
    staircase = staircase.fuse(leftHandrail).fuse(rightHandrail);
  }
  
  return staircase;
}
`;

const tableCode = `/**
 * Parametric Table
 * A customizable table with adjustable dimensions, leg style options, and optional features.
 * Suitable for 3D printing, woodworking plans, or visualization.
 */
const defaultParams = {
  // Table dimensions
  width: 800,      // Width of the table in mm
  length: 1200,    // Length of the table in mm
  height: 750,     // Height of the table in mm
  
  // Table top
  topThickness: 25, // Thickness of the tabletop in mm
  roundedCorners: true, // Whether to create rounded corners on the tabletop
  cornerRadius: 50, // Radius for rounded corners (if enabled)
  
  // Legs
  legStyle: "square", // "square" or "round"
  legWidth: 50,      // Width/diameter of the legs in mm
  legInset: 25,      // Distance from edge to OUTER edge of leg
  
  // Apron (the frame under the tabletop)
  includeApron: true, // Whether to include an apron
  apronHeight: 80,    // Height of the apron in mm
  apronThickness: 20, // Thickness of the apron in mm
  
  // Additional features
  includeShelf: false, // Whether to include a lower shelf
  shelfHeight: 150,    // Height from floor to shelf in mm
  shelfThickness: 15,  // Thickness of the shelf in mm
  shelfInset: 50,      // Inset of shelf from edges
};

const { drawRoundedRectangle, drawCircle, draw } = replicad;

/**
 * Creates the tabletop of the table
 * @param p - Parameters for the table
 * @returns The tabletop 3D shape
 */
function createTabletop(p) {
  // Create tabletop at the exact final height
  if (p.roundedCorners) {
    return drawRoundedRectangle(p.width, p.length, p.cornerRadius)
      .sketchOnPlane()
      .extrude(p.topThickness)
      .translate([0, 0, p.height - p.topThickness]);
  } else {
    return draw([-p.width/2, -p.length/2])
      .hLine(p.width)
      .vLine(p.length)
      .hLine(-p.width)
      .close()
      .sketchOnPlane()
      .extrude(p.topThickness)
      .translate([0, 0, p.height - p.topThickness]);
  }
}

/**
 * Creates a single leg for the table
 * @param p - Parameters for the table
 * @param x - X position of the leg
 * @param y - Y position of the leg
 * @returns The leg 3D shape
 */
function createLeg(p, x, y) {
  // Start legs from Z=0 and extrude up to meet the apron
  const legHeight = p.height - p.topThickness;
    
  if (p.legStyle === "round") {
    return drawCircle(p.legWidth / 2)
      .sketchOnPlane()
      .extrude(legHeight)
      .translate([x, y, 0]);
  } else {
    return draw([x - p.legWidth/2, y - p.legWidth/2])
      .hLine(p.legWidth)
      .vLine(p.legWidth)
      .hLine(-p.legWidth)
      .close()
      .sketchOnPlane()
      .extrude(legHeight)
      .translate([0, 0, 0]);
  }
}

/**
 * Creates all four legs for the table
 * @param p - Parameters for the table
 * @returns The combined legs 3D shape
 */
function createLegs(p) {
  // Calculate leg positions - now include legWidth for proper inset
  // For each leg, position the center so the outer edge is exactly legInset from table edge
  const legXPos = p.width/2 - p.legInset - p.legWidth/2;
  const legYPos = p.length/2 - p.legInset - p.legWidth/2;
  
  // Create all four legs
  const leg1 = createLeg(p, -legXPos, -legYPos);
  const leg2 = createLeg(p, legXPos, -legYPos);
  const leg3 = createLeg(p, legXPos, legYPos);
  const leg4 = createLeg(p, -legXPos, legYPos);
  
  // Combine legs into a single shape
  return leg1.fuse(leg2).fuse(leg3).fuse(leg4);
}

/**
 * Creates the apron frame under the tabletop
 * @param p - Parameters for the table
 * @returns The apron 3D shape or null if apron is disabled
 */
function createApron(p) {
  if (!p.includeApron) {
    return null;
  }
  
  // Calculate leg positions
  const legXPos = p.width/2 - p.legInset - p.legWidth/2;
  const legYPos = p.length/2 - p.legInset - p.legWidth/2;
  
  // Position the apron to meet exactly with the bottom of the tabletop
  const apronZ = p.height - p.topThickness - p.apronHeight;
  
  // Calculate the positions of the leg corners that the apron should connect to
  const legHalfWidth = p.legWidth / 2;
  
  // Front apron (Y-) - extends from left leg to right leg
  const frontApron = draw([-legXPos - legHalfWidth, -legYPos - legHalfWidth])
    .hLine(2 * legXPos + p.legWidth)  // Full width between outer edges of legs
    .vLine(p.apronThickness)
    .hLine(-(2 * legXPos + p.legWidth))
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);
    
  // Back apron (Y+) - extends from left leg to right leg
  const backApron = draw([-legXPos - legHalfWidth, legYPos + legHalfWidth - p.apronThickness])
    .hLine(2 * legXPos + p.legWidth)
    .vLine(p.apronThickness)
    .hLine(-(2 * legXPos + p.legWidth))
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);
    
  // Left apron (X-) - extends from front leg to back leg
  const leftApron = draw([-legXPos - legHalfWidth, -legYPos - legHalfWidth + p.apronThickness])
    .hLine(p.apronThickness)
    .vLine(2 * legYPos + p.legWidth - p.apronThickness)
    .hLine(-p.apronThickness)
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);
    
  // Right apron (X+) - extends from front leg to back leg
  const rightApron = draw([legXPos + legHalfWidth - p.apronThickness, -legYPos - legHalfWidth + p.apronThickness])
    .hLine(p.apronThickness)
    .vLine(2 * legYPos + p.legWidth - p.apronThickness)
    .hLine(-p.apronThickness)
    .close()
    .sketchOnPlane()
    .extrude(p.apronHeight)
    .translate([0, 0, apronZ]);
  
  // Combine apron sides
  return frontApron.fuse(backApron).fuse(leftApron).fuse(rightApron);
}

/**
 * Creates an optional lower shelf for the table
 * @param p - Parameters for the table
 * @returns The shelf 3D shape or null if shelf is disabled
 */
function createShelf(p) {
  if (!p.includeShelf) {
    return null;
  }
  
  // Calculate shelf dimensions with inset
  const shelfWidth = p.width - 2 * p.shelfInset;
  const shelfLength = p.length - 2 * p.shelfInset;
  
  // Create the shelf shape at exact specified height
  if (p.roundedCorners) {
    const shelfRadius = Math.min(p.cornerRadius * 0.8, Math.min(shelfWidth, shelfLength) * 0.2);
    
    return drawRoundedRectangle(shelfWidth, shelfLength, shelfRadius)
      .sketchOnPlane()
      .extrude(p.shelfThickness)
      .translate([0, 0, p.shelfHeight]);
  } else {
    return draw([-shelfWidth/2, -shelfLength/2])
      .hLine(shelfWidth)
      .vLine(shelfLength)
      .hLine(-shelfWidth)
      .close()
      .sketchOnPlane()
      .extrude(p.shelfThickness)
      .translate([0, 0, p.shelfHeight]);
  }
}

/**
 * Creates a parametric table with customizable features
 * @param _ - Unused parameter (required by replicad)
 * @param params - Custom parameters to override defaults
 * @returns The complete table model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
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
}`;

const legoCode = `
/**
 * Parametric LEGO Brick
 * A simplified and more robust version with standard LEGO dimensions.
 * Features hollow bottom for connecting to other bricks.
 */

const defaultParams = {
  // Basic brick dimensions in LEGO units
  width: 2,       // Number of studs wide
  length: 4,      // Number of studs long
  height: 1,      // Height (1 = standard brick, 1/3 = plate)
  
  // Standard LEGO dimensions in mm
  studDiameter: 4.8,
  studHeight: 1.8,
  wallThickness: 1.5,    // Increased for better stability
  baseThickness: 1.2,    // Slightly thicker base
  
  // Tube dimensions
  tubeOuterDiameter: 6.5,
  tubeInnerDiameter: 4.8,
  tubeHeight: 8.0 - 1.2, // Full height minus base thickness
  
  // Base unit (1 LEGO unit = 8mm)
  unit: 8.0,
  
  // Features
  withTubes: true,      // Include bottom tubes
  rounded: false,       // Simplified version without rounds
};

const { 
  drawCircle, 
  drawRectangle,
  draw
} = replicad;

/**
 * Creates a single stud
 * @param p Parameters object
 * @returns The stud shape
 */
function createStud(p) {
  return drawCircle(p.studDiameter / 2)
    .sketchOnPlane()
    .extrude(p.studHeight);
}

/**
 * Creates a bottom tube (hollow cylinder)
 * @param p Parameters object
 * @returns The tube shape
 */
function createBottomTube(p) {
  const outer = drawCircle(p.tubeOuterDiameter / 2)
    .sketchOnPlane()
    .extrude(p.tubeHeight);
    
  const inner = drawCircle(p.tubeInnerDiameter / 2)
    .sketchOnPlane()
    .extrude(p.tubeHeight);
    
  return outer.cut(inner);
}

/**
 * Determines tube positions for any brick size
 * @param width Number of studs wide
 * @param length Number of studs long
 * @returns Array of [x,y] positions for tubes
 */
function calculateTubePositions(width, length) {
  const positions = [];
  
  if (width === 1) {
    // 1-wide bricks don't have tubes
    return positions;
  }
  
  // if (width === 2) {
  //   // 2-wide bricks have tubes only in center line
  //   const numTubes = length - 1;
  //   for (let i = 0; i < numTubes; i++) {
  //     positions.push([0, i - (numTubes - 1) / 2]);
  //   }
  //   return positions;
  // }
  
  // For wider bricks, create appropriate grid of tubes
  // Skip outer edges, place tubes in interior
  // For wider bricks, place tubes at intersection of 4 studs
  for (let x = 0; x < width - 1; x++) {
    for (let y = 0; y < length - 1; y++) {
      // Convert to centered coordinates and offset by 0.5 to place between studs
      const xPos = (x - (width - 2) / 2);
      const yPos = (y - (length - 2) / 2);
      positions.push([xPos, yPos]);
    }
  }
  
  return positions;
}

/**
 * Creates a LEGO brick with hollow bottom
 * @param _ Unused parameter
 * @param params Custom parameters
 * @returns The LEGO brick model
 */
function main(_, params) {
  // Merge parameters
  const p = { ...defaultParams, ...params };
  
  // Calculate dimensions
  const totalWidth = p.width * p.unit;
  const totalLength = p.length * p.unit;
  const totalHeight = p.height * p.unit;
  
  // Create main body
  const brickBody = drawRectangle(
    totalWidth,
    totalLength
  )
    .sketchOnPlane()
    .extrude(totalHeight);
  
  // Create bottom hollow
  const hollowWidth = totalWidth - 2 * p.wallThickness;
  const hollowLength = totalLength - 2 * p.wallThickness;
  const hollowHeight = totalHeight - p.baseThickness;
  
  const bottomHollow = drawRectangle(
    hollowWidth,
    hollowLength
  )
    .sketchOnPlane()
    .extrude(hollowHeight);
  
  // Start building the brick
  let brick = brickBody;
  
  // Add studs
  for (let x = 0; x < p.width; x++) {
    for (let y = 0; y < p.length; y++) {
      const xPos = (x - (p.width - 1) / 2) * p.unit;
      const yPos = (y - (p.length - 1) / 2) * p.unit;
      
      const stud = createStud(p).translate([xPos, yPos, totalHeight]);
      brick = brick.fuse(stud);
    }
  }
  
  // Cut out the bottom hollow
  brick = brick.cut(
    bottomHollow.translate([0, 0, 0])
  );
  
  // Add bottom tubes
  if (p.withTubes) {
    const tubePositions = calculateTubePositions(p.width, p.length);
    
    for (const [x, y] of tubePositions) {
      const xPos = x * p.unit;
      const yPos = y * p.unit;
      
      const tube = createBottomTube(p).translate([xPos, yPos, 0]);
      brick = brick.fuse(tube);
    }
  }
  
  return brick;
}
`;

const simpleTrayCode = `
/**
 * Parametric Storage Tray/Drawer Organizer
 * A customizable storage solution with adjustable compartments.
 * Designed for reliable 3D printing with proper tolerances.
 */

const { draw, drawRoundedRectangle } = replicad;

const defaultParams = {
  // Overall dimensions
  width: 200,         // mm - total width of the tray
  length: 300,        // mm - total height of the tray
  height: 50,         // mm - total depth of the tray
  
  // Compartment configuration
  numRows: 4,         // number of rows
  numCols: 3,         // number of columns
  
  // Construction parameters
  wallThickness: 2,   // mm - thickness of walls (minimum 1.2mm recommended)
  baseThickness: 1.5, // mm - thickness of the base
  cornerRadius: 4,    // mm - radius for outer corners
  
  // Features
  includeFillet: true, // whether to fillet edges
  filletRadius: 0.8   // mm - radius for fillets (keep small for stability)
};

/**
 * Creates the main storage tray with compartments
 * @param {*} _ Unused parameter (required by replicad)
 * @param {Object} params Custom parameters to override defaults
 * @returns {Shape} The complete storage tray model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };
  
  try {
    // Validate parameters
    if (p.width < 20 || p.length < 20 || p.height < 10) {
      throw new Error("Dimensions too small - minimum size is 20x20x10mm");
    }
    if (p.wallThickness < 1.2) {
      throw new Error("Wall thickness too small - minimum 1.2mm recommended");
    }
    if (p.numRows < 1 || p.numCols < 1) {
      throw new Error("Must have at least 1 row and 1 column");
    }

    // Calculate internal dimensions
    const innerWidth = p.width - (2 * p.wallThickness);
    const innerLength = p.length - (2 * p.wallThickness);
    
    // Create base outer shell
    let tray = drawRoundedRectangle(p.width, p.length, p.cornerRadius)
      .sketchOnPlane()
      .extrude(p.height);
    
    // Create inner cavity
    const innerShell = drawRoundedRectangle(
      innerWidth,
      innerLength,
      Math.max(p.cornerRadius - p.wallThickness, 1)
    )
      .sketchOnPlane()
      .extrude(p.height - p.baseThickness)
      .translate([0, 0, p.baseThickness]);
    
    // Cut inner cavity from outer shell
    tray = tray.cut(innerShell);
    
    // Calculate compartment sizes
    const compartmentWidth = innerWidth / p.numCols;
    const compartmentLength = innerLength / p.numRows;
    
    // Create dividers as separate shapes then combine
    let dividers = null;
    
    // Vertical dividers (columns)
    for (let i = 1; i < p.numCols; i++) {
      const x = (i * compartmentWidth) - (innerWidth / 2);
      const divider = drawRoundedRectangle(
        p.wallThickness,
        innerLength,
        0
      )
        .sketchOnPlane()
        .extrude(p.height - p.baseThickness)
        .translate([x, 0, p.baseThickness]);
      
      dividers = dividers ? dividers.fuse(divider) : divider;
    }
    
    // Horizontal dividers (rows)
    for (let i = 1; i < p.numRows; i++) {
      const y = (i * compartmentLength) - (innerLength / 2);
      const divider = drawRoundedRectangle(
        innerWidth,
        p.wallThickness,
        0
      )
        .sketchOnPlane()
        .extrude(p.height - p.baseThickness)
        .translate([0, y, p.baseThickness]);
      
      dividers = dividers ? dividers.fuse(divider) : divider;
    }
    
    // Add dividers to main tray
    if (dividers) {
      tray = tray.fuse(dividers);
    }
    
    // Add fillets if requested
    if (p.includeFillet && p.filletRadius > 0) {
      try {
        // Only fillet the top edges
        tray = tray.fillet(p.filletRadius, (e) => 
          e.inBox(
            [-p.width, -p.length, p.height - 0.1],
            [p.width, p.length, p.height + 0.1]
          )
        );
      } catch (filletError) {
        console.warn("Failed to create fillets - continuing without them");
      }
    }
    
    return tray;
    
  } catch (error) {
    console.error("Error creating tray:", error.message);
    // Return a simple cube as fallback
    return drawRoundedRectangle(50, 50, 2)
      .sketchOnPlane()
      .extrude(20);
  }
}
`;

const hexScrewdriverCode = `/**
 * Parametric M5 Allen Key Screwdriver
 * A customizable M5 Allen key screwdriver with adjustable hexagonal handle and shaft dimensions.
 */
const defaultParams = {
  handleLength: 100, // Length of the handle in mm
  handleSize: 20, // Size of the hexagonal handle in mm
  shaftLength: 75, // Length of the shaft in mm
  shaftDiameter: 5, // Diameter of the shaft in mm
  hexSize: 5, // Size of the hexagonal tip in mm (M5)
  hexLength: 10, // Length of the tip in mm
  filletRadius: 2, // Radius for filleting edges
};

const { drawCircle, drawPolysides } = replicad;

/**
 * Creates a parametric M5 Allen key screwdriver
 * @param _ Unused parameter (required by replicad)
 * @param params Custom parameters to override defaults
 * @returns The complete screwdriver model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };

  // Create hexagonal handle
  let handle = drawPolysides(p.handleSize / 2, 6)
    .sketchOnPlane()
    .extrude(p.handleLength);

  // Apply fillet to the edges of the handle
  handle = handle.fillet(p.filletRadius);

  // Create shaft
  const shaft = drawCircle(p.shaftDiameter / 2)
    .sketchOnPlane()
    .extrude(p.shaftLength)
    .translate([0, 0, p.handleLength]);

  // Create hexagonal tip
  const hexTip = drawPolysides(p.hexSize / 2, 6)
    .sketchOnPlane()
    .extrude(p.hexLength)
    .translate([0, 0, p.handleLength + p.shaftLength]);

  // Combine handle, shaft, and hex tip
  return handle.fuse(shaft).fuse(hexTip);
}
`;

const chairCode = `/**
 * Parametric Chair Model
 * A customizable chair with adjustable dimensions.
 */
const { drawRectangle, drawCircle, EdgeFinder } = replicad;

const defaultParams = {
  // Overall dimensions
  seatWidth: 450,    // mm - Width of the seat
  seatDepth: 420,    // mm - Depth of the seat
  seatHeight: 460,   // mm - Height from floor to top of seat

  // Component thicknesses
  seatThickness: 20, // mm - Thickness of the seat plate
  legThickness: 40,  // mm - Thickness of the square legs
  backrestHeight: 500, // mm - Height of the backrest from the seat
  backrestThickness: 20, // mm - Thickness of the backrest

  // Design details
  backrestAngle: 10, // degrees - Angle of the backrest from vertical (positive leans back)
  filletRadius: 5,   // mm - Radius for filleting edges (0 for sharp edges)
};

/**
 * Creates a parametric chair model
 * @param _ Unused parameter (required by replicad)
 * @param params Custom parameters to override defaults
 * @returns The complete chair model
 */
function main(_, params) {
  // Merge default parameters with provided ones
  const p = { ...defaultParams, ...params };

  // --- Create Seat ---
  const seat = drawRectangle(p.seatWidth, p.seatDepth)
    .sketchOnPlane("XY")
    .extrude(p.seatThickness)
    .translateZ(p.seatHeight - p.seatThickness); // Position seat top at seatHeight

  // --- Create Legs ---
  const legProfile = drawRectangle(p.legThickness, p.legThickness).sketchOnPlane("XY");
  const legHeight = p.seatHeight - p.seatThickness;
  const singleLeg = legProfile.extrude(legHeight);

  // Calculate leg positions relative to seat center
  const legOffsetX = p.seatWidth / 2 - p.legThickness / 2;
  const legOffsetY = p.seatDepth / 2 - p.legThickness / 2;

  // Create four legs by cloning and translating
  const legFL = singleLeg.clone().translate([-legOffsetX, legOffsetY, 0]); // Front Left
  const legFR = singleLeg.clone().translate([legOffsetX, legOffsetY, 0]);  // Front Right
  const legBL = singleLeg.clone().translate([-legOffsetX, -legOffsetY, 0]); // Back Left
  const legBR = singleLeg.clone().translate([legOffsetX, -legOffsetY, 0]); // Back Right

  // --- Create Backrest ---
  const angleRadians = p.backrestAngle * Math.PI / 180;
  const zOffset = p.backrestThickness * Math.sin(angleRadians);
  // Create backrest vertically first, starting at the seat top
  const backrestStartZ = p.seatHeight + p.backrestHeight/2 - zOffset-5;
  let backrest  = drawRectangle(p.seatWidth, p.backrestHeight)
    .sketchOnPlane("XZ") // Sketch in XZ plane for vertical orientation
    .extrude(p.backrestThickness)
    // Position it at the back edge of the seat, centered, thickness protruding backwards
    // The Z position is exactly at the seat height (top of seat)
    .translate([0, -p.seatDepth / 2 + p.backrestThickness, backrestStartZ]); 

  // Apply backrest angle if specified
  if (p.backrestAngle !== 0) {
    // Rotation axis is along the bottom edge of the backrest at the seat height
    const rotationAxisOrigin = [0, -p.seatDepth / 2, p.seatHeight];
    const rotationAxisDirection = [1, 0, 0]; // Rotate around X-axis
    backrest = backrest.rotate(p.backrestAngle, rotationAxisOrigin, rotationAxisDirection);
  }

  // --- Assemble Chair ---
  let chair = seat
    .fuse(legFL)
    .fuse(legFR)
    .fuse(legBL)
    .fuse(legBR)
    .fuse(backrest);

  // --- Apply Fillets (Optional) ---
  if (p.filletRadius > 0) {
    // Example: Fillet top edges of the seat and front/top edges of backrest
    // More specific filtering might be needed for a production model
    try {
       chair = chair.fillet(p.filletRadius, (e) => e
         .either([
           (f) => f.inPlane("XY", p.seatHeight), // Top surface edges of seat
           (f) => f.containsPoint([0, -p.seatDepth / 2, p.seatHeight + p.backrestHeight * 0.9]) // Edges near top of backrest
         ])
       );
    } catch (error) {
        console.warn("Filleting failed, returning shape without fillets:", error);
    }
  }

  return chair;
}
`;

export const mockModels = [
  {
    id: 'bld_birdhouse',
    name: 'Birdhouse',
    code: birdhouseCode,
  },
  {
    id: 'bld_hollow_box',
    name: 'Hollow Box',
    code: hollowBoxCode,
  },
  {
    id: 'bld_tray',
    name: 'Tray',
    code: trayCode,
  },
  {
    id: 'bld_drinking_glass',
    name: 'Drinking Glass',
    code: drinkingGlassCode,
  },
  {
    id: 'bld_vase',
    name: 'Vase',
    code: vaseCode,
  },
  {
    id: 'bld_wavy_vase',
    name: 'Wavy Vase',
    code: wavyVase,
  },
  {
    id: 'bld_cylindrical_gear',
    name: 'Cycloidal Gear',
    code: cycloidalGear,
  },
  {
    id: 'bld_bottle',
    name: 'Bottle',
    code: bottle,
  },
  {
    id: 'bld_gridfinity_box',
    name: 'Gridfinity Box',
    code: gridfinityBox,
  },
  {
    id: 'bld_decorated_box',
    name: 'Decorated Box',
    code: decoratedBox,
  },
  {
    id: 'bld_card_holder',
    name: 'Card Holder',
    code: cardHolderCode,
  },
  {
    id: 'bld_staircase',
    name: 'Staircase',
    code: staircaseCode,
  },
  {
    id: 'bld_table',
    name: 'Table',
    code: tableCode,
  },
  {
    id: 'bld_lego',
    name: 'Lego',
    code: legoCode,
  },
  {
    id: 'bld_simple_tray',
    name: 'Simple Tray',
    code: simpleTrayCode,
  },
  {
    id: 'bld_hex_screwdriver',
    name: 'Hex Screwdriver',
    code: hexScrewdriverCode,
  },
  {
    id: 'bld_chair',
    name: 'Chair',
    code: chairCode,
  },
] satisfies Model[];
