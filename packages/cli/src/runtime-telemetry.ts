/**
 * The CLI's runtime telemetry (runtime observability PR-3, `host-node.ts`): one composition per process, for
 * `tau export` (route `cli`), `tau mcp` (route `mcp`) and the cloud host container's `tau serve` (route `cloud`).
 *
 * Nothing composes for any other `tau serve`, which marks itself and its runtime children with `TAU_SERVE_ROLE`, or in
 * CI. A signed-out CLI reports only after `tau telemetry on`. The reporter sends only to this process's own
 * `TAU_API_URL`, and nothing here throws into a command or keeps the process alive.
 *
 * @module
 */

import { defaultConfigDirectory } from '@taucad/host';
import { composeNodeHostTelemetry } from '@taucad/host/telemetry';
import type { NodeHostTelemetry } from '@taucad/host/telemetry';

import { authApiOrigin, authTokenReader } from '#auth.js';

/** The CLI's routes. */
export type CliTelemetryRoute = 'cli' | 'mcp' | 'cloud';

let composed: NodeHostTelemetry | undefined;

/**
 * This process's composition, created on first use with the route of the command that asked first. Its identity
 * bootstrap starts at once, so every entry before the first resolved read is held rather than mistagged.
 *
 * @param route - The command's route.
 * @param release - The CLI's version.
 * @returns The composition, or `undefined` when `TAU_API_URL` is not a valid origin.
 */
export const cliRuntimeTelemetry = (route: CliTelemetryRoute, release: string): NodeHostTelemetry | undefined => {
  if (composed !== undefined) {
    return composed;
  }
  let apiOrigin: string;
  try {
    apiOrigin = authApiOrigin();
  } catch {
    return undefined;
  }
  composed = composeNodeHostTelemetry({
    route,
    release,
    apiOrigin,
    configDir: defaultConfigDirectory(),
    env: process.env,
    readToken: authTokenReader(apiOrigin),
    writeNotice: (text) => {
      process.stderr.write(text);
    },
  });
  composed.startIdentityBootstrap();
  return composed;
};
