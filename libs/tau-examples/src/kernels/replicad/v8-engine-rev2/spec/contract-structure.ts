/**
 * Contract rows for CL-1 flow paths, CL-2 split lines and fasteners, and
 * CL-3 sealing (verify-today rows only; frontier-gated REQs live in the
 * deferral registry). Quantities and bands are verbatim spec values; every
 * row cites its T-FITS/T-THREADS source in `reason` where one exists.
 */
import {
  banks,
  bankOf,
  bankSlot,
  cylinders,
  datumOf,
  headGasketOf,
  headOf,
  iface,
  interferenceProofMinVolume,
  tolerances,
  valves,
} from './contract-base.js';
import type {
  BankSide,
  ContractRow,
  ContractSelector,
} from './contract-base.js';
import { pressFitReason, runningFitBand, runningFitReason } from './fits.js';

const block = 'Block 1';
const manifold = 'Intake Manifold 1';

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

/** Fastener stack triple: shank coaxial, thread insertion, head seat contact. */
const fastenerStack = (options: {
  requirementId: string;
  bolt: string;
  shankTarget: ContractSelector;
  tapTarget: ContractSelector;
  seatTarget: ContractSelector;
  engagement: number;
  callout: string;
}): ContractRow[] => [
  {
    requirementId: options.requirementId,
    id: `${options.bolt} shank is coaxial with ${options.shankTarget.kind === 'interface' ? `${options.shankTarget.of} ${options.shankTarget.name}` : options.bolt}`,
    kind: 'coaxial',
    subject: iface(options.bolt, 'shank'),
    target: options.shankTarget,
    tolerance: tolerances.coaxial,
    angularToleranceDegrees: tolerances.angularDegrees,
  },
  {
    requirementId: options.requirementId,
    id: `${options.bolt} thread engages its tap by >= ${options.engagement}`,
    kind: 'insertion',
    subject: iface(options.bolt, 'thread'),
    target: options.tapTarget,
    min: options.engagement,
    tolerance: tolerances.depth,
    reason: `T-THREADS ${options.callout}: min engagement ${options.engagement}`,
  },
  {
    requirementId: options.requirementId,
    alsoVerifies: ['REQ-V8R2-082'],
    id: `${options.bolt} head washer face seats on its spot face`,
    kind: 'contact',
    subject: iface(options.bolt, 'headFace'),
    target: options.seatTarget,
    tolerance: tolerances.contact,
    reason: 'REQ-V8R2-082: head lands on a machined spot face >= 1.8x head AF',
  },
];

// ---------------------------------------------------------------------------
// CL-1 flow paths (verify-today rows: REQ 008, 009, 011, 014, 016, 018)
// ---------------------------------------------------------------------------

const cl1Rows = (): ContractRow[] => {
  const rows: ContractRow[] = [];

  // REQ-V8R2-008 — per-bank 8x Ø10 + 2x Ø14 coolant transfers, coaxial per
  // stack through block, gasket, and head (alsoVerifies REQ-036 for these
  // openings — single authoritative row per stack, REQ-102).
  for (const bank of banks) {
    const gasket = headGasketOf(bank);
    const head = headOf(bank);
    for (const [family, count] of [
      ['coolant10', 8],
      ['coolant14', 2],
    ] as const) {
      for (let hole = 1; hole <= count; hole++) {
        rows.push(
          {
            requirementId: 'REQ-V8R2-008',
            alsoVerifies: ['REQ-V8R2-036'],
            id: `${gasket} ${family}[${hole}] is coaxial with the block ${bank} deck transfer`,
            kind: 'coaxial',
            subject: iface(gasket, `${family}[${hole}]`),
            target: iface(block, `${family}${bank}[${hole}]`),
            tolerance: tolerances.coaxial,
            angularToleranceDegrees: tolerances.angularDegrees,
          },
          {
            requirementId: 'REQ-V8R2-008',
            alsoVerifies: ['REQ-V8R2-036'],
            id: `${gasket} ${family}[${hole}] is coaxial with the ${head} deck transfer`,
            kind: 'coaxial',
            subject: iface(gasket, `${family}[${hole}]`),
            target: iface(head, `${family}[${hole}]`),
            tolerance: tolerances.coaxial,
            angularToleranceDegrees: tolerances.angularDegrees,
          },
        );
      }
    }
  }

  // REQ-V8R2-009 — 8 core plugs pressed, P05 declared allowance pairs.
  for (let plug = 1; plug <= 8; plug++) {
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-009',
        id: `Core Plug ${plug} is pressed in block core bore ${plug}`,
        subject: iface(`Core Plug ${plug}`, 'press'),
        target: iface(block, `corePlugBore[${plug}]`),
        pressId: 'P05',
      }),
    );
  }

  // REQ-V8R2-011 — gallery plugs seated in their taps (hole counts and
  // diameters are asserted on the block part export in flow-paths).
  rows.push({
    requirementId: 'REQ-V8R2-011',
    id: 'Oil Gallery Plug 1 seals the rear main gallery tap M16x1.5',
    kind: 'insertion',
    subject: iface('Oil Gallery Plug 1', 'thread'),
    target: iface(block, 'galleryPlugTap[1]'),
    min: 10,
    tolerance: tolerances.depth,
    reason: 'T-THREADS main gallery plug M16x1.5: min engagement 10.0',
  });
  for (let plug = 2; plug <= 5; plug++) {
    rows.push({
      requirementId: 'REQ-V8R2-011',
      id: `Oil Gallery Plug ${plug} seals lifter gallery tap ${plug - 1} M12x1.5`,
      kind: 'insertion',
      subject: iface(`Oil Gallery Plug ${plug}`, 'thread'),
      target: iface(block, `galleryPlugTap[${plug}]`),
      min: 9,
      tolerance: tolerances.depth,
      reason: 'T-THREADS lifter gallery plugs M12x1.5: min engagement 9.0',
    });
  }

  // REQ-V8R2-014 — 5 saddle-feed stacks: block Ø8 feed coaxial with the
  // upper shell oil hole.
  for (let main = 1; main <= 5; main++) {
    rows.push({
      requirementId: 'REQ-V8R2-014',
      id: `block saddle feed ${main} passes through Main Bearing Upper Shell ${main} oil hole`,
      kind: 'coaxial',
      subject: iface(block, `saddleFeed[${main}]`),
      target: iface(`Main Bearing Upper Shell ${main}`, 'oilHole'),
      tolerance: tolerances.coaxial,
      angularToleranceDegrees: tolerances.angularDegrees,
    });
  }

  // REQ-V8R2-016 — per bank, head 2x Ø16 drain-backs align with gasket Ø16
  // holes and block deck drain passages (alsoVerifies REQ-036 for these
  // openings).
  for (const bank of banks) {
    const gasket = headGasketOf(bank);
    const head = headOf(bank);
    for (let drain = 1; drain <= 2; drain++) {
      rows.push(
        {
          requirementId: 'REQ-V8R2-016',
          alsoVerifies: ['REQ-V8R2-036'],
          id: `${gasket} oilDrain[${drain}] is coaxial with ${head} drain-back ${drain}`,
          kind: 'coaxial',
          subject: iface(gasket, `oilDrain[${drain}]`),
          target: iface(head, `drainBack[${drain}]`),
          tolerance: tolerances.coaxial,
          angularToleranceDegrees: tolerances.angularDegrees,
        },
        {
          requirementId: 'REQ-V8R2-016',
          alsoVerifies: ['REQ-V8R2-036'],
          id: `${gasket} oilDrain[${drain}] is coaxial with the block ${bank} deck drain`,
          kind: 'coaxial',
          subject: iface(gasket, `oilDrain[${drain}]`),
          target: iface(block, `deckDrain${bank}[${drain}]`),
          tolerance: tolerances.coaxial,
          angularToleranceDegrees: tolerances.angularDegrees,
        },
      );
    }
  }

  // REQ-V8R2-018 — throttle bore/blade/shaft running fits F22/F23.
  rows.push(
    clearanceRow({
      requirementId: 'REQ-V8R2-018',
      id: 'throttle blade rides in the bore with F22 radial clearance',
      subject: iface('Throttle Blade 1', 'edge'),
      target: iface('Throttle Body 1', 'bore'),
      fitId: 'F22',
    }),
  );
  for (let boss = 1; boss <= 2; boss++) {
    rows.push(
      clearanceRow({
        requirementId: 'REQ-V8R2-018',
        id: `throttle shaft rides in boss ${boss} with F23 clearance`,
        subject: iface('Throttle Shaft 1', 'journal'),
        target: iface('Throttle Body 1', `shaftBoss[${boss}]`),
        fitId: 'F23',
      }),
    );
  }

  return rows;
};

