import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.join(import.meta.dirname, '..');
const packageJsonText = readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonText) as {
  exports: Record<string, string>;
};

const moduleNames = (directory: string): string[] =>
  readdirSync(path.join(packageRoot, 'src', directory))
    .filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))
    .map((file) => file.slice(0, -'.tsx'.length))
    .toSorted();

describe('package exports', () => {
  it('pins one subpath per module and the generated icon assets', () => {
    const moduleExports = Object.fromEntries(
      ['components', 'icons', 'utils'].flatMap((directory) =>
        moduleNames(directory).map((name) => [`./${directory}/${name}`, `./src/${directory}/${name}.tsx`]),
      ),
    );

    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      ...moduleExports,
      './icons/generated/svg-icons': './src/icons/generated/svg-icons.d.ts',
      './icons/generated/sprite.svg': './src/icons/generated/sprite.svg',
      './icons/generated/payment-sprite.svg': './src/icons/generated/payment-sprite.svg',
      './package.json': './package.json',
    });
    expect(Object.keys(moduleExports)).toHaveLength(31);
  });

  it('points every export at a file that exists', () => {
    for (const target of Object.values(packageJson.exports)) {
      expect(existsSync(path.join(packageRoot, target)), target).toBe(true);
    }
  });

  it('declares each subpath once and maps no two subpaths to one file', () => {
    // `JSON.parse` keeps only the last of two equal keys, so read the declared subpaths from the text.
    const exportsBlock = /^ {2}"exports": \{$([\s\S]*?)^ {2}\}/mu.exec(packageJsonText)?.[1] ?? '';
    const subpaths = [...exportsBlock.matchAll(/^ {4}"([^"]+)":/gmu)].map((match) => match[1]);
    expect(subpaths.filter((subpath, index) => subpaths.indexOf(subpath) !== index)).toEqual([]);
    expect(new Set(subpaths)).toEqual(new Set(Object.keys(packageJson.exports)));

    const targets = Object.values(packageJson.exports).map((target) => path.posix.normalize(target));
    expect(targets.filter((target, index) => targets.indexOf(target) !== index)).toEqual([]);
  });
});
