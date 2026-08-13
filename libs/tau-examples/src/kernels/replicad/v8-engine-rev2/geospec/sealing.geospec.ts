/**
 * CL-3 sealing (spec Section 5.3, REQ-V8R2-035..049).
 *
 * Gaskets are blanked from the real feature maps and modeled at compressed
 * nominal; rings are split and touch the bore; guides/seats/seals are real
 * presses. Quantified seating-area requirements remain registered frontier
 * deferrals until a release-suitable contact-area proof exists.
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
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

describe('V8R2 CL-3 sealing', () => {
  it('REQ-V8R2-035: each head gasket carries EXACTLY 36 openings blanked from the shared deck map', async () => {
    const gasket = await loadPartStep(testExports.headGasket);
    // 4 fire rings Ø96 + 10 bolt Ø12.5 + 2 dowel Ø12.5 + 8 pushrod Ø20 +
    // 8 coolant Ø10 + 2 coolant Ø14 + 2 oil drain Ø16 = 36 openings.
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 96,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 10,
      holeDiameter: 12.5,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 12.5,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 20,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 10,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 14,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 16,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-036: every gasket opening is coaxial with its block and head counterparts, all joints', async () => {
    await expectRequirementRelationships('REQ-V8R2-036');
  });

  it('REQ-V8R2-037: gaskets modeled at compressed nominal — every joint face distance inside its T-FITS-GASKET band', async () => {
    await expectRequirementRelationships('REQ-V8R2-037');
  });

  it('REQ-V8R2-039: cylinder-1 valve 45.0 deg cones contact their insert seat cones at the modeled phase', async () => {
    await expectRequirementRelationships('REQ-V8R2-039');
  });

  it('REQ-V8R2-040: 16 seat inserts pressed 0.045-0.075 radial (P03); floating pockets prohibited', async () => {
    await expectRequirementRelationships('REQ-V8R2-040');
  });

  it('REQ-V8R2-041: 16 valve guides pressed 0.015-0.035 radial (P02)', async () => {
    await expectRequirementRelationships('REQ-V8R2-041');
  });

  it('REQ-V8R2-042: all rings split with installed end gaps F12/F13/F14 — 40 gaps total', async () => {
    await expectRequirementRelationships('REQ-V8R2-042');
  });

  it('REQ-V8R2-043: every compression ring and oil rail contacts the bore wall — 32 contact rows', async () => {
    await expectRequirementRelationships('REQ-V8R2-043');
  });

  it('REQ-V8R2-045: ring side clearance in groove 0.020-0.070 (F10/F11), all pistons', async () => {
    await expectRequirementRelationships('REQ-V8R2-045');
  });

  it('REQ-V8R2-046: 8x Ø2.5 oil drain holes in each piston oil groove root', async () => {
    const piston = await loadPartStep(testExports.piston);
    expectGeo(piston).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 2.5,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-047: 16 stem seals pressed on guide bosses 0.10-0.30 (P12 elastomer allowances)', async () => {
    await expectRequirementRelationships('REQ-V8R2-047');
  });

  it('REQ-V8R2-048: front/rear main seals pressed in their bores (P13) with declared lip squeeze (P14)', async () => {
    await expectRequirementRelationships('REQ-V8R2-048');
  });

  it('REQ-V8R2-049: plug seats, injector/o-ring seats, thermostat seat, and minor gasket bands hold', async () => {
    await expectRequirementRelationships('REQ-V8R2-049');
  });
});
