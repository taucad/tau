import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installedVersion } from '#installed-version.js';

/** The manifest a build inlines. */
const bundled = { name: '@taucad/cli', version: '0.1.0-beta.6' } as const;

describe('installedVersion', () => {
  let directory: string;

  /** An installed package folder whose `package.json` holds `manifest`, and the URL of its bundled entry. */
  const installedPackage = async (manifest: string): Promise<string> => {
    const root = join(directory, 'node_modules', '@taucad', 'cli');
    await mkdir(join(root, 'dist', 'bin'), { recursive: true });
    await writeFile(join(root, 'package.json'), manifest);
    return pathToFileURL(join(root, 'dist', 'bin', 'tau.mjs')).href;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-cli-installed-version-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should take the installed manifest’s version, as a preview packed after its build carries', async () => {
    const entry = await installedPackage(JSON.stringify({ name: '@taucad/cli', version: '0.0.0-preview-test' }));

    expect(installedVersion(entry, bundled)).toBe('0.0.0-preview-test');
  });

  it('should keep the bundled version when no manifest sits two folders above the entry, as for src/bin.ts', () => {
    const entry = pathToFileURL(join(directory, 'cli', 'src', 'bin.ts')).href;

    expect(installedVersion(entry, bundled)).toBe('0.1.0-beta.6');
  });

  it.each([
    ['names another package', JSON.stringify({ name: 'tau', version: '1.0.0' })],
    ['names no version', JSON.stringify({ name: '@taucad/cli' })],
    ['does not parse', '{ "name": "@taucad/cli",'],
  ])('should keep the bundled version when the manifest there %s', async (_case, manifest) => {
    const entry = await installedPackage(manifest);

    expect(installedVersion(entry, bundled)).toBe('0.1.0-beta.6');
  });
});
