#!/usr/bin/env node
/**
 * The `geospec` bin (D-S4).
 *
 * Two lines of process wiring: run the CLI against the Node host and set the
 * exit code. Every decision lives in `#cli/cli.js` and
 * `#cli/node-host.js`, which are covered; this file is a shim by design and is
 * excluded from coverage for exactly that reason.
 *
 * @module
 */

import { runGeoSpecCli } from '#cli/cli.js';
import { createNodeGeoSpecCliHost } from '#cli/node-host.js';

process.exitCode = await runGeoSpecCli(process.argv.slice(2), createNodeGeoSpecCliHost());
