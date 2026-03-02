/**
 * Benchmark Torture Test Geometry
 * ================================
 * A parametric model designed to stress-test OpenCascade kernel operations.
 * Exercises: boolean ops (fuse/cut), filleting, shelling, lofting, sweeping,
 * and high feature count geometry.
 *
 * Use the `complexity` parameter (1-5) to scale the workload.
 * Higher complexity = more holes, ribs, fillets, and features.
 *
 * Key operations that benefit from multi-threading:
 *   1. Many boolean cuts (hole patterns) - parallelizable per-hole
 *   2. Filleting many edges simultaneously - edge-independent solver
 *   3. Mesh tessellation of complex result - face-parallel meshing
 *   4. Loft/sweep surface construction - parametric evaluation
 */
import {
  drawCircle,
  drawRoundedRectangle,
  makeCylinder,
  makeSphere,
  makePlane,
  sketchCircle,
  sketchRectangle,
  sketchRoundedRectangle,
  makeHelix,
} from 'replicad';
import type { Shape3D } from 'replicad';

export const defaultParams = {
  // Overall size
  baseLength: 120, // Mm - X dimension of base block
  baseWidth: 120, // Mm - Y dimension of base block
  baseHeight: 40, // Mm - Z height of base block
  baseCornerRadius: 8, // Mm - rounded corners on base

  // Complexity multiplier (1-5): controls feature count
  complexity: 5,

  // Hole pattern
  holeRadius: 3, // Mm - radius of pattern holes
  holeDepth: 20, // Mm - depth of blind holes
  circularPatternRadius: 40, // Mm - radius of circular hole pattern

  // Boss / tower
  bossRadius: 15, // Mm - radius of central boss
  bossHeight: 20, // Mm - height of central boss

  // Ribs
  ribThickness: 3, // Mm - thickness of reinforcement ribs
  ribHeight: 15, // Mm - height of ribs

  // Pocket
  pocketDepth: 10, // Mm - depth of corner pockets
  pocketSize: 25, // Mm - size of corner pockets
  pocketCornerRadius: 4, // Mm - pocket corner radius

  // Lofted feature
  loftBaseRadius: 12, // Mm
  loftTopRadius: 6, // Mm
  loftHeight: 18, // Mm

  // Swept channel
  channelRadius: 2.5, // Mm - radius of swept channel
  helixPitch: 20, // Mm
  helixRadius: 30, // Mm - radius of helix path

  // Finishing
  filletRadius: 1.5, // Mm - global small fillet
  largeFilletRadius: 4, // Mm - large transition fillets
  wallThickness: 2, // Mm - shell wall thickness
};

type Parameters_ = typeof defaultParams;

/** Generate positions for a circular pattern */
function circularPattern(
  count: number,
  radius: number,
  zHeight: number,
): Array<[number, number, number]> {
  const positions: Array<
    [number, number, number]
  > = [];
  for (let i = 0; i < count; i++) {
    const angle =
      (2 * Math.PI * i) / count;
    positions.push([
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      zHeight,
    ]);
  }

  return positions;
}

/** Generate positions for a rectangular grid pattern */
function gridPattern(
  countX: number,
  countY: number,
  spacingX: number,
  spacingY: number,
  zHeight: number,
): Array<[number, number, number]> {
  const positions: Array<
    [number, number, number]
  > = [];
  const offsetX =
    ((countX - 1) * spacingX) / 2;
  const offsetY =
    ((countY - 1) * spacingY) / 2;
  for (let ix = 0; ix < countX; ix++) {
    for (
      let iy = 0;
      iy < countY;
      iy++
    ) {
      positions.push([
        ix * spacingX - offsetX,
        iy * spacingY - offsetY,
        zHeight,
      ]);
    }
  }

  return positions;
}

