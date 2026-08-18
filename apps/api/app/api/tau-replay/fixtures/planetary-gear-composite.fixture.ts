import type { ReplayFixture } from '#api/tau-replay/replay-fixture.schema.js';

export const planetaryGearMain = `import type { geometries } from '@jscad/modeling';
import { defaultParams, makePlanetaryAssembly } from './lib/planetaryGear.js';

export { defaultParams };

export default function main(p = defaultParams): geometries.geom3.Geom3[] {
  return makePlanetaryAssembly(p);
}
`;

export const planetaryGearLibrary = `import { primitives, booleans, transforms, extrusions, colors, type geometries } from '@jscad/modeling';

const { circle, cylinder, polygon } = primitives;
const { union, subtract } = booleans;
const { translate, rotateZ } = transforms;
const { extrudeLinear } = extrusions;
const { colorize } = colors;

const named = <T extends object>(shape: T, name: string): T => Object.assign(shape, { name });

export const defaultParams = {
  module: 2.0,
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
  backlashAngle = 0.0,
  customOuterRadius?: number,
  customRootRadius?: number,
) {
  const pressureAngleRad = (pressureAngleDeg * Math.PI) / 180;
  const pitchRadius = (module * N) / 2;
  const baseRadius = pitchRadius * Math.cos(pressureAngleRad);
  const outerRadius = customOuterRadius !== undefined ? customOuterRadius : pitchRadius + module;
  const rootRadius = customRootRadius !== undefined ? customRootRadius : pitchRadius - 1.25 * module;

  const rStart = Math.max(rootRadius, baseRadius);
  const tStart = Math.sqrt(Math.max(0, (rStart / baseRadius) ** 2 - 1));
  const tEnd = Math.sqrt(Math.max(0, (outerRadius / baseRadius) ** 2 - 1));
  const thetaPitch = Math.tan(pressureAngleRad) - pressureAngleRad;

  const points: [number, number][] = [];
  const numSteps = 12;

  for (let i = 0; i < N; i++) {
    const toothCenterAngle = (i * 2 * Math.PI) / N;
    const leftPoints: [number, number][] = [];
    const rightPoints: [number, number][] = [];

    if (rootRadius < baseRadius) {
      const thetaLeftBase = -thetaPitch - Math.PI / (2 * N) + backlashAngle + toothCenterAngle;
      leftPoints.push([rootRadius * Math.cos(thetaLeftBase), rootRadius * Math.sin(thetaLeftBase)]);
    }

    for (let j = 0; j <= numSteps; j++) {
      const t = tStart + (tEnd - tStart) * (j / numSteps);
      const r = baseRadius * Math.sqrt(1 + t * t);
      const thetaRaw = t - Math.atan(t);
      const thetaLeft = thetaRaw - thetaPitch - Math.PI / (2 * N) + backlashAngle + toothCenterAngle;
      leftPoints.push([r * Math.cos(thetaLeft), r * Math.sin(thetaLeft)]);
    }

    const topPoints: [number, number][] = [];
    const thetaLeftOuter = tEnd - Math.atan(tEnd) - thetaPitch - Math.PI / (2 * N) + backlashAngle + toothCenterAngle;
    const thetaRightOuter = -(tEnd - Math.atan(tEnd)) + thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle;

    for (let j = 1; j < 3; j++) {
      const theta = thetaLeftOuter + (thetaRightOuter - thetaLeftOuter) * (j / 3);
      topPoints.push([outerRadius * Math.cos(theta), outerRadius * Math.sin(theta)]);
    }

    for (let j = numSteps; j >= 0; j--) {
      const t = tStart + (tEnd - tStart) * (j / numSteps);
      const r = baseRadius * Math.sqrt(1 + t * t);
      const thetaRaw = t - Math.atan(t);
      const thetaRight = -thetaRaw + thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle;
      rightPoints.push([r * Math.cos(thetaRight), r * Math.sin(thetaRight)]);
    }

    if (rootRadius < baseRadius) {
      const thetaRightBase = thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle;
      rightPoints.push([rootRadius * Math.cos(thetaRightBase), rootRadius * Math.sin(thetaRightBase)]);
    }

    const nextToothCenterAngle = ((i + 1) * 2 * Math.PI) / N;
    const thetaCurrentRightBase =
      rootRadius < baseRadius
        ? thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle
        : -tStart + Math.atan(tStart) + thetaPitch + Math.PI / (2 * N) - backlashAngle + toothCenterAngle;
    const thetaNextLeftBase =
      rootRadius < baseRadius
        ? -thetaPitch - Math.PI / (2 * N) + backlashAngle + nextToothCenterAngle
        : tStart - Math.atan(tStart) - thetaPitch - Math.PI / (2 * N) + backlashAngle + nextToothCenterAngle;

    const gapPoints: [number, number][] = [];
    for (let j = 1; j < 4; j++) {
      const theta = thetaCurrentRightBase + (thetaNextLeftBase - thetaCurrentRightBase) * (j / 4);
      gapPoints.push([rootRadius * Math.cos(theta), rootRadius * Math.sin(theta)]);
    }

    points.push(...leftPoints, ...topPoints, ...rightPoints, ...gapPoints);
  }

  return polygon({ points });
}

function extrudeAt(profile: unknown, height: number, zMin: number) {
  return translate([0, 0, zMin], extrudeLinear({ height }, profile));
}

export const makePlanetaryAssembly = (p = defaultParams): geometries.geom3.Geom3[] => {
  const { module, pressureAngle, thickness, sunTeeth, planetTeeth, ringTeeth } = p;

  const carrierRadius = (module * (sunTeeth + planetTeeth)) / 2;
  const earDistance = 49;

  const sunProfile = subtract(generateGear2D(sunTeeth, module, pressureAngle, 0.008), circle({ radius: 4.0, segments: 32 }));
  const sunGear = named(colorize([0.85, 0.65, 0.15], extrudeAt(sunProfile, thickness, 4.5)), 'Sun Gear');
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

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const px = carrierRadius * Math.cos(angle);
    const py = carrierRadius * Math.sin(angle);
    const planet = translate([px, py, 0], rotateZ(Math.PI / 12, planetBody));
    planets.push(named(colorize([0.2, 0.55, 0.85], planet), \`Planet Gear \${i + 1}\`));
  }

  const ringPitchRadius = (module * ringTeeth) / 2;
  const ringOuterRadius = ringPitchRadius + 1.25 * module;
  const ringInnerRadius = ringPitchRadius - module;
  const ringPhaseOffset = Math.PI / ringTeeth;

  const ringImaginary2D = rotateZ(
    ringPhaseOffset,
    generateGear2D(ringTeeth, module, pressureAngle, -0.008, ringOuterRadius, ringInnerRadius),
  );

  const outerHousingProfile = circle({ radius: 44, segments: 96 });
  const earProfiles = [];
  const earHoleProfiles = [];

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const ex = earDistance * Math.cos(angle);
    const ey = earDistance * Math.sin(angle);
    earProfiles.push(circle({ center: [ex, ey], radius: 8, segments: 32 }));
    earHoleProfiles.push(circle({ center: [ex, ey], radius: 3.0, segments: 24 }));
  }

  const housingFloorProfile = subtract(
    union(outerHousingProfile, ...earProfiles),
    circle({ radius: 4.1, segments: 32 }),
    ...earHoleProfiles,
  );
  const housingRingProfile = subtract(outerHousingProfile, ringImaginary2D);

  const housingFloor = named(colorize([0.35, 0.35, 0.35], extrudeAt(housingFloorProfile, 4.5, 0)), 'Housing Floor');
  const housingRing = named(colorize([0.35, 0.35, 0.35], extrudeAt(housingRingProfile, 10.5, 4.5)), 'Housing Ring');

  const carrierWindowProfiles = [];
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    carrierWindowProfiles.push(circle({ center: [14 * Math.cos(angle), 14 * Math.sin(angle)], radius: 6, segments: 24 }));
  }

  const carrierPlateProfile = subtract(circle({ radius: 28, segments: 64 }), ...carrierWindowProfiles);
  const carrierPlate = named(colorize([0.8, 0.2, 0.2], extrudeAt(carrierPlateProfile, 3, 15)), 'Planet Carrier Plate');

  const carrierPins = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const px = carrierRadius * Math.cos(angle);
    const py = carrierRadius * Math.sin(angle);
    carrierPins.push(
      named(
        colorize(
          [0.8, 0.2, 0.2],
          cylinder({ center: [px, py, (5 + 15) / 2], height: 10, radius: 3.0, segments: 24 }),
        ),
        \`Carrier Pin \${i + 1}\`,
      ),
    );
  }

  const carrierOutputShaft = named(
    colorize(
      [0.8, 0.2, 0.2],
      cylinder({ center: [0, 0, 18 + 15 / 2], height: 15, radius: 5.0, segments: 32 }),
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
};

export default function main(p = defaultParams): geometries.geom3.Geom3[] {
  return makePlanetaryAssembly(p);
}
`;

