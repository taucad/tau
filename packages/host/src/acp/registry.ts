/**
 * Which external ACP agents this daemon can start, and where their adapters are.
 *
 * OQ-X1 (pin-and-review): the adapters are **exact-pinned dependencies of the
 * distributed daemon** (`packages/cli`, and the desktop app). Native ACP CLIs
 * run the user's installed executable directly; neither path uses `npx` at
 * runtime. An agent the user has not installed is refused. The
 * pins below are the reviewed set; the review cadence is quarterly, because
 * these adapters wrap vendor SDKs that move fast
 * (`docs/research/external-agent-acp-topology.md`).
 *
 * Resolution is relative to a caller-supplied module URL rather than this file:
 * the adapters belong to `packages/cli`, so `tau serve` passes its own
 * `import.meta.url` and a test passes a fixture path instead.
 *
 * The profile array is the **only** per-agent knowledge in the tree (V14): the
 * descriptor every other tier renders is built from it here, so adding an agent
 * is one entry, plus a pinned dependency only when an adapter is needed.
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { promisify } from 'node:util';

import { modelChoice, openAcpSession } from '#acp/session.js';
import type { AcpSession } from '#acp/session.js';
import type { ExternalAgentDescriptor, ExternalAgentRefusalCode } from '@taucad/agent-host';

const execFileAsync = promisify(execFile);

/** Milliseconds one `<cli> --version` probe may take before the agent is refused. @public */
export const acpCliProbeTimeout = 10_000;

/**
 * Milliseconds the model probe may take, per agent.
 *
 * Its own budget, spent in parallel with {@link acpCliProbeTimeout}'s: the
 * version probe measures a CLI that answers in milliseconds, while this one
 * opens a real vendor session (Claude measured at 1.9 s on an M-series host),
 * and folding them into one number would either kill the model probe or make
 * every boot wait on the slower question (EQ1 A).
 *
 * @public
 */
export const acpModelProbeTimeout = 5000;

/** One reviewed external agent: its adapter pin and everything Tau knows about it. @public */
export type AcpAgentProfile = {
  /** Stable agent id used on the wire (`config.agent.id`) and in the selector. */
  readonly id: string;
  /**
   * Product name every surface renders.
   *
   * The single source: the selector, the approval banner and the CLI all read
   * it off the descriptor, so adding an agent is one entry here and nothing
   * else (V14).
   */
  readonly displayName: string;
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
  /**
   * Exact variables this adapter is always given, on top of the allowlist.
   *
   * Values, not passthrough names: `configEnv` forwards what the user set, this
   * states what Tau requires.
   */
  readonly spawnEnv?: Readonly<Record<string, string>> | undefined;
  /**
   * Where this agent puts a tool call's *programmatic* name, as dotted paths
   * into the notification, tried in order.
   *
   * Absent — which both reviewed agents are — means `acpNativeToolNamePaths`:
   * ACP's own `name`, then Claude's `_meta.claudeCode.toolName`, then Codex's
   * `rawInput.tool`. It is one ordered chain rather than a per-agent switch
   * because the three never collide (V-W3 evidence), so an adapter that adopts
   * the standard field is served by the first entry with no entry here at all.
   * Override it only for an adapter that puts the name somewhere none reach.
   */
  readonly nativeToolName?: readonly string[] | undefined;
  /**
   * Oldest CLI version this adapter is known to drive.
   *
   * The probe reads `--version` anyway; below this floor the CLI is refused
   * up front (`CLI_TOO_OLD`) instead of failing mid-turn with a vendor error.
   */
  readonly minimumCliVersion?: string | undefined;
  /** Terminal command shown when the agent needs its own local login. Tau never executes it. */
  readonly loginCommand?: string | undefined;
} & (
  | {
      /** Npm package holding the ACP adapter. */
      readonly package: string;
      /** Exact reviewed adapter version. */
      readonly version: string;
      readonly args?: undefined;
    }
  | {
      /** Installed CLI that implements ACP itself. */
      readonly cli: string;
      /** Arguments selecting the CLI's ACP stdio transport. */
      readonly args: readonly string[];
      readonly package?: undefined;
      readonly version?: undefined;
    }
);

