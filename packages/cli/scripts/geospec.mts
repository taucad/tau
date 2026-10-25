/**
 * Purpose: Run `geospec run` from workspace source with Tau's exporter in every pool worker.
 * Why: Workspace gates (runtime-e2e, warehouse, example packaging) need GeoSpec's own flags (`--test-timeout`,
 * `--workers`) and its `--json` report with diagnostic codes, over Tau projects that have no `geospec.config.*`.
 * The exporter module is the one `tau test` hands the pool (`src/geospec/exporter-module.ts`), so the runtime it
 * composes is `tau export`'s; only the report shape differs from `tau test`.
 * Environment: Node with the workspace install and the `tsx` loader, which the pool workers inherit.
 * Usage: node --import tsx packages/cli/scripts/geospec.mts run <projectPath> [geospec run options]
 * Exit codes: those of `geospec run`: 0 the run succeeded; 1 a test failed, a run-level issue, or an empty selection.
 */

import { createNodeGeoSpecCliHost, runGeoSpecCli } from 'geospec/cli';

const tauExporterModule = new URL('../src/geospec/exporter-module.ts', import.meta.url).href;

process.exitCode = await runGeoSpecCli(
  process.argv.slice(2),
  createNodeGeoSpecCliHost({ exporterModules: [tauExporterModule] }),
);