export const planetaryGearGeoSpec = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Planetary Gear System', () => {
  it('should render the primary entry as watertight geometry', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toBeWatertight();
  });

  it('should render the library entry as watertight geometry', async () => {
    const model = await loadModel({ file: 'lib/planetaryGear.ts' });
    expectGeo(model).toBeWatertight();
  });
});
`;

const finalText = [
  'Created a multi-file planetary gear system in JSCAD.',
  '',
  '- `main.ts` is the primary assembly entry.',
  '- `lib/planetaryGear.ts` is a standalone reusable geometry entry.',
  '- Both compilation units, the focused GeoSpec checks, and multi-angle visual inspection completed successfully.',
].join('\n');

/** Synthetic single-chat replay for the primary + secondary JSCAD compilation path. */
export const planetaryGearCompositeFixture: ReplayFixture = {
  id: 'planetary-gear-composite',
  sourceModel: 'openai-gpt-5.6-luna',
  turns: [
    {
      reasoning:
        'I will establish the reusable planetary assembly first so the primary entry never observes a missing dependency.',
      toolCalls: [
        {
          name: 'create_file',
          args: { targetFile: '/lib/planetaryGear.ts', content: planetaryGearLibrary },
        },
      ],
      usage: { inputTokens: 1200, outputTokens: 320, reasoningTokens: 100 },
    },
    {
      toolCalls: [
        { name: 'create_file', args: { targetFile: '/main.ts', content: planetaryGearMain } },
        { name: 'create_file', args: { targetFile: '/main.geospec.ts', content: planetaryGearGeoSpec } },
      ],
      usage: { inputTokens: 1600, outputTokens: 180 },
    },
    {
      toolCalls: [
        { name: 'get_kernel_result', args: { targetFile: '/main.ts' } },
        { name: 'get_kernel_result', args: { targetFile: '/lib/planetaryGear.ts' } },
      ],
      usage: { inputTokens: 2100, outputTokens: 70 },
    },
    {
      toolCalls: [{ name: 'test_model', args: {} }],
      usage: { inputTokens: 2300, outputTokens: 30 },
    },
    {
      reasoning:
        'Before visual inspection I expect roughly 5,000–80,000 rendered vertices, bounds near X/Y ±44 mm and Z −10 to 33 mm, and an orthographic silhouette with four mounting ears, an outer ring, a central sun, four cardinal planet gears, and the carrier plate and pins. I will use one multi-angle capture because it already provides all six orthographic views.',
      toolCalls: [{ name: 'screenshot', args: { mode: 'multi_angle', targetFile: '/main.ts' } }],
      usage: { inputTokens: 2500, outputTokens: 90, reasoningTokens: 40 },
    },
    {
      text: finalText,
      usage: { inputTokens: 1000, outputTokens: 180 },
    },
  ],
};
