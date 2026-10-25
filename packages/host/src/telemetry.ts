/**
 * Runtime telemetry for the Node hosts this package's consumers run: `tau export`, `tau mcp` and the cloud host
 * container (`tau serve` as a cloud agent host). The composition itself lives in the private `@taucad/telemetry`
 * library, which this public package bundles; the CLI imports it from here.
 *
 * The CLI and daemon builds carry no build signal (AR-W11-01): `cloudBuild` is a literal `false` in
 * {@link composeNodeHostTelemetry}. A process qualifies as a Tau Cloud host only by being signed in, by
 * `tau telemetry on`, or, for the cloud host container, by the provisioner's runtime marker `TAU_CLOUD_HOST=1`.
 *
 * @module
 * @public
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { machineEntry } from '@taucad/telemetry/client';
import { createNodeHostTelemetry, createTauIdentityReader } from '@taucad/telemetry/node-host';
import type { NodeHostRoute, NodeHostTelemetry, TauTokenRead } from '@taucad/telemetry/node-host';
import type { MachineOperationTelemetry } from '@taucad/runtime/host/node';

/* oxlint-disable no-barrel-files/no-barrel-files -- this module is the `./telemetry` package entry */
export { createNodeHostTelemetry, createTauIdentityReader, nodeShutdownWait } from '@taucad/telemetry/node-host';
export type {
  NodeHostRoute,
  NodeHostTelemetry,
  NodeHostTelemetryInput,
  NodeObservedClient,
  NodeTelemetryStatus,
  TauTokenRead,
} from '@taucad/telemetry/node-host';
export { nodeTelemetryPreference, telemetryConfigFileName } from '@taucad/telemetry/node';
export type { TelemetryPreference, TelemetryPreferenceSource } from '@taucad/telemetry/node';
/* oxlint-enable no-barrel-files/no-barrel-files -- end of the re-exports */

/** The marker file whose presence means the first-run notice has been shown on this installation. @public */
export const telemetryNoticeFileName = 'telemetry-notice';

/** What the first-run notice says (AR-W4-18). @public */
export const telemetryNoticeText =
  'Tau sends usage and diagnostics counts (no prompts, code, parameter values, file names or geometry) to the Tau API ' +
  'it is signed in to. Run `tau telemetry off` to stop, or set TAU_TELEMETRY=off or DO_NOT_TRACK=1.\n';

/**
 * The first-run notice: written once per installation, before the first batch, naming `tau telemetry off`. A marker
 * that cannot be written still shows the notice once in this process.
 *
 * @param input - The config directory and where the notice is written (stderr).
 * @returns The notice.
 * @public
 */
export const createFirstRunNotice = (
  input: Readonly<{ configDir: string; write: (text: string) => void }>,
): (() => void) => {
  let shown = false;
  return () => {
    if (shown) {
      return;
    }
    shown = true;
    const marker = join(input.configDir, telemetryNoticeFileName);
    try {
      mkdirSync(input.configDir, { recursive: true });
      /* `wx`: an existing marker means an earlier process already showed it. */
      writeFileSync(marker, `${new Date().toISOString()}\n`, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as { readonly code?: unknown }).code === 'EEXIST') {
        return;
      }
    }
    input.write(telemetryNoticeText);
  };
};

/** Inputs of {@link composeNodeHostTelemetry}. @public */
export type ComposeNodeHostTelemetryInput = Readonly<{
  route: Exclude<NodeHostRoute, 'desktop'>;
  release: string;
  apiOrigin: string;
  configDir: string;
  env: Readonly<Record<string, string | undefined>>;
  /** `TAU_AUTH_TOKEN`, then the OS keyring; never rejects. */
  readToken: TauTokenRead;
  /** Where the first-run notice goes. */
  writeNotice: (text: string) => void;
  platform?: string;
  fetch?: typeof globalThis.fetch;
}>;

/**
 * The CLI, MCP and daemon composition: a literal `false` build signal, identity through `get-session` once per token,
 * the first-run notice on stderr.
 *
 * @param input - The process inputs.
 * @returns The composition; nothing is sent until the host qualifies and consent allows it.
 * @public
 */
export const composeNodeHostTelemetry = (input: ComposeNodeHostTelemetryInput): NodeHostTelemetry =>
  createNodeHostTelemetry({
    route: input.route,
    release: input.release,
    apiOrigin: input.apiOrigin,
    configDir: input.configDir,
    env: input.env,
    cloudBuild: false,
    readIdentity: createTauIdentityReader({
      apiOrigin: input.apiOrigin,
      readToken: input.readToken,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    }),
    firstRunNotice: createFirstRunNotice({ configDir: input.configDir, write: input.writeNotice }),
    platform: input.platform ?? process.platform,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });

/**
 * The machine host's `onOperation`: one `machine` entry per new operation, the caller `agent` for an agent's request
 * and `editor` otherwise. The machine's id, name, address, parameters and job file never leave.
 *
 * @param telemetry - The host's composition.
 * @returns The callback for `createNodeMachineHost({ onOperation })`.
 * @public
 */
export const machineOperationReporter =
  (telemetry: Pick<NodeHostTelemetry, 'context' | 'record'>): ((operation: MachineOperationTelemetry) => void) =>
  (operation) => {
    const { caller: _caller, ...context } = telemetry.context(operation.requester === 'agent' ? 'agent' : 'editor');
    const { duration, ...ran } = operation;
    telemetry.record(machineEntry(ran, duration, context));
  };
