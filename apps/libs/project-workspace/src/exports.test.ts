import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.join(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string>;
};

const moduleExports = (directory: string, extension: '.ts' | '.tsx'): Array<[string, string]> =>
  readdirSync(path.join(packageRoot, 'src', directory))
    .filter((file) => file.endsWith(extension) && !file.includes('.test.'))
    .map((file) => file.slice(0, -extension.length))
    .toSorted()
    .map((name) => [`./${directory}/${name}`, `./src/${directory}/${name}${extension}`]);

describe('package exports', () => {
  it('pins one subpath per module', () => {
    const modules = Object.fromEntries([
      ...moduleExports('components', '.tsx'),
      ...moduleExports('hooks', '.ts'),
      ...moduleExports('utils', '.ts'),
    ]);

    expect(packageJson.exports).toEqual({
      '.': './src/index.ts',
      ...modules,
      './package.json': './package.json',
    });
    expect(Object.keys(modules)).toHaveLength(18);
  });

  it('points every export at a file that exists', () => {
    for (const target of Object.values(packageJson.exports)) {
      expect(existsSync(path.join(packageRoot, target)), target).toBe(true);
    }
  });
});