// ---------------------------------------------------------------------------
// CL-2 split lines and fasteners (REQ 019–033)
// ---------------------------------------------------------------------------

const rodRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  for (const cylinder of cylinders) {
    const rod = `Connecting Rod ${cylinder}`;
    const cap = `Rod Cap ${cylinder}`;

    // REQ-V8R2-019 — parting faces coplanar and in contact (gap = 0).
    rows.push(
      {
        requirementId: 'REQ-V8R2-019',
        id: `${rod} parting faces contact ${cap} parting faces`,
        kind: 'contact',
        subject: iface(rod, 'partingFaces'),
        target: iface(cap, 'partingFaces'),
        tolerance: tolerances.contact,
      },
      {
        requirementId: 'REQ-V8R2-019',
        id: `${rod} parting plane is coplanar with ${cap} parting plane`,
        kind: 'coplanar',
        subject: iface(rod, 'partingFaces'),
        target: iface(cap, 'partingFaces'),
        tolerance: tolerances.coplanar,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
    );

    for (const boltSide of [1, 2] as const) {
      const bolt = `Rod Bolt ${2 * (cylinder - 1) + boltSide}`;
      // REQ-V8R2-020 — M9x1.0x47 stacks: coaxial + insertion >= 13.0 + seat.
      rows.push(
        {
          requirementId: 'REQ-V8R2-020',
          id: `${bolt} is coaxial with ${cap} pilot bore ${boltSide}`,
          kind: 'coaxial',
          subject: iface(bolt, 'shank'),
          target: iface(cap, `pilotBore[${boltSide}]`),
          tolerance: tolerances.coaxial,
          angularToleranceDegrees: tolerances.angularDegrees,
        },
        {
          requirementId: 'REQ-V8R2-020',
          id: `${bolt} thread engages ${rod} tap ${boltSide} by >= 13.0`,
          kind: 'insertion',
          subject: iface(bolt, 'thread'),
          target: iface(rod, `boltTap[${boltSide}]`),
          min: 13,
          tolerance: tolerances.depth,
          reason:
            'T-THREADS rod bolts M9x1.0 x 47: min engagement 13.0 (1.45d)',
        },
        {
          requirementId: 'REQ-V8R2-020',
          alsoVerifies: ['REQ-V8R2-082'],
          id: `${bolt} head seats on ${cap} spot face ${boltSide}`,
          kind: 'contact',
          subject: iface(bolt, 'headFace'),
          target: iface(cap, `boltSeat[${boltSide}]`),
          tolerance: tolerances.contact,
        },
        // REQ-V8R2-021 — fitted pilot register F21.
        clearanceRow({
          requirementId: 'REQ-V8R2-021',
          id: `${bolt} fitted pilot registers ${cap} reamed bore ${boltSide} (F21)`,
          subject: iface(bolt, 'pilotBand'),
          target: iface(cap, `pilotBore[${boltSide}]`),
          fitId: 'F21',
        }),
      );
    }

    // REQ-V8R2-022 — rod shell tangs contained in rod/cap notches.
    rows.push(
      {
        requirementId: 'REQ-V8R2-022',
        id: `Rod Bearing Upper Shell ${cylinder} tang engages ${rod} notch`,
        kind: 'containment',
        subject: iface(`Rod Bearing Upper Shell ${cylinder}`, 'tang'),
        target: iface(rod, 'tangNotch'),
        tolerance: tolerances.depth,
      },
      {
        requirementId: 'REQ-V8R2-022',
        id: `Rod Bearing Lower Shell ${cylinder} tang engages ${cap} notch`,
        kind: 'containment',
        subject: iface(`Rod Bearing Lower Shell ${cylinder}`, 'tang'),
        target: iface(cap, 'tangNotch'),
        tolerance: tolerances.depth,
      },
    );
  }
  return rows;
};

const mainCapRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  for (let cap = 1; cap <= 5; cap++) {
    const capName = `Main Bearing Cap ${cap}`;
    // REQ-V8R2-023 — cap parting faces contact the block saddle faces.
    rows.push(
      {
        requirementId: 'REQ-V8R2-023',
        id: `${capName} parting face contacts block saddle joint ${cap}`,
        kind: 'contact',
        subject: iface(capName, 'partingFace'),
        target: iface(block, `saddleJoint[${cap}]`),
        tolerance: tolerances.contact,
      },
      {
        requirementId: 'REQ-V8R2-023',
        id: `${capName} parting face is coplanar with block saddle joint ${cap}`,
        kind: 'coplanar',
        subject: iface(capName, 'partingFace'),
        target: iface(block, `saddleJoint[${cap}]`),
        tolerance: tolerances.coplanar,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      // REQ-V8R2-024 — side registers pressed into block ledges, P15.
      pressRow({
        requirementId: 'REQ-V8R2-024',
        id: `${capName} side registers press into block ledges (P15)`,
        subject: iface(capName, 'sideRegister'),
        target: iface(block, `capLedge[${cap}]`),
        pressId: 'P15',
      }),
    );
    // REQ-V8R2-025 — M12x1.75x90 stacks, insertion >= 24.0.
    for (const boltSide of [1, 2] as const) {
      const bolt = `Main Cap Bolt ${2 * (cap - 1) + boltSide}`;
      rows.push(
        {
          requirementId: 'REQ-V8R2-025',
          id: `${bolt} passes through ${capName} clearance hole ${boltSide}`,
          kind: 'coaxial',
          subject: iface(bolt, 'shank'),
          target: iface(capName, `boltHole[${boltSide}]`),
          tolerance: tolerances.coaxial,
          angularToleranceDegrees: tolerances.angularDegrees,
        },
        {
          requirementId: 'REQ-V8R2-025',
          id: `${bolt} thread engages block main tap by >= 24.0`,
          kind: 'insertion',
          subject: iface(bolt, 'thread'),
          target: iface(block, `mainCapTap[${2 * (cap - 1) + boltSide}]`),
          min: 24,
          tolerance: tolerances.depth,
          reason:
            'T-THREADS main cap bolts M12x1.75 x 90: min engagement 24.0 (2.0d)',
        },
        {
          requirementId: 'REQ-V8R2-025',
          alsoVerifies: ['REQ-V8R2-082'],
          id: `${bolt} head seats on ${capName} spot face ${boltSide}`,
          kind: 'contact',
          subject: iface(bolt, 'headFace'),
          target: iface(capName, `boltSeat[${boltSide}]`),
          tolerance: tolerances.contact,
        },
      );
    }
  }
  return rows;
};

const bearingShellRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  // REQ-V8R2-026 — 26 half shells; mating seam faces contact at the split.
  for (let main = 1; main <= 5; main++) {
    rows.push({
      requirementId: 'REQ-V8R2-026',
      id: `main shell pair ${main} seam faces contact at the split line`,
      kind: 'contact',
      subject: iface(`Main Bearing Upper Shell ${main}`, 'seamFaces'),
      target: iface(`Main Bearing Lower Shell ${main}`, 'seamFaces'),
      tolerance: tolerances.contact,
    });
  }
  for (const cylinder of cylinders) {
    rows.push({
      requirementId: 'REQ-V8R2-026',
      id: `rod shell pair ${cylinder} seam faces contact at the split line`,
      kind: 'contact',
      subject: iface(`Rod Bearing Upper Shell ${cylinder}`, 'seamFaces'),
      target: iface(`Rod Bearing Lower Shell ${cylinder}`, 'seamFaces'),
      tolerance: tolerances.contact,
    });
  }
  // REQ-V8R2-027 — crush on all 26 shells, P01 allowance pairs.
  for (let main = 1; main <= 5; main++) {
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-027',
        id: `Main Bearing Upper Shell ${main} crushes into the block saddle (P01)`,
        subject: iface(`Main Bearing Upper Shell ${main}`, 'crush'),
        target: iface(block, `saddle[${main}]`),
        pressId: 'P01',
      }),
      pressRow({
        requirementId: 'REQ-V8R2-027',
        id: `Main Bearing Lower Shell ${main} crushes into Main Bearing Cap ${main} (P01)`,
        subject: iface(`Main Bearing Lower Shell ${main}`, 'crush'),
        target: iface(`Main Bearing Cap ${main}`, 'halfBore'),
        pressId: 'P01',
      }),
    );
  }
  for (const cylinder of cylinders) {
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-027',
        id: `Rod Bearing Upper Shell ${cylinder} crushes into Connecting Rod ${cylinder} (P01)`,
        subject: iface(`Rod Bearing Upper Shell ${cylinder}`, 'crush'),
        target: iface(`Connecting Rod ${cylinder}`, 'bigEndBore'),
        pressId: 'P01',
      }),
      pressRow({
        requirementId: 'REQ-V8R2-027',
        id: `Rod Bearing Lower Shell ${cylinder} crushes into Rod Cap ${cylinder} (P01)`,
        subject: iface(`Rod Bearing Lower Shell ${cylinder}`, 'crush'),
        target: iface(`Rod Cap ${cylinder}`, 'halfBore'),
        pressId: 'P01',
      }),
    );
  }
  // REQ-V8R2-028 — main shell tangs in saddle/cap notches.
  for (let main = 1; main <= 5; main++) {
    rows.push(
      {
        requirementId: 'REQ-V8R2-028',
        id: `Main Bearing Upper Shell ${main} tang engages the block saddle notch`,
        kind: 'containment',
        subject: iface(`Main Bearing Upper Shell ${main}`, 'tang'),
        target: iface(block, `saddleNotch[${main}]`),
        tolerance: tolerances.depth,
      },
      {
        requirementId: 'REQ-V8R2-028',
        id: `Main Bearing Lower Shell ${main} tang engages Main Bearing Cap ${main} notch`,
        kind: 'containment',
        subject: iface(`Main Bearing Lower Shell ${main}`, 'tang'),
        target: iface(`Main Bearing Cap ${main}`, 'tangNotch'),
        tolerance: tolerances.depth,
      },
    );
  }
  return rows;
};

const headBoltAndDowelRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  // REQ-V8R2-029 — 20 head bolts M11x1.5x110 through head + gasket into
  // block taps, both rows per bank, insertion >= 22.0.
  for (let bolt = 1; bolt <= 20; bolt++) {
    const bank: BankSide = bolt <= 10 ? 'R' : 'L';
    const hole = ((bolt - 1) % 10) + 1;
    const name = `Head Bolt ${bolt}`;
    rows.push(
      {
        requirementId: 'REQ-V8R2-029',
        id: `${name} is coaxial with block ${bank} head tap ${hole}`,
        kind: 'coaxial',
        subject: iface(name, 'shank'),
        target: iface(block, `headBoltTap${bank}[${hole}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      {
        requirementId: 'REQ-V8R2-029',
        id: `${name} passes through ${headOf(bank)} bolt hole ${hole}`,
        kind: 'coaxial',
        subject: iface(name, 'shank'),
        target: iface(headOf(bank), `boltHole[${hole}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      {
        requirementId: 'REQ-V8R2-029',
        id: `${name} passes through ${headGasketOf(bank)} bolt hole ${hole}`,
        kind: 'coaxial',
        subject: iface(name, 'shank'),
        target: iface(headGasketOf(bank), `boltHole[${hole}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      {
        requirementId: 'REQ-V8R2-029',
        id: `${name} thread engages its block tap by >= 22.0`,
        kind: 'insertion',
        subject: iface(name, 'thread'),
        target: iface(block, `headBoltTap${bank}[${hole}]`),
        min: 22,
        tolerance: tolerances.depth,
        reason:
          'T-THREADS head bolts M11x1.5 x 110: min engagement 22.0 (2.0d)',
      },
      {
        requirementId: 'REQ-V8R2-029',
        alsoVerifies: ['REQ-V8R2-082'],
        id: `${name} head seats on ${headOf(bank)} spot face ${hole}`,
        kind: 'contact',
        subject: iface(name, 'headFace'),
        target: iface(headOf(bank), `boltSeat[${hole}]`),
        tolerance: tolerances.contact,
      },
    );
  }
  // REQ-V8R2-030 — dowels: press side P04 in block, slip side F19 in head,
  // coaxial through gasket dowel holes. Bellhousing dowels press-side only
  // (slip side is the unmodeled fixture, F20 stays a callout).
  for (let dowel = 1; dowel <= 4; dowel++) {
    const bank: BankSide = dowel <= 2 ? 'R' : 'L';
    const local = ((dowel - 1) % 2) + 1;
    const name = `Head Dowel ${dowel}`;
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-030',
        id: `${name} presses into block dowel bore ${dowel} (P04)`,
        subject: iface(name, 'press'),
        target: iface(block, `headDowelBore[${dowel}]`),
        pressId: 'P04',
      }),
      clearanceRow({
        requirementId: 'REQ-V8R2-030',
        id: `${name} slips in ${headOf(bank)} dowel bore ${local} (F19)`,
        subject: iface(name, 'slip'),
        target: iface(headOf(bank), `dowelBore[${local}]`),
        fitId: 'F19',
      }),
      {
        requirementId: 'REQ-V8R2-030',
        alsoVerifies: ['REQ-V8R2-036'],
        id: `${name} passes through ${headGasketOf(bank)} dowel hole ${local}`,
        kind: 'coaxial',
        subject: iface(name, 'slip'),
        target: iface(headGasketOf(bank), `dowelHole[${local}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
    );
  }
  for (let dowel = 1; dowel <= 2; dowel++) {
    rows.push({
      requirementId: 'REQ-V8R2-030',
      alsoVerifies: ['REQ-V8R2-105'],
      id: `Bellhousing Dowel ${dowel} presses into the block rear face (P04)`,
      kind: 'interference',
      subject: iface(`Bellhousing Dowel ${dowel}`, 'press'),
      target: iface(block, `bellDowelBore[${dowel}]`),
      minVolume: interferenceProofMinVolume,
      reason: `${pressFitReason('P04')}; F20 bellhousing dowel slip side 0.005-0.030 remains a fixture callout (bellhousing is not an occurrence)`,
    });
  }
  return rows;
};

const flywheelDamperExhaustRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  // REQ-V8R2-031 — flywheel bolts, damper bolt + washer, damper stack.
  for (let bolt = 1; bolt <= 8; bolt++) {
    const name = `Flywheel Bolt ${bolt}`;
    rows.push(
      {
        requirementId: 'REQ-V8R2-031',
        id: `${name} is coaxial with crank flange tap ${bolt}`,
        kind: 'coaxial',
        subject: iface(name, 'shank'),
        target: iface('Crankshaft 1', `flangeTap[${bolt}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      {
        requirementId: 'REQ-V8R2-031',
        id: `${name} thread engages the crank flange by >= 15.0`,
        kind: 'insertion',
        subject: iface(name, 'thread'),
        target: iface('Crankshaft 1', `flangeTap[${bolt}]`),
        min: 15,
        tolerance: tolerances.depth,
        reason: 'T-THREADS flywheel bolts M10x1.0 x 22: min engagement 15.0',
      },
      {
        requirementId: 'REQ-V8R2-031',
        alsoVerifies: ['REQ-V8R2-082'],
        id: `${name} head seats on Flywheel 1 spot face ${bolt}`,
        kind: 'contact',
        subject: iface(name, 'headFace'),
        target: iface('Flywheel 1', `boltSeat[${bolt}]`),
        tolerance: tolerances.contact,
      },
    );
  }
  rows.push(
    {
      requirementId: 'REQ-V8R2-031',
      id: 'Damper Bolt 1 thread engages the crank snout by >= 28.0',
      kind: 'insertion',
      subject: iface('Damper Bolt 1', 'thread'),
      target: iface('Crankshaft 1', 'snoutThread'),
      min: 28,
      tolerance: tolerances.depth,
      reason: 'T-THREADS damper bolt M16x2.0 x 45: min engagement 28.0',
    },
    {
      requirementId: 'REQ-V8R2-031',
      id: 'Damper Washer 1 clamps against Damper Hub 1',
      kind: 'contact',
      subject: iface('Damper Washer 1', 'clampFace'),
      target: iface('Damper Hub 1', 'noseFace'),
      tolerance: tolerances.contact,
    },
    {
      requirementId: 'REQ-V8R2-031',
      id: 'Damper Hub 1 seats against the crank snout shoulder',
      kind: 'contact',
      subject: iface('Damper Hub 1', 'shoulderFace'),
      target: iface('Crankshaft 1', 'snoutShoulder'),
      tolerance: tolerances.contact,
    },
    {
      requirementId: 'REQ-V8R2-031',
      id: 'Damper Elastomer 1 is bonded between hub rim and inertia ring (compressed nominal)',
      kind: 'contact',
      subject: iface('Damper Elastomer 1', 'hubBond'),
      target: iface('Damper Hub 1', 'rim'),
      tolerance: tolerances.contact,
      reason:
        'REQ-V8R2-097 stack: hub + elastomer + inertia ring; elastomer modeled at compressed radial thickness 4.0',
    },
    {
      requirementId: 'REQ-V8R2-031',
      id: 'Damper Inertia Ring 1 is bonded onto Damper Elastomer 1 (compressed nominal)',
      kind: 'contact',
      subject: iface('Damper Elastomer 1', 'ringBond'),
      target: iface('Damper Inertia Ring 1', 'bore'),
      tolerance: tolerances.contact,
      reason:
        'REQ-V8R2-097 stack: hub + elastomer + inertia ring; elastomer modeled at compressed radial thickness 4.0',
    },
  );
  // REQ-V8R2-032 — 16 exhaust stud stacks: stud into head tap >= 16.0,
  // through gasket + flange slots, nut contacts the flange face.
  for (let stud = 1; stud <= 16; stud++) {
    const bank: BankSide = stud <= 8 ? 'R' : 'L';
    const local = ((stud - 1) % 8) + 1;
    const name = `Exhaust Stud ${stud}`;
    rows.push(
      {
        requirementId: 'REQ-V8R2-032',
        id: `${name} engages ${headOf(bank)} exhaust tap ${local} by >= 16.0`,
        kind: 'insertion',
        subject: iface(name, 'headThread'),
        target: iface(headOf(bank), `exhaustStudTap[${local}]`),
        min: 16,
        tolerance: tolerances.depth,
        reason: 'T-THREADS exhaust studs M8x1.25: min engagement 16.0',
      },
      {
        requirementId: 'REQ-V8R2-032',
        id: `${name} passes through Exhaust Header ${bank} stud slot ${local}`,
        kind: 'coaxial',
        subject: iface(name, 'shank'),
        target: iface(`Exhaust Header ${bank}`, `studSlot[${local}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      {
        requirementId: 'REQ-V8R2-032',
        alsoVerifies: ['REQ-V8R2-036'],
        id: `${name} passes through Exhaust Gasket ${bank} stud hole ${local}`,
        kind: 'coaxial',
        subject: iface(name, 'shank'),
        target: iface(`Exhaust Gasket ${bank}`, `studHole[${local}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      },
      {
        requirementId: 'REQ-V8R2-032',
        alsoVerifies: ['REQ-V8R2-082'],
        id: `Exhaust Nut ${stud} clamps Exhaust Header ${bank} flange face`,
        kind: 'contact',
        subject: iface(`Exhaust Nut ${stud}`, 'clampFace'),
        target: iface(`Exhaust Header ${bank}`, `flangeSeat[${local}]`),
        tolerance: tolerances.contact,
      },
    );
  }
  return rows;
};

type PeripheralFamily = {
  bolt: string;
  count: number;
  engagement: number;
  callout: string;
  /**
   * Clamped part, tapped base part + tap family for ordinal i (1-based).
   * `clampedLocal` overrides the clamped-side hole/seat index when the
   * clamped part is shared across banks (e.g. the intake manifold).
   */
  resolve: (index: number) => {
    clamped: string;
    base: string;
    tapFamily: string;
    local: number;
    clampedLocal?: number;
  };
};

/**
 * REQ-V8R2-033 peripheral fastener closure: every remaining fastener family
 * (85 fasteners, verbatim list) passes through modeled clearance holes into a
 * modeled tapped depth with its head on a spot face.
 */
const peripheralFamilies: readonly PeripheralFamily[] = [
  {
    bolt: 'Valve Cover Bolt',
    count: 16,
    engagement: 12,
    callout: 'valve cover bolts M6x1.0 x 25',
    resolve: (index) => ({
      clamped: `Valve Cover ${index <= 8 ? 'R' : 'L'}`,
      base: headOf(index <= 8 ? 'R' : 'L'),
      tapFamily: 'railTap',
      local: ((index - 1) % 8) + 1,
    }),
  },
  {
    bolt: 'Oil Pan Bolt',
    count: 16,
    engagement: 9,
    callout: 'oil pan bolts M6x1.0 x 16',
    resolve: (index) => ({
      clamped: 'Oil Pan 1',
      base: block,
      tapFamily: 'panRailTap',
      local: index,
    }),
  },
  {
    bolt: 'Front Cover Bolt',
    count: 10,
    engagement: 9,
    callout: 'front cover bolts M6x1.0 x 30',
    resolve: (index) => ({
      clamped: 'Front Cover 1',
      base: block,
      tapFamily: 'frontCoverTap',
      local: index,
    }),
  },
  {
    bolt: 'Rear Seal Housing Bolt',
    count: 6,
    engagement: 9,
    callout: 'rear seal housing bolts M6x1.0 x 16',
    resolve: (index) => ({
      clamped: 'Rear Seal Housing 1',
      base: block,
      tapFamily: 'rearHousingTap',
      local: index,
    }),
  },
  {
    bolt: 'Oil Pump Cover Bolt',
    count: 4,
    engagement: 9,
    callout: 'oil pump cover bolts M6x1.0 x 16',
    resolve: (index) => ({
      clamped: 'Oil Pump Cover 1',
      base: 'Front Cover 1',
      tapFamily: 'pumpCoverTap',
      local: index,
    }),
  },
  {
    bolt: 'Pickup Bolt',
    count: 2,
    engagement: 9,
    callout: 'pickup tube bolts M6x1.0 x 12',
    resolve: (index) => ({
      clamped: 'Oil Pickup Tube 1',
      base: 'Front Cover 1',
      tapFamily: 'pickupTap',
      local: index,
    }),
  },
  {
    bolt: 'Water Pump Bolt',
    count: 4,
    engagement: 12,
    callout: 'water pump bolts M8x1.25 x 30',
    resolve: (index) => ({
      clamped: 'Water Pump Housing 1',
      base: block,
      tapFamily: 'waterPumpTap',
      local: index,
    }),
  },
  {
    bolt: 'Thermostat Housing Bolt',
    count: 2,
    engagement: 9,
    callout: 'thermostat housing bolts M6x1.0 x 20',
    resolve: (index) => ({
      clamped: 'Thermostat Housing 1',
      base: manifold,
      tapFamily: 'thermostatTap',
      local: index,
    }),
  },
  {
    bolt: 'Intake Bolt',
    count: 10,
    engagement: 16,
    callout: 'intake manifold bolts M8x1.25 x 35',
    resolve: (index) => ({
      clamped: manifold,
      base: headOf(index <= 5 ? 'R' : 'L'),
      tapFamily: 'intakeBoltTap',
      local: ((index - 1) % 5) + 1,
      clampedLocal: index,
    }),
  },
  {
    bolt: 'Throttle Bolt',
    count: 4,
    engagement: 9,
    callout: 'throttle bolts M6x1.0 x 20',
    resolve: (index) => ({
      clamped: 'Throttle Body 1',
      base: manifold,
      tapFamily: 'throttleTap',
      local: index,
    }),
  },
  {
    bolt: 'Rail Bolt',
    count: 4,
    engagement: 9,
    callout: 'fuel rail bolts M6x1.0 x 16',
    resolve: (index) => ({
      clamped: `Fuel Rail ${index <= 2 ? 'R' : 'L'}`,
      base: manifold,
      tapFamily: `railMountTap${index <= 2 ? 'R' : 'L'}`,
      local: ((index - 1) % 2) + 1,
    }),
  },
  {
    bolt: 'Cam Gear Bolt',
    count: 3,
    engagement: 12,
    callout: 'cam gear bolts M8x1.25 x 20',
    resolve: (index) => ({
      clamped: 'Cam Gear 1',
      base: 'Camshaft 1',
      tapFamily: 'gearTap',
      local: index,
    }),
  },
  {
    bolt: 'Thrust Plate Bolt',
    count: 2,
    engagement: 9,
    callout: 'cam thrust plate bolts M6x1.0 x 12',
    resolve: (index) => ({
      clamped: 'Cam Thrust Plate 1',
      base: block,
      tapFamily: 'thrustPlateTap',
      local: index,
    }),
  },
  {
    bolt: 'Throttle Blade Screw',
    count: 2,
    engagement: 3,
    callout: 'throttle blade screws M3x0.5 x 6',
    resolve: (index) => ({
      clamped: 'Throttle Blade 1',
      base: 'Throttle Shaft 1',
      tapFamily: 'bladeScrewTap',
      local: index,
    }),
  },
];

const peripheralFastenerRows = (): ContractRow[] =>
  peripheralFamilies.flatMap((family) =>
    Array.from({ length: family.count }, (_, offset) => {
      const index = offset + 1;
      const { clamped, base, tapFamily, local, clampedLocal } =
        family.resolve(index);
      const holeIndex = clampedLocal ?? local;
      return fastenerStack({
        requirementId: 'REQ-V8R2-033',
        bolt: `${family.bolt} ${index}`,
        shankTarget: iface(clamped, `boltHole[${holeIndex}]`),
        tapTarget: iface(base, `${tapFamily}[${local}]`),
        seatTarget: iface(clamped, `boltSeat[${holeIndex}]`),
        engagement: family.engagement,
        callout: family.callout,
      });
    }).flat(),
  );

// ---------------------------------------------------------------------------
// CL-3 sealing (verify-today rows: REQ 036, 037, 039, 040, 041, 042, 043,
// 045, 047, 048, 049; 035 and 046 are part-export hole patterns)
// ---------------------------------------------------------------------------

/** Head-gasket opening stacks not owned by REQ-008/016/029/030 (REQ-036). */
const headGasketStackRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  for (const bank of banks) {
    const gasket = headGasketOf(bank);
    const head = headOf(bank);
    for (let ring = 1; ring <= 4; ring++) {
      const cylinder = bank === 'R' ? ring : ring + 4;
      rows.push({
        requirementId: 'REQ-V8R2-036',
        id: `${gasket} fire ring ${ring} is coaxial with block cylinder bore ${cylinder}`,
        kind: 'coaxial',
        subject: iface(gasket, `fireRing[${ring}]`),
        target: iface(block, `cylBore[${cylinder}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      });
    }
    for (let hole = 1; hole <= 10; hole++) {
      rows.push({
        requirementId: 'REQ-V8R2-036',
        id: `${gasket} bolt hole ${hole} is coaxial with ${head} bolt hole ${hole}`,
        kind: 'coaxial',
        subject: iface(gasket, `boltHole[${hole}]`),
        target: iface(head, `boltHole[${hole}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      });
    }
    for (let hole = 1; hole <= 8; hole++) {
      rows.push({
        requirementId: 'REQ-V8R2-036',
        id: `${gasket} pushrod hole ${hole} is coaxial with ${head} pushrod hole ${hole}`,
        kind: 'coaxial',
        subject: iface(gasket, `pushrodHole[${hole}]`),
        target: iface(head, `pushrodHole[${hole}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      });
    }
    for (let hole = 1; hole <= 2; hole++) {
      rows.push({
        requirementId: 'REQ-V8R2-036',
        id: `${gasket} dowel hole ${hole} is coaxial with ${head} dowel bore ${hole}`,
        kind: 'coaxial',
        subject: iface(gasket, `dowelHole[${hole}]`),
        target: iface(head, `dowelBore[${hole}]`),
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      });
    }
  }
  return rows;
};

/** REQ-V8R2-036 "same rule" stacks for the other named gasket joints. */
const flangeGasketStackRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  const push = (options: {
    gasket: string;
    family: string;
    count: number;
    target: (hole: number) => ContractSelector;
    label: string;
  }): void => {
    for (let hole = 1; hole <= options.count; hole++) {
      const target = options.target(hole);
      rows.push({
        requirementId: 'REQ-V8R2-036',
        id: `${options.gasket} ${options.family}[${hole}] is coaxial with ${options.label} ${hole}`,
        kind: 'coaxial',
        subject: iface(options.gasket, `${options.family}[${hole}]`),
        target,
        tolerance: tolerances.coaxial,
        angularToleranceDegrees: tolerances.angularDegrees,
      });
    }
  };
  for (const bank of banks) {
    const head = headOf(bank);
    push({
      gasket: `Intake Gasket ${bank}`,
      family: 'portOval',
      count: 4,
      target: (hole) => iface(head, `intakePort[${hole}]`),
      label: `${head} intake port`,
    });
    push({
      gasket: `Intake Gasket ${bank}`,
      family: 'portOval',
      count: 4,
      target: (hole) => iface(manifold, `runnerFlange${bank}[${hole}]`),
      label: `${manifold} runner flange ${bank}`,
    });
    push({
      gasket: `Intake Gasket ${bank}`,
      family: 'boltHole',
      count: 5,
      target: (hole) => iface(head, `intakeBoltTap[${hole}]`),
      label: `${head} intake tap`,
    });
    push({
      gasket: `Intake Gasket ${bank}`,
      family: 'coolantPort',
      count: 1,
      target: () => iface(head, 'crossoverOutlet'),
      label: `${head} crossover outlet`,
    });
    push({
      gasket: `Exhaust Gasket ${bank}`,
      family: 'port',
      count: 4,
      target: (hole) => iface(head, `exhaustPort[${hole}]`),
      label: `${head} exhaust port`,
    });
    push({
      gasket: `Exhaust Gasket ${bank}`,
      family: 'port',
      count: 4,
      target: (hole) => iface(`Exhaust Header ${bank}`, `portOpening[${hole}]`),
      label: `Exhaust Header ${bank} port opening`,
    });
    push({
      gasket: `Valve Cover Gasket ${bank}`,
      family: 'boltHole',
      count: 8,
      target: (hole) => iface(head, `railTap[${hole}]`),
      label: `${head} rail tap`,
    });
  }
  push({
    gasket: 'Oil Pan Gasket 1',
    family: 'boltHole',
    count: 16,
    target: (hole) => iface(block, `panRailTap[${hole}]`),
    label: 'block pan rail tap',
  });
  push({
    gasket: 'Front Cover Gasket 1',
    family: 'boltHole',
    count: 10,
    target: (hole) => iface(block, `frontCoverTap[${hole}]`),
    label: 'block front tap',
  });
  push({
    gasket: 'Rear Seal Housing Gasket 1',
    family: 'boltHole',
    count: 6,
    target: (hole) => iface(block, `rearHousingTap[${hole}]`),
    label: 'block rear tap',
  });
  push({
    gasket: 'Water Pump Gasket 1',
    family: 'transferPort',
    count: 2,
    target: (hole) => iface(block, `jacketInlet[${hole}]`),
    label: 'block jacket inlet',
  });
  push({
    gasket: 'Water Pump Gasket 1',
    family: 'boltHole',
    count: 4,
    target: (hole) => iface(block, `waterPumpTap[${hole}]`),
    label: 'block water pump tap',
  });
  return rows;
};

type GasketJoint = {
  gasket: string;
  band: string;
  sideA: ContractSelector;
  sideB: ContractSelector;
  faceA: string;
  faceB: string;
  /** Head-deck rows are REQ-037 proper; the rest alsoVerify REQ-049. */
  minor: boolean;
};

const gasketJoints = (): GasketJoint[] => [
  ...banks.map((bank) => ({
    gasket: headGasketOf(bank),
    band: 'Head Gasket',
    sideA: iface(block, `deck${bank}`),
    sideB: iface(headOf(bank), 'deck'),
    faceA: 'block',
    faceB: 'head',
    minor: false,
  })),
  ...banks.map((bank) => ({
    gasket: `Intake Gasket ${bank}`,
    band: 'Intake Gasket',
    sideA: iface(headOf(bank), 'intakeFlange'),
    sideB: iface(manifold, `headFlange${bank}`),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  })),
  ...banks.map((bank) => ({
    gasket: `Exhaust Gasket ${bank}`,
    band: 'Exhaust Gasket',
    sideA: iface(headOf(bank), 'exhaustFlange'),
    sideB: iface(`Exhaust Header ${bank}`, 'headJoint'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  })),
  ...banks.map((bank) => ({
    gasket: `Valve Cover Gasket ${bank}`,
    band: 'Valve Cover Gasket',
    sideA: iface(headOf(bank), 'coverRail'),
    sideB: iface(`Valve Cover ${bank}`, 'rail'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  })),
  {
    gasket: 'Oil Pan Gasket 1',
    band: 'Oil Pan Gasket',
    sideA: iface(block, 'panRail'),
    sideB: iface('Oil Pan 1', 'rail'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  },
  {
    gasket: 'Front Cover Gasket 1',
    band: 'Front Cover Gasket',
    sideA: iface(block, 'frontFace'),
    sideB: iface('Front Cover 1', 'blockJoint'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  },
  {
    gasket: 'Rear Seal Housing Gasket 1',
    band: 'Rear Seal Housing Gasket',
    sideA: iface(block, 'rearFace'),
    sideB: iface('Rear Seal Housing 1', 'blockJoint'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  },
  {
    gasket: 'Water Pump Gasket 1',
    band: 'Water Pump Gasket',
    sideA: iface(block, 'waterPumpPad'),
    sideB: iface('Water Pump Housing 1', 'blockJoint'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  },
  {
    gasket: 'Thermostat Gasket 1',
    band: 'Thermostat Gasket',
    sideA: iface(manifold, 'thermostatCavity'),
    sideB: iface('Thermostat Housing 1', 'manifoldJoint'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  },
  {
    gasket: 'Throttle Gasket 1',
    band: 'Throttle Gasket',
    sideA: iface(manifold, 'throttleFlange'),
    sideB: iface('Throttle Body 1', 'flange'),
    faceA: 'a',
    faceB: 'b',
    minor: true,
  },
];

/** REQ-V8R2-037 (+049 for minor joints): compressed-band and face contacts. */
const compressedGasketRows = (
  gasketBandLookup: (band: string) => { min: number; max: number },
): ContractRow[] => {
  const rows: ContractRow[] = [];
  for (const joint of gasketJoints()) {
    const { min, max } = gasketBandLookup(joint.band);
    const alsoVerifies = joint.minor ? ['REQ-V8R2-049'] : undefined;
    rows.push(
      {
        requirementId: 'REQ-V8R2-037',
        ...(alsoVerifies ? { alsoVerifies } : {}),
        id: `${joint.gasket} joint face-to-face distance stays in the T-FITS-GASKET band`,
        kind: 'clearance',
        subject: joint.sideA,
        target: joint.sideB,
        min,
        max,
        tolerance: tolerances.band,
        reason: `T-FITS-GASKET ${joint.band}: compressed band ${min}-${max}`,
      },
      {
        requirementId: 'REQ-V8R2-037',
        ...(alsoVerifies ? { alsoVerifies } : {}),
        id: `${joint.gasket} ${joint.faceA} face contacts its seat`,
        kind: 'contact',
        subject: iface(joint.gasket, joint.faceA),
        target: joint.sideA,
        tolerance: tolerances.contact,
      },
      {
        requirementId: 'REQ-V8R2-037',
        ...(alsoVerifies ? { alsoVerifies } : {}),
        id: `${joint.gasket} ${joint.faceB} face contacts its clamp`,
        kind: 'contact',
        subject: iface(joint.gasket, joint.faceB),
        target: joint.sideB,
        tolerance: tolerances.contact,
      },
    );
  }
  return rows;
};

const valveSealingRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  // REQ-V8R2-039 — cylinder 1 IN and EX cone-on-cone at modeled phase.
  for (const slot of ['Intake', 'Exhaust'] as const) {
    const valve = slot === 'Intake' ? 'Intake Valve 1' : 'Exhaust Valve 1';
    const seat =
      slot === 'Intake' ? 'Intake Valve Seat 1' : 'Exhaust Valve Seat 1';
    const width = slot === 'Intake' ? 1.5 : 2;
    rows.push(
      {
        requirementId: 'REQ-V8R2-039',
        id: `${valve} face cone sits at 45.0 deg from its stem axis`,
        kind: 'angle',
        subject: iface(valve, 'seatFace'),
        target: datumOf(valve, 'stemAxis'),
        angleDegrees: 45,
        angularToleranceDegrees: 0.5,
        reason: 'REQ-V8R2-039: valve 45.0 +/-0.5 deg face cone',
      },
      {
        requirementId: 'REQ-V8R2-039',
        id: `${seat} seat cone sits at 45.0 deg from its axis`,
        kind: 'angle',
        subject: iface(seat, 'seatCone'),
        target: datumOf(seat, 'axis'),
        angleDegrees: 45,
        angularToleranceDegrees: 0.5,
        reason: 'REQ-V8R2-039: insert 45.0 deg seat cone',
      },
      {
        requirementId: 'REQ-V8R2-039',
        id: `${valve} seat face contacts ${seat} cone (closed at TDC compression)`,
        kind: 'contact',
        subject: iface(valve, 'seatFace'),
        target: iface(seat, 'seatCone'),
        tolerance: tolerances.contact,
        reason: `REQ-V8R2-039: seat width ${slot === 'Intake' ? 'IN 1.5' : 'EX 2.0'} (${width})`,
      },
    );
  }
  // REQ-V8R2-040/041 — 16 seat inserts P03, 16 guides P02.
  for (const { valve, slot, bank, bankValve } of valves) {
    const seat = `${slot} Valve Seat ${Math.ceil(valve / 2)}`;
    rows.push(
      pressRow({
        requirementId: 'REQ-V8R2-040',
        id: `${seat} presses into ${headOf(bank)} counterbore ${bankValve} (P03)`,
        subject: iface(seat, 'press'),
        target: iface(headOf(bank), `seatBore[${bankValve}]`),
        pressId: 'P03',
      }),
      pressRow({
        requirementId: 'REQ-V8R2-041',
        id: `Valve Guide ${valve} presses into ${headOf(bank)} guide bore ${bankValve} (P02)`,
        subject: iface(`Valve Guide ${valve}`, 'press'),
        target: iface(headOf(bank), `guideBore[${bankValve}]`),
        pressId: 'P02',
      }),
      // REQ-V8R2-047 — stem seals pressed on guide bosses, P12.
      pressRow({
        requirementId: 'REQ-V8R2-047',
        id: `Valve Stem Seal ${valve} presses onto Valve Guide ${valve} boss (P12)`,
        subject: iface(`Valve Stem Seal ${valve}`, 'bossPress'),
        target: iface(`Valve Guide ${valve}`, 'sealBoss'),
        pressId: 'P12',
      }),
    );
  }
  // REQ-V8R2-048 — main seal case press (P13) and lip squeeze (P14).
  rows.push(
    pressRow({
      requirementId: 'REQ-V8R2-048',
      id: 'Front Main Seal 1 case presses into Front Cover 1 seal bore (P13)',
      subject: iface('Front Main Seal 1', 'casePress'),
      target: iface('Front Cover 1', 'sealBore'),
      pressId: 'P13',
    }),
    pressRow({
      requirementId: 'REQ-V8R2-048',
      id: 'Rear Main Seal 1 case presses into Rear Seal Housing 1 bore (P13)',
      subject: iface('Rear Main Seal 1', 'casePress'),
      target: iface('Rear Seal Housing 1', 'sealBore'),
      pressId: 'P13',
    }),
    pressRow({
      requirementId: 'REQ-V8R2-048',
      id: 'Front Main Seal 1 lip squeezes the Damper Hub 1 seal journal (P14)',
      subject: iface('Front Main Seal 1', 'lip'),
      target: iface('Damper Hub 1', 'sealJournal'),
      pressId: 'P14',
    }),
    pressRow({
      requirementId: 'REQ-V8R2-048',
      id: 'Rear Main Seal 1 lip squeezes the crank rear seal journal (P14)',
      subject: iface('Rear Main Seal 1', 'lip'),
      target: iface('Crankshaft 1', 'rearSealJournal'),
      pressId: 'P14',
    }),
  );
  return rows;
};

const ringRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  for (const cylinder of cylinders) {
    const piston = `Piston ${cylinder}`;
    const ringSet = [
      { name: `Top Ring ${cylinder}`, gapFit: 'F12' },
      { name: `Second Ring ${cylinder}`, gapFit: 'F13' },
      { name: `Oil Ring Upper Rail ${cylinder}`, gapFit: 'F14' },
      { name: `Oil Ring Lower Rail ${cylinder}`, gapFit: 'F14' },
    ] as const;
    // REQ-V8R2-042 — installed end gaps (REQ counts 40 gaps: the oil pack
    // expander joint is banded with its rails per F14).
    for (const ring of ringSet) {
      rows.push(
        clearanceRow({
          requirementId: 'REQ-V8R2-042',
          id: `${ring.name} end gap stays in its installed band`,
          subject: iface(ring.name, 'gapFaceA'),
          target: iface(ring.name, 'gapFaceB'),
          fitId: ring.gapFit,
        }),
      );
      // REQ-V8R2-043 — 32 ring/rail outer faces contact the bore wall.
      rows.push({
        requirementId: 'REQ-V8R2-043',
        id: `${ring.name} outer face contacts cylinder bore ${cylinder}`,
        kind: 'contact',
        subject: iface(ring.name, 'face'),
        target: iface(block, `cylBore[${cylinder}]`),
        tolerance: tolerances.contact,
        reason:
          'REQ-V8R2-043: installed OD = bore Ø94; the v1 0.25 radial shyness is prohibited',
      });
    }
    rows.push(
      clearanceRow({
        requirementId: 'REQ-V8R2-042',
        id: `Oil Ring Expander ${cylinder} pack joint stays in the oil-rail band`,
        subject: iface(`Oil Ring Expander ${cylinder}`, 'gapFaceA'),
        target: iface(`Oil Ring Expander ${cylinder}`, 'gapFaceB'),
        fitId: 'F14',
      }),
      // REQ-V8R2-045 — side clearances F10/F11.
      clearanceRow({
        requirementId: 'REQ-V8R2-045',
        id: `Top Ring ${cylinder} side clearance in its groove (F10)`,
        subject: iface(`Top Ring ${cylinder}`, 'sides'),
        target: iface(piston, 'topGroove'),
        fitId: 'F10',
      }),
      clearanceRow({
        requirementId: 'REQ-V8R2-045',
        id: `Second Ring ${cylinder} side clearance in its groove (F10)`,
        subject: iface(`Second Ring ${cylinder}`, 'sides'),
        target: iface(piston, 'secondGroove'),
        fitId: 'F10',
      }),
      clearanceRow({
        requirementId: 'REQ-V8R2-045',
        id: `Oil ring pack ${cylinder} side clearance in its groove (F11)`,
        subject: iface(`Oil Ring Upper Rail ${cylinder}`, 'topFace'),
        target: iface(piston, 'oilGroove'),
        fitId: 'F11',
      }),
    );
  }
  return rows;
};

const seatAndInjectorRows = (): ContractRow[] => {
  const rows: ContractRow[] = [];
  // REQ-V8R2-049 — spark plug flanges on machined counterbore seats plus
  // T-THREADS reach.
  for (const cylinder of cylinders) {
    const bank = bankOf(cylinder);
    const slot = bankSlot(cylinder);
    rows.push(
      {
        requirementId: 'REQ-V8R2-049',
        id: `Spark Plug ${cylinder} flange contacts ${headOf(bank)} plug seat ${slot}`,
        kind: 'contact',
        subject: iface(`Spark Plug ${cylinder}`, 'seatFlange'),
        target: iface(headOf(bank), `plugSeat[${slot}]`),
        tolerance: tolerances.contact,
        reason:
          'REQ-V8R2-049: gasket-seat plug on Ø20 machined counterbore flat (crush declared)',
      },
      {
        requirementId: 'REQ-V8R2-049',
        id: `Spark Plug ${cylinder} thread reaches 19.0 into ${headOf(bank)} plug tap ${slot}`,
        kind: 'insertion',
        subject: iface(`Spark Plug ${cylinder}`, 'thread'),
        target: iface(headOf(bank), `plugTap[${slot}]`),
        min: 19,
        tolerance: tolerances.depth,
        reason: 'T-THREADS spark plugs M14x1.25: reach 19.0, gasket seat',
      },
    );
  }
  // REQ-V8R2-049 — injectors seated both ends with compressed o-rings.
  for (let injector = 1; injector <= 8; injector++) {
    const bank: BankSide = injector <= 4 ? 'R' : 'L';
    const cup = ((injector - 1) % 4) + 1;
    const upperRing = `Injector O-Ring ${2 * injector - 1}`;
    const lowerRing = `Injector O-Ring ${2 * injector}`;
    rows.push(
      {
        requirementId: 'REQ-V8R2-049',
        id: `Injector ${injector} upper land inserts into Fuel Rail ${bank} cup ${cup}`,
        kind: 'insertion',
        subject: iface(`Injector ${injector}`, 'upperLand'),
        target: iface(`Fuel Rail ${bank}`, `cup[${cup}]`),
        tolerance: tolerances.depth,
      },
      {
        requirementId: 'REQ-V8R2-049',
        id: `Injector ${injector} lower land inserts into the manifold pocket ${injector}`,
        kind: 'insertion',
        subject: iface(`Injector ${injector}`, 'lowerLand'),
        target: iface(manifold, `injectorPocket[${injector}]`),
        tolerance: tolerances.depth,
      },
      {
        requirementId: 'REQ-V8R2-049',
        id: `${upperRing} seats in Fuel Rail ${bank} cup gland ${cup} (compressed squeeze 0.35-0.60)`,
        kind: 'contact',
        subject: iface(upperRing, 'gland'),
        target: iface(`Fuel Rail ${bank}`, `cup[${cup}]`),
        tolerance: tolerances.contact,
        reason:
          'FKM o-ring modeled at compressed squeeze 0.35-0.60 radial (declared elastomer)',
      },
      {
        requirementId: 'REQ-V8R2-049',
        id: `${lowerRing} seats in manifold pocket gland ${injector} (compressed squeeze 0.35-0.60)`,
        kind: 'contact',
        subject: iface(lowerRing, 'gland'),
        target: iface(manifold, `injectorPocket[${injector}]`),
        tolerance: tolerances.contact,
        reason:
          'FKM o-ring modeled at compressed squeeze 0.35-0.60 radial (declared elastomer)',
      },
    );
  }
  rows.push({
    requirementId: 'REQ-V8R2-049',
    id: 'Thermostat 1 seats in the manifold cavity groove',
    kind: 'contact',
    subject: iface('Thermostat 1', 'seat'),
    target: iface(manifold, 'thermostatSeatGroove'),
    tolerance: tolerances.contact,
  });
  return rows;
};

/** All CL-1..CL-3 verify-today rows. */
export const structureContractRows = (
  gasketBandLookup: (band: string) => { min: number; max: number },
): ContractRow[] => [
  ...cl1Rows(),
  ...rodRows(),
  ...mainCapRows(),
  ...bearingShellRows(),
  ...headBoltAndDowelRows(),
  ...flywheelDamperExhaustRows(),
  ...peripheralFastenerRows(),
  ...headGasketStackRows(),
  ...flangeGasketStackRows(),
  ...compressedGasketRows(gasketBandLookup),
  ...valveSealingRows(),
  ...ringRows(),
  ...seatAndInjectorRows(),
];
