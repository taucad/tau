import { describe, expectNativeGeo, it } from 'geospec';
import { subject, bounds, wrongBounds } from 'native-subject';

describe('native ordinary', () => {
  it('awaited pass', async () => {
    const assertion = await expectNativeGeo(subject).toHaveBoundingBox(bounds);
    if (!assertion.passed || assertion.nativeReport?.status !== 'passed') {
      throw new Error('Await resumed before the native report was recorded.');
    }
  });
  it('positive failure', async () => {
    await expectNativeGeo(subject).toHaveBoundingBox(wrongBounds);
  });
  it('negative pass', async () => {
    await expectNativeGeo(subject).not.toHaveBoundingBox(wrongBounds);
  });
  it('negative failure', async () => {
    await expectNativeGeo(subject).not.toHaveBoundingBox(bounds);
  });
  it('unawaited pass', () => {
    void expectNativeGeo(subject).toHaveBoundingBox(bounds);
    void expectNativeGeo(subject).not.toHaveBoundingBox(wrongBounds);
  });
  it('ordinary budget refusal', async () => {
    await expectNativeGeo(subject).toHaveBoundingBox(bounds);
  });
});
