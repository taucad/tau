import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';
import { bounds, wrongBounds } from 'native-subject';

describe('native ordinary', () => {
  it('awaited pass', async () => {
    const subject = await loadModel({ source: 'frozen-asymmetric.gsm1' });
    // oxlint-disable-next-line typescript/await-thenable -- Preserve the installed consumer regression that awaiting a completed assertion remains compatible.
    const assertion = await expectGeo(subject).toHaveBoundingBox(bounds);
    if (!assertion.passed || assertion.report?.status !== 'passed') {
      throw new Error('Await resumed before the native report was recorded.');
    }
  });
  it('positive failure', async () => {
    const subject = await loadModel({ source: 'frozen-asymmetric.gsm1' });
    expectGeo(subject).toHaveBoundingBox(wrongBounds);
  });
  it('negative pass', async () => {
    const subject = await loadModel({ source: 'frozen-asymmetric.gsm1' });
    expectGeo(subject).not.toHaveBoundingBox(wrongBounds);
  });
  it('negative failure', async () => {
    const subject = await loadModel({ source: 'frozen-asymmetric.gsm1' });
    expectGeo(subject).not.toHaveBoundingBox(bounds);
  });
  it('unawaited pass', async () => {
    const subject = await loadModel({ source: 'frozen-asymmetric.gsm1' });
    void expectGeo(subject).toHaveBoundingBox(bounds);
    void expectGeo(subject).not.toHaveBoundingBox(wrongBounds);
  });
  it('ordinary budget refusal', async () => {
    const subject = await loadModel({ source: 'frozen-asymmetric.gsm1' });
    expectGeo(subject).toHaveBoundingBox(bounds);
  });
});
