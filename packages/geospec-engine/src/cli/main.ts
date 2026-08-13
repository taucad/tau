#!/usr/bin/env node
/**
 * The `geospec` bin (D-S4).
 *
 * Three lines of process wiring: register the engine, run the CLI against the
 * Node host, set the exit code. Every decision lives in `#cli/cli.js` and
 * `#cli/node-host.js`, which are covered; this file is a shim by design and is
 * excluded from coverage for exactly that reason.
 *
 * @module
 */

// oxlint-disable-next-line import/no-unassigned-import -- The registration IS the import: the bin exists to install the engine before the CLI runs.
import '#register-node.js';
import { runGeoSpecCli } from '#cli/cli.js';
import { createNodeGeoSpecCliHost } from '#cli/node-host.js';

process.exitCode = await runGeoSpecCli(process.argv.slice(2), createNodeGeoSpecCliHost());
