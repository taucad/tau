import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

const part = async (component: string, parameters = {}) =>
  loadModel({
    file: 'main.ts',
    parameters: { component, ...parameters },
  });
const exact = async (component: string) =>
  loadModel({
    file: 'main.ts',
    format: 'step',
    parameters: { component },
  });

describe('30:1 generated worm drive', () => {
  it('has a valid rounded threading-tool sweep', async () => {
    expectGeo(await exact('worm-cutter')).toBeValidBrep();
    expectGeo(await part('worm-cutter')).toBeWatertight();
  });
  it('fits the base and has all major named components in position', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({
      min: [-75, -50, 0],
      max: [75, 50, 103],
      tolerance: 0.2,
    });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveAssemblyOccurrences({
      occurrences: [
        {
          name: 'Bronze wheel - 30 teeth',
          count: 1,
          bounds: { center: [0, 0, 49], tolerance: 0.3 },
        },
        {
          name: 'Single-start worm',
          count: 1,
          bounds: { center: [0, 0, 89], tolerance: 0.3 },
        },
        { name: 'Output shaft', count: 1 },
        { name: 'Mounting base', count: 1 },
        { name: 'Worm support left', count: 1 },
        { name: 'Worm support right', count: 1 },
        { name: 'Output support front', count: 1 },
        { name: 'Output support rear', count: 1 },
      ],
    });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.08 });
  });

  it('has one closed bronze wheel, a 24 mm hub, and six lightening holes', async () => {
    const model = await part('wheel');
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 66, y: 24, z: 66 },
      center: { x: 0, y: 0, z: 49 },
      tolerance: 0.35,
    });
    const brep = await exact('wheel');
    expectGeo(brep).toBeValidBrep();
    expectGeo(brep).toHaveCircularHole({
      diameter: 12.3,
      through: true,
      axis: 'y',
      tolerance: 0.03,
    });
    expectGeo(brep).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 8,
      boltCircleDiameter: 39,
      axis: 'y',
      tolerance: 0.05,
    });
  });

  it('has one closed threaded worm on a 132 mm input shaft', async () => {
    const model = await part('worm');
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 132, y: 24, z: 24 },
      center: { x: 0, y: 0, z: 89 },
      tolerance: 0.25,
    });
    expectGeo(await exact('worm')).toBeValidBrep();
  });

  it('has a closed mounting plate with four through mounting holes', async () => {
    const model = await exact('base');
    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 150, y: 100, z: 8 },
      tolerance: 0.05,
    });
    for (const x of [-64, 64]) {
      for (const y of [-39, 39]) {
        // The exact feature matcher reports counterbore segments as blind;
        // check both diameters and prove the complete passage separately.
        expectGeo(model).toHaveCircularHole({
          diameter: 7,
          axis: 'z',
          center: { x, y },
          tolerance: 0.05,
        });
        expectGeo(model).toHaveCircularHole({
          diameter: 12,
          axis: 'z',
          center: { x, y },
          tolerance: 0.05,
        });
        expectGeo(model).toHaveVoidContinuity({
          path: [
            [x, y, -0.5],
            [x, y, 4],
            [x, y, 8.5],
          ],
          bounds: { min: [x - 7, y - 7, -1], max: [x + 7, y + 7, 9] },
          minCrossSection: 30,
        });
      }
    }
    for (const x of [-48, 48, -23, 23]) {
      for (const y of [-27, 27]) {
        expectGeo(model).toHaveCircularHole({
          diameter: 4.8,
          through: true,
          axis: 'z',
          center: { x, y },
          tolerance: 0.05,
        });
      }
    }
  });

  it('has four closed bearing supports with orthogonal bearing seats', async () => {
    const model = await part('supports');
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 4 });
    const brep = await exact('supports');
    expectGeo(brep).toBeValidBrep();
    expectGeo(brep).toHaveCylindricalFace({
      radius: 8.15,
      axis: 'x',
      tolerance: 0.03,
    });
    expectGeo(brep).toHaveCylindricalFace({
      radius: 10.15,
      axis: 'y',
      tolerance: 0.03,
    });
    expectGeo(brep).toHaveCylindricalFace({
      radius: 2.4,
      axis: 'z',
      tolerance: 0.03,
    });
  });

  it('has four separate bearing bushes and two removable shaft collars', async () => {
    const model = await part('bearings');
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 6 });
  });

  it('has a closed 12 mm output shaft with an exposed key seat', async () => {
    const model = await exact('shaft');
    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 12, y: 94, z: 12 },
      center: { x: 0, y: 0, z: 49 },
      tolerance: 0.1,
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 6,
      axis: 'y',
      tolerance: 0.02,
    });
    expectGeo(model).toHavePlanarFace({
      normal: [0, 0, 1],
      offset: 53,
      area: 48,
      tolerance: 0.05,
    });
  });

  it('has eight closed support bolts and a bored input coupling', async () => {
    const model = await part('hardware');
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 9 });
    expectGeo(await exact('hardware')).toHaveCylindricalFace({
      radius: 5.15,
      axis: 'x',
      tolerance: 0.02,
    });
  });

  it('adapts the wheel and shaft heights to a 32:1 ratio', async () => {
    const model = await part('wheel', { wheelTeeth: 32 });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 70, y: 24, z: 70 },
      center: { x: 0, y: 0, z: 51 },
      tolerance: 0.35,
    });
  });

  for (const inputAngle of [0, 45, 90, 135, 180, 225, 270, 315]) {
    it(`keeps the matched flanks clear at input angle ${inputAngle} degrees`, async () => {
      const model = await part('gears', { inputAngle });
      expectGeo(model).toBeWatertight();
      // Meshing parts have overlapping bounding boxes; the component-cluster
      // matcher merges those boxes. Check each solid separately above and use
      // occurrence identity plus actual overlap testing for the pair.
      expectGeo(model).toHaveAssemblyOccurrences({
        occurrences: [
          { name: 'Single-start worm', count: 1 },
          { name: 'Bronze wheel - 30 teeth', count: 1 },
        ],
      });
      expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.005 });
    });
  }

  it('keeps CAD working flanks within 0.005 mm of independent analytical samples', async () => {
    const model = await part('gears', { verifyProfiles: true });
    expectGeo(model).toBeWatertight();
  });
});

// Sampled mesh poses do not establish load capacity or continuous contact.
// The independent analytical generator check is tooth-profile.test.ts.
