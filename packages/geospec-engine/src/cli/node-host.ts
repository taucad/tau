/**
 * The Node platform binding for the `geospec` CLI.
 *
 * Split from the bin so it can be tested: `main.ts` is three lines of process
 * wiring, and everything that makes a decision — which runner, which
 * filesystem, how a path becomes a `kind` — lives here.
 *
 * @module
 */

import { readdir, stat } from 'node:fs/promises';
import { flushEvidenceStore } from '#cache/evidence-cache.js';
import { installNodeEvidenceStore } from '#cache/node-evidence-store.js';
import { createModelLoader } from '#model/load-model.js';
import type { GeoSpecCliHost } from '#cli/cli.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { createGeoSpecNodePoolRunner } from '#runner/node/node-runner.js';
import { createSerialGeoSpecRunner } from '#runner/serial.js';

/**
 * Build the Node CLI host.
 *
 * @param options - Optional report sink used by embedding hosts and tests.
 * @returns The host the CLI runs against.
 * @public
 */
export const createNodeGeoSpecCliHost = (options?: { reportStream?: (text: string) => void }): GeoSpecCliHost => {
  const reportStream = options?.reportStream ?? ((text: string): void => void process.stdout.write(text));
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
    createRunner: ({ projectPath, workers, shardTimeout, cache, cacheDirectory }) => {
      if (workers === undefined) {
        installNodeEvidenceStore({
          projectPath,
          ...(cache === undefined ? {} : { cache }),
          ...(cacheDirectory === undefined ? {} : { cacheDirectory }),
        });
        return createSerialGeoSpecRunner({
          filesystem: createNodeVmFileSystem(projectPath),
          // The model loader is NOT in the VM world: it drives the Tau runtime
          // against the real directory.
          modelLoader: createModelLoader({ projectPath }),
        });
      }
      return createGeoSpecNodePoolRunner({
        projectPath,
        // `--workers` with no count auto-sizes, which the pool models as an
        // absent `workers`.
        ...(workers > 0 ? { workers } : {}),
        ...(shardTimeout === undefined ? {} : { shardTimeout }),
        ...(cache === undefined ? {} : { cache }),
        ...(cacheDirectory === undefined ? {} : { cacheDirectory }),
      });
    },
    flush: flushEvidenceStore,
  };
};
