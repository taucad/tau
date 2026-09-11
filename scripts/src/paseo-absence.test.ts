import { globSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');

/**
 * The bespoke Paseo integration was deleted as one set (N34): connector API,
 * UI path, settings entry, e2e fixtures, wire vocabulary, catalogue pins and
 * pnpm patches. Applied migrations are history and keep the name they were
 * written with; nothing else may.
 */
const paseo = /paseo/iu;

describe('paseo deletion', () => {
  it('leaves no source, manifest or patch naming Paseo', () => {
    // `globSync` also yields directories whose name matches the pattern.
    const paths = globSync(
      [
        'apps/**/*.{ts,tsx,mts,mjs,js,json,yaml,md}',
        'libs/**/*.{ts,tsx,mts,mjs,js,json,yaml,md}',
        'packages/**/*.{ts,tsx,mts,mjs,js,json,yaml,md}',
        'patches/*',
        'package.json',
        'pnpm-workspace.yaml',
        'pnpm-lock.yaml',
      ],
      {
        cwd: repositoryRoot,
        exclude: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/out-tsc/**',
          '**/package-out/**',
          'apps/api/app/database/migrations/**',
        ],
      },
    ).filter((path) => statSync(join(repositoryRoot, path)).isFile());

    const survivors = paths.filter(
      (path) => paseo.test(path) || paseo.test(readFileSync(join(repositoryRoot, path), 'utf8')),
    );

    expect(paths.length).toBeGreaterThan(0);
    expect(survivors).toEqual([]);
    // `exclude` filters results rather than pruning the walk, so the scan still
    // crosses every `node_modules` and takes a second or two under a loaded run.
  }, 30_000);
});
