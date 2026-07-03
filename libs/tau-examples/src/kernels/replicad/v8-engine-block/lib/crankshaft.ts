/**
 * Cross-plane V8 crankshaft.
 *
 * Axis = global +X. Front snout at X=0, rear flange at X=totalLen.
 * Five main journals on-axis, four crankpins offset by `crankThrow` in the
 * Y–Z plane, phased 0/90/270/180° (cross-plane). Each throw is bracketed by
 * two webs that carry counterweight lobes opposite the pin. Drilled oil
 * galleries connect each pin to an adjacent main; the rear flange carries a
 * flywheel bolt circle and a centre pilot bore.
 */
import {
  makeCylinder,
  drawCircle,
  drawRoundedRectangle,
  type Shape3D,
  type Drawing,
} from 'replicad';
import {
  defaultParams as defaultParameters,
  PIN_PHASE,
  cosd,
  sind,
  crankStations,
  type Params,
} from './params.js';

/** One crank web + counterweight, as a flat plate extruded along +X. */
function makeWeb(p: Params, xStart: number, phaseDeg: number): Shape3D {
  const dirY = cosd(phaseDeg);
  const dirZ = sind(phaseDeg);

  // Pin hub centre (offset by throw) and counterweight centre (opposite).
  const pinHubY = p.crankThrow * dirY;
  const pinHubZ = p.crankThrow * dirZ;
  const cwY = -p.counterweightOffset * dirY;
  const cwZ = -p.counterweightOffset * dirZ;

  // Plane 'YZ' maps local-x -> Y, local-y -> Z; build the silhouette there.
  const mainHub: Drawing = drawCircle(p.webHubMainDia / 2);
  const pinHub: Drawing = drawCircle(p.webHubPinDia / 2).translate(
    pinHubY,
    pinHubZ,
  );
  const counterweight: Drawing = drawCircle(p.counterweightDia / 2).translate(
    cwY,
    cwZ,
  );

  // Beam connecting main hub to pin hub.
  const beamLen = p.crankThrow + p.webHubPinDia / 2;
  const beam: Drawing = drawRoundedRectangle(
    beamLen,
    p.webHubPinDia,
    p.webHubPinDia / 2,
  )
    .rotate(phaseDeg)
    .translate(pinHubY / 2, pinHubZ / 2);

  const silhouette = mainHub.fuse(beam).fuse(pinHub).fuse(counterweight);
  return silhouette.sketchOnPlane('YZ', xStart).extrude(p.webThickness);
}

export function makeCrankshaft(p: Params = defaultParameters): Shape3D {
  const st = crankStations(p);
  const mainR = p.mainJournalDia / 2;
  const pinR = p.crankpinDia / 2;

  // --- Front snout (drives the harmonic damper) ---
  let crank: Shape3D = makeCylinder(
    p.snoutDia / 2,
    p.snoutLen,
    [st.snoutStart, 0, 0],
    [1, 0, 0],
  );

  const fuseParts: Shape3D[] = [];

  // --- Five main journals on-axis ---
  for (let index = 0; index < 5; index++) {
    fuseParts.push(
      makeCylinder(
        mainR,
        p.mainJournalLen,
        [st.mainStart[index], 0, 0],
        [1, 0, 0],
      ),
    );
  }

  // --- Four throws: web | crankpin | web ---
  for (let index = 0; index < 4; index++) {
    const phase = PIN_PHASE[index];
    const py = p.crankThrow * cosd(phase);
    const pz = p.crankThrow * sind(phase);

    const webFront = st.webStart[2 * index];
    const webRear = st.webStart[2 * index + 1];

    fuseParts.push(makeWeb(p, webFront, phase));
    fuseParts.push(
      makeCylinder(
        pinR,
        p.crankpinLen,
        [st.pinStart[index], py, pz],
        [1, 0, 0],
      ),
    );
    fuseParts.push(makeWeb(p, webRear, phase));
  }

  // --- Rear flywheel flange ---
  fuseParts.push(
    makeCylinder(
      p.flangeDia / 2,
      p.flangeThk,
      [st.flangeStart, 0, 0],
      [1, 0, 0],
    ),
  );

  crank = crank.fuseAll(fuseParts);

  // --- Drilled oil galleries: each pin -> the main journal behind it ---
  const cutTools: Shape3D[] = [];
  for (let index = 0; index < 4; index++) {
    const phase = PIN_PHASE[index];
    const py = p.crankThrow * cosd(phase);
    const pz = p.crankThrow * sind(phase);
    const pinC: [number, number, number] = [st.pinCenter[index], py, pz];
    const mainC: [number, number, number] = [st.mainCenter[index + 1], 0, 0];
    const dx = mainC[0] - pinC[0];
    const dy = mainC[1] - pinC[1];
    const dz = mainC[2] - pinC[2];
    const length = Math.hypot(dx, dy, dz);
    const gallery = makeCylinder(p.oilGalleryDia / 2, length, pinC, [
      dx / length,
      dy / length,
      dz / length,
    ]);
    cutTools.push(gallery);
  }

  // --- Flange features: centre pilot bore + bolt circle ---
  const flangeMidX = st.flangeStart + p.flangeThk / 2;
  const pilot = makeCylinder(
    11,
    p.flangeThk + 4,
    [st.flangeStart - 2, 0, 0],
    [1, 0, 0],
  );
  cutTools.push(pilot);

  for (let b = 0; b < p.flangeBolts; b++) {
    const ang = (360 / p.flangeBolts) * b;
    const by = (p.flangeBoltCircle / 2) * cosd(ang);
    const bz = (p.flangeBoltCircle / 2) * sind(ang);
    const hole = makeCylinder(
      p.flangeBoltDia / 2,
      p.flangeThk + 4,
      [st.flangeStart - 2, by, bz],
      [1, 0, 0],
    );
    cutTools.push(hole);
  }
  void flangeMidX;

  crank = crank.cutAll(cutTools);

  return crank;
}

export default makeCrankshaft;
