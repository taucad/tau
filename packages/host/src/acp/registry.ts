/**
 * Which external ACP agents this daemon can start, and where their adapters are.
 *
 * OQ-X1 (pin-and-review): the adapters are **exact-pinned dependencies of the
 * distributed daemon** (`packages/cli`), never a PATH lookup and never `npx` at
 * runtime — an agent the user has not installed is simply not advertised. The
 * pins below are the reviewed set; the review cadence is quarterly, alongside
 * the X9 Paseo sunset review, because these adapters wrap vendor SDKs that move
 * fast (`docs/research/external-agent-acp-topology.md`).
 *
 * Resolution is relative to a caller-supplied module URL rather than this file:
 * the adapters belong to `packages/cli`, so `tau serve` passes its own
 * `import.meta.url` and a test passes a fixture path instead.
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Milliseconds one `<cli> --version` probe may take before the agent is refused. @public */
export const acpCliProbeTimeout = 10_000;

/** One reviewed external-agent adapter. @public */
export type AcpAdapterPin = {
  /** Stable agent id used on the wire (`config.agent.id`) and in the selector. */
  readonly id: string;
  /** Npm package holding the ACP adapter. */
  readonly package: string;
  /** Exact reviewed version; see the cadence note above. */
  readonly version: string;
  /**
   * CLI whose *own* login the adapter inherits (X6). Probed once at start;
   * `undefined` skips the probe, which only a test override does.
   */
  readonly cli?: string | undefined;
  /**
   * Variables naming the agent's own configuration directory. Everything else
   * is dropped by {@link acpAdapterEnvironment}'s allowlist, so these are the
   * one carve-out — a user who moved `~/.codex` must still be found.
   */
  readonly configEnv: readonly string[];
};

/** The reviewed adapter set. @public */
export const acpAdapterPins: readonly AcpAdapterPin[] = [
  {
    id: 'claude',
    package: '@agentclientprotocol/claude-agent-acp',
    version: '0.70.0',
    cli: 'claude',
    configEnv: ['CLAUDE_CONFIG_DIR'],
  },
  {
    id: 'codex',
    package: '@agentclientprotocol/codex-acp',
    version: '1.7.0',
    cli: 'codex',
    configEnv: ['CODEX_HOME'],
  },
];

/** A resolved adapter, ready to spawn. @public */
export type AcpAdapter = AcpAdapterPin & {
  /** Absolute entry module, run with this process's own `node`. */
  readonly modulePath: string;
};

/** Why one agent is not advertised. @public */
export type AcpAdapterRefusal = {
  readonly id: string;
  readonly code: 'ADAPTER_NOT_INSTALLED' | 'ADAPTER_NO_BIN' | 'CLI_NOT_FOUND';
  readonly message: string;
};

/** What this installation can and cannot start. @public */
export type AcpAgentDiscovery = {
  readonly agents: readonly AcpAdapter[];
  readonly refused: readonly AcpAdapterRefusal[];
};

/** Environment variable carrying test-only adapter overrides. @public */
export const acpAdapterOverrideVariable = 'TAU_ACP_ADAPTER_OVERRIDE';

type PackageManifest = { readonly bin?: string | Readonly<Record<string, string>> };

const binaryEntry = (manifest: PackageManifest, id: string): string | undefined => {
  if (typeof manifest.bin === 'string') {
    return manifest.bin;
  }
  const entries = Object.entries(manifest.bin ?? {});
  return (entries.find(([name]) => name.includes(id)) ?? entries[0])?.[1];
};

/**
 * Test-only adapter overrides, as `<absolute module path>:<agent id>` entries.
 *
 * Guarded on `NODE_ENV === 'test'` **in code, not by convention**: a production
 * daemon that inherited this variable would otherwise spawn an arbitrary module
 * under the user's own CLI credentials.
 *
 * @param environment - Environment to read; defaults to this process's.
 * @returns Overrides by agent id.
 */
const adapterOverrides = (environment: NodeJS.ProcessEnv): ReadonlyMap<string, string> => {
  const raw = environment[acpAdapterOverrideVariable];
  if (!raw || environment['NODE_ENV'] !== 'test') {
    return new Map();
  }
  return new Map(
    raw
      .split(',')
      .flatMap((entry) => {
        const separator = entry.lastIndexOf(':');
        if (separator <= 0) {
          return [];
        }
        return [[entry.slice(separator + 1).trim(), resolvePath(entry.slice(0, separator).trim())] as const];
      })
      .filter(([id, path]) => id !== '' && path !== ''),
  );
};

