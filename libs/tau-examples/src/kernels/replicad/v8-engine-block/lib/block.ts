/**
 * Engine block: 90° V, two banks of four bores, crank axis along +X at Z=0.
 *
 * Each bank deck normal sits at ±45° from vertical (+Z). The block is a fused
 * valley casting (crankcase box + two angled bank slabs) with bored cylinders,
 * a main-bearing crank tunnel, and an open crankcase bottom that clears the
 * counterweight swing.
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  cosd,
  sind,
  crankStations,
  type Params,
} from './params.js';

const BANK = [
  { side: 'L', angle: 135, xShift: 0 }, // Deck normal up-left (+Z, -Y)
  { side: 'R', angle: 45, xShift: 15 }, // Deck normal up-right (+Z, +Y), staggered
] as const;

export function makeBlock(p: Params = defaultParameters): Shape3D {
  const st = crankStations(p);
  const xFront = -10;
  const xRear = st.totalLen + 10;
  const blockLength = xRear - xFront;

  const deck = p.deckHeight; // Crank axis -> deck along bank normal
  const boreR = p.bore / 2;

  // --- Crankcase: a chunky box around the crank ---
  const caseW = 200;
  const caseTop = 30;
  const caseBot = -110;
  let block: Shape3D = makeBox(
    [xFront, -caseW / 2, caseBot],
    [xRear, caseW / 2, caseTop],
  );

  // --- Two bank slabs: boxes built centred on origin, rotated to bank normal ---
  const slabLen = deck; // Along bank normal
  const slabW = 150; // Across (perpendicular to normal, in YZ)
  const bankSlabs: Shape3D[] = [];
  for (const b of BANK) {
    const ny = cosd(b.angle);
    const nz = sind(b.angle);
    const cy = (ny * slabLen) / 2;
    const cz = (nz * slabLen) / 2 + 10;
    const oriented = makeBox(
      [-blockLength / 2, -slabW / 2, -slabLen / 2],
      [blockLength / 2, slabW / 2, slabLen / 2],
    )
      .rotate(b.angle - 90, [0, 0, 0], [1, 0, 0])
      .translate([(xFront + xRear) / 2, cy, cz]);
    bankSlabs.push(oriented);
  }
  block = block.fuseAll(bankSlabs);

  // --- Bore the eight cylinders along each bank normal ---
  const cutTools: Shape3D[] = [];
  for (const b of BANK) {
    const ny = cosd(b.angle);
    const nz = sind(b.angle);
    for (let i = 0; i < 4; i++) {
      const x = st.pinCenter[i] + b.xShift - 7;
      const bore = makeCylinder(
        boreR,
        deck + 30,
        [x, ny * 15, nz * 15 + 10],
        [0, ny, nz],
      );
      cutTools.push(bore);
    }
  }

  // --- Main bearing crank tunnel ---
  const tunnel = makeCylinder(
    p.mainJournalDia / 2 + 1,
    blockLength + 20,
    [xFront - 10, 0, 0],
    [1, 0, 0],
  );
  cutTools.push(tunnel);

  // --- Open crankcase bottom: clear the counterweight swing (lower half only) ---
  const crankClearR = p.counterweightDia / 2 + 4;
  const sweep = makeCylinder(
    crankClearR,
    blockLength + 20,
    [xFront - 10, 0, 0],
    [1, 0, 0],
  );
  const lowerHalf = makeBox(
    [xFront - 12, -caseW, caseBot - 5],
    [xRear + 12, caseW, 0],
  );
  cutTools.push(sweep.intersect(lowerHalf));

  // --- Open the pan rail (flat bottom) ---
  const panSlot = makeBox(
    [xFront + 6, -70, caseBot - 1],
    [xRear - 6, 70, caseBot + 25],
  );
  cutTools.push(panSlot);

  block = block.cutAll(cutTools);

  return block;
}

export default makeBlock;
