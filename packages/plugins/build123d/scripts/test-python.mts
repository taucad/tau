/**
 * Run Build123d's Python tests and strict coverage gate with the interpreter of the sealed closure
 * `tau prepare build123d` installs, prepared offline from the payload seed (`pnpm nx run build123d:seed`).
 * `--desktop` instead validates and uses the prepared desktop interpreter, including Windows where
 * the registry closure is not yet declared. Both paths run the identical tests and coverage gate.
 *
 * This is the executable Wave 1/2 coverage gate from
 * docs/research/native-language-kernel-process-blueprint.md.
 *
 * Required environment variables: none.
 * Optional environment variables: TAU_BUILD123D_TEST_STORE selects an isolated native test store.
 *
 * Usage:
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/test-python.mts
 *   pnpm nx run build123d:test-python-desktop
 *
 * Exit codes:
 *   0  Tests pass with 100% line and branch coverage.
 *   1  Resource validation, tests, or coverage fail.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { z } from 'zod';

import { build123dOptionsFromClosure } from '#build123d-closure.js';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const pythonRoot = resolve(repoRoot, 'packages/plugins/build123d/python');
const reportRoot = resolve(repoRoot, 'out/reports/coverage/packages/plugins/build123d-python');
const measuredFiles = ['analyzer.py', 'glb.py', 'worker.py', 'native_materials.py', 'mechanisms.py'].map((name) =>
  resolve(pythonRoot, name),
);

const run = (pythonExecutable: string, arguments_: readonly string[]): void => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['COVERAGE_FILE'] = resolve(reportRoot, '.coverage');
  // The sealed closure is verified file by file; nothing may write bytecode into it.
  const result = spawnSync(pythonExecutable, ['-I', '-B', '-m', 'coverage', ...arguments_], {
    cwd: repoRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Python coverage command failed with exit code ${String(result.status)}.`);
  }
};

const main = async (): Promise<void> => {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length > 1 || (arguments_.length === 1 && arguments_[0] !== '--desktop')) {
    throw new Error('Usage: test-python.mts [--desktop]');
  }
  let pythonExecutable: string;
  if (arguments_[0] === '--desktop') {
    const target = `${process.platform}-${process.arch}`;
    const targetRoot = resolve(repoRoot, 'apps/desktop/resources/python', target);
    const manifest = z
      .object({
        target: z.literal(target),
        build123dVersion: z.literal('0.13.0'),
        pythonSha256: z.string().regex(/^[\da-f]{64}$/u),
      })
      .parse(JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')));
    pythonExecutable = resolve(targetRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
    const digest = createHash('sha256').update(readFileSync(pythonExecutable)).digest('hex');
    if (digest !== manifest.pythonSha256) {
      throw new Error('Prepared desktop interpreter digest mismatch; run desktop:prepare-build123d-python.');
    }
  } else {
    const { prepareFromSeed } = await import('#build123d-closure.fixture.js');
    ({ pythonExecutable } = build123dOptionsFromClosure(await prepareFromSeed()));
  }
  mkdirSync(reportRoot, { recursive: true });
  run(pythonExecutable, ['erase']);
  run(pythonExecutable, [
    'run',
    '--branch',
    `--source=${pythonRoot}`,
    `--omit=${resolve(pythonRoot, 'tests')}/*`,
    '-m',
    'unittest',
    'discover',
    '-s',
    resolve(pythonRoot, 'tests'),
    '-p',
    'test_*.py',
  ]);
  run(pythonExecutable, ['json', '-o', resolve(reportRoot, 'coverage.json'), ...measuredFiles]);
  run(pythonExecutable, ['report', '--show-missing', '--fail-under=100', ...measuredFiles]);
};

await main().catch((error: unknown) => {
  console.error('Build123d Python tests failed:', error);
  process.exitCode = 1;
});
