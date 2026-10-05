/**
 * True cold-path regression for GeoSpec's runtime-backed STEP lifecycle.
 *
 * A persisted export used to hide failures in source evaluation and placed
 * prototype preparation. This fixture starts in a new project with no `.tau`
 * directory, resolves a named face from live Replicad shapes, writes AP242,
 * and requires GeoSpec's native XDE reader to materialize that evidence,
 * checked through public matchers because the native subject is opaque.
 */
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const geospecCli = resolve(repoRoot, 'packages/geospec-engine/src/cli/main.ts');

const source = `
  import { drawRoundedRectangle } from 'replicad';
  import { face } from '@taucad/replicad/annotations';

  export default function main() {
    const prototype = drawRoundedRectangle(20, 10).sketchOnPlane().extrude(8);
    return [
      {
        shape: prototype.clone(),
        name: 'bracketA',
        interfaces: { mount: face((f) => f.inPlane('XY', 8)) },
      },
      {
        shape: prototype.clone().translate([30, 0, 0]),
        name: 'bracketB',
        interfaces: { mount: face((f) => f.inPlane('XY', 8)) },
      },
    ];
  }
`;

const specification = `
  import { describe, expectGeo, it } from 'geospec';
  import { loadModel } from 'geospec/model';

  describe('clean STEP lifecycle', () => {
    it('preserves named occurrences and faces', async () => {
      const subject = await loadModel({ file: 'main.ts', format: 'step', mesh: false });
      await expectGeo(subject).toHaveAssemblyOccurrences({
        uniqueNames: true,
        occurrences: [
          { name: 'bracketA', count: 1 },
          { name: 'bracketB', count: 1 },
        ],
      });
      await expectGeo(subject).toHaveSpatialRelationships({
        relationships: [
          {
            id: 'mounts',
            kind: 'coplanar',
            subject: { kind: 'interface', name: 'bracketA.mount' },
            target: { kind: 'interface', name: 'bracketB.mount' },
          },
        ],
      });
    });
  });
`;

let projectPath: string | undefined;

afterEach(async () => {
  if (projectPath !== undefined) {
    await rm(projectPath, { recursive: true, force: true });
    projectPath = undefined;
  }
});

describe('GeoSpec clean STEP lifecycle', () => {
  it('constructs, resolves, exports, and XDE-loads without a warm .tau cache', { timeout: 120_000 }, async () => {
    projectPath = await mkdtemp(join(tmpdir(), 'tau-geospec-step-'));
    await writeFile(join(projectPath, 'main.ts'), source);
    await writeFile(join(projectPath, 'main.geospec.ts'), specification);
    expect(existsSync(join(projectPath, '.tau'))).toBe(false);

    // The CLI exits non-zero when the spec fails; its JSON report is still on
    // stdout, so parse it to surface the diagnostics in the assertion.
    const stdout = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', geospecCli, 'run', projectPath, '--test-timeout', '120000', '--workers', '1', '--json'],
      { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
    ).then(
      (result) => result.stdout,
      (error: unknown) => {
        const { stdout: failedStdout } = error as { stdout?: string };
        if (failedStdout) {
          return failedStdout;
        }
        throw error;
      },
    );
    const report = JSON.parse(stdout) as { success: boolean; passed: number; failed: number; files?: unknown };

    // Persistent evidence belongs outside the project under test.
    expect(existsSync(join(projectPath, '.tau'))).toBe(false);
    expect(report, JSON.stringify(report.files)).toMatchObject({ success: true, passed: 1, failed: 0 });
  });
});
