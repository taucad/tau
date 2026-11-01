import { describe, expect, it } from 'vitest';
import { isTransientNetworkFailure } from '#lib/network-failure.js';

describe('isTransientNetworkFailure', () => {
  it.each([
    'Failed to fetch',
    'Failed to fetch (taucad.dev)',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
    'Network request failed',
  ])('matches the browser network failure %j', (message) => {
    expect(isTransientNetworkFailure(new TypeError(message))).toBe(true);
  });

  it('leaves module load failures to the stale-build recovery', () => {
    expect(
      isTransientNetworkFailure(
        new TypeError('Failed to fetch dynamically imported module: https://taucad.dev/assets/route-LuT89dZu.js'),
      ),
    ).toBe(false);
  });

  it('ignores the same words on anything but a TypeError', () => {
    expect(isTransientNetworkFailure(new Error('Failed to fetch'))).toBe(false);
    expect(isTransientNetworkFailure('Failed to fetch')).toBe(false);
  });
});
