/**
 * Desktop external-agent discovery (blueprint D4, failure F2).
 *
 * Main discovers which ACP agents this machine can start, posts the adapters to
 * the services utility and serves the descriptors to the renderer. A refusal is
 * not kept for the life of the process: the next listing after
 * {@link externalAgentRediscoveryMilliseconds} probes the refused profiles
 * again, so a user who installs, updates or repairs a CLI sees the row recover
 * without restarting Tau. Startable agents are never probed again: re-probing
 * spawns vendor adapters, which a listing must not do on every call.
 *
 * The library probe budgets apply (blueprint D8): the window does not wait on
 * discovery, so a shorter budget only turns a slow CLI into a refusal.
 */

import {
  acpAgentProfiles,
  acpEnvironmentAllowlist,
  acpEnvironmentPrefixAllowlist,
  externalAgentDescriptors,
} from '@taucad/host';
import type { AcpAdapter, AcpAgentDiscovery, AcpAgentProfile } from '@taucad/host';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';

import type { DiagnosticsLog } from '#main/diagnostics.js';

/** Shortest wait between two discoveries of a refused or failed result. */
export const externalAgentRediscoveryMilliseconds = 30_000;

/** Longest refusal message one log line carries. */
const refusalMessageCharacters = 300;

/** What {@link createExternalAgentDiscovery} passes to its discover function. */
export type ExternalAgentDiscoverOptions = {
  readonly resolveFrom: string;
  /** Only these profiles; absent means the reviewed set. */
  readonly pins?: readonly AcpAgentProfile[];
};

/** Options for {@link createExternalAgentDiscovery}. */
export type ExternalAgentDiscoveryOptions = {
  /** Module URL the pinned adapters resolve from. */
  readonly resolveFrom: string;
  /** Resolves and probes the agents; `discoverAcpAgents` outside a test. */
  readonly discover: (options: ExternalAgentDiscoverOptions) => Promise<AcpAgentDiscovery>;
  /**
   * Posts the `agentHost` configuration with these adapters, or with none when
   * no discovery has succeeded yet. Called after every discovery that settles.
   */
  readonly configure: (agents: readonly AcpAdapter[] | undefined) => void;
  /** The local diagnostics log; refusal messages hold local paths and stay here. */
  readonly log: DiagnosticsLog;
  /** Milliseconds clock. */
  readonly now: () => number;
  /** Main's environment, whose account and agent variables each adapter is given; `process.env` by default. */
  readonly environment?: NodeJS.ProcessEnv | undefined;
};

/**
 * The adapter, given main's values for the names its allowlist forwards.
 *
 * The services utility that spawns adapters starts from a minimal environment
 * with no `HOME` or `USER`, so an adapter spawned there would lose them. Claude
 * Code finds its macOS keychain sign-in by `USER`, and a signed-in CLI answered
 * "not logged in" on every turn while discovery, which runs in main, saw it
 * signed in. Main's values travel on `spawnEnv`, which wins over the utility's
 * own allowlisted environment, and the utility's environment stays minimal.
 *
 * @param adapter - A discovered adapter.
 * @param environment - Main's environment.
 * @returns The adapter, with the allowlisted names main holds added beneath its own `spawnEnv`.
 */
export const withMainAgentEnvironment = (adapter: AcpAdapter, environment: NodeJS.ProcessEnv): AcpAdapter => {
  const names = new Set([...acpEnvironmentAllowlist, ...adapter.configEnv]);
  const forwarded = Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        /* The utility's own PATH is main's login-shell PATH already. */
        entry[0] !== 'PATH' &&
        (names.has(entry[0]) || acpEnvironmentPrefixAllowlist.some((prefix) => entry[0].startsWith(prefix))),
    ),
  );
  return Object.keys(forwarded).length === 0
    ? adapter
    : { ...adapter, spawnEnv: { ...forwarded, ...adapter.spawnEnv } };
};

/** The descriptors this machine advertises, kept current across listings. */
export type ExternalAgentDiscovery = {
  /**
   * Answer the descriptors, first running discovery again when the last answer
   * refused an agent or failed and the interval has passed. Concurrent calls
   * share one discovery. Never rejects.
   */
  list(): Promise<readonly ExternalAgentDescriptor[]>;
  /**
   * The adapter the last successful discovery advertised for an agent id, as discovered (before main's account
   * variables are added for the utility); `undefined` for an agent it refused or never saw.
   */
  adapterOf(agentId: string): AcpAdapter | undefined;
};

