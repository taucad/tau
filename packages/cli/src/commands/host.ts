import { defineCommand } from 'citty';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { oneLine, resolveHostToken, resolveHostUrl } from '#commands/agent/client.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a package dependency.
import { cliError, emit, exitCodes, writeStdout } from '#output.js';

/** The same-origin discovery document a Tau Host serves at `/.well-known/tau-host`. */
type HostDescriptor = {
  readonly v: number;
  readonly agent: boolean;
  readonly label?: string;
  readonly workspaceRoot?: string;
  readonly externalAgents?: ReadonlyArray<{
    readonly id: string;
    readonly displayName?: string;
    readonly refusal?: string;
  }>;
};

const isHostDescriptor = (body: unknown): body is HostDescriptor =>
  typeof body === 'object' && body !== null && 'v' in body && 'agent' in body;

const inspectCommand = defineCommand({
  meta: {
    name: 'inspect',
    description: 'Read a Tau Host discovery document and report what that host owns',
  },
  args: {
    host: {
      type: 'string',
      description: 'Tau Host origin, such as http://127.0.0.1:7777 (defaults to TAU_HOST_URL)',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Write one versioned JSON result record to stdout instead of plain lines',
      required: false,
    },
  },
  async run({ args }) {
    const url = resolveHostUrl(args.host);
    const descriptorUrl = new URL('/.well-known/tau-host', url);

    let response: Response;
    try {
      response = await fetch(descriptorUrl);
    } catch (error) {
      throw cliError(
        'HOST_UNREACHABLE',
        `No host answered at ${descriptorUrl.origin} (${oneLine(error instanceof Error ? error.message : String(error))}). Start one with \`tau serve --trust-projects\`.`,
        exitCodes.error,
      );
    }

    const body: unknown = response.ok ? await response.json().catch(() => undefined) : undefined;
    if (!isHostDescriptor(body)) {
      throw cliError(
        'HOST_NOT_DISCOVERABLE',
        `${descriptorUrl.origin} answered ${String(response.status)} without a Tau Host descriptor. That origin is serving something else.`,
        exitCodes.refused,
      );
    }

    const record = {
      kind: 'host',
      ok: true,
      url: url.origin,
      agent: body.agent,
      ...(body.label === undefined ? {} : { label: oneLine(body.label) }),
      ...(body.workspaceRoot === undefined ? {} : { workspaceRoot: oneLine(body.workspaceRoot) }),
      /* The id, and — for an agent this host knows about but cannot start —
       * why (VSC4), so the operator reads `codex:CLI_TOO_OLD` rather than a
       * row that silently went missing. */
      ...(body.externalAgents === undefined
        ? {}
        : {
            externalAgents: body.externalAgents.map((agent) =>
              oneLine(agent.refusal === undefined ? agent.id : `${agent.id}:${agent.refusal}`),
            ),
          }),
    };

    if (args.json) {
      await emit(record);
      return;
    }
    const lines = Object.entries(record)
      .filter(([key]) => key !== 'kind' && key !== 'ok')
      .map(([key, value]) => `${key}\t${Array.isArray(value) ? value.join(',') : String(value)}`);
    await writeStdout(`${lines.join('\n')}\n`);
  },
});

const computeCommand = (operation: 'inspect' | 'clear' | 'collect') =>
  defineCommand({
    meta: { name: operation, description: `${operation} the admitted host compute store` },
    args: {
      host: { type: 'string', required: false },
      json: { type: 'boolean', required: false },
      budget: { type: 'string', required: false, default: '50' },
      cursor: { type: 'string', required: false },
    },
    async run({ args }) {
      const url = new URL(`/compute/${operation}`, resolveHostUrl(args.host));
      const response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${resolveHostToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(
          operation === 'collect'
            ? { budget: Number(args.budget), ...(args.cursor ? { cursor: args.cursor } : {}) }
            : {},
        ),
      }).catch((error: unknown) => {
        throw cliError(
          'HOST_UNREACHABLE',
          oneLine(error instanceof Error ? error.message : String(error)),
          exitCodes.error,
        );
      });
      const body = (await response.json().catch(() => undefined)) as
        | { readonly v: 1; readonly operation: string; readonly result: unknown }
        | undefined;
      if (!response.ok || body?.v !== 1 || body.operation !== operation) {
        throw cliError(
          'HOST_COMPUTE_REFUSED',
          `Host refused compute ${operation} (${String(response.status)}).`,
          exitCodes.refused,
        );
      }
      await (args.json
        ? emit({ kind: 'host-compute', ok: true, ...body })
        : writeStdout(`${JSON.stringify(body.result)}\n`));
    },
  });

const hostComputeCommand = defineCommand({
  meta: { name: 'compute', description: 'Inspect and maintain the host compute store' },
  subCommands: {
    inspect: computeCommand('inspect'),
    clear: computeCommand('clear'),
    collect: computeCommand('collect'),
  },
});

/**
 * `tau host` command family.
 *
 * @example <caption>Ask a running daemon what it owns</caption>
 * ```bash
 * tau host inspect --host http://127.0.0.1:7777
 * tau host inspect --json
 * ```
 */
export const hostCommand = defineCommand({
  meta: {
    name: 'host',
    description: 'Inspect a Tau Host',
  },
  subCommands: { inspect: inspectCommand, compute: hostComputeCommand },
});
