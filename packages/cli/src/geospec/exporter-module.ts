/**
 * The exporter module `tau test` hands the GeoSpec pool: each worker imports it by URL and gets one
 * {@link tauExporter} composed from the options in the URL's query (`pluginRoot`, repeated `plugin`, `config`),
 * because a worker receives strings only.
 *
 * @module
 */

import type { GeoSpecExporterModule } from 'geospec/runner/node';

import { tauExporter } from '#geospec/tau-exporter.js';

/**
 * Create a worker's exporters from a module URL's query.
 *
 * @internal
 * @param url - The URL the worker imported this module by.
 * @param context - The worker's project.
 * @returns The one Tau exporter.
 */
export const exportersFor = async (
  url: string,
  { projectPath }: Parameters<GeoSpecExporterModule['default']>[0],
): ReturnType<GeoSpecExporterModule['default']> => {
  const query = new URL(url).searchParams;
  const config = query.get('config');
  return [
    await tauExporter({
      projectPath,
      pluginRoot: query.get('pluginRoot') ?? process.cwd(),
      plugins: query.getAll('plugin'),
      ...(config === null ? {} : { config }),
    }),
  ];
};

const createTauExporters: GeoSpecExporterModule['default'] = async (context) => exportersFor(import.meta.url, context);

export default createTauExporters;
