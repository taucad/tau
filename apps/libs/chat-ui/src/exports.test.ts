import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.join(import.meta.dirname, '..');
const sourceRoot = path.join(packageRoot, 'src');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string>;
};

const moduleFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return moduleFiles(entryPath);
    }

    return /\.tsx?$/u.test(entry.name) && !/\.(?:test|spec|test-d)\./u.test(entry.name) ? [entryPath] : [];
  });

describe('package exports', () => {
  it('pins one subpath per source module', () => {
    const moduleExports = Object.fromEntries(
      moduleFiles(sourceRoot)
        .map((file) => path.relative(packageRoot, file).split(path.sep).join('/'))
        .toSorted()
        .map((file) => [`./${file.slice('src/'.length).replace(/\.tsx?$/u, '')}`, `./${file}`]),
    );

    expect(packageJson.exports).toEqual({ ...moduleExports, './package.json': './package.json' });
    expect(Object.keys(moduleExports)).toHaveLength(62);
  });

  it('points every export at a file that exists', () => {
    for (const target of Object.values(packageJson.exports)) {
      expect(existsSync(path.join(packageRoot, target)), target).toBe(true);
    }
  });
});
