// oxlint-disable no-restricted-imports, import/extensions -- Standalone tool test exercises the CLI's published-package staging.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '..');

describe('pkgcheck', () => {
  it('stages a published JSON agent export for both TypeScript and attw', () => {
    const cache = join(workspaceRoot, 'node_modules/.cache/tau-pkgcheck');
    mkdirSync(cache, { recursive: true });
    const fixture = mkdtempSync(join(cache, 'agent-fixture-'));

    try {
      mkdirSync(join(fixture, 'dist'));
      mkdirSync(join(fixture, 'agent'));
      writeFileSync(join(fixture, 'dist/index.mjs'), 'export const answer = 42;\n');
      writeFileSync(join(fixture, 'dist/index.d.mts'), 'export declare const answer: number;\n');
      writeFileSync(join(fixture, 'agent/skills.json'), '{"bundles":[]}\n');
      writeFileSync(
        join(fixture, 'package.json'),
        JSON.stringify({
          name: '@taucad/pkgcheck-agent-fixture',
          version: '0.0.0',
          type: 'module',
          main: './dist/index.mjs',
          types: './dist/index.d.mts',
          files: ['dist', 'agent'],
          exports: {
            '.': { types: './dist/index.d.mts', import: './dist/index.mjs' },
            './agent': './agent/skills.json',
          },
        }),
      );

      const result = spawnSync(join(workspaceRoot, 'node_modules/.bin/tsx'), ['tools/pkgcheck.ts', fixture], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        timeout: 45_000,
      });
      const output = `${result.stdout}${result.stderr}`;
      expect(output).toContain('[PASS] ✓ tau-strict-consumer-types');
      expect(output).toContain('[PASS] ✓ attw');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 50_000);
});
