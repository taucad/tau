/**
 * Run Build123d's Python tests and strict coverage gate with the bundled interpreter.
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

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const pythonRoot = resolve(repoRoot, 'packages/plugins/build123d/python');
const targetRoot = resolve(repoRoot, `apps/desktop/resources/python/${process.platform}-${process.arch}`);
const pythonExecutable = resolve(targetRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const reportRoot = resolve(repoRoot, 'out/reports/coverage/packages/plugins/build123d-python');
const measuredFiles = ['analyzer.py', 'glb.py', 'worker.py'].map((name) => resolve(pythonRoot, name));

const run = (arguments_: readonly string[]): void => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['COVERAGE_FILE'] = resolve(reportRoot, '.coverage');
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

const main = (): void => {
  if (!existsSync(pythonExecutable)) {
    throw new Error(
      `Bundled Python is missing for ${process.platform}-${process.arch}. Run the desktop preparation target.`,
    );
  }
  mkdirSync(reportRoot, { recursive: true });
  run(['erase']);
  run([
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
  run(['json', '-o', resolve(reportRoot, 'coverage.json'), ...measuredFiles]);
  run(['report', '--show-missing', '--fail-under=100', ...measuredFiles]);
};

try {
  main();
} catch (error) {
  console.error('Build123d Python tests failed:', error);
  process.exit(1);
}
