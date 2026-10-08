/**
 * The Node platform binding for the `geospec` CLI.
 *
 * Split from the bin so it can be tested: `main.ts` is two lines of process
 * wiring, and everything that makes a decision — which runner, which
 * filesystem, how a path becomes a `kind` — lives here.
 *
 * @module
 */

import { readdir, stat } from 'node:fs/promises';
import type { GeoSpecCliHost } from '#cli/cli.js';
import { availableParallelism } from 'node:os';
import { createGeoSpecNativeNodePoolRunner } from '#runner/node/native-pool-runner.js';

/**
 * Build the Node CLI host.
 *
 * @param options - Optional report sink used by embedding hosts and tests.
 * @returns The host the CLI runs against.
 * @public
 */
export const createNodeGeoSpecCliHost = (options?: { reportStream?: (text: string) => void }): GeoSpecCliHost => {
  const reportStream =
    options?.reportStream ??
    ((text: string): void => {
      process.stdout.write(text);
    });
  return {
    cwd: () => process.cwd(),
    write: (line) => {
      reportStream(`${line}\n`);
    },
    discoveryFileSystem: () => ({
      readdir: async (path: string) => readdir(path),
      stat: async (path: string) => {
        const entry = await stat(path);
        return { kind: entry.isDirectory() ? 'directory' : 'file' };
      },
    }),
    createRunner: ({ projectPath, workers, shardTimeout }) =>
      createGeoSpecNativeNodePoolRunner({
        projectPath,
        // `--workers` with no count auto-sizes, which the pool models as an
        // absent `workers`.
        workers: workers === 0 ? availableParallelism() : (workers ?? 1),
        ...(shardTimeout === undefined ? {} : { shardTimeout }),
      }),
  };
};
