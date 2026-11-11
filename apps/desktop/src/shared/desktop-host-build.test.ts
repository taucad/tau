import { describe, expect, it } from 'vitest';
import { desktopHostBuildOf } from '#shared/desktop-host-build.js';

describe('desktopHostBuildOf', () => {
  const commit = 'ABCDEF0123456789abcdef0123456789abcdef01';

  it('should stamp the 12-hex short commit of the checked-out tree', () => {
    expect(desktopHostBuildOf(() => `${commit}\n`)).toBe('abcdef012345');
  });

  it.each([
    ['no checkout', () => undefined],
    [
      'no git',
      () => {
        throw new Error('spawn git ENOENT');
      },
    ],
    ['a short commit', () => 'abcdef0'],
    ['something else', () => 'HEAD'],
  ])('should stamp nothing for %s', (_case, readCommit) => {
    expect(desktopHostBuildOf(readCommit)).toBe('');
  });
});