/**
 * Resolve every pinned adapter that is actually installed.
 *
 * @param options - Module URL to resolve from, plus pin/environment overrides.
 * @returns Installed adapters and a typed refusal for each that is missing.
 * @public
 *
 * @example <caption>Resolve from the distributed daemon</caption>
 * ```typescript
 * import { resolveAcpAdapters } from '@taucad/host';
 *
 * const { agents } = resolveAcpAdapters({ resolveFrom: import.meta.url });
 * ```
 */
export const resolveAcpAdapters = (options: {
  readonly resolveFrom: string;
  readonly pins?: readonly AcpAdapterPin[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
}): AcpAgentDiscovery => {
  const environment = options.environment ?? process.env;
  const overrides = adapterOverrides(environment);
  const require = createRequire(options.resolveFrom);
  const agents: AcpAdapter[] = [];
  const refused: AcpAdapterRefusal[] = [];
  for (const pin of options.pins ?? acpAdapterPins) {
    const override = overrides.get(pin.id);
    if (override) {
      /* An override replaces the adapter *and* its CLI probe: the fixture speaks
       * ACP on its own and has no vendor CLI to interrogate. */
      agents.push({ ...pin, cli: undefined, package: `${pin.package} (override)`, modulePath: override });
      continue;
    }
    try {
      const manifestPath = require.resolve(`${pin.package}/package.json`);
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an npm manifest is JSON with an optional `bin` field.
      const manifest = require(manifestPath) as PackageManifest;
      const binary = binaryEntry(manifest, pin.id);
      if (!binary) {
        refused.push({
          id: pin.id,
          code: 'ADAPTER_NO_BIN',
          message: `${pin.package} declares no bin entry to run as an ACP adapter.`,
        });
        continue;
      }
      agents.push({ ...pin, modulePath: resolvePath(dirname(manifestPath), binary) });
    } catch (error) {
      refused.push({
        id: pin.id,
        code: 'ADAPTER_NOT_INSTALLED',
        message: `${pin.package}@${pin.version} is not installed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return { agents, refused };
};

/**
 * Probe each adapter's underlying CLI once.
 *
 * The adapter inherits the CLI's own login (X6), so an adapter whose CLI is not
 * on PATH would fail every turn with a vendor error the user cannot act on.
 * Refusing it up front is the honest advertisement.
 *
 * @param discovery - Resolved adapters.
 * @param options - Probe timeout and environment overrides.
 * @returns The subset whose CLI answered, plus refusals for the rest.
 * @public
 */
export const probeAcpAgents = async (
  discovery: AcpAgentDiscovery,
  options: { readonly probeTimeout?: number | undefined; readonly environment?: NodeJS.ProcessEnv | undefined } = {},
): Promise<AcpAgentDiscovery> => {
  const environment = options.environment ?? process.env;
  const probes = await Promise.all(
    discovery.agents.map(async (adapter): Promise<AcpAdapter | AcpAdapterRefusal> => {
      if (!adapter.cli) {
        return adapter;
      }
      try {
        await execFileAsync(adapter.cli, ['--version'], {
          timeout: options.probeTimeout ?? acpCliProbeTimeout,
          env: environment,
        });
        return adapter;
      } catch (error) {
        return {
          id: adapter.id,
          code: 'CLI_NOT_FOUND',
          message: `The ${adapter.cli} CLI did not answer \`--version\`: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }),
  );
  return {
    agents: probes.filter((probe): probe is AcpAdapter => 'modulePath' in probe),
    refused: [...discovery.refused, ...probes.filter((probe): probe is AcpAdapterRefusal => !('modulePath' in probe))],
  };
};

/**
 * Resolve and probe in one step.
 *
 * @param options - Module URL to resolve from, plus probe overrides.
 * @returns The agents this daemon may advertise.
 * @public
 */
export const discoverAcpAgents = async (options: {
  readonly resolveFrom: string;
  readonly pins?: readonly AcpAdapterPin[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly probeTimeout?: number | undefined;
}): Promise<AcpAgentDiscovery> =>
  probeAcpAgents(resolveAcpAdapters(options), {
    ...(options.probeTimeout === undefined ? {} : { probeTimeout: options.probeTimeout }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
  });
