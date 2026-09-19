import { afterEach, beforeEach, expect, it } from 'vitest';
import type { GeoSpecVolumeExpectation } from '#runner/types.js';
import { installGeoSpecVitest } from '#vitest/index.js';
/* oxlint-disable no-restricted-imports -- Reserved host fixtures share private support outside the package build graph. */
import {
  completedCount,
  createSettlementClient,
  delayedSubject,
  resetCompletedCount,
  subject,
} from './fixture-support.js';
/* oxlint-enable no-restricted-imports */

beforeEach(() => {
  resetCompletedCount();
});

afterEach(() => {
  const current = expect.getState().currentTestName;
  const doesNotReachEngine =
    current?.includes('rejected subject') === true || current?.includes('invalid subject') === true;
  let expected = 1;
  if (doesNotReachEngine) {
    expected = 0;
  } else if (current?.includes('both polarities') === true) {
    expected = 2;
  }
  expect(completedCount()).toBe(expected);
});

installGeoSpecVitest(createSettlementClient());

it('forgotten green settles before cleanup', () => {
  // oxlint-disable-next-line typescript/no-floating-promises -- This regression intentionally omits the matcher await.
  expect(delayedSubject()).toHaveVolume({ value: 1 });
});

it('forgotten red fails its originating test', () => {
  // oxlint-disable-next-line typescript/no-floating-promises -- This regression intentionally omits the matcher await.
  expect(delayedSubject()).toHaveVolume({ value: 0 });
});

it('fast forgotten red survives an unrelated await and fails its originating test', async () => {
  // oxlint-disable-next-line typescript/no-floating-promises -- This regression intentionally omits the matcher await.
  expect(subject).toHaveVolume({ value: 0 });
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
});

// oxlint-disable promise/prefer-await-to-then, tau-lint/no-async-iife -- These runner regressions intentionally omit chained Promise settlement.
it('forgotten red then-chain fails its originating test', () => {
  void expect(delayedSubject())
    .toHaveVolume({ value: 0 })
    .then(() => undefined);
});

it('forgotten green throwing then-chain fails its originating test', () => {
  void expect(delayedSubject())
    .toHaveVolume({ value: 1 })
    .then(() => {
      throw new Error('unawaited chained failure');
    });
});

it('forgotten red finally-chain fails its originating test', () => {
  void expect(delayedSubject())
    .toHaveVolume({ value: 0 })
    .finally(() => undefined);
});

it('forgotten handled refusal stays green', () => {
  void expect(delayedSubject())
    .toHaveVolume({ disposition: 'refused' } as unknown as GeoSpecVolumeExpectation)
    .catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('GEOSPEC_CAPABILITY_UNAVAILABLE');
    });
});

it('forgotten throwing catch-chain fails its originating test', () => {
  void expect(delayedSubject())
    .toHaveVolume({ disposition: 'refused' } as unknown as GeoSpecVolumeExpectation)
    .catch(() => {
      throw new Error('unawaited catch failure');
    });
});
// oxlint-enable promise/prefer-await-to-then, tau-lint/no-async-iife

it('forgotten rejected subject fails its originating test', () => {
  // oxlint-disable-next-line typescript/no-floating-promises -- This regression intentionally omits the matcher await.
  expect(Promise.reject(new TypeError('subject load failed'))).toHaveVolume({ value: 1 });
});

it('retry applies to the originating forgotten assertion', { retry: 1 }, () => {
  // oxlint-disable-next-line typescript/no-floating-promises -- This regression intentionally omits the matcher await.
  expect(delayedSubject()).toHaveVolume({ retry: true } as unknown as GeoSpecVolumeExpectation);
});

it('awaited green passes', async () => {
  await expect(delayedSubject()).toHaveVolume({ value: 1 });
});

it('awaited expected red stays green', async () => {
  await expect(expect(delayedSubject()).toHaveVolume({ value: 0 })).rejects.toThrow('volume mismatch');
});

it('awaited negative green passes after one host inversion', async () => {
  await expect(delayedSubject()).not.toHaveVolume({ value: 0 });
});

it('awaited expected negative red stays green', async () => {
  await expect(expect(delayedSubject()).not.toHaveVolume({ value: 1 })).rejects.toThrow('volume mismatch');
});

it('awaited expected refusal stays green under both polarities', async () => {
  const refused = { disposition: 'refused' } as unknown as GeoSpecVolumeExpectation;

  await expect(expect(delayedSubject()).toHaveVolume(refused)).rejects.toThrow('GEOSPEC_CAPABILITY_UNAVAILABLE');
  await expect(expect(delayedSubject()).not.toHaveVolume(refused)).rejects.toThrow('GEOSPEC_CAPABILITY_UNAVAILABLE');
});

it('resolved subject modifier preserves the assertion result', async () => {
  await expect(Promise.resolve(subject)).resolves.toHaveVolume({ value: 1 });
});

it('awaited invalid subject preserves its rejection', async () => {
  await expect(expect({ subjectHash: 'bad' }).toBeWatertight()).rejects.toThrow('64 lowercase hexadecimal characters');
});

it('following control stays green', async () => {
  await expect(delayedSubject()).toHaveVolume({ value: 1 });
});