/** The reviewed agent set. @public */
export const acpAgentProfiles: readonly AcpAgentProfile[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    package: '@agentclientprotocol/claude-agent-acp',
    version: '0.70.0',
    cli: 'claude',
    configEnv: ['CLAUDE_CONFIG_DIR'],
  },
  {
    id: 'codex',
    displayName: 'Codex',
    package: '@agentclientprotocol/codex-acp',
    version: '1.7.0',
    cli: 'codex',
    configEnv: ['CODEX_HOME'],
    /* Run the CLI this pin probed, not the adapter's own bundled `@openai/codex`
     * copy. X6 already makes the user's `codex` login the credential plane, and
     * the probe already refuses the adapter when that CLI is absent — so the
     * bundled copy is a second Codex nobody checked, and its platform payload is
     * 258 MB that the packaged app would otherwise have to carry. */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable name is the vendor's, not ours.
    spawnEnv: { CODEX_PATH: 'codex' },
    /* The copy codex-acp 1.7.0 bundles; an older PATH binary is refused. */
    minimumCliVersion: '0.148.0',
  },
  {
    id: 'grok',
    displayName: 'Grok Build',
    cli: 'grok',
    args: ['--no-auto-update', 'agent', 'stdio'],
    configEnv: ['GROK_HOME'],
    /* Official @xai-official/grok release verified with an unauthenticated
     * initialize; includes per-session pluginDirs for Tau's system skills. */
    minimumCliVersion: '1.0.41',
    loginCommand: 'grok login',
  },
];

/** A resolved adapter, ready to spawn. @public */
export type AcpAdapter = AcpAgentProfile & {
  /** Models the discovery probe read; empty when it failed (V5). */
  readonly models?: ReadonlyArray<{ readonly id: string; readonly name: string }> | undefined;
  /** The model select's `currentValue`: what a turn naming no model runs. */
  readonly defaultModel?: string | undefined;
} & (
    | {
        readonly package: string;
        /** Absolute entry module, run with this process's own Node. */
        readonly modulePath: string;
      }
    | {
        /** Native ACP executable and arguments, inherited from its profile. */
        readonly cli: string;
        readonly args: readonly string[];
        readonly modulePath?: undefined;
      }
  );

/** Why one agent is not advertised. @public */
export type AcpAdapterRefusal = {
  readonly id: string;
  readonly code: ExternalAgentRefusalCode;
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
  readonly pins?: readonly AcpAgentProfile[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
}): AcpAgentDiscovery => {
  const environment = options.environment ?? process.env;
  const overrides = adapterOverrides(environment);
  const require = createRequire(options.resolveFrom);
  const agents: AcpAdapter[] = [];
  const refused: AcpAdapterRefusal[] = [];
  for (const pin of options.pins ?? acpAgentProfiles) {
    const override = overrides.get(pin.id);
    if (override) {
      /* An override replaces the adapter *and* its CLI probe: the fixture speaks
       * ACP on its own and has no vendor CLI to interrogate. */
      agents.push({
        ...pin,
        args: undefined,
        cli: undefined,
        package: 'test-override',
        version: '0.0.0',
        modulePath: override,
      });
      continue;
    }
    if (pin.args !== undefined) {
      agents.push(pin);
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
 * Whether one dotted version sorts before another, numerically per segment.
 *
 * @param installed - The version the CLI reported.
 * @param floor - The pin's minimum.
 * @returns `true` when `installed` is older than `floor`.
 */
const olderThan = (installed: string, floor: string): boolean => {
  const a = installed.split('.').map(Number);
  const b = floor.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) {
      return (a[index] ?? 0) < (b[index] ?? 0);
    }
  }
  return false;
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
        const { stdout } = await execFileAsync(adapter.cli, ['--version'], {
          timeout: options.probeTimeout ?? acpCliProbeTimeout,
          env: environment,
        });
        const installed = /\d+\.\d+\.\d+/u.exec(String(stdout))?.[0];
        if (
          adapter.minimumCliVersion !== undefined &&
          installed !== undefined &&
          olderThan(installed, adapter.minimumCliVersion)
        ) {
          return {
            id: adapter.id,
            code: 'CLI_TOO_OLD',
            message: `The ${adapter.cli} CLI is ${installed}; ${adapter.displayName} needs ${adapter.minimumCliVersion} or newer.`,
          };
        }
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
    agents: probes.filter((probe): probe is AcpAdapter => !('code' in probe)),
    refused: [...discovery.refused, ...probes.filter((probe): probe is AcpAdapterRefusal => 'code' in probe)],
  };
};

