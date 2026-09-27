import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

const names = [
  'Base pedestal',
  'Turret',
  'Shoulder motor',
  'Upper arm',
  'Elbow motor',
  'Forearm',
  'Wrist housing',
  'Wrist pitch body',
  'Tool flange',
  'Gripper',
];

// J1 90, j2 90, j3 -90, j4 90, j5 90: the arm reaches straight out along +Y at shoulder height
// and the wrist turns the tool sideways, so the flange centre lands at (-66, 560, 300).
const posed = {
  height: 300,
  reach: 560,
  j1: 90,
  j2: 90,
  j3: -90,
  j4: 90,
  j5: 90,
  j6: 0,
};

describe('Six-axis arm', () => {
  it('has the home-pose envelope', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({
      min: { x: -110, y: -110, z: 0 },
      max: { x: 411, y: 126, z: 620 },
      tolerance: 0.2,
    });
  });

  it('contains closed, uniquely named link solids', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        ...names.map((name) => ({ name, count: 1 })),
        {
          name: 'Base pedestal',
          bounds: { min: { z: 0 }, max: { z: 110 }, tolerance: 0.05 },
        },
        {
          name: 'Tool flange',
          bounds: { center: { x: 346, y: 0, z: 580 }, tolerance: 0.05 },
        },
      ],
    });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.015 });
  });

  it('places the tool flange where forward kinematics puts it', async () => {
    const model = await loadModel({ file: 'main.ts', parameters: posed });
    expectGeo(model).toHaveAssemblyOccurrences({
      occurrences: [
        {
          name: 'Tool flange',
          bounds: { center: { x: -66, y: 560, z: 300 }, tolerance: 0.05 },
        },
      ],
    });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.015 });
  });

  it('provides valid millimetre BRep with the anchor-bolt pattern', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'step' });
    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveStepUnits({ unit: 'mm' });
    expectGeo(model).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 13.5,
      boltCircleDiameter: 196,
      axis: 'z',
      center: { x: 0, y: 0 },
      tolerance: 0.03,
    });
  });
});
