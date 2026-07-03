/**
 * V8 engine assembly. Places every component into the global engine frame:
 *   +X = crank axis, +Z = up (valley bisector), +Y = right bank side.
 *
 * Reciprocating parts are positioned for the cross-plane crank at its rest
 * orientation: each piston rides in its bank bore, each rod connects its
 * shared crankpin to its piston pin, each wrist pin sits in the piston.
 */
import type { ShapeConfig, Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  PIN_PHASE,
  cosd,
  sind,
  crankStations,
  type Params,
} from './params.js';
import { makeCrankshaft } from './crankshaft.js';
import { makeBlock } from './block.js';
import { makePiston } from './piston.js';
import { makeWristPin } from './wrist-pin.js';
import { makeConrod } from './conrod.js';
import { makeCylinderHead } from './cylinder-head.js';
import { makeValveCover } from './valve-cover.js';
import { makeIntake } from './intake.js';
import { makeOilPan } from './oil-pan.js';
import { makeDamper } from './damper.js';
import { makeFlywheel } from './flywheel.js';
import { makeSparkPlug } from './spark-plug.js';

const BANKS = [
  { side: 'L', deckAngle: 135, sign: -1 },
  { side: 'R', deckAngle: 45, sign: 1 },
] as const;

export function makeEngine(p: Params = defaultParameters): ShapeConfig[] {
  const st = crankStations(p);
  const parts: ShapeConfig[] = [];

  // --- Crankshaft ---
  parts.push({
    shape: makeCrankshaft(p),
    color: '#c3c3cc',
    name: 'Crankshaft',
  });

  // --- Block ---
  parts.push({
    shape: makeBlock(p),
    color: '#5f6168',
    name: 'Block',
    alpha: 0.55,
  });

  // --- Damper (front) and Flywheel (rear) ---
  parts.push({
    shape: makeDamper(p).translate([st.snoutStart - p.damperThk, 0, 0]),
    color: '#2b2b2e',
    name: 'HarmonicDamper',
  });
  parts.push({
    shape: makeFlywheel(p).translate([st.flangeStart + p.flangeThk, 0, 0]),
    color: '#9a9aa2',
    name: 'Flywheel',
  });

  // --- Oil pan ---
  parts.push({ shape: makeOilPan(p), color: '#3a3a40', name: 'OilPan' });

  // --- Intake ---
  parts.push({
    shape: makeIntake(p),
    color: '#7a2d2d',
    name: 'IntakeManifold',
    alpha: 0.9,
  });

  // --- Reciprocating assemblies: 8 pistons + pins + rods (true slider-crank) ---
  const L = p.rodLength;
  const baseZ = 10; // Bore-axis reference height above the crank axis (valley)
  let cyl = 0;
  for (const bank of BANKS) {
    const ny = cosd(bank.deckAngle);
    const nz = sind(bank.deckAngle);
    for (let index = 0; index < 4; index++) {
      const x = st.pinCenter[index] + (bank.side === 'R' ? 15 : 0) - 7;
      const phase = PIN_PHASE[index];
      const crankY = p.crankThrow * cosd(phase);
      const crankZ = p.crankThrow * sind(phase);

      // Solve the slider-crank: find the piston-pin centre Q on the bore axis
      // (line through (x,0,baseZ) along the bank normal n=(0,ny,nz)) such that
      // |Q - crankpin| == rodLength. Take the root up the bank.
      const a = crankY;
      const b = crankZ - baseZ;
      const k = ny * a + nz * b;
      const s = k + Math.sqrt(Math.max(0, k * k - (a * a + b * b - L * L)));
      const pinCY = s * ny;
      const pinCZ = baseZ + s * nz;

      // Rod direction (crankpin -> piston pin) in the YZ plane.
      const dy = pinCY - crankY;
      const dz = pinCZ - crankZ;
      const phiDeg = (Math.atan2(dz, dy) * 180) / Math.PI;

      // Piston: local +Z axis -> bank normal; pin bore (local X) stays on X.
      const piston = makePiston(p)
        .rotate(bank.deckAngle - 90, [0, 0, 0], [1, 0, 0])
        .translate([x, pinCY, pinCZ]);
      parts.push({ shape: piston, color: '#d9d9de', name: `Piston${cyl + 1}` });

      // Wrist pin: axis along engine X at the piston-pin centre.
      const wp = makeWristPin(p).translate([x, pinCY, pinCZ]);
      parts.push({ shape: wp, color: '#8f8f97', name: `WristPin${cyl + 1}` });

      // Rod: bores local Z -> engine X (rotate 90 about Y); long axis (local +Y)
      // swung to the crank->pin direction (rotate phi about X); big end -> crankpin.
      const rod = makeConrod(p)
        .rotate(90, [0, 0, 0], [0, 1, 0])
        .rotate(phiDeg, [0, 0, 0], [1, 0, 0])
        .translate([x, crankY, crankZ]);
      parts.push({ shape: rod, color: '#b0b0b8', name: `ConRod${cyl + 1}` });

      // Spark plug: threaded end at the deck, body protruding outward along n.
      const sDeck = p.deckHeight;
      const plug = makeSparkPlug(p)
        .rotate(bank.deckAngle - 90, [0, 0, 0], [1, 0, 0])
        .translate([x, ny * sDeck, baseZ + nz * sDeck]);
      parts.push({
        shape: plug,
        color: '#cfcf66',
        name: `SparkPlug${cyl + 1}`,
      });

      cyl++;
    }
  }

  // --- Heads + valve covers (one per bank) ---
  for (const bank of BANKS) {
    const headDistribution = p.deckHeight; // Deck face along bank normal
    const head = makeCylinderHead(p)
      .rotate(bank.deckAngle - 90, [0, 0, 0], [1, 0, 0])
      .translate([
        0,
        cosd(bank.deckAngle) * headDistribution,
        sind(bank.deckAngle) * headDistribution + 10,
      ]);
    parts.push({
      shape: head,
      color: '#55575d',
      name: `Cylinder Head ${bank.side}`,
    });

    const coverDistribution = p.deckHeight + p.headThk;
    const cover = makeValveCover(p)
      .rotate(bank.deckAngle - 90, [0, 0, 0], [1, 0, 0])
      .translate([
        0,
        cosd(bank.deckAngle) * coverDistribution,
        sind(bank.deckAngle) * coverDistribution + 10,
      ]);
    parts.push({
      shape: cover,
      color: '#43444a',
      name: `Valve Cover ${bank.side}`,
    });
  }

  return parts;
}

export default makeEngine;
