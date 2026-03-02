/**
 * Parametric Gridfinity Box
 * A customizable storage box compatible with the Gridfinity system.
 */
import type {
  Plane,
  Point,
  Sketch,
  Shape3D,
} from 'replicad';
import {
  draw,
  drawRoundedRectangle,
  drawCircle,
  makeSolid,
  assembleWire,
  makeFace,
  EdgeFinder,
} from 'replicad';

export const defaultParams = {
  xSize: 2, // Width in Gridfinity units
  ySize: 1, // Length in Gridfinity units
  height: 0.5, // Height in Gridfinity units
  enableMagnet: false, // Include magnet holes
  enableScrew: false, // Include screw holes
  magnetRadius: 3.25, // Radius of magnet holes
  magnetHeight: 2, // Depth of magnet holes
  screwRadius: 1.5, // Radius of screw holes
  keepFull: false, // Whether to keep box solid or hollow
  wallThickness: 1.2, // Wall thickness
};

// Gridfinity magic numbers
const SIZE = 42;
const CLEARANCE = 0.5;
const AXIS_CLEARANCE =
  (CLEARANCE * Math.sqrt(2)) / 4;

const CORNER_RADIUS = 4;
const TOP_FILLET = 0.6;

const SOCKET_HEIGHT = 5;
const SOCKET_SMALL_TAPER = 0.8;
const SOCKET_BIG_TAPER = 2.4;
const SOCKET_VERTICAL_PART =
  SOCKET_HEIGHT -
  SOCKET_SMALL_TAPER -
  SOCKET_BIG_TAPER;
const SOCKET_TAPER_WIDTH =
  SOCKET_SMALL_TAPER + SOCKET_BIG_TAPER;

/**
 * Creates a socket profile for the Gridfinity base
 * @param _ - Unused parameter
 * @param startPoint - Start position for the profile
 * @returns The socket profile sketch
 */
function socketProfile(
  _plane: Plane,
  startPoint: Point,
) {
  const full = draw([-CLEARANCE / 2, 0])
    .vLine(-CLEARANCE / 2)
    .lineTo([
      -SOCKET_BIG_TAPER,
      -SOCKET_BIG_TAPER,
    ])
    .vLine(-SOCKET_VERTICAL_PART)
    .line(
      -SOCKET_SMALL_TAPER,
      -SOCKET_SMALL_TAPER,
    )
    .done()
    .translate(CLEARANCE / 2, 0);

  return full.sketchOnPlane(
    'XZ',
    startPoint,
  ) as Sketch;
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
  enableScrew = true,
  enableMagnet = true,
} = {}) {
  const baseSocket =
    drawRoundedRectangle(
      SIZE - CLEARANCE,
      SIZE - CLEARANCE,
      CORNER_RADIUS,
    ).sketchOnPlane() as Sketch;

  const slotSide =
    baseSocket.sweepSketch(
      socketProfile,
      {
        withContact: true,
      },
    );

  let slot = makeSolid([
    slotSide,
    makeFace(
      assembleWire(
        new EdgeFinder()
          .inPlane('XY', -SOCKET_HEIGHT)
          .find(slotSide),
      ),
    ),
    makeFace(
      assembleWire(
        new EdgeFinder()
          .inPlane('XY', 0)
          .find(slotSide),
      ),
    ),
  ]);

  if (enableScrew || enableMagnet) {
    const magnetCutout = enableMagnet
      ? drawCircle(magnetRadius)
          .sketchOnPlane()
          .extrude(magnetHeight)
      : null;
    const screwCutout = enableScrew
      ? drawCircle(screwRadius)
          .sketchOnPlane()
          .extrude(SOCKET_HEIGHT)
      : null;

    const cutout =
      magnetCutout && screwCutout
        ? magnetCutout.fuse(screwCutout)
        : (magnetCutout ?? screwCutout);

    if (!cutout) {
      return slot;
    }

    slot = slot
      .cut(
        cutout
          .clone()
          .translate([-13, -13, -5]),
      )
      .cut(
        cutout
          .clone()
          .translate([-13, 13, -5]),
      )
      .cut(
        cutout
          .clone()
          .translate([13, 13, -5]),
      )
      .cut(
        cutout
          .clone()
          .translate([13, -13, -5]),
      );
  }

  return slot;
}

/**
 * Creates an array with sequential numbers
 * @param i - Number of elements
 * @returns Array of sequential numbers
 */
function range(i: number) {
  return [
    ...Array.from({ length: i }).keys(),
  ];
}

/**
 * Clones a shape in a grid pattern
 * @param shape - Shape to clone
 * @param options - Grid configuration options
 * @returns Array of cloned shapes with translations
 */
