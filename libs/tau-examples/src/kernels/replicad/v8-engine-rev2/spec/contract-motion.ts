/**
 * Contract rows for CL-4 valvetrain drive, CL-5 pin retention, CL-6 fit
 * semantics, and the verify-today DFM/service relationships (REQ 107..110).
 * Bands verbatim from T-FITS; press rows cite their
 * T-FITS-PRESS id.
 */
import {
  cylinders,
  datumOf,
  headOf,
  iface,
  interferenceProofMinVolume,
  tolerances,
  valves,
} from './contract-base.js';
import type { ContractRow, ContractSelector } from './contract-base.js';
import { pressFitReason, runningFitBand, runningFitReason } from './fits.js';

const block = 'Block 1';
const crank = 'Crankshaft 1';
const cam = 'Camshaft 1';
const manifold = 'Intake Manifold 1';
const frontCover = 'Front Cover 1';

const clearanceRow = (options: {
  requirementId: string;
  id: string;
  subject: ContractSelector;
  target: ContractSelector;
  fitId: string;
  alsoVerifies?: string[];
}): ContractRow => ({
  requirementId: options.requirementId,
  ...(options.alsoVerifies ? { alsoVerifies: options.alsoVerifies } : {}),
  id: options.id,
  kind: 'clearance',
  subject: options.subject,
  target: options.target,
  ...runningFitBand(options.fitId),
  tolerance: tolerances.band,
  reason: runningFitReason(options.fitId),
});

const pressRow = (options: {
  requirementId: string;
  id: string;
  subject: ContractSelector;
  target: ContractSelector;
  pressId: string;
  alsoVerifies?: string[];
}): ContractRow => ({
  requirementId: options.requirementId,
  ...(options.alsoVerifies ? { alsoVerifies: options.alsoVerifies } : {}),
  id: options.id,
  kind: 'interference',
  subject: options.subject,
  target: options.target,
  minVolume: interferenceProofMinVolume,
  reason: pressFitReason(options.pressId),
});

// ---------------------------------------------------------------------------
// CL-4 valvetrain drive (verify-today: REQ 050, 051, 052, 055, 056, 057,
// 058, 059)
// ---------------------------------------------------------------------------

const valvetrainDriveRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];

  // REQ-V8R2-050/051 — every lifter foot contacts its lobe at the modeled
  // phase; cylinder-1 lifters (v = 1, 2) sit on the base circle (REQ-050
  // owns those two rows, single authoritative row per pair).
  for (const { valve } of valves) {
    const cylinderOne = valve <= 2;
    rows.push({
      requirementId: cylinderOne ? 'REQ-V8R2-050' : 'REQ-V8R2-051',
      ...(cylinderOne ? { alsoVerifies: ['REQ-V8R2-051'] } : {}),
      id: `Lifter ${valve} crowned foot contacts cam lobe ${valve} at the modeled phase`,
      kind: 'contact',
      subject: iface(`Lifter ${valve}`, 'foot'),
      target: iface(cam, `lobe[${valve}]`),
      tolerance: tolerances.contact,
      reason: cylinderOne
        ? 'REQ-V8R2-050: true cam profile (base circle Ø32.0, lift 6.5, nose R3.5, flanks R60); cylinder-1 lifters on base circle at modeled phase'
        : 'REQ-V8R2-051: base circle, flank, or nose contact per phase table — drive chain kinematically alive',
    });
  }

  // REQ-V8R2-052 — gear pitch geometry: pitch cylinders tangent within 0.05,
  // gears on their axes, cam gear piloted on the nose spigot. The v1
  // decorative chain is deleted (census closure enforces absence).
  rows.push(
    {
      requirementId: 'REQ-V8R2-052',
      id: 'crank gear pitch cylinder is tangent to cam gear pitch cylinder within 0.05',
      kind: 'clearance',
      subject: iface('Crank Timing Gear 1', 'pitchSurface'),
      target: iface('Cam Gear 1', 'pitchSurface'),
      min: 0,
      max: 0.05,
      tolerance: tolerances.band,
      reason:
        'REQ-V8R2-052: pitch Ø80.00 + Ø160.00, radii 40.0 + 80.0 = centre distance 120.0 exactly',
    },
    {
      requirementId: 'REQ-V8R2-052',
      id: 'crank timing gear bore is coaxial with the crank centerline',
      kind: 'coaxial',
      subject: iface('Crank Timing Gear 1', 'bore'),
      target: datumOf(crank, 'centerline'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
    },
    {
      requirementId: 'REQ-V8R2-052',
      id: 'cam gear bore is coaxial with the camshaft centerline',
      kind: 'coaxial',
      subject: iface('Cam Gear 1', 'bore'),
      target: datumOf(cam, 'centerline'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
    },
    {
      requirementId: 'REQ-V8R2-052',
      id: 'cam gear pilot recess seats on the cam nose spigot Ø28',
      kind: 'contact',
      subject: iface('Cam Gear 1', 'pilotRecess'),
      target: iface(cam, 'noseSpigot'),
      tolerance: tolerances.contact,
    },
  );

  // REQ-V8R2-055 — cam thrust plate bolted to the block front face; endplay
  // gaps bounded (F16 total 0.05-0.15 across collar and hub faces).
  rows.push(
    {
      requirementId: 'REQ-V8R2-055',
      id: 'Cam Thrust Plate 1 seats on the block front face',
      kind: 'contact',
      subject: iface('Cam Thrust Plate 1', 'blockJoint'),
      target: iface(block, 'camPlateSeat'),
      tolerance: tolerances.contact,
    },
    {
      requirementId: 'REQ-V8R2-055',
      id: 'cam thrust collar to plate face gap stays inside the F16 total band',
      kind: 'clearance',
      subject: iface(cam, 'thrustCollar'),
      target: iface('Cam Thrust Plate 1', 'camFaces'),
      min: 0,
      max: 0.15,
      tolerance: tolerances.band,
      reason:
        'T-FITS-RUN F16 cam endplay 0.05-0.15 TOTAL; per-face gap bounded, sum realized by geometry',
    },
    {
      requirementId: 'REQ-V8R2-055',
      id: 'plate to cam gear hub face gap stays inside the F16 total band',
      kind: 'clearance',
      subject: iface('Cam Thrust Plate 1', 'camFaces'),
      target: iface('Cam Gear 1', 'hubFace'),
      min: 0,
      max: 0.15,
      tolerance: tolerances.band,
      reason:
        'T-FITS-RUN F16 cam endplay 0.05-0.15 TOTAL; per-face gap bounded, sum realized by geometry',
    },
  );

  // REQ-V8R2-056 — keeper/retainer stacks: keeper beads contained in the
  // stem groove Ø6.6x1.5, keeper cones on the retainer 7 deg cone, retainer
  // step on the spring top coil. 16 complete stacks.
  for (const { valve, slot } of valves) {
    const valveName = `${slot} Valve ${Math.ceil(valve / 2)}`;
    const retainer = `Spring Retainer ${valve}`;
    for (const keeperSide of [1, 2] as const) {
      const keeper = `Valve Keeper ${2 * (valve - 1) + keeperSide}`;
      rows.push(
        {
          requirementId: 'REQ-V8R2-056',
          id: `${keeper} bead is contained in ${valveName} stem groove`,
          kind: 'containment',
          subject: iface(keeper, 'bead'),
          target: iface(valveName, 'keeperGroove'),
          tolerance: tolerances.depth,
          reason: 'REQ-V8R2-056: stem groove Ø6.6 x 1.5',
        },
        {
          requirementId: 'REQ-V8R2-056',
          id: `${keeper} cone contacts ${retainer} 7 deg keeper cone`,
          kind: 'contact',
          subject: iface(keeper, 'cone'),
          target: iface(retainer, 'keeperCone'),
          tolerance: tolerances.contact,
        },
      );
    }
    rows.push({
      requirementId: 'REQ-V8R2-056',
      id: `${retainer} spring step contacts Valve Spring ${valve} top coil`,
      kind: 'contact',
      subject: iface(retainer, 'springStep'),
      target: iface(`Valve Spring ${valve}`, 'retainerEnd'),
      tolerance: tolerances.contact,
    });
  }

  // REQ-V8R2-057 — true helical springs at installed height 40.0 +/-0.5
  // (head seat pocket floor to retainer underside), seated both ends.
  for (const { valve, bank, bankValve } of valves) {
    rows.push(
      {
        requirementId: 'REQ-V8R2-057',
        id: `Valve Spring ${valve} installed height stays at 40.0 +/-0.5`,
        kind: 'clearance',
        subject: iface(headOf(bank), `springPocket[${bankValve}]`),
        target: iface(`Spring Retainer ${valve}`, 'underside'),
        min: 39.5,
        max: 40.5,
        tolerance: tolerances.band,
        reason:
          'REQ-V8R2-057: installed height 40.0 +/-0.5 (wire Ø4.2, mean coil Ø26.0, 7.2 coils)',
      },
      {
        requirementId: 'REQ-V8R2-057',
        id: `Valve Spring ${valve} ground seat end sits in its head pocket`,
        kind: 'contact',
        subject: iface(`Valve Spring ${valve}`, 'seatEnd'),
        target: iface(headOf(bank), `springPocket[${bankValve}]`),
        tolerance: tolerances.contact,
      },
    );
  }

  // REQ-V8R2-058 — rockers pivot on stud-mounted balls; pallet on valve tip;
  // adjuster nut clamps the ball; stud engaged 20 into the head boss.
  for (const { valve, slot, bank, bankValve } of valves) {
    const rocker = `Rocker Arm ${valve}`;
    const valveName = `${slot} Valve ${Math.ceil(valve / 2)}`;
    rows.push(
      {
        requirementId: 'REQ-V8R2-058',
        id: `${rocker} socket pivots on Rocker Pivot Ball ${valve}`,
        kind: 'contact',
        subject: iface(rocker, 'pivotSocket'),
        target: iface(`Rocker Pivot Ball ${valve}`, 'sphere'),
        tolerance: tolerances.contact,
        reason:
          'REQ-V8R2-058: arm radii 38.4/24.0 give ratio 1.6 (valve lift 10.4 = 6.5 x 1.6)',
      },
      {
        requirementId: 'REQ-V8R2-058',
        id: `${rocker} pallet contacts ${valveName} tip`,
        kind: 'contact',
        subject: iface(rocker, 'pallet'),
        target: iface(valveName, 'tip'),
        tolerance: tolerances.contact,
      },
      {
        requirementId: 'REQ-V8R2-058',
        id: `Rocker Adjuster Nut ${valve} clamps Rocker Pivot Ball ${valve}`,
        kind: 'contact',
        subject: iface(`Rocker Adjuster Nut ${valve}`, 'clampFace'),
        target: iface(`Rocker Pivot Ball ${valve}`, 'topFace'),
        tolerance: tolerances.contact,
      },
      {
        requirementId: 'REQ-V8R2-058',
        id: `Rocker Stud ${valve} engages its head boss by >= 20.0`,
        kind: 'insertion',
        subject: iface(`Rocker Stud ${valve}`, 'headThread'),
        target: iface(headOf(bank), `studTap[${bankValve}]`),
        min: 20,
        tolerance: tolerances.depth,
        reason:
          'T-THREADS rocker studs M10x1.5 lower: min engagement 20.0 (2.0d)',
      },
    );
  }

  // REQ-V8R2-059 — pushrods at FULL Ø9.5 with R4.75 ball ends contained and
  // contacting lifter cup R5.0 and rocker cup R5.0.
  for (const { valve } of valves) {
    const pushrod = `Pushrod ${valve}`;
    rows.push(
      {
        requirementId: 'REQ-V8R2-059',
        id: `${pushrod} lower ball is contained in Lifter ${valve} cup`,
        kind: 'containment',
        subject: iface(pushrod, 'lifterBall'),
        target: iface(`Lifter ${valve}`, 'cup'),
        tolerance: tolerances.depth,
        reason:
          'REQ-V8R2-059: R4.75 ball in R5.0 cup; the v1 0.34x diameter dodge is prohibited',
      },
      {
        requirementId: 'REQ-V8R2-059',
        id: `${pushrod} lower ball contacts Lifter ${valve} cup`,
        kind: 'contact',
        subject: iface(pushrod, 'lifterBall'),
        target: iface(`Lifter ${valve}`, 'cup'),
        tolerance: tolerances.contact,
      },
      {
        requirementId: 'REQ-V8R2-059',
        id: `${pushrod} upper ball is contained in Rocker Arm ${valve} cup`,
        kind: 'containment',
        subject: iface(pushrod, 'rockerBall'),
        target: iface(`Rocker Arm ${valve}`, 'cup'),
        tolerance: tolerances.depth,
      },
      {
        requirementId: 'REQ-V8R2-059',
        id: `${pushrod} upper ball contacts Rocker Arm ${valve} cup`,
        kind: 'contact',
        subject: iface(pushrod, 'rockerBall'),
        target: iface(`Rocker Arm ${valve}`, 'cup'),
        tolerance: tolerances.contact,
      },
    );
  }

  return rows;
};

// ---------------------------------------------------------------------------
// CL-5 pin retention (REQ 060–064)
// ---------------------------------------------------------------------------

const pinRetentionRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  for (const cylinder of cylinders) {
    const piston = `Piston ${cylinder}`;
    const pin = `Wrist Pin ${cylinder}`;
    for (const side of [1, 2] as const) {
      const clip = `Pin Circlip ${2 * (cylinder - 1) + side}`;
      rows.push(
        // REQ-V8R2-060 — grooves Ø23.6 x 1.30, outer edge 1.5 inboard of each
        // boss face (span +/-32.5 to +/-31.2); clip seated in the groove.
        {
          requirementId: 'REQ-V8R2-060',
          id: `${clip} is contained in ${piston} clip groove ${side}`,
          kind: 'containment',
          subject: iface(clip, 'wire'),
          target: iface(piston, `clipGroove[${side}]`),
          tolerance: tolerances.depth,
          reason:
            'REQ-V8R2-060: groove Ø23.6 x 1.30 wide, outer edge 1.5 inboard of the boss face (span +/-32.5 to +/-31.2)',
        },
        // REQ-V8R2-061 — clip bears on the groove and protrudes >= 0.9
        // inboard of the pin bore surface (real retention shoulder).
        {
          requirementId: 'REQ-V8R2-061',
          id: `${clip} bears against its groove outer flank`,
          kind: 'contact',
          subject: iface(clip, 'wire'),
          target: iface(piston, `clipGrooveFlank[${side}]`),
          tolerance: tolerances.contact,
        },
        {
          requirementId: 'REQ-V8R2-061',
          id: `${clip} protrudes >= 0.9 inboard of the pin bore surface`,
          kind: 'containment',
          subject: iface(clip, 'wire'),
          target: iface(piston, 'pinBore'),
          min: 0.9,
          tolerance: tolerances.depth,
          reason:
            'REQ-V8R2-061: retention shoulder protrusion >= 0.9 (wire Ø1.2)',
        },
        // REQ-V8R2-062 — bounded axial float; the pin cannot reach the wall.
        {
          requirementId: 'REQ-V8R2-062',
          id: `${pin} end face floats 0.1-0.5 against ${clip} (total 0.2-1.0)`,
          kind: 'clearance',
          subject: iface(pin, `endFace[${side}]`),
          target: iface(clip, 'wire'),
          min: 0.1,
          max: 0.5,
          tolerance: tolerances.band,
          reason:
            'REQ-V8R2-062: pin 62.0 vs clip faces at +/-31.2 — TOTAL axial float 0.2-1.0 (nominal 0.4), centered at modeled phase',
        },
        // REQ-V8R2-063 — pin-in-boss engagement >= 18.5 per side.
        {
          requirementId: 'REQ-V8R2-063',
          id: `${pin} engages ${piston} boss ${side} by >= 18.5`,
          kind: 'insertion',
          subject: iface(pin, 'outer'),
          target: iface(piston, `pinBoss[${side}]`),
          min: 18.5,
          tolerance: tolerances.depth,
          reason:
            'REQ-V8R2-063: nominal 19.0 (pin end +/-31.0 vs boss inner face +/-12.0); the v1 10.0 engagement is prohibited',
        },
      );
    }
    // REQ-V8R2-064 — handbook full-float fits F01/F02.
    rows.push(
      clearanceRow({
        requirementId: 'REQ-V8R2-064',
        id: `${pin} floats in ${piston} bosses (F01)`,
        subject: iface(pin, 'outer'),
        target: iface(piston, 'pinBore'),
        fitId: 'F01',
      }),
      clearanceRow({
        requirementId: 'REQ-V8R2-064',
        id: `${pin} floats in Small End Bushing ${cylinder} (F02)`,
        subject: iface(pin, 'outer'),
        target: iface(`Small End Bushing ${cylinder}`, 'bore'),
        fitId: 'F02',
      }),
    );
  }
  return rows;
};

