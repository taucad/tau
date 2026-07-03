import {
  makeBox,
  makeCylinder,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';
import {
  hexPrismZ,
  revolvedZFromCurvePath,
  tubeBetween,
  tubeZ,
} from './helpers.js';
import {
  defaultParams,
  cylinderPlacements,
  crankStations,
  type CylinderPlacement,
  type Params,
} from './params.js';

const placeOnBank = (
  shape: Shape3D,
  placement: CylinderPlacement,
  localY: number,
  localZ: number,
): Shape3D =>
  shape
    .rotate(placement.deckAngle - 90, [0, 0, 0], [1, 0, 0])
    .translate([
      placement.x,
      placement.deckY + localY,
      placement.deckZ + localZ,
    ]) as Shape3D;

export function makeValve(
  p: Params = defaultParams,
  kind: 'intake' | 'exhaust' = 'intake',
): Shape3D {
  const headRadius =
    (kind === 'intake' ? p.intakeValveDia : p.exhaustValveDia) / 2;
  const stemRadius = p.valveStemDia / 2;
  return revolvedZFromCurvePath(
    [0, 0],
    [
      { kind: 'line', to: [headRadius, 0] },
      { kind: 'line', to: [headRadius, 2.5] },
      { kind: 'line', to: [stemRadius + 1, 8] },
      { kind: 'line', to: [stemRadius, p.valveLength] },
      { kind: 'line', to: [0, p.valveLength] },
    ],
  );
}

export function makeValveSpring(p: Params = defaultParams): Shape3D {
  const coils: Shape3D[] = [];
  const innerRadius = p.valveStemDia / 2 + 1.2;
  const outerRadius = Math.max(innerRadius + 4, p.valveSpringOuterDia * 0.36);
  for (let index = 0; index < 5; index++) {
    coils.push(
      tubeZ(outerRadius, innerRadius, 18 + index * 7, 20.5 + index * 7),
    );
  }
  const [first, ...remainingCoils] = coils;
  return first!.fuseAll(remainingCoils);
}

export function makeRockerArm(p: Params = defaultParams): Shape3D {
  const arm = makeBox([-p.rockerLength / 2, -4, 0], [p.rockerLength / 2, 4, 7]);
  const pivot = makeCylinder(5, 12, [0, -6, 3.5], [0, 1, 0]);
  return arm.fuseAll([pivot]);
}

export function makeLifter(p: Params = defaultParams): Shape3D {
  return makeCylinder(p.lifterDia / 2, 22, [0, 0, 0], [0, 0, 1]);
}

export function makeCamshaft(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const x0 = st.mainStart[0]!;
  const len = st.totalLen - p.snoutLen - p.flangeThk;
  const lobes: Shape3D[] = [];
  for (let index = 0; index < p.bores * 4; index++) {
    const x = x0 + 18 + (len * (index + 0.5)) / (p.bores * 4);
    lobes.push(
      makeCylinder(
        p.camshaftDia / 2 + p.camLobeLift,
        7,
        [x, 0, 0],
        [1, 0, 0],
      ).translate([
        0,
        index % 2 === 0 ? p.camLobeLift / 2 : -p.camLobeLift / 2,
        0,
      ]) as Shape3D,
    );
  }
  return makeCylinder(p.camshaftDia / 2, len, [x0, 0, 0], [1, 0, 0]).fuseAll(
    lobes,
  );
}

export function makeValvetrainParts(p: Params = defaultParams): ShapeConfig[] {
  const parts: ShapeConfig[] = [];
  const timingX =
    crankStations(p).snoutStart - p.damperThk - p.frontCoverThk - 18;
  const camCenterZ = 430;
  const lifterBottomZ = camCenterZ + p.camshaftDia / 2 + p.camLobeLift + 1;
  const lifterTopZ = lifterBottomZ + 22;
  const intakeValve = makeValve(p, 'intake');
  const exhaustValve = makeValve(p, 'exhaust');
  const spring = makeValveSpring(p);
  const rocker = makeRockerArm(p);
  const lifter = makeLifter(p);

  parts.push({
    shape: makeCamshaft(p).translate([0, 0, camCenterZ]) as Shape3D,
    color: '#b0b0b8',
    name: 'Camshaft',
  });
  parts.push({
    shape: makeCylinder(38, 8, [timingX, 0, 0], [1, 0, 0]),
    color: '#8d8d94',
    name: 'Crank Timing Gear',
  });
  parts.push({
    shape: makeCylinder(52, 8, [timingX - 8, 0, camCenterZ], [1, 0, 0]),
    color: '#8d8d94',
    name: 'Cam Timing Gear',
  });
  parts.push({
    shape: tubeZ(54, 43, -2, 6)
      .rotate(90, [0, 0, 0], [0, 1, 0])
      .translate([timingX - 16, 0, camCenterZ / 2]) as Shape3D,
    color: '#2d2d30',
    name: 'Timing Chain',
  });

  for (const placement of cylinderPlacements(p)) {
    for (const [slot, localY, prototype, kind] of [
      ['Intake', -p.valveCenterOffset, intakeValve, 'intake'],
      ['Exhaust', p.valveCenterOffset, exhaustValve, 'exhaust'],
    ] as const) {
      const ordinal = placement.cylinderIndex * 2 + (kind === 'intake' ? 1 : 2);
      const valleySign = placement.bankSide === 'L' ? 1 : -1;
      const laneOffset = kind === 'intake' ? -14 : 14;
      const valve = placeOnBank(prototype.clone(), placement, localY, 260);
      const valveTop = [
        placement.x,
        placement.deckY + localY + placement.normalY * (p.valveLength + 8),
        placement.deckZ + 260 + placement.normalZ * (p.valveLength + 8),
      ] as [number, number, number];
      const pushrodTop = [
        placement.x,
        placement.deckY +
          valleySign * 155 +
          localY * 0.7 +
          placement.normalY * (p.valveLength + 14),
        placement.deckZ + 260 + placement.normalZ * (p.valveLength + 10),
      ] as [number, number, number];
      const lifterBase = [
        placement.x,
        valleySign * 38 + laneOffset,
        lifterBottomZ,
      ] as [number, number, number];
      const pushrodBase = [
        placement.x,
        valleySign * 38 + laneOffset,
        lifterTopZ + 4,
      ] as [number, number, number];

      parts.push({
        shape: valve,
        color: kind === 'intake' ? '#c9c9d0' : '#b9a49a',
        name: `${slot} Valve ${ordinal}`,
      });
      parts.push({
        shape: placeOnBank(spring.clone(), placement, localY, 294),
        color: '#888890',
        name: `${slot} Valve Spring ${ordinal}`,
      });
      parts.push({
        shape: placeOnBank(
          rocker.clone(),
          placement,
          localY,
          p.valveLength + 268,
        ),
        color: '#8b8b93',
        name: `${slot} Rocker Arm ${ordinal}`,
      });
      parts.push({
        shape: lifter.clone().translate(lifterBase) as Shape3D,
        color: '#9a9aa2',
        name: `${slot} Lifter ${ordinal}`,
      });
      parts.push({
        shape: tubeBetween(pushrodBase, pushrodTop, p.pushrodDia * 0.34),
        color: '#c8c8ce',
        name: `${slot} Pushrod ${ordinal}`,
      });
      parts.push({
        shape: hexPrismZ(9, 0, 5).translate([
          valveTop[0],
          valveTop[1],
          valveTop[2],
        ]) as Shape3D,
        color: '#b0b0b8',
        name: `${slot} Valve Retainer ${ordinal}`,
      });
    }
  }

  return parts;
}

export default makeValvetrainParts;
