/**
 * True cold-path regression for GeoSpec's runtime-backed STEP lifecycle.
 *
 * A persisted export used to hide failures in source evaluation and placed
 * prototype preparation. This fixture starts in a new project with no `.tau`
 * directory, resolves a named face from live Replicad shapes, writes AP242,
 * and requires GeoSpec's native XDE reader to materialize that evidence.
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
  import { face } from '@taucad/runtime/kernels/replicad/annotations';

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
  import { describe, it } from 'geospec';
  import { loadModel } from 'geospec/model';

  describe('clean STEP lifecycle', () => {
    it('preserves named occurrences and faces', async () => {
      const subject = await loadModel({ file: 'main.ts', format: 'step', mesh: false });
      const occurrences = subject.step?.xde?.occurrences.map((entry) => entry.instanceName);
      const names = subject.step?.xde?.subshapeNames.map((entry) => entry.occurrencePath + '.' + entry.name);
      if (JSON.stringify(occurrences) !== JSON.stringify(['bracketA', 'bracketB'])) {
        throw new Error('Unexpected occurrences: ' + JSON.stringify(occurrences));
      }
      if (JSON.stringify(names) !== JSON.stringify(['bracketA.mount', 'bracketB.mount'])) {
        throw new Error('Unexpected subshape names: ' + JSON.stringify(names));
      }
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

    const { stdout } = await execFileAsync(
      process.execPath,
      ['--import', 'tsx', geospecCli, 'run', projectPath, '--test-timeout', '120000', '--workers', '1', '--json'],
      { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    const report = JSON.parse(stdout) as { success: boolean; passed: number; failed: number };

    expect(existsSync(join(projectPath, '.tau'))).toBe(true);
    expect(report).toMatchObject({ success: true, passed: 1, failed: 0 });
  });
});