// ---------------------------------------------------------------------------
// CL-6 fit semantics (REQ 065–077)
// ---------------------------------------------------------------------------

const fitSemanticsRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];

  // REQ-V8R2-065 residual T-FITS-RUN interfaces without a more specific REQ
  // (oil pump train + pickup + inner rotor drive): every interface classifies
  // as contact / running / press / compressed gasket — no 0.01 air.
  rows.push(
    clearanceRow({
      requirementId: 'REQ-V8R2-065',
      id: 'oil pump outer rotor rides the front cover pocket (F24)',
      subject: iface('Oil Pump Outer Rotor 1', 'outer'),
      target: iface(frontCover, 'pumpPocket'),
      fitId: 'F24',
    }),
    clearanceRow({
      requirementId: 'REQ-V8R2-065',
      id: 'oil pump rotor side clearance against the cover plate (F25)',
      subject: iface('Oil Pump Outer Rotor 1', 'sideFace'),
      target: iface('Oil Pump Cover 1', 'plateFace'),
      fitId: 'F25',
    }),
    clearanceRow({
      requirementId: 'REQ-V8R2-065',
      id: 'gerotor tip clearance between inner and outer rotors (F26)',
      subject: iface('Oil Pump Inner Rotor 1', 'lobes'),
      target: iface('Oil Pump Outer Rotor 1', 'lobes'),
      fitId: 'F26',
    }),
    {
      requirementId: 'REQ-V8R2-065',
      id: 'oil pump inner rotor is driven on the crank snout flats',
      kind: 'containment',
      subject: iface('Oil Pump Inner Rotor 1', 'driveFlats'),
      target: iface(crank, 'snoutFlats'),
      tolerance: tolerances.depth,
      reason:
        'REQ-V8R2-065: inner 10-lobe driven on snout flats (34 A/F) — every interface classified',
    },
    {
      requirementId: 'REQ-V8R2-065',
      id: 'oil pickup tube flange seats on the front cover pump inlet',
      kind: 'contact',
      subject: iface('Oil Pickup Tube 1', 'pumpJoint'),
      target: iface(frontCover, 'pickupPad'),
      tolerance: tolerances.contact,
    },
  );

  // REQ-V8R2-065 residual T-FITS-PRESS interfaces without a more specific
  // REQ: cam bearings (P06) and small-end bushings (P11) are real presses,
  // not the v1 clearance stand-ins.
  for (let bearing = 1; bearing <= 5; bearing++) {
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-065',
        id: `Camshaft Bearing ${bearing} presses into the block cam tunnel (P06)`,
        subject: iface(`Camshaft Bearing ${bearing}`, 'press'),
        target: iface(block, `camTunnel[${bearing}]`),
        pressId: 'P06',
      }),
    );
  }
  for (const cylinder of cylinders) {
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-065',
        id: `Small End Bushing ${cylinder} presses into Connecting Rod ${cylinder} eye (P11)`,
        subject: iface(`Small End Bushing ${cylinder}`, 'press'),
        target: iface(`Connecting Rod ${cylinder}`, 'smallEndEye'),
        pressId: 'P11',
      }),
    );
  }

  // REQ-V8R2-066..069 — running clearances F03..F06.
  for (const cylinder of cylinders) {
    rows.push(
      clearanceRow({
        requirementId: 'REQ-V8R2-066',
        id: `Piston ${cylinder} skirt clearance at the gauge point (F03)`,
        subject: iface(`Piston ${cylinder}`, 'skirt'),
        target: iface(block, `cylBore[${cylinder}]`),
        fitId: 'F03',
      }),
    );
  }
  for (let main = 1; main <= 5; main++) {
    for (const half of ['Upper', 'Lower'] as const) {
      rows.push(
        clearanceRow({
          requirementId: 'REQ-V8R2-067',
          id: `crank main journal ${main} oil clearance in the ${half.toLowerCase()} shell (F04)`,
          subject: iface(crank, `mainJournal[${main}]`),
          target: iface(`Main Bearing ${half} Shell ${main}`, 'bore'),
          fitId: 'F04',
        }),
      );
    }
  }
  for (const cylinder of cylinders) {
    for (const half of ['Upper', 'Lower'] as const) {
      rows.push(
        clearanceRow({
          requirementId: 'REQ-V8R2-068',
          id: `crankpin oil clearance for Connecting Rod ${cylinder} ${half.toLowerCase()} shell (F05)`,
          subject: iface(crank, `crankpin[${((cylinder - 1) % 4) + 1}]`),
          target: iface(`Rod Bearing ${half} Shell ${cylinder}`, 'bore'),
          fitId: 'F05',
        }),
      );
    }
  }
  for (let journal = 1; journal <= 5; journal++) {
    rows.push(
      clearanceRow({
        requirementId: 'REQ-V8R2-069',
        id: `cam journal ${journal} oil clearance in Camshaft Bearing ${journal} (F06)`,
        subject: iface(cam, `journal[${journal}]`),
        target: iface(`Camshaft Bearing ${journal}`, 'bore'),
        fitId: 'F06',
      }),
    );
  }

  // REQ-V8R2-070 — crank endplay on the flanged thrust main #3 (F15 total
  // 0.05-0.20; per-side band at the modeled centered nominal 0.065/side).
  for (const half of ['Upper', 'Lower'] as const) {
    rows.push({
      requirementId: 'REQ-V8R2-070',
      id: `crank thrust faces float against Main Bearing ${half} Shell 3 flanges`,
      kind: 'clearance',
      subject: iface(crank, 'thrustFaces'),
      target: iface(`Main Bearing ${half} Shell 3`, 'flangeFaces'),
      min: 0.025,
      max: 0.1,
      tolerance: tolerances.band,
      reason:
        'T-FITS-RUN F15 crank endplay 0.05-0.20 TOTAL (spans 28.08 vs 27.95 = modeled 0.13; centered 0.065/side)',
    });
  }

  // REQ-V8R2-071 — rod pair side clearance on each crankpin (F17 total
  // 0.25-0.55; pin 44.00 − 2 x 21.80 = 0.40). Bounds every gap in the stack;
  // the v1 +/-7 mm float is prohibited.
  for (let pin = 1; pin <= 4; pin++) {
    const rodR = `Connecting Rod ${pin}`;
    const rodL = `Connecting Rod ${pin + 4}`;
    const pinCheeks = iface(crank, `pinCheeks[${pin}]`);
    rows.push(
      {
        requirementId: 'REQ-V8R2-071',
        id: `${rodR} side faces float against crankpin ${pin} cheeks within the F17 total band`,
        kind: 'clearance',
        subject: iface(rodR, 'sideFaces'),
        target: pinCheeks,
        min: 0,
        max: 0.55,
        tolerance: tolerances.band,
        reason:
          'T-FITS-RUN F17 rod pair side clearance 0.25-0.55 TOTAL on pin 44.00 (2 x 21.80 rods)',
      },
      {
        requirementId: 'REQ-V8R2-071',
        id: `${rodL} side faces float against crankpin ${pin} cheeks within the F17 total band`,
        kind: 'clearance',
        subject: iface(rodL, 'sideFaces'),
        target: pinCheeks,
        min: 0,
        max: 0.55,
        tolerance: tolerances.band,
        reason:
          'T-FITS-RUN F17 rod pair side clearance 0.25-0.55 TOTAL on pin 44.00 (2 x 21.80 rods)',
      },
      {
        requirementId: 'REQ-V8R2-071',
        id: `paired rods ${pin} and ${pin + 4} float side by side within the F17 total band`,
        kind: 'clearance',
        subject: iface(rodR, 'sideFaces'),
        target: iface(rodL, 'sideFaces'),
        min: 0,
        max: 0.55,
        tolerance: tolerances.band,
        reason:
          'T-FITS-RUN F17 rod pair side clearance 0.25-0.55 TOTAL on pin 44.00 (2 x 21.80 rods)',
      },
    );
  }

  // REQ-V8R2-072/073 — lifter and valve-stem running fits.
  for (const { valve, slot } of valves) {
    rows.push(
      clearanceRow({
        requirementId: 'REQ-V8R2-072',
        id: `Lifter ${valve} rides in block lifter bore ${valve} (F07)`,
        subject: iface(`Lifter ${valve}`, 'body'),
        target: iface(block, `lifterBore[${valve}]`),
        fitId: 'F07',
      }),
      clearanceRow({
        requirementId: 'REQ-V8R2-073',
        id: `${slot} valve stem ${valve} slides in Valve Guide ${valve} (${slot === 'Intake' ? 'F08' : 'F09'})`,
        subject: iface(`${slot} Valve ${Math.ceil(valve / 2)}`, 'stem'),
        target: iface(`Valve Guide ${valve}`, 'bore'),
        fitId: slot === 'Intake' ? 'F08' : 'F09',
      }),
    );
  }

  // REQ-V8R2-074 — damper hub press P07 + key containment both slots.
  rows.push(
    pressRow({
      requirementId: 'REQ-V8R2-074',
      id: 'Damper Hub 1 bore presses onto the crank snout Ø38 (P07)',
      subject: iface('Damper Hub 1', 'bore'),
      target: iface(crank, 'snout'),
      pressId: 'P07',
    }),
    {
      requirementId: 'REQ-V8R2-074',
      alsoVerifies: ['REQ-V8R2-031'],
      id: 'Crank Key 1 is contained in the snout keyway',
      kind: 'containment',
      subject: iface('Crank Key 1', 'body'),
      target: iface(crank, 'keyway'),
      tolerance: tolerances.depth,
      reason:
        'REQ-V8R2-074: parallel key 10x8x36 DIN 6885; slip-fit torque transmission prohibited',
    },
    {
      requirementId: 'REQ-V8R2-074',
      alsoVerifies: ['REQ-V8R2-031'],
      id: 'Crank Key 1 is contained in the damper hub key slot',
      kind: 'containment',
      subject: iface('Crank Key 1', 'body'),
      target: iface('Damper Hub 1', 'keySlot'),
      tolerance: tolerances.depth,
      reason:
        'REQ-V8R2-074: parallel key 10x8x36 DIN 6885; slip-fit torque transmission prohibited',
    },
  );

  // REQ-V8R2-075 — flywheel spigot chain: concentric + F18 + P10.
  rows.push(
    {
      requirementId: 'REQ-V8R2-075',
      id: 'flywheel spigot recess is concentric with the crank axis',
      kind: 'concentric',
      subject: iface('Flywheel 1', 'spigotRecess'),
      target: datumOf(crank, 'centerline'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
    },
    clearanceRow({
      requirementId: 'REQ-V8R2-075',
      id: 'flywheel recess registers the crank spigot boss Ø70 (F18)',
      subject: iface('Flywheel 1', 'spigotRecess'),
      target: iface(crank, 'spigot'),
      fitId: 'F18',
    }),
    pressRow({
      requirementId: 'REQ-V8R2-075',
      id: 'Pilot Bushing 1 presses into the crank pilot bore Ø20 (P10)',
      subject: iface('Pilot Bushing 1', 'press'),
      target: iface(crank, 'pilotBore'),
      pressId: 'P10',
    }),
  );

  // REQ-V8R2-076 — shrink bands P08/P09.
  rows.push(
    pressRow({
      requirementId: 'REQ-V8R2-076',
      id: 'Ring Gear 1 shrinks onto the flywheel rim seat (P08)',
      subject: iface('Ring Gear 1', 'shrink'),
      target: iface('Flywheel 1', 'ringGearSeat'),
      pressId: 'P08',
    }),
    pressRow({
      requirementId: 'REQ-V8R2-076',
      id: 'Reluctor Ring 1 presses onto the crank seat Ø98 (P09)',
      subject: iface('Reluctor Ring 1', 'press'),
      target: iface(crank, 'reluctorSeat'),
      pressId: 'P09',
    }),
  );

  return rows;
};

