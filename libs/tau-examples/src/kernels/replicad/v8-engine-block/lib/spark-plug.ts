/**
 * Spark plug. Local frame: thread axis along +Z, gap end at z=0, terminal up.
 * Threaded shank (modelled as a plain cylinder of the thread major dia),
 * hex body, ceramic insulator, and terminal nut.
 */
import { drawPolysides, makeCylinder, type Shape3D } from 'replicad';
import { defaultParams as defaultParameters, type Params } from './params.js';

export function makeSparkPlug(p: Params = defaultParameters): Shape3D {
  const tr = p.plugThreadDia / 2;

  // Threaded reach.
  let plug: Shape3D = makeCylinder(tr, p.plugReach, [0, 0, 0], [0, 0, 1]);
  const fuseParts: Shape3D[] = [];
  // Centre electrode tip.
  fuseParts.push(makeCylinder(1.2, 4, [0, 0, -3.5], [0, 0, 1]));

  // Hex body (across-flats = hexAcross).
  const hexR = p.plugHexAcross / Math.sqrt(3); // Circumradius of hex from AF
  const hex = drawPolysides(hexR, 6)
    .sketchOnPlane('XY', p.plugReach)
    .extrude(14);
  fuseParts.push(hex);

  // Ceramic insulator (stepped cylinders).
  let z = p.plugReach + 14;
  fuseParts.push(makeCylinder(6.5, 22, [0, 0, z], [0, 0, 1]));
  z += 22;
  fuseParts.push(makeCylinder(5, 10, [0, 0, z], [0, 0, 1]));
  z += 10;
  // Terminal nut.
  fuseParts.push(makeCylinder(3, 6, [0, 0, z], [0, 0, 1]));

  plug = plug.fuseAll(fuseParts);

  return plug;
}

export default makeSparkPlug;
