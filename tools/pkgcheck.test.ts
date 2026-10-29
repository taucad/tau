// oxlint-disable no-restricted-imports, import/extensions -- Standalone tool test exercises the CLI's published-package staging.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

      const timingDirectory = join(fixture, 'timings');
      const instrumented = spawnSync(join(workspaceRoot, 'node_modules/.bin/tsx'), ['tools/pkgcheck.ts', fixture], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        timeout: 45_000,
        env: { ...process.env, TAU_CI_TIMING_DIRECTORY: timingDirectory },
      });
      expect(instrumented.status).toBe(result.status);
      const checks = (text: string) => text.split('\n').filter((line) => /^\[(?:PASS|FAIL|SKIP)\]/u.test(line));
      expect(checks(`${instrumented.stdout}${instrumented.stderr}`)).toEqual(checks(output));

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
      const timedMissing = spawnSync(join(workspaceRoot, 'node_modules/.bin/tsx'), ['tools/pkgcheck.ts', fixture], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        timeout: 45_000,
        env: { ...process.env, TAU_CI_TIMING_DIRECTORY: timingDirectory },
      });
      expect(timedMissing.status).toBe(missing.status);
      expect(checks(`${timedMissing.stdout}${timedMissing.stderr}`)).toEqual(checks(missingOutput));
      const reports = readdirSync(timingDirectory).map(
        (file) =>
          JSON.parse(readFileSync(join(timingDirectory, file), 'utf8')) as {
            exitCode: number;
            spans: { phase: string; outcome: string }[];
          },
      );
      expect(reports).toHaveLength(2);
      expect(reports.every((report) => report.exitCode === 1)).toBe(true); // Fixture metadata intentionally fails other validators.
      expect(reports.every((report) => report.spans.some((span) => span.phase === 'consumer-cleanup'))).toBe(true);
      const passing = reports.find((report) =>
        report.spans.some((span) => span.phase === 'validateStrictConsumerTypes' && span.outcome === 'success'),
      )!;
      expect(passing.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ phase: 'tsc-bundler', outcome: 'success' }),
          expect.objectContaining({ phase: 'tsc-nodenext', outcome: 'success' }),
        ]),
      );
      expect(
        reports.some((report) =>
          report.spans.some((span) => span.phase === 'validateStrictConsumerTypes' && span.outcome === 'failure'),
        ),
      ).toBe(true);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 100_000);
});
