import {
  primitives,
  booleans,
  transforms,
  extrusions,
  colors,
  type geometries,
} from '@jscad/modeling';

const { circle, cylinder, polygon } = primitives;
const { union, subtract } = booleans;
const { translate, rotateZ } = transforms;
const { extrudeLinear } = extrusions;
const { colorize } = colors;

type Geom2 = geometries.geom2.Geom2;

const named = <T extends object>(shape: T, name: string): T =>
  Object.assign(shape, { name });

export const defaultParams = {
  module: 2,
  pressureAngle: 20,
  thickness: 10,
  sunTeeth: 12,
  planetTeeth: 12,
  ringTeeth: 36,
};

function generateGear2D(
  N: number,
  module: number,
  pressureAngleDeg: number,
  backlashAngle = 0,
  customOuterRadius?: number,
  customRootRadius?: number,
) {
  const pressureAngleRad = (pressureAngleDeg * Math.PI) / 180;
  const pitchRadius = (module * N) / 2;
  const baseRadius = pitchRadius * Math.cos(pressureAngleRad);
  const outerRadius = customOuterRadius ?? pitchRadius + module;
  const rootRadius = customRootRadius ?? pitchRadius - 1.25 * module;

  const rStart = Math.max(rootRadius, baseRadius);
  const tStart = Math.sqrt(Math.max(0, (rStart / baseRadius) ** 2 - 1));
  const tEnd = Math.sqrt(Math.max(0, (outerRadius / baseRadius) ** 2 - 1));
  const thetaPitch = Math.tan(pressureAngleRad) - pressureAngleRad;

  const points: Array<[number, number]> = [];
  const numberSteps = 12;

  for (let i = 0; i < N; i++) {
    const toothCenterAngle = (i * 2 * Math.PI) / N;
    const leftPoints: Array<[number, number]> = [];
    const rightPoints: Array<[number, number]> = [];

    if (rootRadius < baseRadius) {
      const thetaLeftBase =
        -thetaPitch - Math.PI / (2 * N) + backlashAngle + toothCenterAngle;
      leftPoints.push([
        rootRadius * Math.cos(thetaLeftBase),
        rootRadius * Math.sin(thetaLeftBase),
      ]);
    }

    for (let j = 0; j <= numberSteps; j++) {
      const t = tStart + (tEnd - tStart) * (j / numberSteps);
      const r = baseRadius * Math.sqrt(1 + t * t);
      const thetaRaw = t - Math.atan(t);
      const thetaLeft =
        thetaRaw -
        thetaPitch -
        Math.PI / (2 * N) +
        backlashAngle +
        toothCenterAngle;
      leftPoints.push([r * Math.cos(thetaLeft), r * Math.sin(thetaLeft)]);
    }

    const topPoints: Array<[number, number]> = [];
    const thetaLeftOuter =
      tEnd -
      Math.atan(tEnd) -
      thetaPitch -
      Math.PI / (2 * N) +
      backlashAngle +
      toothCenterAngle;
    const thetaRightOuter =
      -(tEnd - Math.atan(tEnd)) +
      thetaPitch +
      Math.PI / (2 * N) -
      backlashAngle +
      toothCenterAngle;

    for (let j = 1; j < 3; j++) {
      const theta =
        thetaLeftOuter + (thetaRightOuter - thetaLeftOuter) * (j / 3);
      topPoints.push([
        outerRadius * Math.cos(theta),
        outerRadius * Math.sin(theta),
      ]);
    }

    for (let j = numberSteps; j >= 0; j--) {
      const t = tStart + (tEnd - tStart) * (j / numberSteps);
      const r = baseRadius * Math.sqrt(1 + t * t);
      const thetaRaw = t - Math.atan(t);
      const thetaRight =
        -thetaRaw +
        thetaPitch +
        Math.PI / (2 * N) -
        backlashAngle +
        toothCenterAngle;
      rightPoints.push([r * Math.cos(thetaRight), r * Math.sin(thetaRight)]);
    }

    if (rootRadius < baseRadius) {
      const thetaRightBase =
        thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle;
      rightPoints.push([
        rootRadius * Math.cos(thetaRightBase),
        rootRadius * Math.sin(thetaRightBase),
      ]);
    }

    const nextToothCenterAngle = ((i + 1) * 2 * Math.PI) / N;
    const thetaCurrentRightBase =
      rootRadius < baseRadius
        ? thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle
        : -tStart +
          Math.atan(tStart) +
          thetaPitch +
          Math.PI / (2 * N) -
          backlashAngle +
          toothCenterAngle;
    const thetaNextLeftBase =
      rootRadius < baseRadius
        ? -thetaPitch - Math.PI / (2 * N) + backlashAngle + nextToothCenterAngle
        : tStart -
          Math.atan(tStart) -
          thetaPitch -
          Math.PI / (2 * N) +
          backlashAngle +
          nextToothCenterAngle;

    const gapPoints: Array<[number, number]> = [];
    for (let index = 1; index < 4; index++) {
      const theta =
        thetaCurrentRightBase +
        (thetaNextLeftBase - thetaCurrentRightBase) * (index / 4);
      gapPoints.push([
        rootRadius * Math.cos(theta),
        rootRadius * Math.sin(theta),
      ]);
    }

    points.push(...leftPoints, ...topPoints, ...rightPoints, ...gapPoints);
  }

  return polygon({ points });
}

