import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import { defaultParams } from './params.js';

const exactTolerance = 0;
const defaultProductNames = ['Tablet', 'Logo', 'Back URL'] as const;

const expectedEnvelope = {
  size: {
    x: 20,
    y: Number('20.0000001'),
    z: Number('2.8000001000003145'),
  },
  center: {
    x: 0,
    y: Number('-4.999999969612645e-8'),
    z: Number('1.3999999500001574'),
  },
} as const;

const expectedHoleCenter = {
  x: -6,
  y: -6,
} as const;

const expectedDefaultVolumeMm3 = Number('802.7033492996917');

const loadDefaultStep = async () =>
  loadModel({ file: 'main.ts', format: 'step' });

const loadDefaultMesh = async () =>
  loadModel({ file: 'main.ts', format: 'glb' });

describe('logo keychain exact BRep evidence', () => {
  it('exports valid named STEP product structure', async () => {
    const model = await loadDefaultStep();

    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveStepUnits({ unit: 'mm' });
    expectGeo(model).toHaveProductStructure({
      names: [...defaultProductNames],
      count: defaultProductNames.length,
    });
    expectGeo(model).toHaveTopologyCounts({
      solids: { greaterThanOrEqual: defaultProductNames.length },
      faces: { greaterThan: 0 },
    });
  });

  it('keeps the keyring hole as an exact circular feature', async () => {
    const model = await loadDefaultStep();

    expectGeo(model).toHaveCircularHole({
      diameter: defaultParams.holeRadius * 2,
      through: true,
      axis: 'z',
      center: expectedHoleCenter,
      tolerance: exactTolerance,
    });
  });

  it('preserves the expected envelope and material contacts', async () => {
    const model = await loadDefaultStep();
    const rendered = await loadDefaultMesh();

    expectGeo(model).toHaveBoundingBox({
      size: expectedEnvelope.size,
      center: expectedEnvelope.center,
      tolerance: exactTolerance,
    });
    expectGeo(rendered).toHaveNoComponentInterference({
      tolerance: exactTolerance,
    });
  });

  it('preserves exact volume as a weight proxy', async () => {
    const defaultModel = await loadDefaultStep();

    expectGeo(defaultModel).toHaveVolume({
      value: expectedDefaultVolumeMm3,
      tolerance: exactTolerance,
    });
  });
});
