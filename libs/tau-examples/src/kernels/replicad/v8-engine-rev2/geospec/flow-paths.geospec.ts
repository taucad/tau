/**
 * CL-1 flow paths (spec Section 5.1, REQ-V8R2-001..018).
 *
 * Verify-today rows run red against the missing model; the region-wall REQs
 * (007/017) stay registered deferrals (Section 1.3 policy). The void-continuity
 * frontier has LANDED (packages/geospec toHaveVoidContinuity), so its 7 REQs
 * now run as red matcher tests against the not-yet-exported model — failing on
 * the missing-model precondition today, real void proofs once the model lands.
 */
import { describe, expectGeo, it } from 'geospec';
import type { GeoSpecVoidContinuityExpectation } from 'geospec';
import { loadModel } from 'geospec/model';
import {
  assertDeferralsRegistered,
  assemblyStepLoadOptions,
  relationshipsForRequirement,
  testExports,
  tolerances,
} from '../spec/requirements.js';

const loadPartStep = async (file: string) =>
  loadModel({ file, format: 'step', mesh: false });

const loadAssemblyStep = async () => loadModel(assemblyStepLoadOptions);

const expectRequirementRelationships = async (
  requirementId: string,
): Promise<void> => {
  const model = await loadAssemblyStep();
  expectGeo(model).toHaveSpatialRelationships({
    relationships: relationshipsForRequirement(requirementId),
  });
};

/**
 * Assert one void-continuity claim on the given part/assembly export. Waypoints
 * are census occurrence names ONLY where the AABB centre provably lies in the
 * claimed void (ring/insert parts left out of the material set); everywhere
 * else they are explicit [x, y, z] mm points in the Section 1.5 frame: origin
 * at the block front face on the crank axis, +X rearward, +Z up the vee
 * bisector, +Y toward bank R. Bank R points along (0, 0.7071, 0.7071): a point
 * at distance s along a bank-R bore axis with in-deck lateral offset a maps to
 * y = 0.7071 * (s + a), z = 0.7071 * (s - a); the deck plane sits at s = 230
 * (2.1 deckHeight), so axis-aligned bounds can wall the tilted deck/crankcase
 * through the y+z bound.
 */
const occ = (name: string): { occurrence: string } => ({ occurrence: name });

const expectVoidContinuityOnAssembly = async (
  expectation: GeoSpecVoidContinuityExpectation,
): Promise<void> => {
  const model = await loadAssemblyStep();
  expectGeo(model).toHaveVoidContinuity(expectation);
};

/**
 * Cylinder-1 seal set shared by the intake/exhaust tract claims: seated valves
 * plug seats and guide bores (F08/F09 clearances are below the proof tolerance), spark plug,
 * piston 1 + compression rings, gasket, and block close the chamber floor, so
 * the seat-throat side of a tract can never reach exterior air — a broken
 * tract strands the throat waypoint in its own void component.
 */
const cylinderOneSeal = [
  'Cylinder Head R',
  'Intake Valve Seat 1',
  'Intake Valve 1',
  'Exhaust Valve Seat 1',
  'Exhaust Valve 1',
  'Valve Guide 1',
  'Valve Guide 2',
  'Spark Plug 1',
  'Head Gasket R',
  'Block 1',
  'Piston 1',
  'Top Ring 1',
  'Second Ring 1',
];

/** Intake tract walls (3.7) + cylinder-1 seal + bank-R injector-pocket plugs. */
const intakeTractMaterial = [
  'Throttle Body 1',
  'Throttle Gasket 1',
  'Intake Manifold 1',
  'Intake Gasket R',
  ...cylinderOneSeal,
  'Injector 1',
  'Injector 2',
  'Injector 3',
  'Injector 4',
];

/** Exhaust tract walls (3.8) + cylinder-1 seal. */
const exhaustTractMaterial = [
  ...cylinderOneSeal,
  'Exhaust Gasket R',
  'Exhaust Header R',
];

/**
 * Front-cover oil-chain walls (3.10): cover + gasket + block carry the
 * drillings; pump cover closes the gerotor pocket; the installed filter can
 * closes the circuit across its adapter face; relief plug blinds the relief
 * bore; seal + damper hub + crank seal the snout; the pickup tube walls its
 * own lumen (its strainer mouth lies beyond the claim bounds).
 */
