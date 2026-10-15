/**
 * Run Build123d's Python tests and strict coverage gate with the interpreter of the sealed closure
 * `tau prepare build123d` installs, prepared offline from the payload seed (`pnpm nx run build123d:seed`).
 *
 * This is the executable Wave 1/2 coverage gate from
 * docs/research/native-language-kernel-process-blueprint.md.
 *
 * Required environment variables: none.
 * Optional environment variables: none.
 *
 * Usage:
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/test-python.mts
 *
 * Exit codes:
 *   0  Tests pass with 100% line and branch coverage.
 *   1  Resource validation, tests, or coverage fail.
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { prepareFromSeed } from '#build123d-closure.fixture.js';
import { build123dOptionsFromClosure } from '#build123d-closure.js';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const pythonRoot = resolve(repoRoot, 'packages/plugins/build123d/python');
const reportRoot = resolve(repoRoot, 'out/reports/coverage/packages/plugins/build123d-python');
const measuredFiles = ['analyzer.py', 'glb.py', 'worker.py'].map((name) => resolve(pythonRoot, name));

const run = (pythonExecutable: string, arguments_: readonly string[]): void => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['COVERAGE_FILE'] = resolve(reportRoot, '.coverage');
  // The sealed closure is verified file by file; nothing may write bytecode into it.
  environment['PYTHONDONTWRITEBYTECODE'] = '1';
  const result = spawnSync(pythonExecutable, ['-I', '-m', 'coverage', ...arguments_], {
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
  const { pythonExecutable } = build123dOptionsFromClosure(await prepareFromSeed());
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
