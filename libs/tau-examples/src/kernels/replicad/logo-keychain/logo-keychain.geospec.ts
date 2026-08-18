import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import { defaultParams } from './params.js';

const exactTolerance = 0;
const defaultProductNames = ['Tablet', 'Logo', 'Back URL'] as const;

const expectedEnvelope = {
  size: {
    x: Number('20.023802773390287'),
    y: Number('20.023802773390287'),
    z: Number('2.823802773390286'),
  },
  center: {
    x: 0,
    y: 0,
    z: Number('1.3999999999999997'),
  },
} as const;

const expectedHoleCenter = {
  x: Number('-5.9999999999998685'),
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
      through: false,
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
