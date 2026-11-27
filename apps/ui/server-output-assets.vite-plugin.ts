import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** What happened to one asset the server build emitted. */
export type ServerAssetOutcome = 'removed' | 'kept';

/**
 * Remove one server-build asset when the client output holds the same file byte for byte, as React Router does for a
 * server build that does not emit assets. Any other asset is kept: one only the server emitted stays where the server
 * build put it, so the client output does not change, and a same-named file with other bytes stays so
 * `check-server-output` reports it.
 *
 * @param input - The asset's path relative to both build directories, and the two directories.
 * @returns What was done.
 */
export const removeServerAssetCopy = (input: {
  fileName: string;
  serverDirectory: string;
  clientDirectory: string;
}): ServerAssetOutcome => {
  const source = path.join(input.serverDirectory, input.fileName);
  const target = path.join(input.clientDirectory, input.fileName);
  if (!existsSync(source) || !existsSync(target) || !readFileSync(source).equals(readFileSync(target))) {
    return 'kept';
  }
  rmSync(source);
  return 'removed';
};

/**
 * Keep browser assets out of the server output (React Router 8 migration RR0, ruling RD8).
 *
 * `tauRuntime()` turns on `build.ssrEmitAssets`, so the server build writes every asset its graph imports (skill and
 * API documents, example thumbnails, printer models, fonts, editor WASM) and React Router, seeing that option,
 * copies them to the client output instead of moving them. The browser fetches each from the client output; the
 * server only names its URL. After React Router's own pass this plugin removes the server's copy of each emitted
 * asset the client output also holds. Chunks, source maps, the server's `.vite/manifest.json` and assets only the
 * server emitted stay.
 *
 * @param options - The client build directory the server build's assets belong to.
 * @returns A plugin that acts on the server build only.
 */
export const createServerOutputAssets = (options: { clientDirectory: string }): Plugin => ({
  name: 'tau:server-output-assets',
  apply: 'build',
  /*
   * The server environment, by its consumer: React Router 8's Environment API build builds client and server from
   * one shared config, so the config-level `isSsrBuild` is false for both.
   */
  applyToEnvironment: (environment) => environment.config.consumer === 'server',
  writeBundle: {
    order: 'post',
    handler(outputOptions, bundle) {
      const serverDirectory = outputOptions.dir;
      if (serverDirectory === undefined) {
        throw new Error('tau:server-output-assets: the server build directory is unknown');
      }
      const counts: Record<ServerAssetOutcome, number> = { removed: 0, kept: 0 };
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || output.fileName.endsWith('.map') || output.fileName.startsWith('.vite/')) {
          continue;
        }
        const outcome = removeServerAssetCopy({
          fileName: output.fileName,
          serverDirectory,
          clientDirectory: options.clientDirectory,
        });
        counts[outcome] += 1;
      }
      this.environment.logger.info(
        `server output assets: ${counts.removed} removed (also in the client output), ${counts.kept} kept`,
      );
    },
  },
});
