/* eslint-disable max-lines -- mocks */
type Model = {
  id: string;
  name: string;
  code: string;
  thumbnail: string;
};

export const emptyCode = `function main(_, params) {}
`;

export const cubeCode = `/**
 * Parametric Cube with Filleted Edges
 * A simple cube with adjustable dimensions and rounded edges.
 */
const { sketchRectangle, EdgeFinder, makePlane } = replicad;

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
  let shape = sketchRectangle(p.length, p.length, makePlane("XY"))
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
  _,
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
  _,
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
  _,
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

export const decoratedBox = `/**
 * Decorated Box Model
 * A customizable box with decorative patterns.
 */
const { sketchRectangle, EdgeFinder, FaceFinder, makePlane } = replicad;
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

export const main = (_, { height, depth, width, filletRadius, shellThickness, decorationStyle, decorationMargin, decorationPadding, decorationRadius, decorationCellCount, decorationSeed }) => {
  let shape = sketchRectangle(depth, width, makePlane("XY"))
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

const cardHolderCode = `/**
 * Card Holder Model
 * A customizable card holder with a handle and a lock.
 */
const { Sketcher, sketchRectangle, sketchCircle, Plane, makeSphere, FaceFinder, makePlane } = replicad;

const defaultParams = {
};

const main = (_, params) => {
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

  const lockNegative = sketchRectangle(25.0, 7.0, makePlane("XY"))
    .extrude(20.0)
    .rotate(90, undefined, [1, 0, 0])
    .rotate(90, undefined, [0, 0, 1])
    .translate([0, 0, 3.5]);

  const lockSmallTabSpaceNegative = sketchRectangle(15.0, 5.0, makePlane("XY"))
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
  staircaseHeight: 2700, // mm - typical floor-to-floor height
  staircaseRun: 3600,    // mm - horizontal length of staircase
  staircaseWidth: 1200,       // mm - width of stairs
  stepCount: 15,      // number of steps
  
  // Step customization
  stepThickness: 50, // mm - thickness of each step
  stepNosing: 25,        // mm - step overhang
  roundedStep: true, // whether to use rounded corners on steps
  stepCornerRadius: 10,  // mm - radius for rounded corners on steps
  
  // Stringer options
  includeStringer: true, // whether to include side stringers
  stringerWidth: 50, // mm - width of stringer boards
  stringerThickness: 25, // mm - thickness of stringer boards
  
  // Handrail options
  includeHandrail: true, // whether to include handrails
  handrailHeight: 900, // mm - height from step to top of handrail
  handrailDiameter: 60, // mm - diameter of handrail
  includeBaluster: true, // whether to include vertical balusters
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
  const stepRise = p.staircaseHeight / p.stepCount; // Height of each step
  const stepRun = p.staircaseRun / p.stepCount;     // Depth of each step
  
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
  
  for (let i = 0; i < p.stepCount; i++) {
    // Calculate step position
    const x = i * stepRun;
    const z = i * stepRise;
    
    // Create basic step shape
    let step;
    if (p.roundedStep) {
      // For rounded rectangle, we need width, height, and corner radius
      step = drawRoundedRectangle(stepRun + p.stepNosing, p.staircaseWidth, p.stepCornerRadius)
        .sketchOnPlane("XY") // Steps are in XY plane
        .extrude(p.stepThickness) // Extrude to create 3D step
        .translate([x - p.stepNosing, 0, z]); // Position step
    } else {
      // For regular rectangle using draw
      step = draw([x - p.stepNosing, -p.staircaseWidth / 2])
        .hLine(stepRun + p.stepNosing) // Horizontal line to the right
        .vLine(p.staircaseWidth)            // Vertical line up
        .hLine(-(stepRun + p.stepNosing)) // Horizontal line to the left
        .close()
        .sketchOnPlane("XY")
        .extrude(p.stepThickness)
        .translate([-p.stepNosing, 0, z]);
    }
    
    // Add step to staircase
    if (staircase === null) {
      staircase = step;
    } else {
      staircase = staircase.fuse(step);
    }
  }
  
  // Add stringers if requested
  if (p.includeStringer) {
    // Create left stringer shape
    // First create the profile in XZ plane
    const leftStringerProfile = [];
    
    // Add points for the stringer profile
    leftStringerProfile.push([-p.stepNosing, 0]); // Bottom front
    leftStringerProfile.push([p.staircaseRun, 0]); // Bottom back
    leftStringerProfile.push([p.staircaseRun, p.staircaseHeight]); // Top back
    leftStringerProfile.push([p.staircaseRun - stepRun, p.staircaseHeight]); // Top step
    
        // Add sawtooth pattern for steps
    for (let i = p.stepCount - 1; i >= 0; i--) {
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
      .translate([0, -p.staircaseWidth / 2 + p.stringerWidth, 0]);
    
    // Create right stringer
    const rightStringer = leftStringer.clone()
      .translate([0, p.staircaseWidth - p.stringerWidth, 0]);
    
    // Add stringers to staircase
    staircase = staircase.fuse(leftStringer).fuse(rightStringer);
  }
  
  // Add handrails if requested
  if (p.includeHandrail) {
    // Create handrails on both sides
    
    // Create left and right handrails
    let leftHandrail = null;
    let rightHandrail = null;
    
    // Left and right Y positions
    const leftY = -p.staircaseWidth / 2 + p.stringerWidth / 2;
    const rightY = p.staircaseWidth / 2 - p.stringerWidth / 2;
    
    // Create segments for each step section
    for (let i = 0; i < p.stepCount; i++) {
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
      if (p.includeBaluster) {
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
      const topLeftBaluster = createBaluster(p.staircaseRun, leftY, p.staircaseHeight, p);
      const topRightBaluster = createBaluster(p.staircaseRun, rightY, p.staircaseHeight, p);
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

const potPlantCode = `/**
 * Parametric Pot Plant Holder
 * A customizable pot plant holder with an optional attached saucer and drainage holes.
 */
const defaultParams = {
  potInnerDiameter: 100,    // mm - Inner diameter for the plant pot
  potInnerHeight: 90,       // mm - Inner height for the plant pot
  wallThickness: 3,         // mm - Wall thickness of the pot holder
  baseThickness: 5,         // mm - Base thickness of the pot holder

  includeSaucer: true,      // boolean - Whether to include an attached saucer
  saucerLipHeight: 15,      // mm - Height of the saucer's lip from its base plate
  saucerBaseThickness: 3,   // mm - Thickness of the saucer's base plate
  saucerWallThickness: 3,   // mm - Wall thickness of the saucer's lip
  saucerGap: 5,             // mm - Gap between pot holder outer wall and saucer inner lip

  addDrainageHoles: true,   // boolean - Whether to add drainage holes to the pot holder
  drainageHoleDiameter: 8,  // mm - Diameter of each drainage hole
  drainageHoleCount: 5,     // integer - Number of drainage holes (if 1 and offset 0, it's a center hole)
  drainageHoleOffset: 20,   // mm - Radial distance of drainage holes from the center of the pot base

  filletOuterRim: true,     // boolean - Fillet the top outer rim of the pot holder
  filletInnerRim: true,     // boolean - Fillet the top inner rim of the pot holder
  filletOuterBase: true,    // boolean - Fillet the outer base of the pot holder (or saucer if present)
  filletSaucerRim: true,    // boolean - Fillet the top rim of the saucer (if present)
  filletRadius: 1.5,        // mm - General radius for fillets (should be less than wallThickness)
};

const { drawCircle, EdgeFinder, Vector } = replicad;

function main(_, params) {
  const p = { ...defaultParams, ...params };

  // Validate parameters
  if (p.filletRadius >= p.wallThickness || (p.includeSaucer && p.filletRadius >= p.saucerWallThickness)) {
    console.warn("Fillet radius might be too large compared to wall thickness, potentially causing issues.");
  }
  if (p.potInnerDiameter <= 0 || p.potInnerHeight <=0 || p.wallThickness <=0 || p.baseThickness <=0) {
    throw new Error("Pot dimensions and thicknesses must be positive.");
  }
  if (p.includeSaucer && (p.saucerLipHeight <=0 || p.saucerBaseThickness <=0 || p.saucerWallThickness <=0 || p.saucerGap < 0)) {
    throw new Error("Saucer dimensions and thicknesses must be positive, and gap non-negative.");
  }

  // Helper for fillet selection: checks if an edge in an XY plane is close to an expected radius from the Z-axis
  const isCloseToRadiusInXYPlane = (edge, expectedRadius, tolerance) => {
    if (!edge || typeof edge.pointAt !== 'function') return false;
    const midPoint = edge.pointAt(0.5); // Gets a Vector point on the edge
    if (!midPoint) return false;
    const R = Math.sqrt(midPoint.x**2 + midPoint.y**2); // Radial distance from Z-axis
    return Math.abs(R - expectedRadius) < tolerance;
  };
  const filletTolerance = p.wallThickness * 0.2; // Tolerance for matching edge radius

  // --- Pot Holder --- 
  // (Base of the pot holder part is initially at Z=0)
  const potOuterRadius = p.potInnerDiameter / 2 + p.wallThickness;
  const potPartTotalHeight = p.potInnerHeight + p.baseThickness;

  let potHolderShape = drawCircle(potOuterRadius)
    .sketchOnPlane("XY")
    .extrude(potPartTotalHeight);

  const potCavity = drawCircle(p.potInnerDiameter / 2)
    .sketchOnPlane("XY")
    .extrude(p.potInnerHeight)
    .translateZ(p.baseThickness); // Cavity starts above the pot's base thickness

  potHolderShape = potHolderShape.cut(potCavity);

  // --- Drainage Holes for Pot Holder --- 
  if (p.addDrainageHoles && p.drainageHoleCount > 0 && p.drainageHoleDiameter > 0) {
    const holeRadius = p.drainageHoleDiameter / 2;
    if (p.drainageHoleCount === 1 && p.drainageHoleOffset === 0) {
      // Single center hole
      if (holeRadius < p.potInnerDiameter / 2) {
         const holeCylinder = drawCircle(holeRadius)
          .sketchOnPlane("XY")
          .extrude(p.baseThickness); // Extrude through pot base
        potHolderShape = potHolderShape.cut(holeCylinder);
      }
    } else {
      // Peripheral holes
      for (let i = 0; i < p.drainageHoleCount; i++) {
        const angle = (2 * Math.PI / p.drainageHoleCount) * i;
        // Ensure holes are within the inner diameter of the pot base
        if (p.drainageHoleOffset + holeRadius < p.potInnerDiameter / 2 && p.drainageHoleOffset >=0) {
          const x = p.drainageHoleOffset * Math.cos(angle);
          const y = p.drainageHoleOffset * Math.sin(angle);
          const holeCylinder = drawCircle(holeRadius)
            .sketchOnPlane("XY")
            .extrude(p.baseThickness) 
            .translate([x, y, 0]);
          potHolderShape = potHolderShape.cut(holeCylinder);
        } else if (p.drainageHoleOffset > 0) {
          console.warn("Drainage hole configuration invalid (offset too large or negative), skipping a peripheral hole.");
        }
      }
      // Optional: Add a central hole if there are peripheral holes and offset is not zero
      if (p.drainageHoleOffset > 0 && holeRadius < p.potInnerDiameter / 2) {
        const centerHole = drawCircle(Math.min(holeRadius, p.potInnerDiameter / 4)) // Smaller center hole
            .sketchOnPlane("XY")
            .extrude(p.baseThickness);
        potHolderShape = potHolderShape.cut(centerHole);
      }
    }
  }

  let finalShape = potHolderShape;
  let potHolderZOffset = 0;

  // --- Saucer --- (Optional)
  if (p.includeSaucer) {
    const potHolderOuterDiameter = p.potInnerDiameter + 2 * p.wallThickness;
    const saucerInnerDiameter = potHolderOuterDiameter + 2 * p.saucerGap;
    const saucerOuterDiameter = saucerInnerDiameter + 2 * p.saucerWallThickness;
    const saucerOuterRadius = saucerOuterDiameter / 2;

    // Saucer Base Plate (at Z=0 initially)
    const saucerBasePlate = drawCircle(saucerOuterRadius)
        .sketchOnPlane("XY")
        .extrude(p.saucerBaseThickness);

    // Saucer Lip (ring on top of base plate)
    const saucerLipOuterShape = drawCircle(saucerOuterRadius)
        .sketchOnPlane("XY")
        .extrude(p.saucerLipHeight)
        .translateZ(p.saucerBaseThickness);
    const saucerLipInnerCutShape = drawCircle(saucerInnerDiameter / 2)
        .sketchOnPlane("XY")
        .extrude(p.saucerLipHeight)
        .translateZ(p.saucerBaseThickness);
    const saucerLip = saucerLipOuterShape.cut(saucerLipInnerCutShape);

    const completeSaucer = saucerBasePlate.fuse(saucerLip);

    // Pot holder sits on top of the saucer's base plate
    potHolderZOffset = p.saucerBaseThickness;
    const translatedPotHolder = potHolderShape.clone().translateZ(potHolderZOffset);
    finalShape = completeSaucer.fuse(translatedPotHolder);
  }

  // --- Fillets --- (Applied to the final assembled shape)
  if (p.filletRadius > 0) {
    try {
      // Top outer rim of pot holder
      if (p.filletOuterRim) {
        const potTopZ = potHolderZOffset + p.potInnerHeight + p.baseThickness;
        const expectedR = p.potInnerDiameter / 2 + p.wallThickness;
        finalShape = finalShape.fillet(p.filletRadius, 
          e => e.inPlane("XY", potTopZ) && isCloseToRadiusInXYPlane(e, expectedR, filletTolerance)
        );
      }
      // Top inner rim of pot holder
      if (p.filletInnerRim) {
        const potTopZ = potHolderZOffset + p.potInnerHeight + p.baseThickness;
        const expectedR = p.potInnerDiameter / 2;
         finalShape = finalShape.fillet(p.filletRadius, 
          e => e.inPlane("XY", potTopZ) && isCloseToRadiusInXYPlane(e, expectedR, filletTolerance)
        );
      }

      if (p.includeSaucer) {
        // Saucer top outer rim
        if (p.filletSaucerRim) {
          const saucerLipTopZ = p.saucerBaseThickness + p.saucerLipHeight;
          const expectedOuterR = (p.potInnerDiameter + 2 * p.wallThickness + 2 * p.saucerGap + 2 * p.saucerWallThickness) / 2;
          finalShape = finalShape.fillet(p.filletRadius, e => e.inPlane("XY", saucerLipTopZ) && isCloseToRadiusInXYPlane(e, expectedOuterR, filletTolerance));
        }
        // Saucer top inner rim
        if (p.filletSaucerRim) {
          const saucerLipTopZ = p.saucerBaseThickness + p.saucerLipHeight;
          const expectedInnerR = (p.potInnerDiameter + 2 * p.wallThickness + 2 * p.saucerGap) / 2;
          finalShape = finalShape.fillet(p.filletRadius, e => e.inPlane("XY", saucerLipTopZ) && isCloseToRadiusInXYPlane(e, expectedInnerR, filletTolerance));
        }
        // Outer base of saucer
        if (p.filletOuterBase) {
           const expectedR = (p.potInnerDiameter + 2 * p.wallThickness + 2 * p.saucerGap + 2 * p.saucerWallThickness) / 2;
           finalShape = finalShape.fillet(p.filletRadius, e => e.inPlane("XY", 0) && isCloseToRadiusInXYPlane(e, expectedR, filletTolerance));
        }
      } else {
        // Outer base of pot holder (if no saucer)
        if (p.filletOuterBase) {
          const expectedR = p.potInnerDiameter / 2 + p.wallThickness;
          finalShape = finalShape.fillet(p.filletRadius, e => e.inPlane("XY", 0)  && isCloseToRadiusInXYPlane(e, expectedR, filletTolerance));
        }
      }
    } catch (e) {
      console.warn("A fillet operation failed. The model might have sharp edges. Error: " + e.message);
    }
  }

  return finalShape;
}
`;

export const mockModels = [
  {
    id: 'bld_birdhouse',
    name: 'Birdhouse',
    code: birdhouseCode,
    thumbnail:
      'data:image/webp;base64,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yZh3ZkzDuyZh3ZkzDuyZh3rndmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMPhQ7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZjMmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTPPMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7sygLJmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmh+ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7tTOzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHdkzDuzJmHep92TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO7MmYd2TMO9c7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh8KHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMZkw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZ55mHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmUBZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7s0PzJmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdqZ2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw7smYd2ZMw71PuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3ZkzDuyZh3rndmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMO7JmHdmTMPhQ7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7syZh3ZMw7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',
  },
  {
    id: 'bld_hollow_box',
    name: 'Hollow Box',
    code: hollowBoxCode,
    thumbnail:
      'data:image/webp;base64,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06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTp06dOnTo7uzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3wod2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMvmTDuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJnXmYd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZQFkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzQ/smXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2ivZky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7vU+7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXeud2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu+FDuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl8yYd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZM68zDuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzKAsmZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2aH9ky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7u0V7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd6n3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy71zuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3wod2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMvmTDuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJnXmYd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZQFkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzQ/smXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2ivZky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7vU+7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7JmXeud2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu+FDuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl8yYd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZM68zDuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzKAsmZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2aH9ky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7uyZl3Zky7u0V7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd6n3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy71zuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJlyvBe5jHn/M1C9E/3FP9yZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7smZd2ZMu7tFezJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzJl3dkzLuzFq0f4IaLEu9R4whxmB95A+9K8/162nha1RooNqFWrhusTXHd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd2TMu7MmXd6n3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZd3ZMy7syZdH3aJ+Wvf08MIdnMKu+I3Ry2D9jAYOOwlFW5d/Bwq30154INgGLu7JmXdmTLu7JmXdmTLu7JmXdmTLu7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',
  },
  {
    id: 'bld_tray',
    name: 'Tray',
    code: trayCode,
    thumbnail:
      'data:image/webp;base64,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2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO73juyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp31nd2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVPxVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqruqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VZZlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyzzKqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2o3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7veO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7KqnfWd3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU/FUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqu6qh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVU7uyqh3ZVlmVUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7LPMqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ajdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu947sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd9Z3dlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVT8VQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqq7qqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlVTu7KqHdlWWZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7sqqd3ZVQ7ss8yqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dqN2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO73juyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp31nd2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVPxVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqruqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VVO7sqod2VZZlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyqp3dlVDuyzzKqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2VUO7Kqnd2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',
  },
  {
    id: 'bld_drinking_glass',
    name: 'Drinking Glass',
    code: drinkingGlassCode,
  },
  {
    id: 'bld_pot_plant',
    name: 'Pot Plant',
    code: potPlantCode,
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