const profileOrder = (id: string): number => {
  const index = acpAgentProfiles.findIndex((profile) => profile.id === id);
  return index === -1 ? acpAgentProfiles.length : index;
};

/**
 * Merge a re-discovery of the refused profiles into the previous answer.
 *
 * @param previous - The answer the re-discovery was pinned from.
 * @param next - The answer for the refused profiles alone.
 * @returns The previous agents plus any that recovered, in profile order, with the refusals that remain.
 */
const merge = (previous: AcpAgentDiscovery, next: AcpAgentDiscovery): AcpAgentDiscovery => ({
  agents: [
    ...previous.agents,
    ...next.agents.filter((adapter) => !previous.agents.some(({ id }) => id === adapter.id)),
  ].toSorted((left, right) => profileOrder(left.id) - profileOrder(right.id)),
  refused: next.refused,
});

/**
 * Create the desktop's external-agent discovery.
 *
 * The first {@link ExternalAgentDiscovery.list} runs the full discovery. A
 * rejected discovery answers no agents and configures the host without them,
 * because optional CLI discovery cannot leave the project's history and gateway
 * unconfigured; a rejected re-discovery keeps the agents already posted.
 *
 * @param options - The discover function, the configuration callback, the log and a clock.
 * @returns The discovery, which has not started until its first listing.
 *
 * @example <caption>Serve the renderer's listings</caption>
 * ```typescript
 * const externalAgents = createExternalAgentDiscovery({
 *   resolveFrom: import.meta.url,
 *   discover: discoverAcpAgents,
 *   configure: (agents) => services.post({ type: 'agentHost', config: { ...base, externalAgents: agents } }),
 *   log,
 *   now: Date.now,
 * });
 * ipcMain.handle(externalAgentsChannel, async () => externalAgents.list());
 * ```
 */
export const createExternalAgentDiscovery = (options: ExternalAgentDiscoveryOptions): ExternalAgentDiscovery => {
  const { resolveFrom, discover, configure, log, now } = options;
  const environment = options.environment ?? process.env;
  /** The last answer that succeeded; `undefined` until one has. */
  let current: AcpAgentDiscovery | undefined;
  let descriptors: readonly ExternalAgentDescriptor[] = [];
  /** When the last discovery settled; `undefined` before the first. */
  let settledAt: number | undefined;
  let failed = false;
  let inFlight: Promise<readonly ExternalAgentDescriptor[]> | undefined;

  const run = async (): Promise<readonly ExternalAgentDescriptor[]> => {
    const previous = failed ? undefined : current;
    const refusedIds = new Set(previous?.refused.map((refusal) => refusal.id));
    const pins = previous ? acpAgentProfiles.filter((profile) => refusedIds.has(profile.id)) : undefined;
    try {
      const answer = await discover(pins ? { resolveFrom, pins } : { resolveFrom });
      log.log('info', 'agent-host.external-agents', {
        agents: answer.agents.map((adapter) => `${adapter.id}:${String((adapter.models ?? []).length)}`),
        refused: answer.refused.map(
          (refusal) => `${refusal.id}: ${refusal.code}: ${refusal.message.slice(0, refusalMessageCharacters)}`,
        ),
      });
      current = previous ? merge(previous, answer) : answer;
      failed = false;
      configure(current.agents.map((adapter) => withMainAgentEnvironment(adapter, environment)));
      /* The one canonical descriptor (VSC1): the renderer draws its rows from
       * this, the utility gets the adapters themselves, and neither builds its
       * own idea of what an agent is called or which models it offers. */
      descriptors = externalAgentDescriptors(current);
    } catch (error) {
      log.log('error', 'agent-host.external-agents-failed', { message: String(error) });
      if (!current) {
        failed = true;
        configure(undefined);
      }
    } finally {
      settledAt = now();
      inFlight = undefined;
    }
    return descriptors;
  };

  return {
    async list() {
      if (inFlight) {
        return inFlight;
      }
      const due =
        settledAt === undefined ||
        ((failed || (current?.refused.length ?? 0) > 0) && now() - settledAt >= externalAgentRediscoveryMilliseconds);
      if (!due) {
        return descriptors;
      }
      inFlight = run();
      return inFlight;
    },
    adapterOf: (agentId) => current?.agents.find((adapter) => adapter.id === agentId),
  };
};
