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

const defaultMainFile = 'main.ts';

/**
 * Loads a single example fixture from the filesystem.
 * Reads every file in `<kernel>/<name>/` and returns them as a filename → content map.
 *
 * @param kernel - Kernel directory name (e.g. `'replicad'`, `'jscad'`).
 * @param name   - Example subdirectory name (e.g. `'tray'`, `'bottle'`).
 * @returns A {@link Fixture} with all files and the entry-point filename.
 */
export function loadFixture<K extends KernelName>(kernel: K, name: ExampleName<K>): Fixture {
  const fixtureUrl = new URL(`${kernel}/${name}/`, baseUrl);
  const files: Record<string, string> = {};

  for (const entry of readdirSync(fixtureUrl, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const fileUrl = new URL(entry.name, fixtureUrl);
    files[entry.name] = readFileSync(fileUrl, 'utf8');
  }

  return { files, mainFile: defaultMainFile };
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

    for (const exampleEntry of readdirSync(kernelUrl, { withFileTypes: true })) {
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
