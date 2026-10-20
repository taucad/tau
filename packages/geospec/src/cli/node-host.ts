/**
 * The Node platform binding for the `geospec` CLI.
 *
 * Split from the bin so it can be tested: `main.ts` is two lines of process
 * wiring, and everything that makes a decision — which runner, which
 * filesystem, which config — lives here.
 *
 * @module
 */

import { readdir, stat } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import type { GeoSpecCliHost } from '#cli/cli.js';
import { loadGeoSpecConfig } from '#config/node/load.js';
import { createGeoSpecNodePoolRunner } from '#runner/node/pool-runner.js';

/**
 * Options for {@link createNodeGeoSpecCliHost}.
 *
 * @public
 */
export type NodeGeoSpecCliHostOptions = {
  /** Report sink used by embedding hosts and tests; defaults to stdout. */
  readonly reportStream?: (text: string) => void;
  /**
   * URLs of modules each pool worker imports for exporters that precede the config's, so a host such as `tau test`
   * can run a project with no `geospec.config.*` (see `GeoSpecExporterModule` in `geospec/runner/node`).
   */
  readonly exporterModules?: readonly string[];
};

/**
 * Build the Node CLI host.
 *
 * @param options - Report sink and host-supplied exporter modules.
 * @returns The host the CLI runs against.
 * @public
 */
export const createNodeGeoSpecCliHost = (options: NodeGeoSpecCliHostOptions = {}): GeoSpecCliHost => {
  const reportStream =
    options.reportStream ??
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
    loadConfig: async ({ projectPath, configPath }) =>
      loadGeoSpecConfig({ projectPath, ...(configPath === undefined ? {} : { configPath }) }),
    createRunner: ({ projectPath, configPath, workers, shardTimeout }) =>
      createGeoSpecNodePoolRunner({
        projectPath,
        ...(configPath === undefined ? {} : { configPath }),
        ...(options.exporterModules === undefined ? {} : { exporterModules: options.exporterModules }),
        // `--workers` with no count parses as 0 and auto-sizes to the host's
        // parallelism; an absent `workers` runs one worker.
        workers: workers === 0 ? availableParallelism() : (workers ?? 1),
        ...(shardTimeout === undefined ? {} : { shardTimeout }),
      }),
  };
};
