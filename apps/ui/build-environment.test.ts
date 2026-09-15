import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- This test exercises the build configuration seam directly.
import { resolveTauCloudBuildEnabled } from './build-environment.js';

describe('resolveTauCloudBuildEnabled', () => {
  it.each([
    [undefined, false],
    ['false', false],
    ['true', true],
  ])('resolves %s to %s', (value, expected) => {
    expect(resolveTauCloudBuildEnabled(value)).toBe(expected);
  });

  it('rejects non-canonical values', () => {
    expect(() => resolveTauCloudBuildEnabled('1')).toThrow('must be exactly true or false');
  });
});
