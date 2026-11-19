import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.join(import.meta.dirname, '..');
const sourceRoot = path.join(packageRoot, 'src');
const packageJsonText = readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonText) as {
  exports: Record<string, string>;
};

// A `*.worker.ts` entry is started by URL from its sibling module, never imported, so it has no subpath.
const moduleFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return moduleFiles(entryPath);
    }

    return /\.tsx?$/u.test(entry.name) && !/\.(?:test|spec|test-d|worker)\./u.test(entry.name) ? [entryPath] : [];
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
    expect(Object.keys(moduleExports)).toHaveLength(24);
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