/**
 * Read one agent's model list by opening a throwaway session (V5, EQ1 A).
 *
 * `initialize` + `session/new` in a scratch directory is the only way ACP
 * offers: `InitializeResponse` carries no model list, and the sanctioned list
 * is the `category: 'model'` select on a session's config options. The session
 * is closed again, so the probe leaves no thread behind that the user did not
 * start.
 *
 * A failure is **never** a refusal. Claude's `session/new` succeeds on an
 * account whose prompts fail for billing, and Codex's fails outright when the
 * user is logged out — so an agent whose probe fails keeps its row and simply
 * offers no list until the chat's first session reports one (EQ1 fallback B).
 *
 * @param adapter - The resolved adapter to interrogate.
 * @param modelProbeTimeout - Milliseconds before the probe is abandoned.
 * @returns The adapter, with `models`/`defaultModel` when the probe answered.
 */
const probeAgentModels = async (adapter: AcpAdapter, modelProbeTimeout: number): Promise<AcpAdapter> => {
  const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-probe-'));
  let identifier = 0;
  const nextId = (): string => {
    identifier += 1;
    return `probe-${identifier}`;
  };
  const opening = openAcpSession({ adapter, cwd, createId: nextId });
  /* Its own clock: an adapter that answers `--version` in 10 ms can still hang
   * its handshake, and the boot must not wait on one that will not settle. */
  let probeExpiry: NodeJS.Timeout | undefined;
  /**
   * Close a session that opened after the deadline.
   *
   * Abandoned, not leaked: the probe has already returned, so the only thing
   * left to do with a late session is end it and kill its child.
   *
   * @param pending - The open that lost the race.
   */
  const closeLate = async (pending: Promise<AcpSession>): Promise<void> => {
    try {
      const late = await pending;
      await late.close();
    } catch {
      /* The probe already gave up on this adapter; how it died adds nothing. */
    }
  };
  try {
    const session = await Promise.race([
      opening,
      new Promise<undefined>((resolve) => {
        probeExpiry = setTimeout(() => {
          resolve(undefined);
        }, modelProbeTimeout);
        probeExpiry.unref();
      }),
    ]);
    if (!session) {
      // async-iife: bootstrap -- the probe's deadline has passed; the late close is cleanup, not an answer.
      void closeLate(opening);
      return adapter;
    }
    const choice = modelChoice(session.configOptions);
    await session.close();
    return choice === undefined
      ? adapter
      : {
          ...adapter,
          models: choice.models,
          ...(choice.currentValue === undefined ? {} : { defaultModel: choice.currentValue }),
        };
  } catch {
    return adapter;
  } finally {
    if (probeExpiry) {
      clearTimeout(probeExpiry);
    }
    try {
      await rm(cwd, { recursive: true, force: true });
    } catch {
      /* A scratch directory that outlives the probe is litter, never a failure. */
    }
  }
};

