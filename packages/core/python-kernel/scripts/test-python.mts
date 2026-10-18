/**
 * Purpose: Run Python unit tests under a strict 100% line and branch coverage gate: the core's own `tau_kernel` tests,
 * or a Python kernel's worker tests with the interpreter of the sealed closure `tau prepare <kernel>` installs,
 * prepared offline from the payload seed (`pnpm nx run <project>:seed`).
 * Why: The worker modules run inside the closure's exact interpreter and wheels, so their tests do too; `tau_kernel`
 * needs only CPython 3.13, numpy and coverage, which uv provides at the closure's versions.
 * Environment: Node 24+. Core mode: uv on PATH with access to pypi.org, unless `--python` names an interpreter that has
 * numpy and coverage. Kernel mode: the seed filled by the kernel's `seed` target; TAU_<KERNEL>_TEST_STORE optionally
 * selects an isolated native test store (default out/cache/<kernel id>-store under the working directory).
 * Usage (through `tau-python-kernel`, see tau-python-kernel.mts):
 *   tau-python-kernel test [--python <exe>]
 *   tau-python-kernel test --package <dir> [--python <exe>]
 * Exit codes: 0 when the tests pass with 100% line and branch coverage; 1 when preparation, tests or coverage fail.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

import { createPreparationHost, parsePluginDeployment } from '@taucad/runtime/preparation/node';

// oxlint-disable-next-line no-restricted-imports -- The scripts' shared package reader; scripts have no `#` alias.
import { coreRoot, readPythonKernelPackage, takePackageArgument } from './python-kernel-package.mjs';
// oxlint-disable-next-line no-restricted-imports -- The scripts' shared package reader; scripts have no `#` alias.
import type { PythonKernelPackage } from './python-kernel-package.mjs';

/** The closure's versions of what `tau_kernel` and the coverage gate import (build123d's `requirements.lock`). */
const coreRequirements = ['coverage==7.10.7', 'numpy==2.5.2'] as const;

/** A command prefix that runs the interpreter: `[executable, ...arguments]`. */
type Interpreter = readonly [string, ...string[]];

const runCoverage = (interpreter: Interpreter, reportRoot: string, arguments_: readonly string[]): void => {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  environment['COVERAGE_FILE'] = resolve(reportRoot, '.coverage');
  const [executable, ...prefix] = interpreter;
  // A sealed closure is verified file by file; nothing may write bytecode into it.
  const result = spawnSync(executable, [...prefix, '-I', '-B', '-m', 'coverage', ...arguments_], {
    cwd: process.cwd(),
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

/** Prepare (or reuse) this host's sealed closure from the seed, offline, and return its interpreter. */
const closureInterpreter = async (kernel: PythonKernelPackage): Promise<string> => {
  const { kernelId } = kernel.adopter.worker;
  const deployment = parsePluginDeployment(
    JSON.parse(readFileSync(resolve(kernel.root, 'tau-plugin.json'), 'utf8')) as unknown,
    `${kernel.packageName} tau-plugin.json`,
  );
  const storeVariable = `TAU_${kernelId.toUpperCase().replaceAll(/\W/gu, '_')}_TEST_STORE`;
  const host = createPreparationHost({
    plugins: [
      {
        package: kernel.packageName,
        deployment,
        directory: kernel.root,
        seal: kernel.adopter.seal,
        launchSet: kernel.adopter.launchSet,
      },
    ],
    store: resolve(process.env[storeVariable] ?? `out/cache/${kernelId}-store`),
    seed: resolve(`out/cache/${kernelId}-seed`),
  });
  try {
    const outcome = await host.prepare({
      package: kernel.packageName,
      offline: true,
      signal: AbortSignal.timeout(20 * 60 * 1000),
    });
    if (outcome.status !== 'ready') {
      throw new Error(
        `Preparing ${kernel.packageName} from the seed ended ${outcome.status}: ${JSON.stringify(outcome)}`,
      );
    }
    return kernel.adopter.optionsFromClosure(outcome.receipts['engine']!).pythonExecutable;
  } finally {
    host.dispose();
  }
};

/**
 * Run a Python kernel package's worker tests, or without `--package` the core's `tau_kernel` tests, under the
 * coverage gate.
 * @param args - The arguments after the command name.
 */
export const runTestPython = async (args: readonly string[]): Promise<void> => {
  const { packageDirectory, rest } = takePackageArgument(args);
  const pythonFlag = rest.indexOf('--python');
  const python = pythonFlag === -1 ? undefined : rest[pythonFlag + 1];
  if (rest.length !== (pythonFlag === -1 ? 0 : 2) || (pythonFlag !== -1 && python === undefined)) {
    throw new TypeError('Usage: tau-python-kernel test [--package <dir>] [--python <exe>]');
  }

  let pythonRoot: string;
  let measured: string[];
  let interpreter: Interpreter;
  if (packageDirectory === undefined) {
    pythonRoot = resolve(coreRoot, 'python');
    measured = readdirSync(resolve(pythonRoot, 'tau_kernel'))
      .filter((name) => name.endsWith('.py'))
      .map((name) => resolve(pythonRoot, 'tau_kernel', name));
    interpreter =
      python === undefined
        ? [
            'uv',
            'run',
            '--no-project',
            '--python',
            '3.13',
            ...coreRequirements.flatMap((pin) => ['--with', pin]),
            'python',
          ]
        : [resolve(python)];
  } else {
    const kernel = await readPythonKernelPackage(packageDirectory);
    pythonRoot = resolve(kernel.root, 'python');
    // `tau_kernel` is the core's, measured by the core's own run.
    measured = kernel.adopter.worker.workerModules.map((module) => resolve(pythonRoot, ...module.split('/')));
    interpreter = [python === undefined ? await closureInterpreter(kernel) : resolve(python)];
  }

  const reportRoot = resolve('out/reports/coverage', `${relative(process.cwd(), resolve(pythonRoot, '..'))}-python`);
  mkdirSync(reportRoot, { recursive: true });
  runCoverage(interpreter, reportRoot, ['erase']);
  runCoverage(interpreter, reportRoot, [
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
  runCoverage(interpreter, reportRoot, ['json', '-o', resolve(reportRoot, 'coverage.json'), ...measured]);
  runCoverage(interpreter, reportRoot, ['report', '--show-missing', '--fail-under=100', ...measured]);
};
