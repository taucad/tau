/**
 * Purpose: Read the Python kernel package a core script runs for (`--package <dir>`): its npm name, its Nx project and
 * the adopter its `/native` subpath exports, which names its worker, seal step, launch set and project libraries.
 * Why: The tau-plugin generator, the project template generator and the Python test runner are shared by every Python
 * kernel; each kernel supplies only what its adopter and its `python/` directory declare.
 * Environment: Node 24+; a kernel's TypeScript `/native` entry needs `@oxc-node/core/register`, a built one nothing.
 * Usage: imported by the sibling scripts, which `tau-python-kernel` runs; not run directly.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PythonKernelAdopter } from '#python-kernel-adopter.js';

/** The core package: its `python/tau_kernel` modules and its default `python/interpreter.json`, wherever it installed. */
export const coreRoot = dirname(createRequire(import.meta.url).resolve('@taucad/python-kernel-core/package.json'));

/** One Python kernel package, as the core scripts see it. */
export type PythonKernelPackage = {
  /** The package directory. */
  readonly root: string;
  /** The npm package name, such as `@taucad/build123d`. */
  readonly packageName: string;
  /**
   * The Nx project name, such as `build123d`, whose targets run the scripts; for a package outside an Nx workspace,
   * its unscoped npm name. Generated files name it.
   */
  readonly project: string;
  /** The adopter the package's `/native` subpath exports. */
  readonly adopter: PythonKernelAdopter;
};

const isPythonKernelAdopter = (value: unknown): value is PythonKernelAdopter =>
  typeof value === 'object' &&
  value !== null &&
  'worker' in value &&
  'seal' in value &&
  'launchSet' in value &&
  'projectLibraries' in value;

/**
 * The file a package's `./native` export names: a string target, or the `import` (else `default`) condition.
 * @param target - The export's target.
 * @returns The relative file, or `undefined`.
 */
const nativeTarget = (target: unknown): string | undefined => {
  if (typeof target === 'string' || typeof target !== 'object' || target === null) {
    return typeof target === 'string' ? target : undefined;
  }
  const conditions = target as Readonly<Record<string, unknown>>;
  return nativeTarget(conditions['import'] ?? conditions['default']);
};

/**
 * Read the kernel package at `directory`.
 * @param directory - The package directory, absolute or relative to the working directory.
 * @returns Its name, project and adopter.
 */
export const readPythonKernelPackage = async (directory: string): Promise<PythonKernelPackage> => {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly exports?: Readonly<Record<string, unknown>>;
  };
  const projectFile = resolve(root, 'project.json');
  const project = existsSync(projectFile)
    ? (JSON.parse(await readFile(projectFile, 'utf8')) as { readonly name: string }).name
    : manifest.name.replace(/^@[^/]+\//u, '');
  const native = nativeTarget(manifest.exports?.['./native']);
  if (native === undefined) {
    throw new TypeError(`${manifest.name} exports no ./native subpath, so it declares no Python kernel adopter.`);
  }
  const module = (await import(pathToFileURL(resolve(root, native)).href)) as Record<string, unknown>;
  const adopters = Object.values(module).filter((value) => isPythonKernelAdopter(value));
  const [adopter, ...others] = adopters;
  if (adopter === undefined || others.length > 0 || adopter.package !== manifest.name) {
    throw new TypeError(
      `${manifest.name}'s ./native subpath must export exactly one definePythonKernelAdopter result for ${manifest.name}.`,
    );
  }
  return { root, packageName: manifest.name, project, adopter };
};

/**
 * The value of `--package <dir>`, and the remaining arguments.
 * @param argv - The script's arguments.
 * @returns The package directory, when given, and the other arguments in order.
 */
export const takePackageArgument = (argv: readonly string[]): { packageDirectory?: string; rest: string[] } => {
  const rest = [...argv];
  const index = rest.indexOf('--package');
  if (index === -1) {
    return { rest };
  }
  const [, value] = rest.splice(index, 2);
  if (value === undefined) {
    throw new TypeError('--package needs a directory');
  }
  return { packageDirectory: value, rest };
};
