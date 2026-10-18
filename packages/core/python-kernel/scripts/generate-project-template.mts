/**
 * Purpose: Generate the files a new project of a Python kernel carries (charter D35, W9): `project/pyproject.toml`,
 * `project/pylock.toml` compacted from the per-target pylocks the tau-plugin generator wrote, and `project/uv.lock`.
 * Why: A project Tau creates runs outside Tau with the ecosystem's own tools (I14): `uv sync --locked` then
 * `uv run main.py`. Nothing is re-resolved: the pylock is the closure's own wheels, and uv locks under constraints
 * that equal the closure's versions, which `--check` verifies. The project's libraries are the adopter's
 * `projectLibraries`.
 * Environment: Node 24+ and uv on PATH with network access to pypi.org (generate and check).
 * Usage (through `tau-python-kernel`, see tau-python-kernel.mts):
 *   tau-python-kernel template --package <dir> [--check]
 * Exit codes: 0 on success or when `--check` finds the committed files current; 1 when `--check` finds a difference
 * or uv fails.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  parseTargetPylock,
  readUvLockVersions,
  renderProjectPylock,
  renderProjectPyproject,
  testOnlyDistributions,
} from '#template.js';

// oxlint-disable-next-line no-restricted-imports -- The scripts' shared package reader; scripts have no `#` alias.
import { coreRoot, readPythonKernelPackage, takePackageArgument } from './python-kernel-package.mjs';

const uv = (cwd: string, ...arguments_: string[]): void => {
  execFileSync('uv', arguments_, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
};

/**
 * Generate, or with `--check` verify, a Python kernel package's project template.
 * @param args - The arguments after the command name.
 */
export const runGenerateProjectTemplate = async (args: readonly string[]): Promise<void> => {
  const { packageDirectory, rest } = takePackageArgument(args);
  if (packageDirectory === undefined || rest.some((argument) => argument !== '--check')) {
    throw new TypeError('Usage: tau-python-kernel template --package <dir> [--check]');
  }
  const check = rest.includes('--check');
  const kernel = await readPythonKernelPackage(packageDirectory);
  const owner = { packageName: kernel.packageName, project: kernel.project, kernelId: kernel.adopter.worker.kernelId };
  const pythonRoot = resolve(kernel.root, 'python');
  const projectRoot = resolve(kernel.root, 'project');

  const ownInterpreter = resolve(pythonRoot, 'interpreter.json');
  const interpreter = JSON.parse(
    await readFile(
      existsSync(ownInterpreter) ? ownInterpreter : resolve(coreRoot, 'python', 'interpreter.json'),
      'utf8',
    ),
  ) as { readonly targets: ReadonlyArray<{ readonly key: string }> };
  const targets = await Promise.all(
    interpreter.targets.map(async ({ key }) =>
      parseTargetPylock(await readFile(resolve(pythonRoot, `pylock.${key}.toml`), 'utf8')),
    ),
  );
  const pylock = renderProjectPylock(targets, owner);
  const pyproject = renderProjectPyproject(kernel.adopter.projectLibraries, targets, owner);

  const workspace = await mkdtemp(join(tmpdir(), `tau-${owner.kernelId}-project-`));
  try {
    await writeFile(join(workspace, 'pyproject.toml'), pyproject);
    let lock: string;
    if (check) {
      const differences = [];
      for (const [name, expected] of [
        ['pylock.toml', pylock],
        ['pyproject.toml', pyproject],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- two files, compared in order.
        if ((await readFile(join(projectRoot, name), 'utf8')) !== expected) {
          differences.push(name);
        }
      }
      if (differences.length > 0) {
        throw new Error(
          `project/${differences.join(', project/')} differ; run ${kernel.project}:generate-project-template.`,
        );
      }
      lock = await readFile(join(projectRoot, 'uv.lock'), 'utf8');
      await writeFile(join(workspace, 'uv.lock'), lock);
      // Exits non-zero when uv.lock no longer satisfies pyproject.toml.
      uv(workspace, 'lock', '--check');
    } else {
      uv(workspace, 'lock');
      lock = await readFile(join(workspace, 'uv.lock'), 'utf8');
    }
    const locked = readUvLockVersions(lock);
    const closure = new Map(
      targets.flatMap(({ packages }) =>
        packages
          .filter(({ name }) => !testOnlyDistributions.has(name))
          .map(({ name, version }) => [name, version] as const),
      ),
    );
    const drift = [...new Set([...locked.keys(), ...closure.keys()])].filter(
      (name) => locked.get(name) !== closure.get(name),
    );
    if (drift.length > 0) {
      throw new Error(`uv.lock and the closure disagree on ${drift.join(', ')}.`);
    }
    if (!check) {
      await writeFile(join(projectRoot, 'pylock.toml'), pylock);
      await writeFile(join(projectRoot, 'pyproject.toml'), pyproject);
      await writeFile(join(projectRoot, 'uv.lock'), lock);
    }
    console.log(`${check ? 'Checked' : 'Wrote'} project/ for ${String(closure.size)} distributions.`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};
