/**
 * CL-4 valvetrain drive (spec Section 5.4, REQ-V8R2-050..059).
 *
 * The drive chain must be kinematically alive end to end: true cam
 * profiles under lifter feet, gear pitch cylinders tangent at the exact
 * centre distance (no chain occurrence exists in rev2.0), complete
 * keeper/retainer stacks, true helical springs at installed height,
 * pivoting rockers, and full-diameter ball-end pushrods.
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assertDeferralsRegistered,
  assertProcessOnlyRegistered,
  relationshipsForRequirement,
  testExports,
  tolerances,
} from '../spec/requirements.js';

const loadAssemblyStep = async () =>
  loadModel({ file: testExports.assembly, format: 'step', mesh: false });

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

describe('V8R2 CL-4 valvetrain drive', () => {
  it('REQ-V8R2-050: true cam lobe form (base circle Ø32) with cylinder-1 lifters on the base circle', async () => {
    const camshaft = await loadPartStep(testExports.camshaft);
    // Base circle Ø32.0 (r16) on the cam axis; eccentric discs prohibited.
    expectGeo(camshaft).toHaveCylindricalFace({
      radius: 16,
      axis: 'x',
      tolerance: tolerances.fine,
    });
    await expectRequirementRelationships('REQ-V8R2-050');
  });

  it('REQ-V8R2-051: all 16 lifter crowned feet contact their lobe at the modeled phase', async () => {
    await expectRequirementRelationships('REQ-V8R2-051');
  });

  it('REQ-V8R2-052: gear pitch cylinders (Ø80 + Ø160) tangent within 0.05 at centre distance 120.0', async () => {
    await expectRequirementRelationships('REQ-V8R2-052');
  });

  it('REQ-V8R2-055: cam thrust plate bolted to the block; endplay gaps inside the F16 band', async () => {
    await expectRequirementRelationships('REQ-V8R2-055');
  });

  it('REQ-V8R2-056: 16 complete keeper/retainer stacks — beads in grooves, cones on retainers, steps on springs', async () => {
    await expectRequirementRelationships('REQ-V8R2-056');
  });

  it('REQ-V8R2-057: true helical springs seated at installed height 40.0 +/-0.5, all 16', async () => {
    await expectRequirementRelationships('REQ-V8R2-057');
  });

  it('REQ-V8R2-058: rockers pivot on stud-mounted balls, pallets on valve tips, studs engaged >= 20.0', async () => {
    await expectRequirementRelationships('REQ-V8R2-058');
  });

  it('REQ-V8R2-059: 16 pushrods at full Ø9.5 with ball ends contained in lifter and rocker cups', async () => {
    await expectRequirementRelationships('REQ-V8R2-059');
  });

  it('REQ-V8R2-053 (deferral): gear mesh backlash 0.08-0.20 waits on the mesh-semantics frontier', () => {
    assertDeferralsRegistered('valvetrain-drive', ['REQ-V8R2-053']);
  });

  it('REQ-V8R2-054 (registry): timing ratio 2:1 and firing-order phase table are a process review item', () => {
    assertProcessOnlyRegistered('valvetrain-drive', ['REQ-V8R2-054']);
  });
});
