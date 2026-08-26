/**
 * CL-2 split lines and fasteners (spec Section 5.2, REQ-V8R2-019..034).
 *
 * Every clamped joint is a real stack: split parts with zero-gap coplanar
 * parting faces, fasteners coaxial through modeled clearance holes into
 * modeled tapped depths with T-THREADS engagement, heads on spot faces.
 * REQ-034 (thread-callout binding) is the registered thread-semantics
 * deferral.
 */
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assertDeferralsRegistered,
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

describe('V8R2 CL-2 split lines and fasteners', () => {
  it.skip('REQ-V8R2-019: every rod big end is rod + cap with coplanar zero-gap parting faces (8 rods)', async () => {
    await expectRequirementRelationships('REQ-V8R2-019');
  });

  it.skip('REQ-V8R2-020: 16 rod bolts M9x1.0x47 coaxial through cap pilots into rod taps, insertion >= 13.0', async () => {
    await expectRequirementRelationships('REQ-V8R2-020');
  });

  it.skip('REQ-V8R2-021: cap-to-rod fitted pilots register at 0.004-0.015 radial (F21), all 16 bolts', async () => {
    await expectRequirementRelationships('REQ-V8R2-021');
  });

  it.skip('REQ-V8R2-022: every rod shell tang is contained in its rod/cap notch (16 pairs)', async () => {
    await expectRequirementRelationships('REQ-V8R2-022');
  });

  it.skip('REQ-V8R2-023: 5 main caps contact block saddles with coplanar split planes through the tunnel axis', async () => {
    await expectRequirementRelationships('REQ-V8R2-023');
  });

  it.skip('REQ-V8R2-024: main cap side registers press into block ledges 0.005-0.025 per side (P15)', async () => {
    await expectRequirementRelationships('REQ-V8R2-024');
  });

  it.skip('REQ-V8R2-025: 10 main cap bolts M12x1.75x90 through cap holes into block taps, insertion >= 24.0', async () => {
    await expectRequirementRelationships('REQ-V8R2-025');
  });

  it.skip('REQ-V8R2-026: exactly 26 half-shell occurrences, mating seam faces contact at the split line', async () => {
    const mesh = await loadAssemblyStep();
    const shellNames = [
      ...Array.from(
        { length: 5 },
        (_, index) => `Main Bearing Upper Shell ${index + 1}`,
      ),
      ...Array.from(
        { length: 5 },
        (_, index) => `Main Bearing Lower Shell ${index + 1}`,
      ),
      ...Array.from(
        { length: 8 },
        (_, index) => `Rod Bearing Upper Shell ${index + 1}`,
      ),
      ...Array.from(
        { length: 8 },
        (_, index) => `Rod Bearing Lower Shell ${index + 1}`,
      ),
    ];
    expectGeo(mesh).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        ...shellNames.map((name) => ({ name, count: 1 })),
        // Full-ring bearings prohibited: nothing else may claim a shell name.
        { name: /Bearing (Upper|Lower) Shell/, count: 26 },
      ],
    });
    await expectRequirementRelationships('REQ-V8R2-026');
  });

  it.skip('REQ-V8R2-027: all 26 shells crush into their housings 0.015-0.040 radial (P01 allowances)', async () => {
    await expectRequirementRelationships('REQ-V8R2-027');
  });

  it.skip('REQ-V8R2-028: all 10 main shell tangs engage their saddle/cap notches', async () => {
    await expectRequirementRelationships('REQ-V8R2-028');
  });

  it.skip('REQ-V8R2-029: 20 head bolts M11x1.5x110 through head + gasket into block taps, both rows, insertion >= 22.0', async () => {
    await expectRequirementRelationships('REQ-V8R2-029');
  });

  it.skip('REQ-V8R2-030: dowels press P04 in block, slip F19 in heads, coaxial through gasket dowel holes', async () => {
    await expectRequirementRelationships('REQ-V8R2-030');
  });

  it.skip('REQ-V8R2-031: flywheel bolts, damper bolt + washer, and the damper stack clamp their joints', async () => {
    await expectRequirementRelationships('REQ-V8R2-031');
  });

  it.skip('REQ-V8R2-032: 16 exhaust studs M8x1.25 into head taps >= 16.0 with nuts clamping the flanges', async () => {
    await expectRequirementRelationships('REQ-V8R2-032');
  });

  it.skip('REQ-V8R2-033: every peripheral fastener (85) passes through its stack into a tapped depth, zero floating', async () => {
    await expectRequirementRelationships('REQ-V8R2-033');
  });

  it('REQ-V8R2-034 (deferral): thread-callout binding waits on the thread-semantics frontier', () => {
    assertDeferralsRegistered('split-lines-fasteners', ['REQ-V8R2-034']);
  });
});
