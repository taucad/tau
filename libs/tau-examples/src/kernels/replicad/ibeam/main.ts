/**
 * Parametric I-Beam (Universal Beam)
 * Customizable with beam dimensions and extrusion length.
 */
import { draw } from 'replicad';

export const defaultParams = {
  beamHeight: 200,
  beamWidth: 100,
  webThickness: 6,
  flangeThickness: 10,
  length: 1000,
  rootFilletRadius: 10,
};

export default function main(
  p = defaultParams,
) {
  const hw = p.beamWidth / 2; // Half width
  const hh = p.beamHeight / 2; // Half height
  const wt = p.webThickness;
  const ft = p.flangeThickness;
  const rf = p.rootFilletRadius;

  // Calculate dimensions accounting for fillet radius
  const flangeInset =
    (p.beamWidth - wt) / 2 - rf;
  const webHeight =
    p.beamHeight - 2 * ft - 2 * rf;

  // Start at flange midpoint and trace to center of web
  const pen = draw([0, -hh])
    .hLine(hw)
    .vLine(ft)
    .hLine(-flangeInset)
    .tangentArc(-rf, rf)
    .vLine(webHeight / 2)
    .hLine(-wt / 2)
    .closeWithMirror(); // Mirror on Y axis

  // Mirror on X axis
  const ibeamProfile = pen.fuse(
    pen.mirror([0, 0]),
  );

  // Extrude
  const ibeam = ibeamProfile
    .sketchOnPlane()
    .extrude(p.length);

  return ibeam;
}
