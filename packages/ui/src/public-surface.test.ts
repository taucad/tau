// @vitest-environment node
// Reads the package manifest from disk; jsdom rewrites import.meta.url to a
// non-file scheme, which node:fs rejects.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type ConditionalExport = { types?: string; import?: string; default: string };
type ExportEntry = string | ConditionalExport;

type PackageJson = {
  exports: Record<string, ExportEntry>;
  publishConfig: { exports: Record<string, ExportEntry> };
};

const packageRoot = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as PackageJson;
const tsdownConfig = readFileSync(new URL('tsdown.config.ts', packageRoot), 'utf8');

const sourcePathOf = (entry: ExportEntry): string => (typeof entry === 'string' ? entry : entry.default);

/** `./src/components/button.tsx` → `components/button`, the stem shared by both maps. */
const sourceStem = (sourcePath: string): string => sourcePath.replace(/^\.\/src\//u, '').replace(/\.tsx?$/u, '');

const exportEntries = Object.entries(packageJson.exports);
const moduleEntries = exportEntries.filter(([, entry]) => /\.tsx?$/u.test(sourcePathOf(entry)));

describe('@taucad/ui public surface', () => {
  it('offers the same subpaths before and after publish', () => {
    expect(Object.keys(packageJson.publishConfig.exports).toSorted()).toEqual(
      Object.keys(packageJson.exports).toSorted(),
    );
  });

  it('covers every component, hook, and utility module in src', () => {
    expect(moduleEntries.length).toBeGreaterThan(0);
  });

  it.each(exportEntries)('resolves %s to a real source file', (subpath, entry) => {
    const sourcePath = sourcePathOf(entry);
    if (subpath === './package.json') {
      return;
    }

    expect(existsSync(new URL(sourcePath, packageRoot)), `${subpath} → ${sourcePath}`).toBe(true);
  });

  // A stem that disagrees between the two maps resolves in the workspace and
  // 404s only once the package is installed from the registry.
  it.each(moduleEntries)('publishes %s from the matching build output', (subpath, entry) => {
    const stem = sourceStem(sourcePathOf(entry));

    expect(packageJson.publishConfig.exports[subpath]).toEqual({
      types: `./dist/${stem}.d.mts`,
      import: `./dist/${stem}.mjs`,
      default: `./dist/${stem}.mjs`,
    });
  });

  it.each(moduleEntries)('builds an entry for %s', (_subpath, entry) => {
    expect(tsdownConfig).toContain(sourcePathOf(entry).replace(/^\.\//u, ''));
  });
});
