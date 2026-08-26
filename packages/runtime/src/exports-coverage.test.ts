/**
 * Regression test for the runtime's bundling contract:
 *
 * Every `package.json#publishConfig.exports.<subpath>.default` chunk
 * (e.g. `./dist/middleware/parameter-cache.middleware.mjs`) must have a
 * matching `tsdown.config.ts` entry (e.g. `src/middleware/parameter-cache.middleware.ts`)
 * so the build emits a real file at that path.
 *
 * If they fall out of sync, downstream consumers see "module not found"
 * errors at runtime when the worker dynamically imports a plugin chunk.
 *
 * @see docs/research/runtime-zero-config-bundling.md (R3, Finding 2)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type ExportConditions = {
  readonly types?: string;
  readonly import?: string;
  readonly default?: string;
  readonly require?: unknown;
};

type PublishExports = Readonly<Record<string, ExportConditions | string>>;

type RuntimePackage = {
  readonly main?: string;
  readonly module?: string;
  readonly types?: string;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly publishConfig?: { readonly exports?: PublishExports };
};

const distributionPathToSourceEntry = (distributionPath: string): string => {
  const withoutPrefix = distributionPath.replace(/^\.\/dist\//, '');
  const tsRelative = withoutPrefix.replace(/\.mjs$/, '.ts');
  return `src/${tsRelative}`;
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const readTsdownEntries = (configPath: string): readonly string[] => {
  const source = readFileSync(configPath, 'utf8');
  const entryArrayMatch = /entry:\s*\[([^\]]*?)]/s.exec(source);
  if (!entryArrayMatch?.[1]) {
    throw new Error(`Could not find entry array in ${configPath}`);
  }
  const entries: string[] = [];
  for (const match of entryArrayMatch[1].matchAll(/["']([^"']+)["']/g)) {
    if (match[1] !== undefined) {
      entries.push(match[1]);
    }
  }
  return entries;
};

describe('runtime publishConfig.exports → tsdown entries', () => {
  const packageJson = readJson<RuntimePackage>(resolve(packageRoot, 'package.json'));
  const tsdownEntries = readTsdownEntries(resolve(packageRoot, 'tsdown.config.ts'));

  it('should declare publishConfig.exports', () => {
    expect(packageJson.publishConfig?.exports).toBeDefined();
  });

  it('should advertise an ESM-only package entry point', () => {
    expect(packageJson.main).toBe('./dist/index.mjs');
    expect(packageJson.types).toBe('./dist/index.d.mts');
    expect(packageJson.module).toBeUndefined();
  });

  const exportsMap = packageJson.publishConfig?.exports ?? {};
  // `./package.json` is a self-referential asset export, not a built chunk.
  const subpaths = Object.keys(exportsMap).filter((subpath) => subpath !== './package.json');

  it('should have a non-empty exports map', () => {
    expect(subpaths.length).toBeGreaterThan(0);
  });

  it('should export its own package.json in both maps', () => {
    expect(packageJson.exports?.['./package.json']).toBe('./package.json');
    expect(exportsMap['./package.json']).toBe('./package.json');
  });

  it('keeps development and published export keys identical', () => {
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual(Object.keys(exportsMap).sort());
  });

  it.each(subpaths)('subpath "%s" should map to a tsdown entry', (subpath) => {
    const conditions = exportsMap[subpath];
    if (!conditions || typeof conditions === 'string') {
      throw new Error(`Missing export conditions for ${subpath}`);
    }
    expect(conditions.require, `${subpath} must not declare a CommonJS "require" branch`).toBeUndefined();
    expect(conditions.types, `${subpath} must declare an ESM declaration target`).toMatch(/^\.\/dist\/.+\.d\.mts$/);
    expect(conditions.import, `${subpath} must declare an ESM "import" target`).toMatch(/^\.\/dist\/.+\.mjs$/);
    expect(conditions.default, `${subpath} must declare an ESM "default" target`).toMatch(/^\.\/dist\/.+\.mjs$/);
    expect(conditions.import, `${subpath} import/default targets should stay aligned`).toBe(conditions.default);
    if (!conditions.default) {
      return;
    }

    const expectedEntry = distributionPathToSourceEntry(conditions.default);
    expect(tsdownEntries, `${subpath} → ${conditions.default} requires tsdown entry "${expectedEntry}"`).toContain(
      expectedEntry,
    );
  });
});

describe('runtime production dependency classification', () => {
  const packageJson = readJson<RuntimePackage>(resolve(packageRoot, 'package.json'));

  it('does not publish test-runner peers or mock dependencies', () => {
    expect(packageJson.exports?.['./testing']).toBeUndefined();
    expect(packageJson.publishConfig?.exports?.['./testing']).toBeUndefined();
    expect(packageJson.peerDependencies?.['vitest']).toBeUndefined();
    expect(packageJson.dependencies?.['vitest-mock-extended']).toBeUndefined();
    expect(packageJson.peerDependencies?.['vitest-mock-extended']).toBeUndefined();
    expect(packageJson.devDependencies?.['vitest-mock-extended']).toBeUndefined();
    expect(packageJson.devDependencies?.['vitest']).toBeDefined();
  });

  it('does not retain the convenience Next.js barrel or an unused electron-vite contract', () => {
    expect(packageJson.exports?.['./nextjs']).toBeUndefined();
    expect(packageJson.publishConfig?.exports?.['./nextjs']).toBeUndefined();
    expect(packageJson.peerDependencies?.['electron-vite']).toBeUndefined();
    expect(packageJson.peerDependenciesMeta?.['electron-vite']).toBeUndefined();
    expect(packageJson.devDependencies?.['electron-vite']).toBeUndefined();
  });
});
