/**
 * CL-5 pin retention (spec Section 5.5, REQ-V8R2-060..064).
 *
 * The F-SEED-2 kill: circlip grooves at the spec span, seated clips with a
 * real retention shoulder, bounded axial float (the pin CANNOT reach the
 * cylinder wall), >= 18.5 boss engagement, and handbook full-float fits.
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assemblyStepLoadOptions,
  relationshipsForRequirement,
} from '../spec/requirements.js';

const loadAssemblyStep = async () => loadModel(assemblyStepLoadOptions);

const expectRequirementRelationships = async (
  requirementId: string,
): Promise<void> => {
  const model = await loadAssemblyStep();
  expectGeo(model).toHaveSpatialRelationships({
    relationships: relationshipsForRequirement(requirementId),
  });
};

describe('V8R2 CL-5 pin retention', () => {
  it('REQ-V8R2-060: every piston has two circlip grooves Ø23.6 x 1.30 at the spec span, clips seated', async () => {
    await expectRequirementRelationships('REQ-V8R2-060');
  });

  it('REQ-V8R2-061: 16 circlips seated with a retention shoulder protruding >= 0.9 inboard of the pin bore', async () => {
    await expectRequirementRelationships('REQ-V8R2-061');
  });

  it('REQ-V8R2-062: pin axial float is bounded 0.2-1.0 total — the pin cannot reach the cylinder wall', async () => {
    await expectRequirementRelationships('REQ-V8R2-062');
  });

  it('REQ-V8R2-063: pin-in-boss engagement >= 18.5 per side; the v1 10.0 engagement is prohibited', async () => {
    await expectRequirementRelationships('REQ-V8R2-063');
  });

  it('REQ-V8R2-064: handbook full-float fits — boss 0.005-0.015 (F01), bushing 0.008-0.018 (F02)', async () => {
    await expectRequirementRelationships('REQ-V8R2-064');
  });
});
