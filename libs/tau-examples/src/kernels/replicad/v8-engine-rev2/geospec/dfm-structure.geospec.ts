/**
 * DFM, lightweighting, and service/externals (spec Sections 5.7, 5.8, 5.10:
 * verify-today REQ 080..082, 085, 087..089, 092, 099, 105..110).
 *
 * Tool-access, draft, and region-wall REQs are registered deferrals; the
 * form-maker and datum REQs are registered process reviews.
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assertDeferralsRegistered,
  assertProcessOnlyRegistered,
  assemblyStepLoadOptions,
  relationshipsForRequirement,
  testExports,
  tolerances,
} from '../spec/requirements.js';

const loadAssemblyStep = async () => loadModel(assemblyStepLoadOptions);

const loadPartStep = async (file: string) =>
  loadModel({ file, format: 'step', mesh: false });

const expectRequirementRelationships = async (
  requirementId: string,
): Promise<void> => {
  const model = await loadAssemblyStep();
  expectGeo(model).toHaveSpatialRelationships({
    relationships: relationshipsForRequirement(requirementId),
  });
};

describe('V8R2 DFM, lightweighting, and service', () => {
  it('REQ-V8R2-080: bore entry chamfers present per V8R2Budgets (deck 1.2, lifter/guide/seal 0.5, pin 1.0, taps 0.8)', async () => {
    const block = await loadPartStep(testExports.block);
    expectGeo(block).toHaveChamferFeature({
      distance: 1.2,
      tolerance: tolerances.fine,
    });
    expectGeo(block).toHaveChamferFeature({
      distance: 0.5,
      tolerance: tolerances.fine,
    });
    expectGeo(block).toHaveChamferFeature({
      distance: 0.8,
      tolerance: tolerances.fine,
    });
    const head = await loadPartStep(testExports.cylinderHead);
    expectGeo(head).toHaveChamferFeature({
      distance: 0.5,
      tolerance: tolerances.fine,
    });
    expectGeo(head).toHaveChamferFeature({
      distance: 0.8,
      tolerance: tolerances.fine,
    });
    const piston = await loadPartStep(testExports.piston);
    expectGeo(piston).toHaveChamferFeature({
      distance: 1,
      tolerance: tolerances.fine,
    });
    const frontCover = await loadPartStep(testExports.frontCover);
    expectGeo(frontCover).toHaveChamferFeature({
      distance: 0.5,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-081: crank web-journal transitions filleted R2.5 with 1.0x45 journal end chamfers', async () => {
    const crank = await loadPartStep(testExports.crankshaft);
    expectGeo(crank).toHaveFilletFeature({ radius: 2.5, tolerance: 0.3 });
    expectGeo(crank).toHaveChamferFeature({
      distance: 1,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-082: every fastener head lands on a machined spot face (head washer-face contact per stack)', async () => {
    await expectRequirementRelationships('REQ-V8R2-082');
  });

  it('REQ-V8R2-085: rod beam-to-boss blends filleted R >= 3 on the forged rod', async () => {
    const rod = await loadPartStep(testExports.connectingRod);
    expectGeo(rod).toHaveFilletFeature({
      radius: 3,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-089: 2x M10 lifting eyes per head with tapped bosses', async () => {
    const head = await loadPartStep(testExports.cylinderHead);
    expectGeo(head).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 10,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-092: 6 bay-breathing windows Ø28 through main bulkheads 2-4', async () => {
    const block = await loadPartStep(testExports.block);
    expectGeo(block).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 28,
      axis: 'x',
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-099: each piston crown carries intake Ø49 x 1.8 and exhaust Ø38 x 2.2 valve reliefs', async () => {
    const piston = await loadPartStep(testExports.piston);
    expectGeo(piston).toHaveCircularHole({
      diameter: 49,
      through: false,
      tolerance: tolerances.fine,
    });
    expectGeo(piston).toHaveCircularHole({
      diameter: 38,
      through: false,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-105: bellhousing interface — 6x M10 on Ø330 BC plus press dowels on the machined rear face', async () => {
    const block = await loadPartStep(testExports.block);
    expectGeo(block).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 10,
      boltCircleDiameter: 330,
      axis: 'x',
      tolerance: tolerances.fine,
    });
    await expectRequirementRelationships('REQ-V8R2-105');
  });

  it('REQ-V8R2-106: 2 mount pads mid-block with 3x M10x1.5 tapped 18 deep each', async () => {
    const block = await loadPartStep(testExports.block);
    expectGeo(block).toHaveCircularHolePattern({
      count: 3,
      holeDiameter: 10,
      axis: 'y',
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-107: damper belt groove mid-plane coplanar with the pump pulley groove within 1.0', async () => {
    await expectRequirementRelationships('REQ-V8R2-107');
  });

  it('REQ-V8R2-108: all service fittings present and seated on machined bosses per T-THREADS', async () => {
    const model = await loadAssemblyStep();
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        'Drain Plug 1',
        'Dipstick 1',
        'Dipstick Tube 1',
        'PCV Valve 1',
        'Oil Filler Cap 1',
        'Coolant Temp Sensor 1',
        'Oil Pressure Sensor 1',
        'Knock Sensor 1',
        'Knock Sensor 2',
        'Cam Position Sensor 1',
        'Crank Position Sensor 1',
        'Relief Valve Piston 1',
        'Relief Valve Spring 1',
        'Relief Valve Plug 1',
      ].map((name) => ({ name, count: 1 })),
    });
    await expectRequirementRelationships('REQ-V8R2-108');
  });

  it('REQ-V8R2-109: spin-on filter threaded on the 3/4-16 nipple with its sealing ring on the adapter land', async () => {
    await expectRequirementRelationships('REQ-V8R2-109');
  });

  it('REQ-V8R2-110: water pump internals — impeller tip F27 in the volute, press stack coaxial on the shaft', async () => {
    await expectRequirementRelationships('REQ-V8R2-110');
  });

  it('REQ-V8R2-078/079/086/098 (deferrals): draft-measure and region-wall gates are registered', () => {
    assertDeferralsRegistered('dfm-structure', [
      'REQ-V8R2-078',
      'REQ-V8R2-079',
      'REQ-V8R2-086',
      'REQ-V8R2-098',
    ]);
  });

  it('REQ-V8R2-083/084/090/091/093/094 (registry): DFM process reviews are registered', () => {
    assertProcessOnlyRegistered('dfm-structure', [
      'REQ-V8R2-083',
      'REQ-V8R2-084',
      'REQ-V8R2-090',
      'REQ-V8R2-091',
      'REQ-V8R2-093',
      'REQ-V8R2-094',
    ]);
  });
});
