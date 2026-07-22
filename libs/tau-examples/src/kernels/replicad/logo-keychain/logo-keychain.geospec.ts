import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import { defaultParams } from './params.js';

const exactTolerance = 0;
const defaultProductNames = ['Tablet', 'Logo', 'Back URL'] as const;

const expectedEnvelope = {
  size: {
    x: Number('20.65913780233915'),
    y: Number('20.65913780233915'),
    z: Number('2.8000002000003144'),
  },
  center: {
    x: 0,
    y: 0,
    z: Number('1.4000000000001573'),
  },
} as const;

const expectedHoleCenter = {
  x: Number('-5.9999999999998685'),
  y: -6,
} as const;

const expectedDefaultVolumeMm3 = Number('802.7033492996919');

const loadDefaultStep = async () =>
  loadModel({ file: 'main.ts', format: 'step' });

describe('logo keychain exact BRep evidence', () => {
  it('exports valid named STEP product structure', async () => {
    const model = await loadDefaultStep();

    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveStepUnits({ unit: 'mm' });
    expectGeo(model).toHaveProductStructure({
      names: [...defaultProductNames],
      // + 1 for the root assembly product the AP242 exporter emits above the
      // three named components (Tablet, Logo, Back URL).
      count: defaultProductNames.length + 1,
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

    expectGeo(model).toHaveBoundingBox({
      size: expectedEnvelope.size,
      center: expectedEnvelope.center,
      tolerance: exactTolerance,
      evidence: 'brep',
    });
    expectGeo(model).toHaveNoComponentInterference({
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