function cloneOnGrid(
  shape: Shape3D,
  {
    xSteps = 1,
    ySteps = 1,
    span = 10,
    xSpan = undefined as
      | number
      | undefined,
    ySpan = undefined as
      | number
      | undefined,
  }: {
    xSteps?: number;
    ySteps?: number;
    span?: number;
    xSpan?: number | undefined;
    ySpan?: number | undefined;
  },
) {
  const xCorr =
    ((xSteps - 1) * (xSpan ?? span)) /
    2;
  const yCorr =
    ((ySteps - 1) *
      (ySpan ?? xSpan ?? span)) /
    2;

  const translations = range(
    xSteps,
  ).flatMap((i) => {
    return range(ySteps).map(
      (j) =>
        [
          i * SIZE - xCorr,
          j * SIZE - yCorr,
          0,
        ] as [number, number, number],
    );
  });
  return translations.map(
    (translation) =>
      shape
        .clone()
        .translate(translation),
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
}: {
  xSize: number;
  ySize: number;
  includeLip?: boolean;
  wallThickness?: number;
}) {
  const topShape = (
    _basePlane: Plane,
    startPosition: Point,
  ) => {
    const sketcher = draw([
      -SOCKET_TAPER_WIDTH,
      0,
    ])
      .line(
        SOCKET_SMALL_TAPER,
        SOCKET_SMALL_TAPER,
      )
      .vLine(SOCKET_VERTICAL_PART)
      .line(
        SOCKET_BIG_TAPER,
        SOCKET_BIG_TAPER,
      );

    if (includeLip) {
      sketcher
        .vLineTo(
          -(
            SOCKET_TAPER_WIDTH +
            wallThickness
          ),
        )
        .lineTo([
          -SOCKET_TAPER_WIDTH,
          -wallThickness,
        ]);
    } else {
      sketcher.vLineTo(0);
    }

    const basicShape = sketcher.close();

    const shiftedShape = basicShape
      .translate(
        AXIS_CLEARANCE,
        -AXIS_CLEARANCE,
      )
      .intersect(
        drawRoundedRectangle(
          10,
          10,
        ).translate(
          -5,
          includeLip ? 0 : 5,
        ),
      );

    // We need to shave off the clearance
    let topProfile = shiftedShape
      .translate(CLEARANCE / 2, 0)
      .intersect(
        drawRoundedRectangle(
          10,
          10,
        ).translate(-5, 0),
      );

    if (includeLip) {
      // We remove the wall if we add a lip
      topProfile = topProfile.cut(
        drawRoundedRectangle(
          1.2,
          10,
        ).translate(-0.6, -5),
      );
    }

    return topProfile.sketchOnPlane(
      'XZ',
      startPosition,
    ) as Sketch;
  };

  const boxSketch =
    drawRoundedRectangle(
      xSize * SIZE - CLEARANCE,
      ySize * SIZE - CLEARANCE,
      CORNER_RADIUS,
    ).sketchOnPlane() as Sketch;

  return boxSketch
    .sweepSketch(topShape, {
      withContact: true,
    })
    .fillet(
      TOP_FILLET,
      (e: EdgeFinder) =>
        e.inBox(
          [
            -xSize * SIZE,
            -ySize * SIZE,
            SOCKET_HEIGHT,
          ],
          [
            xSize * SIZE,
            ySize * SIZE,
            SOCKET_HEIGHT - 1,
          ],
        ),
    );
}

export default function main(
  p = defaultParams,
) {
  const stdHeight = p.height * SIZE;

  let box = drawRoundedRectangle(
    p.xSize * SIZE - CLEARANCE,
    p.ySize * SIZE - CLEARANCE,
    CORNER_RADIUS,
  )
    .sketchOnPlane()
    .extrude(stdHeight);

  if (!p.keepFull) {
    box = box.shell(
      p.wallThickness,
      (f) => f.inPlane('XY', stdHeight),
    );
  }

  const top = buildTopShape({
    xSize: p.xSize,
    ySize: p.ySize,
    includeLip: !p.keepFull,
    wallThickness: p.wallThickness,
  }).translateZ(stdHeight);

  const socket = buildSocket({
    enableMagnet: p.enableMagnet,
    enableScrew: p.enableScrew,
    magnetRadius: p.magnetRadius,
    magnetHeight: p.magnetHeight,
    screwRadius: p.screwRadius,
  });

  let base: Shape3D | undefined;
  for (const movedSocket of cloneOnGrid(
    socket,
    {
      xSteps: p.xSize,
      ySteps: p.ySize,
      span: SIZE,
    },
  )) {
    base = base
      ? base.fuse(movedSocket, {
          optimisation: 'commonFace',
        })
      : movedSocket;
  }

  if (!base) {
    throw new Error(
      'No sockets generated',
    );
  }

  return base
    .fuse(box, {
      optimisation: 'commonFace',
    })
    .fuse(top, {
      optimisation: 'commonFace',
    });
}