/**
 * Probe every resolved adapter's model list, in parallel.
 *
 * @param discovery - Resolved adapters.
 * @param options - Probe timeout override.
 * @returns The same agents, decorated with whatever each probe answered.
 * @public
 */
export const probeAcpAgentModels = async (
  discovery: AcpAgentDiscovery,
  options: { readonly modelProbeTimeout?: number | undefined } = {},
): Promise<AcpAgentDiscovery> => ({
  ...discovery,
  agents: await Promise.all(
    discovery.agents.map(async (adapter) =>
      probeAgentModels(adapter, options.modelProbeTimeout ?? acpModelProbeTimeout),
    ),
  ),
});

/**
 * The canonical descriptor every tier carries, for one discovery (VSC1).
 *
 * Refused agents are descriptors too: the row exists so a GUI can say
 * `CLI_TOO_OLD` instead of quietly offering less than the user installed (V9).
 * Their `displayName` comes from the profile, because a refusal names an agent
 * that resolution knew about.
 *
 * @param discovery - What this installation can and cannot start.
 * @param profiles - Profile set the discovery came from; defaults to the reviewed one.
 * @returns One descriptor per known agent, startable first.
 * @public
 *
 * @example <caption>Advertise what this machine has</caption>
 * ```typescript
 * import { discoverAcpAgents, externalAgentDescriptors } from '@taucad/host';
 *
 * const descriptors = externalAgentDescriptors(await discoverAcpAgents({ resolveFrom: import.meta.url }));
 * ```
 */
export const externalAgentDescriptors = (
  discovery: AcpAgentDiscovery,
  profiles: readonly AcpAgentProfile[] = acpAgentProfiles,
): readonly ExternalAgentDescriptor[] => [
  ...discovery.agents.map((adapter) => ({
    id: adapter.id,
    displayName: adapter.displayName,
    models: [...(adapter.models ?? [])],
    ...(adapter.defaultModel === undefined ? {} : { defaultModel: adapter.defaultModel }),
  })),
  ...discovery.refused.map((refusal) => ({
    id: refusal.id,
    displayName: profiles.find((profile) => profile.id === refusal.id)?.displayName ?? refusal.id,
    models: [],
    refusal: refusal.code,
  })),
];

/**
 * Resolve, probe the CLIs and probe the models in one step.
 *
 * The two probes run **together**, not in sequence: they answer different
 * questions on different clocks, and a boot that added them up would wait
 * `acpCliProbeTimeout + acpModelProbeTimeout` on a machine where both hang.
 *
 * @param options - Module URL to resolve from, plus probe overrides.
 * @returns The agents this daemon may advertise, with their model lists.
 * @public
 */
export const discoverAcpAgents = async (options: {
  readonly resolveFrom: string;
  readonly pins?: readonly AcpAgentProfile[] | undefined;
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly probeTimeout?: number | undefined;
  readonly modelProbeTimeout?: number | undefined;
  /** `false` skips the model probe entirely, which only a test does. */
  readonly probeModels?: boolean | undefined;
}): Promise<AcpAgentDiscovery> => {
  const resolved = resolveAcpAdapters(options);
  const [probed, withModels] = await Promise.all([
    probeAcpAgents(resolved, {
      ...(options.probeTimeout === undefined ? {} : { probeTimeout: options.probeTimeout }),
      ...(options.environment === undefined ? {} : { environment: options.environment }),
    }),
    options.probeModels === false
      ? resolved
      : probeAcpAgentModels(
          resolved,
          options.modelProbeTimeout === undefined ? {} : { modelProbeTimeout: options.modelProbeTimeout },
        ),
  ]);
  const models = new Map(withModels.agents.map((adapter) => [adapter.id, adapter]));
  /* The version probe decides *who* is advertised and the model probe decides
   * *what* they offer, so the surviving set is the version probe's. */
  return { refused: probed.refused, agents: probed.agents.map((adapter) => models.get(adapter.id) ?? adapter) };
};
