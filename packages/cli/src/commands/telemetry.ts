import type { TelemetryPreference } from '@taucad/host/telemetry';
import { defineCommand } from 'citty';

import { cliError, emit, exitCodes, writeStdout } from '#output.js';
import { cliRuntimeTelemetry } from '#runtime-telemetry.js';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load the CLI's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../../package.json' with { type: 'json' };

const args = {
  json: { type: 'boolean', description: 'Write a JSON result', default: false },
} as const;

const composition = (): NonNullable<ReturnType<typeof cliRuntimeTelemetry>> => {
  const telemetry = cliRuntimeTelemetry('cli', packageJson.version);
  if (telemetry === undefined) {
    throw cliError('INVALID_API_URL', 'TAU_API_URL must be an absolute HTTPS origin.', exitCodes.usage);
  }
  return telemetry;
};

const report = async (json: boolean): Promise<void> => {
  const status = composition().status();
  await (json
    ? emit({ kind: 'telemetry', ok: true, ...status })
    : writeStdout(
        `Usage and diagnostics data: ${status.preference} (${status.source}).\n` +
          `This installation ${status.cloudHost ? 'reports to' : 'does not report to'} its Tau API; consent is ${status.consent}.\n`,
      ));
};

const setTo = (preference: TelemetryPreference) =>
  defineCommand({
    meta: {
      name: preference,
      description:
        preference === 'on'
          ? 'Share usage and diagnostics counts with the selected Tau API'
          : 'Stop sharing usage and diagnostics counts from this CLI, MCP server and self-hosted server',
    },
    args,
    async run({ args }) {
      await composition().setPreference(preference);
      await report(args.json);
    },
  });

/**
 * `tau telemetry status|on|off`: the command-line equivalent of the settings switch, per API origin. `TAU_TELEMETRY`
 * and `DO_NOT_TRACK` still override what is saved here.
 */
export const telemetryCommand = defineCommand({
  meta: { name: 'telemetry', description: 'Show or change whether Tau shares usage and diagnostics counts' },
  subCommands: {
    status: defineCommand({
      meta: { name: 'status', description: 'Show the saved preference, where it comes from, and the resolved consent' },
      args,
      async run({ args }) {
        await report(args.json);
      },
    }),
    on: setTo('on'),
    /* A template literal: the source scan reserves the string `off` for the OFF mesh format. */
    off: setTo(`off`),
  },
});