// ---------------------------------------------------------------------------
// DFM / service verify-today relationships (REQ 107, 108, 109, 110)
// ---------------------------------------------------------------------------

const serviceRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];

  // REQ-V8R2-107 — accessory belt plane datum alignment within 1.0.
  rows.push({
    requirementId: 'REQ-V8R2-107',
    id: 'damper belt groove mid-plane is coplanar with the water pump pulley groove mid-plane',
    kind: 'coplanar',
    subject: datumOf('Damper Inertia Ring 1', 'beltPlane'),
    target: datumOf('Water Pump Pulley 1', 'beltPlane'),
    tolerance: 1,
    angularToleranceDegrees: tolerances.angularDegrees,
    reason:
      'REQ-V8R2-107: coplanar within 1.0; belt deliberately not an occurrence',
  });

  // REQ-V8R2-108 — service fittings present and seated per T-THREADS.
  rows.push(
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Drain Plug 1 seals the pan sump boss M14x1.5',
      kind: 'insertion',
      subject: iface('Drain Plug 1', 'thread'),
      target: iface('Oil Pan 1', 'drainBoss'),
      min: 6,
      tolerance: tolerances.depth,
      reason:
        'T-THREADS oil drain plug M14x1.5: min engagement 6.0 through boss',
    },
    pressRow({
      requirementId: 'REQ-V8R2-108',
      id: 'Dipstick Tube 1 presses into the block boss (P16)',
      subject: iface('Dipstick Tube 1', 'press'),
      target: iface(block, 'dipstickBoss'),
      pressId: 'P16',
    }),
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Dipstick 1 is inserted through Dipstick Tube 1',
      kind: 'insertion',
      subject: iface('Dipstick 1', 'blade'),
      target: iface('Dipstick Tube 1', 'bore'),
      tolerance: tolerances.depth,
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'PCV Valve 1 seats in the left cover Ø19 grommet boss',
      kind: 'insertion',
      subject: iface('PCV Valve 1', 'body'),
      target: iface('Valve Cover L', 'pcvGrommet'),
      tolerance: tolerances.depth,
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Oil Filler Cap 1 seats on the right cover filler neck Ø38',
      kind: 'contact',
      subject: iface('Oil Filler Cap 1', 'seat'),
      target: iface('Valve Cover R', 'fillerNeck'),
      tolerance: tolerances.contact,
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Coolant Temp Sensor 1 engages the crossover tap M12x1.5 by >= 8.0',
      kind: 'insertion',
      subject: iface('Coolant Temp Sensor 1', 'thread'),
      target: iface(manifold, 'coolantSensorTap'),
      min: 8,
      tolerance: tolerances.depth,
      reason: 'T-THREADS coolant temp sensor M12x1.5: min engagement 8.0',
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Oil Pressure Sensor 1 engages the gallery rear tap M10x1.0 by >= 8.0',
      kind: 'insertion',
      subject: iface('Oil Pressure Sensor 1', 'thread'),
      target: iface(block, 'oilPressureTap'),
      min: 8,
      tolerance: tolerances.depth,
      reason: 'T-THREADS oil pressure sensor M10x1.0: min engagement 8.0',
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Cam Position Sensor 1 seats in the front cover boss',
      kind: 'insertion',
      subject: iface('Cam Position Sensor 1', 'body'),
      target: iface(frontCover, 'camSensorBoss'),
      tolerance: tolerances.depth,
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Crank Position Sensor 1 seats in the block rear boss',
      kind: 'insertion',
      subject: iface('Crank Position Sensor 1', 'body'),
      target: iface(block, 'crankSensorBoss'),
      tolerance: tolerances.depth,
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Crank Position Sensor 1 tip gap to the reluctor teeth stays 0.8-1.2',
      kind: 'clearance',
      subject: iface('Crank Position Sensor 1', 'tip'),
      target: iface('Reluctor Ring 1', 'teeth'),
      min: 0.8,
      max: 1.2,
      tolerance: tolerances.band,
      reason: 'REQ-V8R2-108: reluctor 36-2 tooth wheel, sensor tip gap 0.8-1.2',
    },
    // Relief valve set (Section 3.10 ReliefValve; bound here as service
    // hardware: piston fit, captured spring, sealing plug).
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Relief Valve Piston 1 slides in the front cover relief bore (0.010-0.030)',
      kind: 'clearance',
      subject: iface('Relief Valve Piston 1', 'body'),
      target: iface(frontCover, 'reliefBore'),
      min: 0.01,
      max: 0.03,
      tolerance: tolerances.band,
      reason: 'Section 3.10 ReliefValve: piston Ø12, clearance 0.010-0.030',
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Relief Valve Spring 1 is captured in the relief bore',
      kind: 'containment',
      subject: iface('Relief Valve Spring 1', 'coils'),
      target: iface(frontCover, 'reliefBore'),
      tolerance: tolerances.depth,
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Relief Valve Plug 1 seals the relief bore M12x1.5 by >= 9.0',
      kind: 'insertion',
      subject: iface('Relief Valve Plug 1', 'thread'),
      target: iface(frontCover, 'reliefPlugTap'),
      min: 9,
      tolerance: tolerances.depth,
      reason: 'T-THREADS relief valve plug M12x1.5: min engagement 9.0',
    },
    // Knock sensors (2x M8x1.25 valley walls, engagement 12).
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Knock Sensor 1 engages its valley tap M8x1.25 by >= 12.0',
      kind: 'insertion',
      subject: iface('Knock Sensor 1', 'thread'),
      target: iface(block, 'knockTap[1]'),
      min: 12,
      tolerance: tolerances.depth,
      reason: 'T-THREADS knock sensors M8x1.25: min engagement 12.0',
    },
    {
      requirementId: 'REQ-V8R2-108',
      id: 'Knock Sensor 2 engages its valley tap M8x1.25 by >= 12.0',
      kind: 'insertion',
      subject: iface('Knock Sensor 2', 'thread'),
      target: iface(block, 'knockTap[2]'),
      min: 12,
      tolerance: tolerances.depth,
      reason: 'T-THREADS knock sensors M8x1.25: min engagement 12.0',
    },
  );

  // REQ-V8R2-109 — spin-on filter interface.
  rows.push(
    {
      requirementId: 'REQ-V8R2-109',
      id: 'Oil Filter 1 threads onto the 3/4-16 nipple by >= 12.0',
      kind: 'insertion',
      subject: iface('Oil Filter 1', 'thread'),
      target: iface(frontCover, 'filterNipple'),
      min: 12,
      tolerance: tolerances.depth,
      reason: 'T-THREADS oil filter nipple 3/4-16 UNF: min engagement 12.0',
    },
    {
      requirementId: 'REQ-V8R2-109',
      id: 'Oil Filter 1 sealing ring contacts the adapter land',
      kind: 'contact',
      subject: iface('Oil Filter 1', 'sealingRing'),
      target: iface(frontCover, 'filterLand'),
      tolerance: tolerances.contact,
    },
  );

  // REQ-V8R2-110 — water pump internals: impeller tip F27, press stack on
  // the shaft (modeled line-to-line, callout only — no P row, REQ-077 keeps
  // the allowance list exactly P01-P16), gasket ports coaxial with block
  // inlets (stack rows owned by REQ-036).
  rows.push(
    clearanceRow({
      requirementId: 'REQ-V8R2-110',
      id: 'water pump impeller tip clearance in the volute (F27)',
      subject: iface('Water Pump Impeller 1', 'tips'),
      target: iface('Water Pump Housing 1', 'volute'),
      fitId: 'F27',
    }),
    {
      requirementId: 'REQ-V8R2-110',
      id: 'water pump impeller is coaxial with the shaft cartridge',
      kind: 'coaxial',
      subject: iface('Water Pump Impeller 1', 'hub'),
      target: iface('Water Pump Shaft 1', 'impellerEnd'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
      reason:
        'REQ-V8R2-110: impeller pressed on shaft — modeled line-to-line, press is a callout (allowance list = P01-P16 exactly)',
    },
    {
      requirementId: 'REQ-V8R2-110',
      id: 'water pump pulley is coaxial with the shaft cartridge',
      kind: 'coaxial',
      subject: iface('Water Pump Pulley 1', 'hub'),
      target: iface('Water Pump Shaft 1', 'pulleyEnd'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
      reason:
        'REQ-V8R2-110: pulley pressed on shaft — modeled line-to-line, press is a callout (allowance list = P01-P16 exactly)',
    },
    {
      requirementId: 'REQ-V8R2-110',
      id: 'water pump shaft cartridge is pressed in the housing bore (line-to-line callout)',
      kind: 'coaxial',
      subject: iface('Water Pump Shaft 1', 'cartridge'),
      target: iface('Water Pump Housing 1', 'cartridgeBore'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
    },
    // REQ-V8R2-105 — bellhousing dowels press rows live in REQ-030; the
    // pattern itself is a part-export hole check. Rear-face flatness is the
    // machined rearFace already bound by the rear housing gasket rows.
  );

  return rows;
};

/** All CL-4..CL-6 + DFM/service verify-today rows. */
export const motionContractRows = (): ContractRow[] => [
  ...valvetrainDriveRows(),
  ...pinRetentionRows(),
  ...fitSemanticsRows(),
  ...serviceRows(),
];
