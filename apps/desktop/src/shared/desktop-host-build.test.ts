import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  desktopHostBuildFileName,
  desktopHostBuildOf,
  readDesktopHostBuild,
  writeDesktopHostBuild,
} from '#shared/desktop-host-build.js';

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

describe('the build id recorded beside the bundles', () => {
  const directories: string[] = [];
  const bundleDirectory = (): string => {
    const directory = mkdtempSync(join(tmpdir(), 'tau-desktop-dist-'));
    directories.push(directory);
    return directory;
  };
  const readHead = (): string =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: import.meta.dirname, encoding: 'utf8' });

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should record the checked-out commit, as packaging does, and main should read it back', () => {
    const bundles = bundleDirectory();

    writeDesktopHostBuild(bundles, desktopHostBuildOf(readHead));

    expect(readDesktopHostBuild(bundles)).toBe(readHead().trim().slice(0, 12));
  });

  it.each([
    ['no record', undefined],
    ['an empty record', '{"build":""}'],
    ['a record that is not a build id', '{"build":"HEAD"}'],
    ['a record that is not JSON', 'abcdef012345'],
  ])('should read no build for %s', (_case, record) => {
    const bundles = bundleDirectory();
    if (record !== undefined) {
      writeFileSync(join(bundles, desktopHostBuildFileName), record);
    }

    expect(readDesktopHostBuild(bundles)).toBe('');
  });
});
