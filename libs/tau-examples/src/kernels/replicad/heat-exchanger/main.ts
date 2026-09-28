import {
  draw,
  drawPolysides,
  makeBox,
  makeCompound,
  makeCylinder,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';

export const defaultParams = {
  shellLength: 500,
};

export default function main(p = defaultParams): ShapeConfig[] {
  const halfLength = p.shellLength / 2;
  const centerZ = 135;
  const shellOuterRadius = 84.15;
  const shellInnerRadius = 78.15;
  const flangeRadius = 110;
  const tubeOuterRadius = 5;
  const tubeInnerRadius = 4;
  const tubePitch = 20.5;

  const tubeCenters: Array<[number, number]> = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2) {
        tubeCenters.push([
          tubePitch * (q + r / 2),
          centerZ + (tubePitch * Math.sqrt(3) * r) / 2,
        ]);
      }
    }
  }

  const boltCenters: Array<[number, number]> = [];
  for (let index = 0; index < 12; index += 1) {
    const angle = (2 * Math.PI * index) / 12;
    boltCenters.push([91 * Math.cos(angle), centerZ + 91 * Math.sin(angle)]);
  }

  const leftJointHoles = boltCenters.map(([y, z]) =>
    makeCylinder(5.5, 40, [-halfLength - 30, y, z], [1, 0, 0]),
  );
  const rightJointHoles = boltCenters.map(([y, z]) =>
    makeCylinder(5.5, 40, [halfLength - 10, y, z], [1, 0, 0]),
  );

  const shellBarrel = makeCylinder(
    shellOuterRadius,
    p.shellLength,
    [-halfLength, 0, centerZ],
    [1, 0, 0],
  ).cutAll([
    makeCylinder(
      shellInnerRadius,
      p.shellLength + 2,
      [-halfLength - 1, 0, centerZ],
      [1, 0, 0],
    ),
  ]);

  const leftShellFlange = makeCylinder(
    flangeRadius,
    16,
    [-halfLength - 14, 0, centerZ],
    [1, 0, 0],
  ).cutAll([
    makeCylinder(
      shellInnerRadius,
      18,
      [-halfLength - 15, 0, centerZ],
      [1, 0, 0],
    ),
    ...leftJointHoles,
  ]);
  const rightShellFlange = makeCylinder(
    flangeRadius,
    16,
    [halfLength - 2, 0, centerZ],
    [1, 0, 0],
  ).cutAll([
    makeCylinder(shellInnerRadius, 18, [halfLength - 3, 0, centerZ], [1, 0, 0]),
    ...rightJointHoles,
  ]);

  const shellNozzleParts: Shape3D[] = [];
  const shellNozzleBores: Shape3D[] = [];
  for (const x of [-0.3 * p.shellLength, 0.3 * p.shellLength]) {
    const neck = makeCylinder(30.15, 60, [x, 0, 210], [0, 0, 1]).cutAll([
      makeCylinder(26, 62, [x, 0, 209], [0, 0, 1]),
    ]);
    const pad = makeCylinder(43, 8, [x, 0, 209], [0, 0, 1]).cutAll([
      makeCylinder(26, 10, [x, 0, 208], [0, 0, 1]),
    ]);
    const nozzleBoltHoles: Shape3D[] = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = (2 * Math.PI * index) / 8;
      nozzleBoltHoles.push(
        makeCylinder(
          5.5,
          16,
          [x + 42 * Math.cos(angle), 42 * Math.sin(angle), 267],
          [0, 0, 1],
        ),
      );
    }
    const flange = makeCylinder(55, 14, [x, 0, 268], [0, 0, 1]).cutAll([
      makeCylinder(26, 16, [x, 0, 267], [0, 0, 1]),
      ...nozzleBoltHoles,
    ]);
    shellNozzleParts.push(neck, pad, flange);
    shellNozzleBores.push(makeCylinder(26, 20, [x, 0, 205], [0, 0, 1]));
  }

  const pressureShell = makeCompound([
    shellBarrel.cutAll(shellNozzleBores),
    leftShellFlange,
    rightShellFlange,
    ...shellNozzleParts,
  ]);

  const tubeHoleTools = tubeCenters.map(([y, z]) =>
    makeCylinder(5.15, 8, [-halfLength - 21, y, z], [1, 0, 0]),
  );
  const leftTubeSheet = makeCylinder(
    108,
    6,
    [-halfLength - 20, 0, centerZ],
    [1, 0, 0],
  ).cutAll([...tubeHoleTools, ...leftJointHoles]);
  const rightTubeSheetHoles = tubeCenters.map(([y, z]) =>
    makeCylinder(5.15, 8, [halfLength + 13, y, z], [1, 0, 0]),
  );
  const rightTubeSheet = makeCylinder(
    108,
    6,
    [halfLength + 14, 0, centerZ],
    [1, 0, 0],
  ).cutAll([...rightTubeSheetHoles, ...rightJointHoles]);

  const tubes = tubeCenters.map(([y, z]) =>
    makeCylinder(
      tubeOuterRadius,
      p.shellLength + 40.4,
      [-halfLength - 20.2, y, z],
      [1, 0, 0],
    ).cutAll([
      makeCylinder(
        tubeInnerRadius,
        p.shellLength + 42.4,
        [-halfLength - 21.2, y, z],
        [1, 0, 0],
      ),
    ]),
  );

  const tieRodCenters: Array<[number, number]> = [
    [-58, centerZ],
    [58, centerZ],
    [0, centerZ - 58],
    [0, centerZ + 58],
  ];
  const tieRods = tieRodCenters.map(([y, z]) =>
    makeCylinder(2.5, p.shellLength + 12, [-halfLength - 6, y, z], [1, 0, 0]),
  );

  const baffleTubeHoles = tubeCenters.map(([y, z]) =>
    makeCylinder(5.3, 5, [-2.5, y, z], [1, 0, 0]),
  );
  const baffleTieRodHoles = tieRodCenters.map(([y, z]) =>
    makeCylinder(3, 5, [-2.5, y, z], [1, 0, 0]),
  );
  const baffleDisc = makeCylinder(77, 3, [-1.5, 0, centerZ], [1, 0, 0]);
  const upperWindowBaffle = baffleDisc
    .clone()
    .cutAll([
      ...baffleTubeHoles,
      ...baffleTieRodHoles,
      makeBox([-3, -90, centerZ + 25], [3, 90, centerZ + 85]),
    ]);
  const lowerWindowBaffle = baffleDisc
    .clone()
    .cutAll([
      ...baffleTubeHoles,
      ...baffleTieRodHoles,
      makeBox([-3, -90, centerZ - 85], [3, 90, centerZ - 25]),
    ]);
  const baffleStations = [-0.32, -0.16, 0, 0.16, 0.32].map(
    (f) => f * p.shellLength,
  );
  const baffles = baffleStations.map((x, index) =>
    (index % 2 === 0 ? upperWindowBaffle : lowerWindowBaffle)
      .clone()
      .translate([x, 0, 0]),
  );

  const channelParts: Shape3D[] = [];
  for (const side of [-1, 1]) {
    const barrelStart = side < 0 ? -halfLength - 75 : halfLength + 24;
    const barrel = makeCylinder(
      78,
      51,
      [barrelStart, 0, centerZ],
      [1, 0, 0],
    ).cutAll([makeCylinder(72, 53, [barrelStart - 1, 0, centerZ], [1, 0, 0])]);
    const outerRimX = side * (halfLength + 72);
    const outerPoleX = side * (halfLength + 110);
    const outerMidX = side * (halfLength + 99.99);
    const innerPoleX = side * (halfLength + 105.8);
    const innerMidX = side * (halfLength + 96.99);
    const cap = draw([outerRimX, centerZ + 78.46])
      .threePointsArcTo([outerPoleX, centerZ], [outerMidX, centerZ + 43.6])
      .lineTo([innerPoleX, centerZ])
      .threePointsArcTo(
        [outerRimX, centerZ + 72.19],
        [innerMidX, centerZ + 39.8],
      )
      .close()
      .sketchOnPlane('XZ')
      .revolve([1, 0, 0], { origin: [0, 0, centerZ] });
    const flangeStart = side < 0 ? -halfLength - 26 : halfLength + 18;
    const flange = makeCylinder(
      flangeRadius,
      8,
      [flangeStart, 0, centerZ],
      [1, 0, 0],
    ).cutAll([
      makeCylinder(72, 10, [flangeStart - 1, 0, centerZ], [1, 0, 0]),
      ...(side < 0 ? leftJointHoles : rightJointHoles),
    ]);

    const nozzleX = side * (halfLength + 50);
    const nozzleDirection: [number, number, number] =
      side < 0 ? [0, 1, 0] : [0, -1, 0];
    const neckY = side < 0 ? 68 : -68;
    const flangeY = side < 0 ? 125 : -125;
    const nozzleBoltHoles: Shape3D[] = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = (2 * Math.PI * index) / 8;
      nozzleBoltHoles.push(
        makeCylinder(
          5,
          16,
          [
            nozzleX + 37 * Math.cos(angle),
            flangeY,
            centerZ + 37 * Math.sin(angle),
          ],
          nozzleDirection,
        ),
      );
    }
    const bossY = side < 0 ? 64 : -64;
    const weldBoss = makeCylinder(
      35,
      16,
      [nozzleX, bossY, centerZ],
      nozzleDirection,
    );
    const neck = makeCylinder(
      27,
      59,
      [nozzleX, neckY, centerZ],
      nozzleDirection,
    );
    const nozzleFlange = makeCylinder(
      50,
      14,
      [nozzleX, flangeY, centerZ],
      nozzleDirection,
    );
    const nozzleBoreStartY = side < 0 ? 55 : -55;
    const channelBore = makeCylinder(
      22,
      90,
      [nozzleX, nozzleBoreStartY, centerZ],
      nozzleDirection,
    );
    const channelHead = barrel
      .fuseAll([cap, flange, weldBoss, neck, nozzleFlange])
      .cutAll([channelBore, ...nozzleBoltHoles]);
    channelParts.push(channelHead);
  }

  const saddleParts: Shape3D[] = [];
  for (const station of [-0.36 * p.shellLength, 0.36 * p.shellLength]) {
    const mountingHoles: Shape3D[] = [];
    for (const dx of [-28, 28]) {
      for (const y of [-88, 88]) {
        mountingHoles.push(
          makeCylinder(6, 14, [station + dx, y, -1], [0, 0, 1]),
        );
      }
    }
    const base = makeBox(
      [station - 40, -110, 0],
      [station + 40, 110, 12],
    ).cutAll(mountingHoles);
    const web = makeBox(
      [station - 9, -100, 12],
      [station + 9, 100, 145],
    ).cutAll([makeCylinder(84.4, 22, [station - 11, 0, centerZ], [1, 0, 0])]);
    const wearPlate = makeCylinder(
      87.4,
      22,
      [station - 11, 0, centerZ],
      [1, 0, 0],
    )
      .cutAll([makeCylinder(84.4, 24, [station - 12, 0, centerZ], [1, 0, 0])])
      .intersect(
        makeBox([station - 12, -100, 40], [station + 12, 100, centerZ + 4]),
      );
    saddleParts.push(base, web, wearPlate);
  }

  const flangeFasteners: Shape3D[] = [];
  for (const side of [-1, 1]) {
    for (const [y, z] of boltCenters) {
      const shankStart = side < 0 ? -halfLength - 29 : halfLength - 5;
      const headStart = side < 0 ? -halfLength - 34 : halfLength - 10;
      const nutStart = side < 0 ? -halfLength + 5 : halfLength + 29;
      const shank = makeCylinder(5, 34, [shankStart, y, z], [1, 0, 0]);
      const head = drawPolysides(8.5, 6)
        .sketchOnPlane('YZ', [headStart, y, z])
        .extrude(5);
      const nut = drawPolysides(8.5, 6)
        .sketchOnPlane('YZ', [nutStart, y, z])
        .extrude(5)
        .cutAll([makeCylinder(5.5, 7, [nutStart - 1, y, z], [1, 0, 0])]);
      flangeFasteners.push(shank, head, nut);
    }
  }

  return [
    {
      shape: pressureShell,
      name: 'Pressure Shell',
      color: '#607D8B',
      metalness: 0.75,
      roughness: 0.28,
    },
    {
      shape: makeCompound([leftTubeSheet, rightTubeSheet]),
      name: 'Tube Sheets',
      color: '#B0BEC5',
      metalness: 0.8,
      roughness: 0.22,
    },
    {
      shape: makeCompound(tubes),
      name: 'Tube Bundle',
      color: '#B87333',
      metalness: 0.7,
      roughness: 0.25,
    },
    {
      shape: makeCompound(baffles),
      name: 'Segmental Baffles',
      color: '#90A4AE',
      metalness: 0.75,
      roughness: 0.24,
    },
    {
      shape: makeCompound(tieRods),
      name: 'Tie Rods',
      color: '#78909C',
      metalness: 0.8,
      roughness: 0.22,
    },
    {
      shape: makeCompound(channelParts),
      name: 'Channel Heads',
      color: '#B8C5CB',
      metalness: 0.82,
      roughness: 0.2,
    },
    {
      shape: makeCompound(saddleParts),
      name: 'Support Saddles',
      color: '#455A64',
      metalness: 0.7,
      roughness: 0.32,
    },
    {
      shape: makeCompound(flangeFasteners),
      name: 'Shell Flange Fasteners',
      color: '#263238',
      metalness: 0.85,
      roughness: 0.3,
    },
  ];
}
