/* oxlint-disable no-await-in-loop, no-restricted-imports, promise/prefer-await-to-then, tau-lint/no-async-iife, typescript/use-unknown-in-catch-callback-variable -- Promise settlement and standalone installed-module behavior are the subjects of this harness. */
import { afterAll, beforeAll, expect, it } from 'vitest';

import { installGeoSpecVitest } from 'geospec/vitest';

import {
  assertMissingBrepRefusal,
  COAXIAL_RELATIONSHIP,
  createNativeFixture,
  GREEN_VOLUME,
  MISSING_FILLET,
  RED_VOLUME,
} from './support.mjs';

const fixture = createNativeFixture('settlement');
let retryAttempt = 0;

installGeoSpecVitest(fixture.client);
beforeAll(fixture.open);
afterAll(fixture.close);

it('awaited green passes', async () => {
  await expect(fixture.delayedVolumeSubject()).toHaveVolume(GREEN_VOLUME);
});

it('awaited red fails its originating test', async () => {
  await expect(fixture.delayedVolumeSubject()).toHaveVolume(RED_VOLUME);
});

it('awaited negated green passes', async () => {
  await expect(fixture.delayedVolumeSubject()).not.toHaveVolume(RED_VOLUME);
});

it('awaited negated red fails its originating test', async () => {
  await expect(fixture.delayedVolumeSubject()).not.toHaveVolume(GREEN_VOLUME);
});

it('missing BRep evidence refuses both polarities', async () => {
  for (const assertion of [
    expect(fixture.volumeSubject()).toHaveFilletFeature(MISSING_FILLET),
    expect(fixture.volumeSubject()).not.toHaveFilletFeature(MISSING_FILLET),
  ]) {
    try {
      await assertion;
      throw new Error('Expected the native engine to refuse missing BRep evidence.');
    } catch (error) {
      fixture.recordError('handled-refusal', error);
      assertMissingBrepRefusal(error);
    }
  }
});

it('forgotten green settles before cleanup', () => {
  void expect(fixture.delayedVolumeSubject()).toHaveVolume(GREEN_VOLUME);
});

it('forgotten red fails its originating test', () => {
  void expect(fixture.delayedVolumeSubject()).toHaveVolume(RED_VOLUME);
});

it('fast forgotten red survives an unrelated await and fails its originating test', async () => {
  void expect(fixture.volumeSubject()).toHaveVolume(RED_VOLUME);
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
});

it('forgotten red then-chain fails its originating test', () => {
  void expect(fixture.delayedVolumeSubject())
    .toHaveVolume(RED_VOLUME)
    .then(() => undefined);
});

it('forgotten red finally-chain fails its originating test', () => {
  void expect(fixture.delayedVolumeSubject())
    .toHaveVolume(RED_VOLUME)
    .finally(() => undefined);
});

it('forgotten green throwing then-chain fails its originating test', () => {
  void expect(fixture.delayedVolumeSubject())
    .toHaveVolume(GREEN_VOLUME)
    .then(() => {
      throw new Error('unawaited chained failure');
    });
});

it('forgotten refusal throwing catch-chain fails its originating test', () => {
  void expect(fixture.delayedVolumeSubject())
    .toHaveFilletFeature(MISSING_FILLET)
    .catch((error) => {
      fixture.recordError('throwing-refusal-catch', error);
      throw new Error('unawaited catch failure');
    });
});

it('explicitly handled rejection stays green', async () => {
  await expect(fixture.delayedVolumeSubject())
    .toHaveFilletFeature(MISSING_FILLET)
    .catch((error) => {
      fixture.recordError('explicitly-handled-refusal', error);
      assertMissingBrepRefusal(error);
    });
});

it('forgotten rejected subject fails in the JavaScript framework', () => {
  void expect(Promise.reject(new TypeError('subject load failed'))).toHaveVolume(GREEN_VOLUME);
});

it('retry changes the same actual subject from red to green', { retry: 1 }, () => {
  retryAttempt += 1;
  void expect(fixture.delayedVolumeSubject()).toHaveVolume(retryAttempt === 1 ? RED_VOLUME : GREEN_VOLUME);
});

it('promise-received STEP relationship assertion passes', async () => {
  await expect(Promise.resolve(fixture.relationshipSubject())).resolves.toHaveSpatialRelationships(
    COAXIAL_RELATIONSHIP,
  );
});
