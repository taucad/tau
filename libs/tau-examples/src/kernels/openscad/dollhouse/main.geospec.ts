import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

// Geometry is reported in millimetres; MM keeps the expectations readable.
const MM = 1;

describe('dollhouse assembly', () => {
  it('has the overall footprint and ridge height', async () => {
    const model = await loadModel({ file: 'main.scad' });
    // Width incl. roof overhang 276; height from foundation base (-18)
    // up to the chimney flue pots (~418) => ~436 tall.
    expectGeo(model).toHaveBoundingBox({
      size: { x: 276 * MM, z: 436 * MM },
      tolerance: 16 * MM,
    });
  });

  it('is centred on X', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveBoundingBox({
      center: { x: 0 },
      tolerance: 3 * MM,
    });
  });

  it('is a single connected assembly', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveConnectedComponents({
      count: 1,
      tolerance: Number(MM),
    });
  });
});

describe('foundation', () => {
  it('is a wide flat slab with steps', async () => {
    const model = await loadModel({ file: 'lib/foundation.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 268 * MM },
      tolerance: 6 * MM,
    });
  });
  it('is watertight', async () => {
    const model = await loadModel({ file: 'lib/foundation.scad' });
    expectGeo(model).toBeWatertight();
  });
});

describe('walls shell', () => {
  it('rises two storeys to the gable apex', async () => {
    const model = await loadModel({ file: 'lib/walls.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 240 * MM, z: 363 * MM },
      tolerance: 6 * MM,
    });
  });
});

describe('roof', () => {
  it('spans the width with overhang and reaches the ridge', async () => {
    const model = await loadModel({ file: 'lib/roof.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 276 * MM },
      tolerance: 6 * MM,
    });
  });
  it('apex sits at the ridge height', async () => {
    const model = await loadModel({ file: 'lib/roof.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { z: 123 * MM },
      tolerance: 14 * MM,
    });
  });
});

describe('chimney', () => {
  it('is a tall narrow stack', async () => {
    const model = await loadModel({ file: 'lib/chimney.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 34 * MM },
      tolerance: 6 * MM,
    });
  });
  it('is watertight', async () => {
    const model = await loadModel({ file: 'lib/chimney.scad' });
    expectGeo(model).toBeWatertight();
  });
});

describe('window', () => {
  it('has frame, glass and shutters wider than the opening', async () => {
    const model = await loadModel({ file: 'lib/window.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 90 * MM, z: 66 * MM },
      tolerance: 14 * MM,
    });
  });
});

describe('door', () => {
  it('is a tall panelled slab with transom', async () => {
    const model = await loadModel({ file: 'lib/door.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { z: 126 * MM },
      tolerance: 12 * MM,
    });
  });
});
