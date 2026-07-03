/**
 * Forged piston encoded as a single axisymmetric profile. The ring grooves
 * and domed crown are part of the revolved outline instead of annular cuts.
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import { revolvedZFromCurvePath, type Point2 } from './helpers.js';
import { defaultParams, type Params } from './params.js';

type PistonProfile = {
  start: Point2;
  segments: Array<
    { kind: 'line'; to: Point2 } | { kind: 'arc'; to: Point2; via: Point2 }
  >;
};

function pistonProfile(p: Params): PistonProfile {
  const radius = p.crownDia / 2;
  // Avoid a zero-radius rotation-axis edge; OCCT can build an invalid revolved
  // solid from that degenerate face after the wrist-pin bore is cut.
  const axisCore = 0.01;
  const top = p.pistonCompHeight;
  const bottom = -p.pistonSkirtLen;
  const grooveDepth = p.ringGrooveDepth;
  const grooveWidth = p.ringGrooveWidth;
  const firstGrooveZ = top - 5;
  const grooves = [2, 1, 0].map(
    (index) => firstGrooveZ - index * (grooveWidth + 3),
  );

  const start: Point2 = [axisCore, bottom];
  const segments: PistonProfile['segments'] = [
    { kind: 'line', to: [radius * 0.92, bottom] },
    { kind: 'line', to: [radius, bottom + 4] },
  ];

  for (const grooveZ of grooves) {
    segments.push(
      { kind: 'line', to: [radius, grooveZ] },
      { kind: 'line', to: [radius - grooveDepth, grooveZ + 0.15] },
      {
        kind: 'line',
        to: [radius - grooveDepth, grooveZ + grooveWidth - 0.15],
      },
      { kind: 'line', to: [radius, grooveZ + grooveWidth] },
    );
  }

  segments.push(
    { kind: 'line', to: [radius, top] },
    {
      kind: 'arc',
      to: [axisCore, top + p.domeRise],
      via: [radius * 0.64, top + p.domeRise + 0.5],
    },
  );

  return { start, segments };
}

export function makePiston(p: Params = defaultParams): Shape3D {
  const profile = pistonProfile(p);
  const piston = revolvedZFromCurvePath(profile.start, profile.segments);
  const pinBore = makeCylinder(
    p.pinBoreDia / 2,
    p.crownDia + 8,
    [-p.crownDia / 2 - 4, 0, 0],
    [1, 0, 0],
  );
  const rodClearanceWindow = makeBox(
    [-p.rodBeamWidth - 4, -p.crownDia / 2 - 4, -p.pistonSkirtLen - 2],
    [p.rodBeamWidth + 4, p.crownDia / 2 + 4, p.pinBoreDia / 2 + 6],
  );

  const boredPiston = piston.cutAll([pinBore, rodClearanceWindow]);
  return boredPiston.simplify();
}

export function makePistonRing(p: Params = defaultParams, index = 0): Shape3D {
  const grooveWidth = p.ringGrooveWidth;
  const z = p.pistonCompHeight - 5 - index * (grooveWidth + 3) + 0.35;
  return revolvedZFromCurvePath(
    [p.crownDia / 2 - p.ringGrooveDepth + 0.25, z],
    [
      { kind: 'line', to: [p.crownDia / 2 - 0.05, z] },
      { kind: 'line', to: [p.crownDia / 2 - 0.05, z + grooveWidth - 0.7] },
      {
        kind: 'line',
        to: [p.crownDia / 2 - p.ringGrooveDepth + 0.25, z + grooveWidth - 0.7],
      },
    ],
  );
}

export default makePiston;