const frontCoverOilMaterial = [
  'Front Cover 1',
  'Front Cover Gasket 1',
  'Block 1',
  'Oil Pump Cover 1',
  'Oil Filter 1',
  'Relief Valve Plug 1',
  'Front Main Seal 1',
  'Damper Hub 1',
  'Crankshaft 1',
  'Oil Pickup Tube 1',
];

describe('V8R2 CL-1 flow paths', () => {
  it('REQ-V8R2-002: header, head, and gasket exhaust flanges carry exactly 4 port openings per bank', async () => {
    const header = await loadPartStep(testExports.exhaustHeader);
    expectGeo(header).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 35,
      tolerance: 0.2,
    });
    const head = await loadPartStep(testExports.cylinderHead);
    expectGeo(head).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 35,
      tolerance: 0.2,
    });
    const gasket = await loadPartStep(testExports.exhaustGasket);
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 38,
      tolerance: tolerances.fine,
    });
    expectGeo(gasket).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 9,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-005: block casting global minimum wall thickness >= 4.0', async () => {
    const block = await loadPartStep(testExports.block);
    expectGeo(block).toHaveMinimumWallThickness({
      value: { greaterThanOrEqual: 4 },
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-008: per-bank deck coolant transfers are 8x Ø10 + 2x Ø14, identical and coaxial per stack', async () => {
    const head = await loadPartStep(testExports.cylinderHead);
    expectGeo(head).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 10,
      tolerance: tolerances.fine,
    });
    expectGeo(head).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 14,
      tolerance: tolerances.fine,
    });
    const gasket = await loadPartStep(testExports.headGasket);
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
    const block = await loadPartStep(testExports.block);
    expectGeo(block).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 10,
      tolerance: tolerances.fine,
    });
    expectGeo(block).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 14,
      tolerance: tolerances.fine,
    });
    await expectRequirementRelationships('REQ-V8R2-008');
  });

  it('REQ-V8R2-009: 8 core plugs Ø36 pressed with P05 interference, each a declared allowance pair', async () => {
    await expectRequirementRelationships('REQ-V8R2-009');
  });

  it('REQ-V8R2-011: block gallery network hole counts and diameters are exact, plugs seated', async () => {
    const block = await loadPartStep(testExports.block);
    // 1x Ø16 main gallery full length (plugged rear M16x1.5).
    expectGeo(block).toHaveCircularHole({
      diameter: 16,
      axis: 'x',
      tolerance: tolerances.fine,
    });
    // 4x Ø16 valley drain-backs.
    expectGeo(block).toHaveCircularHolePattern({
      count: 4,
      holeDiameter: 16,
      tolerance: tolerances.fine,
    });
    // 2x Ø11 lifter galleries (plugged x4).
    expectGeo(block).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 11,
      axis: 'x',
      tolerance: tolerances.fine,
    });
    // 5x Ø8 saddle feeds + 2x Ø8 risers.
    expectGeo(block).toHaveCircularHolePattern({
      count: 5,
      holeDiameter: 8,
      tolerance: tolerances.fine,
    });
    expectGeo(block).toHaveCircularHolePattern({
      count: 2,
      holeDiameter: 8,
      tolerance: tolerances.fine,
    });
    // 5x Ø6 cam feeds.
    expectGeo(block).toHaveCircularHolePattern({
      count: 5,
      holeDiameter: 6,
      tolerance: tolerances.fine,
    });
    await expectRequirementRelationships('REQ-V8R2-011');
  });

  it('REQ-V8R2-012: crankshaft carries exactly 8x Ø5 main-to-pin drillings with chamfered exits', async () => {
    const crank = await loadPartStep(testExports.crankshaft);
    expectGeo(crank).toHaveCircularHolePattern({
      count: 8,
      holeDiameter: 5,
      tolerance: tolerances.fine,
    });
    // Every exit chamfered 0.5x45 AT the journal surface.
    expectGeo(crank).toHaveChamferFeature({
      distance: 0.5,
      tolerance: tolerances.fine,
    });
  });

  it('REQ-V8R2-014: block saddle feeds, upper shell oil holes, and grooves align — 5 stacks', async () => {
    await expectRequirementRelationships('REQ-V8R2-014');
  });

  it('REQ-V8R2-016: valley and head drain-backs align coaxially through the gaskets', async () => {
    await expectRequirementRelationships('REQ-V8R2-016');
  });

  it('REQ-V8R2-018: throttle bore Ø75 with blade F22 and shaft F23 running fits', async () => {
    await expectRequirementRelationships('REQ-V8R2-018');
  });

  it('REQ-V8R2-001: one connected intake void throttle -> plenum -> runner -> head port -> seat throat, min section >= 900 mm2', async () => {
    // Cylinder 1, bank R (bore 1 x = 80, 2.1 boreXR). Canon valve station (3.5
    // wedge, IN seat bore Ø53 / EX Ø42 inside the Ø94 bore): the intake valve
    // axis crosses the seat plane 13 mm valley-side of the bore axis.
    // Claim 1 — tract continuity + min section, ending at the seat throat (the
    // valve is seated: the throat waypoint sits in the port bowl annulus 10 mm
    // valley-side of the stem, at s = 242 = deck + 12 into the head, a = -23).
    await expectVoidContinuityOnAssembly({
      // Throttle Body 1 is a ring housing: its AABB centre sits on the Ø75 bore
      // axis (3.7), open void with the blade/shaft left out of the material set.
      path: [occ('Throttle Body 1'), [80, 154.9, 187.4]],
      material: intakeTractMaterial,
      minCrossSection: 900,
      // X spans any throttle placement ahead of the front face through runner 1;
      // the y wall cuts the L-bank flange ports mid-runner; the z floor sits
      // under the chamber band (deck point z = 162.6 on the bore-1 axis).
      bounds: { min: [-130, -45, 140], max: [260, 170, 345] },
    });
    // Claim 2 — isolation from the coolant jacket and head-bolt holes: a tight
    // cylinder-1 box seals both probe spaces (the head-jacket crossover exits
    // at x < 20; the bolt spot-face mouth at s = 336 has z = 278.6 > 266), so
    // only a real wall breach can join them to the port void.
    await expectVoidContinuityOnAssembly({
      path: [[80, 154.9, 187.4]], // Same throat-bowl point as claim 1.
      material: intakeTractMaterial,
      isolatedFrom: [
        // Bank-R water jacket valley-side of bore 1 at deck-60 (s = 170, inside
        // the deck-8..deck-140 band), 56 mm off the bore axis: bore r 47 + land
        // 4.5..7 + width 8 puts the jacket at r 51.5..62 for any land (3.1).
        [80, 80.6, 159.8],
        // Head-bolt hole at station M1 (x = mainX1 = 35.4; bolts at mains-aligned
        // stations, 3.1), canon upper-row lateral a = -58 (rows clear the Ø94
        // bore + jacket), probed mid-head at s = 280; Head Bolt 2 is not in the
        // material set, so the Ø12.5 head bore (3.5) is open void.
        [35.4, 157, 239],
      ],
      bounds: { min: [20, 55, 140], max: [140, 172, 266] },
    });
  });

  it('REQ-V8R2-003: connected exhaust void chamber -> seat throat -> head port -> primary -> collector -> outlet, min section >= 600 mm2', async () => {
    // Canon port geometry (3.5/3.8): exhaust valve station +15 outboard of the
    // bore axis; port exit centre at s = 250 on the head outboard flange face
    // a = +72, port normal (0, 0.7071, -0.7071).
    // Claim 1 — throat -> head port -> gasket window -> primary mouth, cyl 1.
    await expectVoidContinuityOnAssembly({
      path: [
        // Throat bowl above exhaust seat 1 (seated valve): s = 242, a = +25
        // (canon station +15, probed 10 mm outboard of the stem).
        [80, 188.8, 153.4],
        // Primary-1 lumen 15 mm past the flange face along the port normal
        // (flange plate 10 thick + exhaust gasket 1.45 compressed, 3.8/2.2).
        [80, 238, 115],
      ],
      material: exhaustTractMaterial,
      minCrossSection: 600,
      // Cylinder-1 zone; the primary tube is walled mid-run so a broken port
      // strands the mouth waypoint (stud channels stay sealed by the compressed
      // flange contact), and the throat side is sealed by the cylinder-1 set.
      bounds: { min: [20, 55, 95], max: [140, 258, 266] },
    });
    // Claim 2 — all four primaries share ONE collector/outlet void (primaries
    // enter through REAL openings, no tangent-kiss end disks).
    // The y wall sits past the deepest flange-face point (face y <= 235), so
    // each lumen enters the region already sealed: a tangent-kissed primary is
    // a stub in its own component instead of reaching the shared collector.
    await expectVoidContinuityOnAssembly({
      // Lumen centres just past the flange wall at the four port stations
      // x = boreXR (2.1); z = 114 = canon exit height 125.9 advanced 12.3
      // along the port normal to the y = 240 plane.
      path: [
        [80, 240, 114],
        [191, 240, 114],
        [302, 240, 114],
        [413, 240, 114],
      ],
      material: ['Exhaust Header R'],
      bounds: { min: [40, 236, 0], max: [515, 400, 220] },
    });
  });

  it('REQ-V8R2-004: combustion void isolated from lifter valley, water jacket, and adjacent barrel over deck-0..160', async () => {
    // Barrel-wall integrity is a block property: isolate the authored block
    // occurrence from the assembly subject. The block anchors the Section 1.5
    // datums. The 45-deg
    // deck lets one axis-aligned box wall BOTH open ends of the barrels:
    // y+z <= 324 stays below the deck plane (y+z = 325.3), so no
    // over-deck exterior air enters; y+z >= 102 stays above deck-158, so the
    // barrel bottoms exit the region instead of meeting in the crankcase. The
    // y-z range keeps the outboard block exterior (|a| > 66) out too, so the
    // only voids present are the barrels, the jacket, and the valley — exactly
    // the spaces the criterion separates (v1's 33 mm valley slot goes red).
    await expectVoidContinuityOnAssembly({
      path: [[80, 127.3, 127.3]], // Barrel 1 void on the bore-1 axis (x = 80, 2.1 boreXR) at deck-50 (s = 180).
      material: ['Block 1'],
      isolatedFrom: [
        // Lifter valley air on the vee centreline between bores 1-2
        // (x = (80 + 191) / 2), inside the V opening (valley walls at
        // |z - y| >= 73.5 = 0.7071 * (bore r 47 + valley land 5, 3.1/REQ-007)
        // and above the valley floor over the Ø55 cam tunnel at z = 120 (2.1).
        [135.5, 0, 185],
        // Water jacket valley-side of bore 1 at deck-90 (s = 140, inside the
        // deck-8..deck-140 band), 56 mm off the bore axis: land 4.5..7 + width
        // 8 puts jacket at r 51.5..62 for any land in budget (3.1).
        [80, 59.4, 138.6],
        [191, 127.3, 127.3], // Adjacent barrel: bore-2 axis (x = 80 + 111 borePitch, 2.1) at deck-50.
      ],
      bounds: { min: [30, -8, 110], max: [240, 139, 186] },
    });
  });

  it('REQ-V8R2-006: connected coolant void pump volute -> block inlets -> jacket -> deck transfers -> head jacket -> crossover -> thermostat -> outlet', async () => {
    // Bank R in one claim: volute -> 2x Ø30 block inlets -> jacket around all
    // four barrels -> deck transfers -> head jacket. The jacket side is sealed
    // inside the box (core plugs pressed, deck stack gasketed, the head-jacket
    // crossover exit at the head front sits above the z = 210 lid), so a broken
    // link strands the jacket waypoints — exterior air cannot bridge them. The
    // crossover -> thermostat -> outlet leg has no spec-fixed coordinates
    // (manifold internals) and is reported as not honestly encodable today.
    await expectVoidContinuityOnAssembly({
      path: [
        // The stamped impeller sits inside the volute: with impeller and shaft
        // left out of the material set its AABB centre marks volute void (3.10).
        occ('Water Pump Impeller 1'),
        // Block jacket valley-side of bore 1 at deck-60 (s = 170), r 56: land
        // 4.5..7 + width 8 puts the jacket at r 51.5..62 for any land (3.1).
        [80, 80.6, 159.8],
        [413, 80.6, 159.8], // Same jacket station at bore 4 (x = 413, 2.1) — the core wraps all four barrels.
        // Head-R jacket over bore 2 (canon: the jacket core sits above the
        // chamber roof; sampled at s = 255 on the bore-2 axis, 3.5).
        [191, 180.3, 180.3],
      ],
      material: [
        'Water Pump Housing 1',
        'Water Pump Gasket 1',
        'Block 1',
        'Head Gasket R',
        'Cylinder Head R',
        // The eight pressed plugs seal the jacket core bores Ø36 (3.1/P05).
        'Core Plug 1',
        'Core Plug 2',
        'Core Plug 3',
        'Core Plug 4',
        'Core Plug 5',
        'Core Plug 6',
        'Core Plug 7',
        'Core Plug 8',
        // Crankcase front closure so the probe spaces stay sealed non-path voids.
        'Front Cover 1',
        'Front Cover Gasket 1',
        'Front Main Seal 1',
        'Damper Hub 1',
        'Crankshaft 1',
        // Exhaust stack walls the bore-2 probe outboard (its collector/outlet
        // lies beyond x = 475, so the probe component never reaches exterior).
        'Exhaust Gasket R',
        'Exhaust Header R',
      ],
      isolatedFrom: [
        [257.4, 0, -20], // Oil space: crankcase/sump air on the crank axis plane at mid-block (x = mainX3, 2.1), below the Ø68 tunnel.
        [191, 127.3, 127.3], // Cylinder bore 2 void at deck-50 (piston 2 not in the material set).
      ],
      // Lid z = 210 sits under the head-top/crossover zone; floor z = -30 stays
      // above the pan rail; x = 475 walls the block rear face openings.
      bounds: { min: [-50, -35, -30], max: [475, 205, 210] },
    });
  });

  it('REQ-V8R2-010: ONE connected oil void pickup -> pump -> gallery -> saddle feeds -> risers -> lifter bores + cam feeds', async () => {
    // Claim 1 — front-cover chain: gerotor pocket <-> relief branch (pocket
    // Ø62.1 on the crank axis, relief bore Ø12 blinded by its plug, 3.10). Both
    // waypoint occurrences are left out of the material set, so their AABB
    // centres mark the pocket and relief-bore voids; the pickup lumen and the
    // block gallery are walled mid-passage by the box, so a missing drilling
    // isolates the relief stub instead of detouring through the crankcase.
    await expectVoidContinuityOnAssembly({
      path: [occ('Oil Pump Inner Rotor 1'), occ('Relief Valve Piston 1')],
      material: frontCoverOilMaterial,
      bounds: { min: [-50, -60, -45], max: [30, 60, 120] },
    });
    // Claim 2 — the main gallery MEETS all five Ø8 saddle feeds (drilled runs
    // intersect). Canon gallery datum shared with REQ-015: axis y = 0, z = 60,
    // the only full-length Ø16 lane between crank-tunnel top (34 + r8) and
    // cam-tunnel bottom (92.5 - r8) on the bulkhead centre plane (2.1
    // camAxisZ, 3.1 tunnel/saddle sizes); feeds drop on the bulkhead planes to
    // the Ø68 saddles. The z >= 36 floor excludes the crank tunnel, so each
    // feed mouth leaves the region: a missing/misplaced gallery strands all
    // five feed stubs in separate components.
    await expectVoidContinuityOnAssembly({
      path: [
        // Inside each saddle feed 4 mm above its tunnel mouth (r 34), at the
        // five main-bulkhead stations mainX (2.1).
        [35.4, 0, 38],
        [146.4, 0, 38],
        [257.4, 0, 38],
        [368.4, 0, 38],
        [479.4, 0, 38],
      ],
      material: ['Block 1'],
      // Gallery lane only: the front port (x = 0 face) and rear plug tap are
      // walled out, and the Ø28 bay windows live below the z = 36 floor.
      bounds: { min: [25, -8, 36], max: [490, 8, 70] },
    });
    // Risers, lifter galleries, lifter bores, cam feeds, and the pickup -> pump
    // leg have no spec-fixed coordinates; their presence stays covered by the
    // REQ-011 hole-count claims (reported as not honestly encodable here).
  });

  it('REQ-V8R2-013: each crankpin bearing surface void-connected to its main journal through the Ø5 drilling — no blind stubs', async () => {
    // Crankshaft occurrence in the canonical assembly frame (1.5/3.2): mains axis = +X with
    // the front face at x = 0 (spec mainX/crankpinX stations); throw phase is
    // measured from +Z toward +Y about +X (P1 up at the modeled TDC), so a
    // throw at phase t points along u = (0, sin t, cos t). Drill map (3.2):
    // M1>P1, M2>P1 + M2>P2, M3>P2 + M3>P3, M4>P3 + M4>P4, M5>P4; phases P1 0,
    // P2 90, P3 270, P4 180 (2.1). Each drilling enters AT the main journal
    // surface (r 32, Ø64) at its mainX and exits AT the pin surface nearest the
    // axis (r = throw 45 - pin r 27 = 18, 2.1/3.2), the exit offset 10 mm
    // toward the feeding main so the paired feeds into one pin cannot collide.
    // Waypoints float just off both journal surfaces (r 34 and r 16); bounds
    // hug the drill lane, so the solid web between journal and pin blocks every
    // route except the Ø5 drilling itself — a blind mid-throw stub goes red.
    const c = Math.SQRT1_2;
    const drillings: Array<{
      label: string;
      mainX: number;
      pinX: number;
      u: [number, number];
    }> = [
      { label: 'M1>P1', mainX: 35.4, pinX: 90.9, u: [c, c] }, // Installed phase 45°.
      { label: 'M2>P1', mainX: 146.4, pinX: 90.9, u: [c, c] },
      { label: 'M2>P2', mainX: 146.4, pinX: 201.9, u: [c, -c] }, // Installed phase 135°.
      { label: 'M3>P2', mainX: 257.4, pinX: 201.9, u: [c, -c] },
      { label: 'M3>P3', mainX: 257.4, pinX: 312.9, u: [-c, c] }, // Installed phase 315°.
      { label: 'M4>P3', mainX: 368.4, pinX: 312.9, u: [-c, c] },
      { label: 'M4>P4', mainX: 368.4, pinX: 423.9, u: [-c, -c] }, // Installed phase 225°.
      { label: 'M5>P4', mainX: 479.4, pinX: 423.9, u: [-c, -c] },
    ];
    // Interval r 14..37 along the throw direction covers both mouth pockets;
    // +/-6 across it keeps the lane inside the web/counterweight silhouette.
    const throwSpan = (component: number): [number, number] => {
      if (component === 0) {
        return [-6, 6];
      }
      return [
        Math.min(14 * component, 37 * component) - 6,
        Math.max(14 * component, 37 * component) + 6,
      ];
    };
    for (const { mainX, pinX, u } of drillings) {
      const exitX = pinX + (mainX > pinX ? 10 : -10);
      const [yMin, yMax] = throwSpan(u[0]);
      const [zMin, zMax] = throwSpan(u[1]);
      // oxlint-disable-next-line no-await-in-loop -- Native void proofs stay serial to bound kernel memory and preserve deterministic evidence order.
      await expectVoidContinuityOnAssembly({
        path: [
          [mainX, 34 * u[0], 34 * u[1]], // Mouth pocket just outside the main journal surface (r 32 + 2).
          [exitX, 16 * u[0], 16 * u[1]], // Mouth pocket just inside the pin near-surface (r 18 - 2), between pin and axis.
        ],
        material: ['Crankshaft 1'],
        bounds: {
          min: [Math.min(mainX, exitX) - 3, yMin, zMin],
          max: [Math.max(mainX, exitX) + 3, yMax, zMax],
        },
      });
    }
  });

  it('REQ-V8R2-015: front-cover Ø10 drillings connect pump discharge -> filter boss OUT and filter IN -> gallery port', async () => {
    // Pocket -> discharge drilling -> filter boss OUT -> adapter-face plenum
    // under the installed filter can (material: the circuit closes across its
    // adapter face, REQ text) -> boss IN -> block main gallery front port
    // (3.10). The gallery is walled at x = 30 — ahead of the M1 saddle feed at
    // 35.4 — and the pickup lumen mid-tube, so the pocket can reach the gallery
    // stub only through the cover drillings; a missing/blind drilling goes red.
    await expectVoidContinuityOnAssembly({
      path: [
        occ('Oil Pump Inner Rotor 1'), // Gerotor pocket void on the crank axis (rotors left out of the material set, 3.10).
        [15, 0, 60], // Main gallery just behind its front-face port (canon gallery datum y = 0 / z = 60 shared with REQ-010 claim 2).
      ],
      material: frontCoverOilMaterial,
      bounds: { min: [-50, -60, -45], max: [30, 60, 120] },
    });
  });

  it('REQ-V8R2-007/017 (deferrals): flow-path region-wall frontier gates are registered', () => {
    assertDeferralsRegistered('flow-paths', ['REQ-V8R2-007', 'REQ-V8R2-017']);
  });
});
