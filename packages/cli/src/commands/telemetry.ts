import { defineCommand } from 'citty';

import { cliError, emit, exitCodes, writeStdout } from '#output.js';
import { cliRuntimeTelemetry } from '#runtime-telemetry.js';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load the CLI's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../../package.json' with { type: 'json' };

/** `tau telemetry [status|on|off]`, per API origin; `TAU_TELEMETRY` and `DO_NOT_TRACK` override it. */
export const telemetryCommand = defineCommand({
  meta: { name: 'telemetry', description: 'Show or change whether Tau shares usage and diagnostics counts' },
  args: {
    action: { type: 'positional', description: 'status, on or off', default: 'status', required: false },
    json: { type: 'boolean', description: 'Write a JSON result', default: false },
  },
  async run({ args }) {
    const telemetry = cliRuntimeTelemetry('cli', packageJson.version);
    if (telemetry === undefined) {
      throw cliError('INVALID_API_URL', 'TAU_API_URL must be an absolute HTTPS origin.', exitCodes.usage);
    }
    const { action } = args;
    // Template literal: the extension scan reserves the string `off` (OFF meshes).
    if (action === 'on' || action === `off`) {
      await telemetry.setPreference(action);
    } else if (action !== 'status') {
      throw cliError('ARG_INVALID', 'Use tau telemetry status, on or off.', exitCodes.usage);
    }
    const status = telemetry.status();
    await (args.json
      ? emit({ kind: 'telemetry', ok: true, ...status })
      : writeStdout(
          `Usage and diagnostics data: ${status.preference} (${status.source}); consent ${status.consent}; ` +
            `${status.cloudHost ? 'reports' : 'does not report'} to its Tau API.\n`,
        ));
  },
});
