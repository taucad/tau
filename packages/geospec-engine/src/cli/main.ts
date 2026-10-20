#!/usr/bin/env node
/**
 * The `tau-geospec` bin of this compatibility package: the `geospec` CLI with Tau's default exporter in every worker,
 * so a Tau project runs with no `geospec.config.*`. It is named apart from `geospec`'s own bin because npm
 * links a hoisted dependency's bin over a direct one of the same name. It is removed with this package.
 *
 * @module
 */

import { createNodeGeoSpecCliHost, runGeoSpecCli } from 'geospec/cli';
import { defaultExporterModule } from '#model/default-exporter.js';

process.exitCode = await runGeoSpecCli(
  process.argv.slice(2),
  createNodeGeoSpecCliHost({ exporterModules: [defaultExporterModule] }),
);