export default function main(
  p: Parameters_ = defaultParams,
) {
  const complexity = Math.max(
    1,
    Math.min(
      5,
      Math.round(p.complexity),
    ),
  );

  // =========================================================================
  // 1. BASE BLOCK - Rounded rectangle extruded
  // =========================================================================
  let block = sketchRoundedRectangle(
    p.baseLength,
    p.baseWidth,
    p.baseCornerRadius,
  ).extrude(p.baseHeight);

  // =========================================================================
  // 2. CENTRAL BOSS - Cylinder fused on top
  // =========================================================================
  const boss = makeCylinder(
    p.bossRadius,
    p.bossHeight,
    [0, 0, p.baseHeight],
    [0, 0, 1],
  );
  block = block.fuse(boss);

  // =========================================================================
  // 3. REINFORCEMENT RIBS - Cross pattern of thin walls
  //    Number of ribs scales with complexity
  // =========================================================================
  const ribCount = complexity + 1; // 2 to 6 ribs per axis
  for (let i = 0; i < ribCount; i++) {
    const offset =
      ((i - (ribCount - 1) / 2) *
        (p.baseLength -
          2 * p.baseCornerRadius)) /
      ribCount;

    // X-aligned rib
    const ribX = sketchRectangle(
      p.baseWidth * 0.7,
      p.ribThickness,
      {
        plane: 'XY',
        origin: [
          offset,
          0,
          p.baseHeight,
        ] as [number, number, number],
      },
    ).extrude(p.ribHeight);
    block = block.fuse(ribX);

    // Y-aligned rib
    const ribY = sketchRectangle(
      p.ribThickness,
      p.baseLength * 0.7,
      {
        plane: 'XY',
        origin: [
          -offset * 0.7,
          0,
          p.baseHeight,
        ] as [number, number, number],
      },
    ).extrude(p.ribHeight);
    block = block.fuse(ribY);
  }

  // =========================================================================
  // 4. CIRCULAR HOLE PATTERN - Drilled into top of base
  //    Hole count scales with complexity: 6*complexity holes
  // =========================================================================
  const circHoleCount = 6 * complexity;
  const circHolePositions =
    circularPattern(
      circHoleCount,
      p.circularPatternRadius,
      p.baseHeight - p.holeDepth,
    );

  for (const pos of circHolePositions) {
    const hole = makeCylinder(
      p.holeRadius,
      p.holeDepth + 1,
      pos,
      [0, 0, 1],
    );
    block = block.cut(hole);
  }

  // =========================================================================
  // 5. GRID HOLE PATTERN - Small holes in a grid on the bottom
  //    Grid density scales with complexity
  // =========================================================================
  const gridSize = complexity + 1; // 2x2 to 6x6
  const gridSpacing = 15;
  const gridPositions = gridPattern(
    gridSize,
    gridSize,
    gridSpacing,
    gridSpacing,
    -0.5, // Start slightly below bottom for clean cut
  );

  for (const pos of gridPositions) {
    // Skip holes that would intersect the circular pattern area
    const dist = Math.hypot(
      pos[0],
      pos[1],
    );
    if (
      dist <
      p.circularPatternRadius -
        p.holeRadius * 3
    ) {
      const throughHole = makeCylinder(
        p.holeRadius * 0.7,
        p.baseHeight + 1,
        pos,
        [0, 0, 1],
      );
      block = block.cut(throughHole);
    }
  }

  // =========================================================================
  // 6. CORNER POCKETS - Rectangular cutouts at each corner
  //    More pocket features at higher complexity
  // =========================================================================
  const pocketCorners: Array<
    [number, number]
  > = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  for (const [
    sx,
    sy,
  ] of pocketCorners) {
    const cx =
      sx *
      (p.baseLength / 2 -
        p.pocketSize / 2 -
        p.baseCornerRadius / 2);
    const cy =
      sy *
      (p.baseWidth / 2 -
        p.pocketSize / 2 -
        p.baseCornerRadius / 2);

    const pocket =
      sketchRoundedRectangle(
        p.pocketSize,
        p.pocketSize,
        p.pocketCornerRadius,
        {
          plane: 'XY',
          origin: [
            cx,
            cy,
            p.baseHeight -
              p.pocketDepth,
          ] as [number, number, number],
        },
      ).extrude(p.pocketDepth + 1);
    block = block.cut(pocket);
  }

  // =========================================================================
  // 7. LOFTED FEATURES - Organic transitions on corners
  //    Creates complex surface geometry
  // =========================================================================
  const loftPositions: Array<
    [number, number]
  > =
    complexity >= 2
      ? [
          [
            p.baseLength / 2 - 15,
            p.baseWidth / 2 - 15,
          ],
          [
            -(p.baseLength / 2 - 15),
            p.baseWidth / 2 - 15,
          ],
        ]
      : [
          [
            p.baseLength / 2 - 15,
            p.baseWidth / 2 - 15,
          ],
        ];

  if (complexity >= 4) {
    loftPositions.push(
      [
        -(p.baseLength / 2 - 15),
        -(p.baseWidth / 2 - 15),
      ],
      [
        p.baseLength / 2 - 15,
        -(p.baseWidth / 2 - 15),
      ],
    );
  }

  for (const [
    lx,
    ly,
  ] of loftPositions) {
    const basePlane = makePlane(
      'XY',
      p.baseHeight,
    );
    basePlane.setOrigin2d(lx, ly);
    const baseSketch = drawCircle(
      p.loftBaseRadius,
    ).sketchOnPlane(basePlane);

    const midPlane = makePlane(
      'XY',
      p.baseHeight + p.loftHeight / 2,
    );
    midPlane.setOrigin2d(lx, ly);
    const midSketch =
      drawRoundedRectangle(
        p.loftBaseRadius * 1.6,
        p.loftBaseRadius * 1.6,
        3,
      ).sketchOnPlane(midPlane);

    const topPlane = makePlane(
      'XY',
      p.baseHeight + p.loftHeight,
    );
    topPlane.setOrigin2d(lx, ly);
    const topSketch = drawCircle(
      p.loftTopRadius,
    ).sketchOnPlane(topPlane);

    const loftFeature =
      // @ts-expect-error - loftWith types
      baseSketch.loftWith(
        [midSketch, topSketch],
        {
          ruled: false,
        },
      ) as Shape3D;
    block = block.fuse(loftFeature);
  }

  // =========================================================================
  // 8. HEMISPHERE FEATURES - Spherical cuts (expensive boolean)
  //    Tests sphere-box intersection which is numerically challenging
  // =========================================================================
  if (complexity >= 2) {
    const spherePositions: Array<
      [number, number, number]
    > = [
      [
        p.baseLength / 4,
        0,
        p.baseHeight,
      ],
      [
        -p.baseLength / 4,
        0,
        p.baseHeight,
      ],
    ];
    if (complexity >= 4) {
      spherePositions.push(
        [
          0,
          p.baseWidth / 4,
          p.baseHeight,
        ],
        [
          0,
          -p.baseWidth / 4,
          p.baseHeight,
        ],
      );
    }

    for (const spos of spherePositions) {
      const sphere = makeSphere(
        p.holeRadius * 2,
      ).translate(spos);
      block = block.cut(sphere);
    }
  }

  // =========================================================================
  // 9. SWEPT HELICAL CHANNEL - Helix path sweep
  //    This is one of the most expensive single operations
  // =========================================================================
  if (complexity >= 3) {
    try {
      const helixHeight =
        p.baseHeight * 0.6;
      const helixPath = makeHelix(
        p.helixPitch,
        helixHeight,
        p.helixRadius,
        [0, 0, 5],
        [0, 0, 1],
      );

      // Create a circular cross-section at the start of the helix
      const sweepPlane = makePlane();
      sweepPlane.pivot(90, 'Y');
      sweepPlane.translateTo([
        p.helixRadius,
        0,
        5,
      ]);
      const channelProfile =
        sketchCircle(p.channelRadius, {
          plane: sweepPlane,
        });

      const channel =
        channelProfile.sweepSketch(
          (plane) => {
            return sketchCircle(
              p.channelRadius,
              { plane },
            );
          },
          { frenet: true },
        );

      // Use genericSweep instead if sweepSketch doesn't work
      block = block.cut(channel);
    } catch {
      // Sweep can fail on some configurations; skip gracefully
      console.warn(
        'Helical sweep skipped due to geometry error',
      );
    }
  }

  // =========================================================================
  // 10. LARGE TRANSITION FILLETS - Between boss and base
  //     Expensive edge-finding + fillet computation
  // =========================================================================
  try {
    block = block.fillet(
      p.largeFilletRadius,
      (e) =>
        e
          .inBox(
            [
              -p.bossRadius - 2,
              -p.bossRadius - 2,
              p.baseHeight - 1,
            ],
            [
              p.bossRadius + 2,
              p.bossRadius + 2,
              p.baseHeight + 1,
            ],
          )
          .ofCurveType('CIRCLE'),
    );
  } catch {
    // Fillet can fail on complex intersections
  }

  // =========================================================================
  // 11. SMALL EDGE FILLETS - Applied to many edges
  //     The solver must evaluate many edges; great multi-thread target
  // =========================================================================
  try {
    block = block.fillet(
      p.filletRadius,
      (e) =>
        e
          .inBox(
            [
              -p.baseLength / 2 - 1,
              -p.baseWidth / 2 - 1,
              -1,
            ],
            [
              p.baseLength / 2 + 1,
              p.baseWidth / 2 + 1,
              p.baseHeight + 1,
            ],
          )
          .ofCurveType('LINE'),
    );
  } catch {
    // Some fillets may fail on complex geometry
  }

  // =========================================================================
  // 12. CHAMFERS on top edges of ribs
  // =========================================================================
  try {
    const ribTopZ =
      p.baseHeight + p.ribHeight;
    block = block.chamfer(0.8, (e) =>
      e.inBox(
        [
          -p.baseLength / 2,
          -p.baseWidth / 2,
          ribTopZ - 0.5,
        ],
        [
          p.baseLength / 2,
          p.baseWidth / 2,
          ribTopZ + 0.5,
        ],
      ),
    );
  } catch {
    // Chamfer can fail on thin features
  }

  return block;
}
