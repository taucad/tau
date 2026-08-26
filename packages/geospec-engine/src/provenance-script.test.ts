import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pins the DL4 release-provenance generator (`scripts/generate-provenance.mjs`)
 * against the constraints of `provenance.schema.json`: required fields, const
 * values, date arithmetic (+2 years to the Apache-2.0 conversion), and a
 * SHA-256 digest per shipped artifact.
 */

const scriptPath = join(import.meta.dirname, '../scripts/generate-provenance.mjs');
const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../provenance.schema.json'), 'utf8')) as {
  required: string[];
  properties: { version: { pattern: string }; artifacts: { items: { properties: { sha256: { pattern: string } } } } };
};

const withFixture = <Result>(run: (root: string) => Result): Result => {
  const root = mkdtempSync(join(tmpdir(), 'geospec-provenance-'));
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: '@taucad/geospec-engine',
        version: '1.2.3',
        license: 'FSL-1.1-Apache-2.0',
        files: ['dist', 'LICENSE', 'provenance.json', 'missing-entry'],
      }),
    );
    mkdirSync(join(root, 'dist/nested'), { recursive: true });
    writeFileSync(join(root, 'dist/index.mjs'), 'export {};\n');
    writeFileSync(join(root, 'dist/nested/deep.mjs'), '// deep\n');
    writeFileSync(join(root, 'LICENSE'), 'FSL-1.1-Apache-2.0\n');
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const runGenerator = (root: string, releaseDate: string): Uint8Array<ArrayBuffer> => {
  execFileSync(process.execPath, [scriptPath, root, '--release-date', releaseDate]);
  return Uint8Array.from(readFileSync(join(root, 'provenance.json')));
};

const generate = (releaseDate: string): Record<string, unknown> =>
  withFixture(
    (root) => JSON.parse(new TextDecoder().decode(runGenerator(root, releaseDate))) as Record<string, unknown>,
  );

describe('generate-provenance.mjs', () => {
  it('emits a record satisfying every schema constraint', () => {
    const record = generate('2026-08-10');
    for (const field of schema.required) {
      expect(record).toHaveProperty(field);
    }
    expect(record['package']).toBe('@taucad/geospec-engine');
    expect(record['license']).toBe('FSL-1.1-Apache-2.0');
    expect(record['futureLicense']).toBe('Apache-2.0');
    expect(record['version']).toMatch(new RegExp(schema.properties.version.pattern));
    expect(record['releaseDate']).toBe('2026-08-10');
    expect(record['apacheConversionDate']).toBe('2028-08-10');
  });

  it('digests every existing files-array artifact recursively plus package.json, sorted, skipping missing entries', () => {
    const record = generate('2026-08-10');
    const artifacts = record['artifacts'] as Array<{ path: string; sha256: string; bytes: number }>;
    expect(artifacts.map((a) => a.path)).toEqual(['LICENSE', 'dist/index.mjs', 'dist/nested/deep.mjs', 'package.json']);
    const shaPattern = new RegExp(schema.properties.artifacts.items.properties.sha256.pattern);
    for (const artifact of artifacts) {
      expect(artifact.sha256).toMatch(shaPattern);
      expect(artifact.bytes).toBeGreaterThan(0);
    }
  });

  it('lands the conversion date on a real day across a leap boundary', () => {
    const record = generate('2027-02-28');
    expect(record['apacheConversionDate']).toBe('2029-02-28');
  });

  it('is byte-identical across consecutive generations at a fixed date', () => {
    withFixture((root) => {
      const first = runGenerator(root, '2026-08-10');
      const second = runGenerator(root, '2026-08-10');
      expect(second).toStrictEqual(first);
    });
  });

  it('matches the actual pack inventory except for its documented self-manifest exclusion', () => {
    withFixture((root) => {
      runGenerator(root, '2026-08-10');
      const [packed] = JSON.parse(
        execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
          cwd: root,
          encoding: 'utf8',
        }),
      ) as Array<{ files: Array<{ path: string }> }>;
      const record = JSON.parse(readFileSync(join(root, 'provenance.json'), 'utf8')) as {
        version: string;
        artifacts: Array<{ path: string }>;
      };
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
      const packPaths = packed!.files
        .map(({ path }) => path)
        .filter((path) => path !== 'provenance.json')
        .sort();

      expect(record.artifacts.map(({ path }) => path)).toStrictEqual(packPaths);
      expect(record.version).toBe(manifest.version);
    });
  });

  it('rejects missing, malformed and impossible release dates', () => {
    withFixture((root) => {
      for (const arguments_ of [
        [scriptPath, root, '--release-date'],
        [scriptPath, root, '--release-date', 'August-10'],
        [scriptPath, root, '--release-date', '2027-02-29'],
      ]) {
        expect(() => execFileSync(process.execPath, arguments_, { stdio: 'pipe' })).toThrow();
      }
    });
  });
});