function extrudeAt(profile: Geom2, height: number, zMin: number) {
  return translate([0, 0, zMin], extrudeLinear({ height }, profile));
}

export default function main(p = defaultParams) {
  const { module, pressureAngle, thickness, sunTeeth, planetTeeth, ringTeeth } =
    p;

  const carrierRadius = (module * (sunTeeth + planetTeeth)) / 2;
  const earDistance = 49;

  const sunProfile = subtract(
    generateGear2D(sunTeeth, module, pressureAngle, 0.008),
    circle({ radius: 4, segments: 32 }),
  );
  const sunGear = named(
    colorize([0.85, 0.65, 0.15], extrudeAt(sunProfile, thickness, 4.5)),
    'Sun Gear',
  );
  const sunShaft = named(
    colorize(
      [0.85, 0.65, 0.15],
      cylinder({ center: [0, 0, 2.5], height: 25, radius: 3.8, segments: 32 }),
    ),
    'Sun Shaft',
  );

  const planetProfile = subtract(
    generateGear2D(planetTeeth, module, pressureAngle, 0.008),
    circle({ radius: 3.1, segments: 24 }),
  );
  const planetBody = extrudeAt(planetProfile, thickness, 4.5);
  const planets = [];

  for (let index = 0; index < 4; index++) {
    const angle = (index * Math.PI) / 2;
    const px = carrierRadius * Math.cos(angle);
    const py = carrierRadius * Math.sin(angle);
    const planet = translate([px, py, 0], rotateZ(Math.PI / 12, planetBody));
    planets.push(
      named(colorize([0.2, 0.55, 0.85], planet), `Planet Gear ${index + 1}`),
    );
  }

  const ringPitchRadius = (module * ringTeeth) / 2;
  const ringOuterRadius = ringPitchRadius + 1.25 * module;
  const ringInnerRadius = ringPitchRadius - module;
  const ringPhaseOffset = Math.PI / ringTeeth;

  const ringImaginary2D = rotateZ(
    ringPhaseOffset,
    generateGear2D(
      ringTeeth,
      module,
      pressureAngle,
      -0.008,
      ringOuterRadius,
      ringInnerRadius,
    ),
  );

  const outerHousingProfile = circle({ radius: 44, segments: 96 });
  const earProfiles = [];
  const earHoleProfiles = [];

  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2;
    const ex = earDistance * Math.cos(angle);
    const ey = earDistance * Math.sin(angle);
    earProfiles.push(circle({ center: [ex, ey], radius: 8, segments: 32 }));
    earHoleProfiles.push(circle({ center: [ex, ey], radius: 3, segments: 24 }));
  }

  const housingFloorProfile = subtract(
    union(outerHousingProfile, ...earProfiles),
    circle({ radius: 4.1, segments: 32 }),
    ...earHoleProfiles,
  );
  const housingRingProfile = subtract(outerHousingProfile, ringImaginary2D);

  const housingFloor = named(
    colorize([0.35, 0.35, 0.35], extrudeAt(housingFloorProfile, 4.5, 0)),
    'Housing Floor',
  );
  const housingRing = named(
    colorize([0.35, 0.35, 0.35], extrudeAt(housingRingProfile, 10.5, 4.5)),
    'Housing Ring',
  );

  const carrierWindowProfiles = [];
  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2;
    carrierWindowProfiles.push(
      circle({
        center: [14 * Math.cos(angle), 14 * Math.sin(angle)],
        radius: 6,
        segments: 24,
      }),
    );
  }

  const carrierPlateProfile = subtract(
    circle({ radius: 28, segments: 64 }),
    ...carrierWindowProfiles,
  );
  const carrierPlate = named(
    colorize([0.8, 0.2, 0.2], extrudeAt(carrierPlateProfile, 3, 15)),
    'Planet Carrier Plate',
  );

  const carrierPins = [];
  for (let index = 0; index < 4; index++) {
    const angle = (index * Math.PI) / 2;
    const px = carrierRadius * Math.cos(angle);
    const py = carrierRadius * Math.sin(angle);
    carrierPins.push(
      named(
        colorize(
          [0.8, 0.2, 0.2],
          cylinder({
            center: [px, py, (5 + 15) / 2],
            height: 10,
            radius: 3,
            segments: 24,
          }),
        ),
        `Carrier Pin ${index + 1}`,
      ),
    );
  }

  const carrierOutputShaft = named(
    colorize(
      [0.8, 0.2, 0.2],
      cylinder({
        center: [0, 0, 18 + 15 / 2],
        height: 15,
        radius: 5,
        segments: 32,
      }),
    ),
    'Carrier Output Shaft',
  );

  return [
    housingFloor,
    housingRing,
    sunGear,
    sunShaft,
    ...planets,
    carrierPlate,
    ...carrierPins,
    carrierOutputShaft,
  ];
}
