/**
 * V8 engine assembly. Expensive prototypes are built once, then cloned before
 * destructive Replicad transforms place each repeated cylinder part.
 */
import type { ShapeConfig, Shape3D } from 'replicad';
import { makeBlock } from './block.js';
import { makeBottomEndParts } from './bottom-end.js';
import { makeConrod } from './conrod.js';
import { makeCrankshaft } from './crankshaft.js';
import { makeCylinderHead } from './cylinder-head.js';
import { makeDamper } from './damper.js';
import { makeExhaustParts } from './exhaust.js';
import { makeFastenerAndGasketParts } from './fasteners.js';
import { makeFlywheel } from './flywheel.js';
import { makeIntakeParts } from './intake.js';
import { makeLubricationCoolingParts } from './lubrication-cooling.js';
import { makeOilPan } from './oil-pan.js';
import {
  defaultParams,
  bankLayouts,
  cosd,
  crankStations,
  cylinderPlacements,
  sind,
  type Params,
} from './params.js';
import { makePiston, makePistonRing } from './piston.js';
import { makeSparkPlug } from './spark-plug.js';
import { makeValvetrainParts } from './valvetrain.js';
import { makeValveCover } from './valve-cover.js';
import { makeWristPin } from './wrist-pin.js';

export function makeEngine(p: Params = defaultParams): ShapeConfig[] {
  const st = crankStations(p);
  const banks = bankLayouts(p);
  const parts: ShapeConfig[] = [
    { shape: makeCrankshaft(p), color: '#c3c3cc', name: 'Crankshaft' },
    { shape: makeBlock(p), color: '#5f6168', name: 'Block', alpha: 0.55 },
    {
      shape: makeDamper(p).translate([
        st.snoutStart - p.damperThk,
        0,
        0,
      ]) as Shape3D,
      color: '#2b2b2e',
      name: 'Harmonic Damper',
    },
    {
      shape: makeFlywheel(p).translate([
        st.flangeStart + p.flangeThk,
        0,
        0,
      ]) as Shape3D,
      color: '#9a9aa2',
      name: 'Flywheel',
    },
    { shape: makeOilPan(p), color: '#3a3a40', name: 'Oil Pan' },
    ...makeBottomEndParts(p),
    ...makeIntakeParts(p),
    ...makeExhaustParts(p),
    ...makeLubricationCoolingParts(p),
    ...makeValvetrainParts(p),
    ...makeFastenerAndGasketParts(p),
  ];

  const pistonPrototype = makePiston(p);
  const pistonRingPrototypes = [
    makePistonRing(p, 0),
    makePistonRing(p, 1),
    makePistonRing(p, 2),
  ];
  const pinPrototype = makeWristPin(p);
  const rodPrototype = makeConrod(p);
  const plugPrototype = makeSparkPlug(p);
  const headPrototype = makeCylinderHead(p);
  const coverPrototype = makeValveCover(p);

  for (const placement of cylinderPlacements(p)) {
    parts.push({
      shape: pistonPrototype
        .clone()
        .rotate(placement.deckAngle - 90, [0, 0, 0], [1, 0, 0])
        .translate([placement.x, placement.pinY, placement.pinZ]) as Shape3D,
      color: '#d9d9de',
      name: `Piston ${placement.cylinderIndex + 1}`,
    });
    for (const [ringIndex, ringPrototype] of pistonRingPrototypes.entries()) {
      parts.push({
        shape: ringPrototype
          .clone()
          .rotate(placement.deckAngle - 90, [0, 0, 0], [1, 0, 0])
          .translate([placement.x, placement.pinY, placement.pinZ]) as Shape3D,
        color: '#242426',
        name: `Piston Ring ${placement.cylinderIndex + 1}.${ringIndex + 1}`,
      });
    }
    parts.push({
      shape: pinPrototype
        .clone()
        .translate([placement.x, placement.pinY, placement.pinZ]) as Shape3D,
      color: '#8f8f97',
      name: `Wrist Pin ${placement.cylinderIndex + 1}`,
    });
    parts.push({
      shape: rodPrototype
        .clone()
        .rotate(90, [0, 0, 0], [0, 1, 0])
        .rotate(placement.rodAngleDeg, [0, 0, 0], [1, 0, 0])
        .translate([
          placement.x,
          placement.crankY,
          placement.crankZ,
        ]) as Shape3D,
      color: '#b0b0b8',
      name: `Con Rod ${placement.cylinderIndex + 1}`,
    });
    parts.push({
      shape: plugPrototype
        .clone()
        .rotate(placement.deckAngle - 90, [0, 0, 0], [1, 0, 0])
        .translate([
          placement.x,
          placement.normalY * (p.deckHeight + 260),
          placement.deckZ + placement.normalZ * 260,
        ]) as Shape3D,
      color: '#cfcf66',
      name: `Spark Plug ${placement.cylinderIndex + 1}`,
    });
  }

  for (const bank of banks) {
    parts.push({
      shape: headPrototype
        .clone()
        .rotate(bank.deckAngle - 90, [0, 0, 0], [1, 0, 0])
        .translate([
          0,
          cosd(bank.deckAngle) * p.deckHeight,
          sind(bank.deckAngle) * p.deckHeight + 10,
        ]) as Shape3D,
      color: '#55575d',
      name: `Cylinder Head ${bank.side}`,
    });
    parts.push({
      shape: coverPrototype
        .clone()
        .rotate(bank.deckAngle - 90, [0, 0, 0], [1, 0, 0])
        .translate([
          0,
          cosd(bank.deckAngle) *
            (p.deckHeight + p.headThk + 28 + p.gasketThk + 0.2),
          sind(bank.deckAngle) *
            (p.deckHeight + p.headThk + 28 + p.gasketThk + 0.2) +
            10,
        ]) as Shape3D,
      color: '#43444a',
      name: `Valve Cover ${bank.side}`,
    });
  }

  return parts;
}

export default makeEngine;
