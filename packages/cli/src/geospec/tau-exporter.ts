/**
 * `tauExporter`: Tau's runtime as a GeoSpec model exporter, composed the way `tau export` composes it (the built-in
 * kernels, then `--plugin` and `--config`), so `geospec run` and `tau test` export a Tau project with no live host.
 *
 * @module
 */

import { createHostGeoSpecExporter } from '@taucad/host/agent-tools';
import { createNodeClient } from '@taucad/runtime/node';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import type { GeoSpecModelExporter } from 'geospec/model';

import { loadCliRuntime } from '#runtime-options.js';
import { authorizeCliZooProxy, cliZooProxyUrl } from '#zoo-proxy.js';

/**
 * Options for {@link tauExporter}.
 *
 * @public
 */
export type TauExporterOptions = {
  /** Absolute project root the exporter's runtime client is rooted at; defaults to the current directory. */
  readonly projectPath?: string;
  /** Directory the plugins load from, as the CLI loads them from the invoking project; defaults to the current directory. */
  readonly pluginRoot?: string;
  /** Plugin packages or paths installed in `pluginRoot`, as `--plugin` names them. */
  readonly plugins?: readonly string[];
  /** Configuration module exporting an invoked `plugins` array, as `--config` names it. */
  readonly config?: string;
};

/**
 * Create Tau's exporter. Its extensions are those the composed runtime's kernels declare; its runtime client is
 * created on the first export and shut down when the exporter closes.
 *
 * @example <caption>A `geospec.config.ts` that runs a Tau project under `geospec run`</caption>
 * ```typescript
 * import { defineConfig } from 'geospec/config';
 * import { tauExporter } from '@taucad/cli/geospec';
 *
 * export default defineConfig({ exporters: [await tauExporter()] });
 * ```
 *
 * @param options - The project, and the plugins to compose.
 * @returns The exporter.
 * @public
 */
export const tauExporter = async (options: TauExporterOptions = {}): Promise<GeoSpecModelExporter> => {
  const projectPath = options.projectPath ?? process.cwd();
  // The runtime runs in this thread, so its Zoo proxy upgrades carry this process's Tau credentials, as `tau export`'s do.
  await authorizeCliZooProxy(process.env);
  const runtime = await loadCliRuntime({
    projectRoot: options.pluginRoot ?? process.cwd(),
    plugin: [...(options.plugins ?? [])],
    ...(options.config === undefined ? {} : { config: options.config }),
    zooProxyUrl: cliZooProxyUrl(process.env),
  });
  const { kernels } = await resolveRuntimeDefinition(runtime, undefined);
  return createHostGeoSpecExporter({
    client: async () => createNodeClient({ runtime, projectPath }),
    extensions: [
      ...new Set(kernels.flatMap(({ extensions = [] }) => extensions).filter((extension) => extension !== '*')),
    ],
  });
};
