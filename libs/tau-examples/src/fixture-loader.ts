/**
 * Filesystem-based fixture loader for example code.
 * Uses `new URL()` resolution against `import.meta.url` so paths are
 * correct regardless of the caller's working directory.
 *
 * This module is intentionally separate from the main package exports
 * (which rely on Vite `?raw` imports) so it can be used in any Node.js
 * context — tsx scripts, Vitest, benchmarks, etc.
 */

import { readdirSync, readFileSync } from 'node:fs';
import type { ExampleName, KernelName } from '#manifest.js';

const baseUrl = new URL('kernels/', import.meta.url);

/** A loaded fixture with all source files and an identified entry point. */
export type Fixture = {
  /** Map of relative filenames to their source contents. */
  files: Record<string, string>;
  /** Entry-point filename within {@link files}. */
  mainFile: string;
};

const candidateMainFiles = ['main.ts', 'main.py', 'main.scad', 'main.cpp'] as const;
const excludedDirectories = new Set(['.tau', '__pycache__']);
const excludedFiles = new Set(['thumbnail.webp']);

function readFixtureFiles(directoryUrl: URL, prefix = ''): Record<string, string> {
  const files: Record<string, string> = {};

  for (const entry of readdirSync(directoryUrl, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excludedDirectories.has(entry.name)) {
      continue;
    }

    const relativePath = `${prefix}${entry.name}`;
    const entryUrl = new URL(entry.name, directoryUrl);

    if (entry.isDirectory()) {
      Object.assign(files, readFixtureFiles(new URL(`${entry.name}/`, directoryUrl), `${relativePath}/`));
      continue;
    }

    if (entry.isFile() && !excludedFiles.has(entry.name)) {
      files[relativePath] = readFileSync(entryUrl, 'utf8');
    }
  }

  return files;
}

/**
 * Loads a single example fixture from the filesystem.
 * Reads every file in `<kernel>/<name>/` recursively and returns them as a filename → content map.
 *
 * @param kernel - Kernel directory name (e.g. `'replicad'`, `'jscad'`).
 * @param name   - Example subdirectory name (e.g. `'tray'`, `'bottle'`).
 * @returns A {@link Fixture} with all files and the entry-point filename.
 */
export function loadFixture<K extends KernelName>(kernel: K, name: ExampleName<K>): Fixture {
  const fixtureUrl = new URL(`${kernel}/${name}/`, baseUrl);
  const files = readFixtureFiles(fixtureUrl);
  const mainFile = candidateMainFiles.find((candidate) => Object.hasOwn(files, candidate));
  if (!mainFile) {
    throw new Error(`Fixture ${kernel}/${name} has no supported main entrypoint`);
  }

  return { files, mainFile };
}

/**
 * Auto-discovers all example fixtures by scanning kernel subdirectories
 * for entries that contain source files.
 *
 * @returns Nested record keyed by `[kernel][exampleName]` → {@link Fixture}.
 */
export function loadAllFixtures(): Record<string, Record<string, Fixture>> {
  const result: Record<string, Record<string, Fixture>> = {};

  for (const kernelEntry of readdirSync(baseUrl, { withFileTypes: true })) {
    if (!kernelEntry.isDirectory()) {
      continue;
    }

    const kernelUrl = new URL(`${kernelEntry.name}/`, baseUrl);
    const examples: Record<string, Fixture> = {};

    for (const exampleEntry of readdirSync(kernelUrl, {
      withFileTypes: true,
    })) {
      if (!exampleEntry.isDirectory()) {
        continue;
      }

      try {
        examples[exampleEntry.name] = loadFixture(
          kernelEntry.name as KernelName,
          exampleEntry.name as ExampleName<KernelName>,
        );
      } catch {
        // Skip directories that can't be loaded
      }
    }

    if (Object.keys(examples).length > 0) {
      result[kernelEntry.name] = examples;
    }
  }

  return result;
}
