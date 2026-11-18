import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.join(import.meta.dirname, '..');
const sourceRoot = path.join(packageRoot, 'src');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string | Record<string, string>>;
};

/**
 * `<name>.web.ts` and `<name>.desktop.ts` are one subpath resolved by the
 * `tau-desktop` package condition; `default` is the web variant.
 */
const buildTargetVariant = /\.(?:web|desktop)\.ts$/u;

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
        .map((file): [string, string | Record<string, string>] => {
          if (buildTargetVariant.test(file)) {
            const base = file.replace(buildTargetVariant, '');
            return [
              `./${base.slice('src/'.length)}`,
              { 'tau-desktop': `./${base}.desktop.ts`, default: `./${base}.web.ts` },
            ];
          }
          return [`./${file.slice('src/'.length).replace(/\.tsx?$/u, '')}`, `./${file}`];
        }),
    );

    expect(packageJson.exports).toEqual({ ...moduleExports, './package.json': './package.json' });
    expect(Object.keys(moduleExports)).toHaveLength(96);
  });

  it('points every export at a file that exists', () => {
    const targets = Object.values(packageJson.exports).flatMap((entry): string[] =>
      typeof entry === 'string' ? [entry] : Object.values(entry),
    );
    for (const target of targets) {
      expect(existsSync(path.join(packageRoot, target)), target).toBe(true);
    }
  });
});
