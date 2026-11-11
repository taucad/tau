import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.join(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
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
    expect(Object.keys(moduleExports)).toHaveLength(30);
  });

  it('points every export at a file that exists', () => {
    for (const target of Object.values(packageJson.exports)) {
      expect(existsSync(path.join(packageRoot, target)), target).toBe(true);
    }
  });
});
