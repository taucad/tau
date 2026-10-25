/** One runtime telemetry composition per CLI process (runtime observability PR-3); never throws into a command. */

import { defaultConfigDirectory } from '@taucad/host';
import { composeNodeHostTelemetry } from '@taucad/host/telemetry';
import type { NodeHostTelemetry, TauTokenRead } from '@taucad/host/telemetry';

import { authApiOrigin, credentialEntry } from '#auth.js';

/** The CLI's routes. */
export type CliTelemetryRoute = 'cli' | 'mcp' | 'cloud';

/**
 * `TAU_AUTH_TOKEN`, then the keyring; a store that cannot be read is `unavailable`, never a rejection.
 *
 * @param origin - Selected API origin.
 * @param environment - Process environment.
 * @returns The token source.
 */
export const authTokenReader =
  (origin: string, environment: Readonly<Record<string, string | undefined>> = process.env): TauTokenRead =>
  async () => {
    const variable = environment['TAU_AUTH_TOKEN'];
    if (variable) {
      return { kind: 'token', token: variable };
    }
    try {
      const entry = await credentialEntry(origin);
      const token = await entry.getPassword();
      return token ? { kind: 'token', token } : { kind: 'none' };
    } catch {
      return { kind: 'unavailable' };
    }
  };

let composed: NodeHostTelemetry | undefined;

/**
 * The process's composition, made on first use; its identity read starts at once.
 *
 * @param route - The first caller's route.
 * @param release - The CLI's version.
 * @returns The composition, or `undefined` for an invalid `TAU_API_URL`.
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
