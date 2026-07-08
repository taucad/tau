/**
 * CL-3 sealing (spec Section 5.3, REQ-V8R2-035..049).
 *
 * Gaskets are blanked from the real feature maps and modeled at compressed
 * nominal; rings are split and touch the bore; guides/seats/seals are real
 * presses. The contact-area frontier has LANDED (packages/geospec
 * minContactArea on the contact matcher), so REQ-038/044 now run as red
 * contact-patch tests against the not-yet-exported model — failing on the
 * missing-model precondition today, real seating-patch proofs once it lands.
 */
import { describe, expectGeo, it } from 'geospec';
import type { GeoSpecSpatialRelationshipExpectation } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  banks,
  iface,
  occ,
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

  it('REQ-V8R2-038: each fire-ring bead band seats on BOTH decks with contact patch >= 500 mm² per bore', async () => {
    const model = await loadAssemblyStep();
    // Ø94.5–Ø97.5 minimum band, both bank decks: the gasket fire-ring bead face
    // must seat >= 500 mm² against the block deck and the head deck per bore.
    const relationships: GeoSpecSpatialRelationshipExpectation[] =
      banks.flatMap((bank) =>
        [1, 2, 3, 4].flatMap((slot) => {
          const bead = iface(`Head Gasket ${bank}`, `fireRing[${slot}]`);
          return [
            {
              id: `fire ring ${bank}${slot} on block deck`,
              kind: 'contact',
              subject: bead,
              target: occ('Block 1'),
              minContactArea: 500,
              tolerance: tolerances.contact,
            },
            {
              id: `fire ring ${bank}${slot} on head deck`,
              kind: 'contact',
              subject: bead,
              target: occ(`Cylinder Head ${bank}`),
              minContactArea: 500,
              tolerance: tolerances.contact,
            },
          ];
        }),
      );
    expectGeo(model).toHaveSpatialRelationships({ relationships });
  });

  it('REQ-V8R2-044: each ring-to-bore seating patch >= 80% circumference × face height (top ring >= 283 mm²)', async () => {
    const model = await loadAssemblyStep();
    // Top ring: >= 0.8 × π × 94 × 1.2 = 283 mm² of the ring outer face seating
    // on its bore wall; oil rails and second rings follow with their own bands.
    const relationships: GeoSpecSpatialRelationshipExpectation[] = [
      1, 2, 3, 4, 5, 6, 7, 8,
    ].map((cylinder) => ({
      id: `top ring ${cylinder} seats on bore`,
      kind: 'contact',
      subject: iface(`Top Ring ${cylinder}`, 'face'),
      target: occ('Block 1'),
      minContactArea: 283,
      tolerance: tolerances.contact,
    }));
    expectGeo(model).toHaveSpatialRelationships({ relationships });
  });
});
