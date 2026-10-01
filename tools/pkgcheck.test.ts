// oxlint-disable no-restricted-imports, import/extensions -- Standalone tool test exercises the CLI's published-package staging.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '..');

describe('pkgcheck', () => {
  it('should stage declared JSON assets and reject a missing schema export', () => {
    const cache = join(workspaceRoot, 'node_modules/.cache/tau-pkgcheck');
    mkdirSync(cache, { recursive: true });
    const fixture = mkdtempSync(join(cache, 'agent-fixture-'));

    try {
      mkdirSync(join(fixture, 'dist'));
      mkdirSync(join(fixture, 'agent'));
      mkdirSync(join(fixture, 'schema'));
      writeFileSync(join(fixture, 'dist/index.mjs'), 'export const answer = 42;\n');
      writeFileSync(join(fixture, 'dist/index.d.mts'), 'export declare const answer: number;\n');
      writeFileSync(join(fixture, 'agent/skills.json'), '{"bundles":[]}\n');
      writeFileSync(join(fixture, 'schema/topology.schema.json'), '{"type":"object"}\n');
      writeFileSync(
        join(fixture, 'package.json'),
        JSON.stringify({
          name: '@taucad/pkgcheck-agent-fixture',
          version: '0.0.0',
          type: 'module',
          main: './dist/index.mjs',
          types: './dist/index.d.mts',
          files: ['dist', 'agent', 'schema'],
          exports: {
            '.': { types: './dist/index.d.mts', import: './dist/index.mjs' },
            './agent': './agent/skills.json',
            './schema/topology': './schema/topology.schema.json',
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

      rmSync(join(fixture, 'schema/topology.schema.json'));
      const missing = spawnSync(join(workspaceRoot, 'node_modules/.bin/tsx'), ['tools/pkgcheck.ts', fixture], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        timeout: 45_000,
      });
      const missingOutput = `${missing.stdout}${missing.stderr}`;
      expect(missing.status).not.toBe(0);
      expect(missingOutput).toContain('[FAIL] ✗ tau-strict-consumer-types');
      expect(missingOutput).toContain('[FAIL] ✗ attw');
      expect(missingOutput).toContain('Resolution failed');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 50_000);
});
