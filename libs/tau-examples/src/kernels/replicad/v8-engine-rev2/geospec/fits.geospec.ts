/**
 * CL-6 fit semantics (spec Section 5.6, REQ-V8R2-065..077).
 *
 * The micro-standoff regime is abolished: every interface classifies as
 * contact (gap <= 0.001), running (T-FITS-RUN band), press (T-FITS-PRESS
 * declared allowance), or compressed gasket. The interference allowance
 * list equals T-FITS-PRESS exactly, both directions (REQ-077).
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assertContactRowsExact,
  assemblyStepLoadOptions,
  expectedIntentionalInterferenceAllowances,
  pressFits,
  relationshipsForRequirement,
  testExports,
  tolerances,
} from '../spec/requirements.js';

const loadAssemblyStep = async () => loadModel(assemblyStepLoadOptions);

const loadAssemblyMesh = async () =>
  loadModel({
    file: testExports.assembly,
    format: 'glb',
    meshLinearTolerance: 0.1,
    meshAngularToleranceDegrees: 30,
  });

const expectRequirementRelationships = async (
  requirementId: string,
): Promise<void> => {
  const model = await loadAssemblyStep();
  expectGeo(model).toHaveSpatialRelationships({
    relationships: relationshipsForRequirement(requirementId),
  });
};

describe('V8R2 CL-6 fit semantics', () => {
  it('REQ-V8R2-065 (suite lint): every contact row in the contract asserts gap <= 0.001 — no standoffs', () => {
    assertContactRowsExact();
  });

  it('REQ-V8R2-065: residual T-FITS interfaces classify as running/press/contact (pump train, bushings, cam bearings)', async () => {
    await expectRequirementRelationships('REQ-V8R2-065');
  });

  it('REQ-V8R2-066: piston skirt-to-bore clearance 0.020-0.050 (F03) at the gauge point, all 8', async () => {
    await expectRequirementRelationships('REQ-V8R2-066');
  });

  it('REQ-V8R2-067: main bearing oil clearance 0.015-0.0325 radial (F04), all 5 mains', async () => {
    await expectRequirementRelationships('REQ-V8R2-067');
  });

  it('REQ-V8R2-068: rod bearing oil clearance 0.0125-0.030 radial (F05), all 8 rods', async () => {
    await expectRequirementRelationships('REQ-V8R2-068');
  });

  it('REQ-V8R2-069: cam bearing oil clearance 0.020-0.045 radial (F06), all 5 journals', async () => {
    await expectRequirementRelationships('REQ-V8R2-069');
  });

  it('REQ-V8R2-070: crank endplay bounded on the flanged thrust main #3 (F15 total 0.05-0.20)', async () => {
    await expectRequirementRelationships('REQ-V8R2-070');
  });

  it('REQ-V8R2-071: rod pair side clearance bounded on every crankpin (F17 total 0.25-0.55)', async () => {
    await expectRequirementRelationships('REQ-V8R2-071');
  });

  it('REQ-V8R2-072: lifter-to-bore clearance 0.010-0.030 (F07), all 16', async () => {
    await expectRequirementRelationships('REQ-V8R2-072');
  });

  it('REQ-V8R2-073: stem-to-guide clearance IN 0.012-0.030 (F08) / EX 0.018-0.038 (F09), all 16 valves', async () => {
    await expectRequirementRelationships('REQ-V8R2-073');
  });

  it('REQ-V8R2-074: damper hub pressed on the snout (P07) with the key contained in both keyways', async () => {
    await expectRequirementRelationships('REQ-V8R2-074');
  });

  it('REQ-V8R2-075: flywheel spigot concentric and registered (F18); pilot bushing pressed (P10)', async () => {
    await expectRequirementRelationships('REQ-V8R2-075');
  });

  it('REQ-V8R2-076: ring gear shrink 0.100-0.200 (P08) and reluctor press 0.030-0.060 (P09)', async () => {
    await expectRequirementRelationships('REQ-V8R2-076');
  });

  it('REQ-V8R2-077 (suite lint): the allowance list equals T-FITS-PRESS exactly, both directions', () => {
    const allowances = expectedIntentionalInterferenceAllowances();
    if (allowances.length !== pressFits.length) {
      throw new Error(
        `Allowance list has ${allowances.length} entries, T-FITS-PRESS has ${pressFits.length}.`,
      );
    }
    for (const press of pressFits) {
      const cited = allowances.filter((allowance) =>
        allowance.reason.startsWith(`${press.id} `),
      );
      if (cited.length !== 1) {
        throw new Error(
          `Press row ${press.id} must have exactly one allowance entry, found ${cited.length}.`,
        );
      }
    }
    for (const allowance of allowances) {
      if (
        !pressFits.some((press) => allowance.reason.startsWith(`${press.id} `))
      ) {
        throw new Error(
          `Allowance without a T-FITS-PRESS row: ${allowance.reason}`,
        );
      }
    }
  });

  it('REQ-V8R2-077: no unclassified positive-volume interference outside the declared P01-P16 allowances', async () => {
    const model = await loadAssemblyMesh();
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: tolerances.overlap,
      allowances: expectedIntentionalInterferenceAllowances(),
    });
  });
});
