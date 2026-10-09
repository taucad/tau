/**
 * Services-utility behaviour (work item E7), separated from its entry so it is
 * testable in a plain Node vitest run.
 *
 * Imports **no** `electron` — the "two launchers of one host" invariant, so
 * everything here is equally launchable from the daemon. Main talks to it over
 * `process.parentPort`, which Electron exposes as a process global rather than
 * through the `electron` module, so the invariant survives the transport.
 *
 * It hosts four concerns, one dedicated port each. Renderer filesystem,
 * runtime filesystem, agent tools, and revision preparation all derive rooted
 * clients from one internal authority channel. The machines concern serves
 * the node machine host — the real Bambu, Grbl and Carvera providers beside their simulators — over
 * the same broker, from the per-user machine store every Tau host on this
 * computer shares; it needs no project. The agent host is ruling C3's
 * **launcher 2**: `createProjectHost` from `@taucad/host`, the same composition the
 * daemon runs, bound to main's `MessagePortMain` by the port-agnostic
 * `serveAgentChannel` the daemon's WebSocket route also calls. One `projectHost`
 * actor per root decides which host a connection is served on and when a
 * released host closes (W6 RH-S5).
 *
 * Main sends the gateway and the credential; the model rides each admission
 * from the renderer, and the *workspace root* arrives per connection, because
 * one desktop app opens many projects and each launcher owns exactly one
 * directory. See
 * `docs/research/host-agnostic-transport-substrate-blueprint.md`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { EmitterPort } from '@taucad/filesystem/backend/node';
import { serveAgentChannel } from '@taucad/agent-host/launcher';
import { createGatewayModelTransport, createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import { bambuA1MiniMachine, bambuA1MiniSimulatorMachine, bambuMachine, bambuSimulatorMachine } from '@taucad/bambu';
import { carveraMachine, carveraSimulatorMachine } from '@taucad/carvera';
import { grblMachine, grblSimulatorMachine } from '@taucad/grbl';
import {
  completeMachineBinding,
  createMachineSecretStore,
  createNodeMachineRuntime,
  createProjectHostActor,
  keyedResource,
  localMachineFacet,
  machineRouteGrants,
  openMachineHostIdentity,
  openSecretVault,
  readProjectId,
} from '@taucad/host';
import type {
  AcpAdapter,
  HostMcpEndpoint,
  MachineHostIdentity,
  MachineSecretStore,
  ProjectHost,
  ProjectHostActor,
  ProjectHostOptions,
} from '@taucad/host';
import { createChannelServer, wrapMessagePortMain } from '@taucad/rpc';
import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import type { HostAdmissionAuthority } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import type { NodeMachineHost } from '@taucad/runtime/host/node';
import type { MachineArtifactReference, MachineBindingOutcome } from '@taucad/runtime/machine';
import type { HostToolFileSystem } from '@taucad/host/agent-tools';
import { createRuntimeClient } from '@taucad/runtime/client';
import { packageVersion } from '@taucad/runtime/metadata';
import { electronUtilityMainTransport } from '@taucad/runtime/electron/renderer';
import { serveElectronFileSystemBridgePort } from '@taucad/runtime/electron/utility';
import { systemSkillBundles } from '@taucad/skills/resources';

import { canonicalPath } from '#main/project-roots.js';
import { createGeometryRunnerClient } from '#tau/geometry-runner-client.js';
import type { createDesktopRuntime } from '#tau/desktop-runtime.factory.js';

/**
 * Context label every dispatch on the channel carries.
 *
 * It is `serveAgentChannel`'s own default, and it is *not* a handshake — a
 * client that names another label is still served (verified by flipping this
 * literal: the T0 round trip stays green). It is pinned here anyway because the
 * contract handed to the agent-host program names it, so the value stays
 * greppable from both halves rather than living only as two defaults.
 */
const agentSessionKey = 'tau-agent';

/**
 * How long a connection waits for main's `agentHost` frame. Milliseconds.
 *
 * Main's CLI probe runs on 1.5 s and its model probe on 5 s, and the frame is
 * posted once both settle — so this is the same 10 s the utility already gives
 * main to answer a runtime-port request, with room over the slower probe.
 */
const agentHostConfigTimeout = 10_000;

/**
 * Compose the rejection a refused runtime-port request settles with.
 *
 * Main is the only process that knows why it refused — a utility guard, a root
 * it has not admitted — and this sentence is the whole path that reason takes
 * to the agent's tool error.
 *
 * @param reason - The `message` main sent with its refusal, if it sent one.
 * @returns The sentence to reject the pending request with.
 */
export const refusedRuntimePortMessage = (reason: unknown): string =>
  typeof reason === 'string' && reason.length > 0
    ? `Main refused the desktop runtime-port request: ${reason}`
    : 'Main refused the desktop runtime-port request.';

/** The machine host and the trusted seams only this utility may call. */
type MachineHostServices = Readonly<{
  host: NodeMachineHost;
  admission: HostAdmissionAuthority;
  identity: MachineHostIdentity;
  secrets: MachineSecretStore;
}>;

type RuntimeFileSystemDisposer = {
  drain(): Promise<void>;
  force(): void;
};

type RuntimeFileSystemHandlers = Parameters<typeof serveElectronFileSystemBridgePort>[0];

/**
 * Stop runtime-filesystem admission and observe every dispatched reply before
 * its bridge is closed.
 *
 * The extra event-loop turn is intentional: the common bridge awaits the
 * handler promise and serializes its success or failure in later promise
 * continuations. Settling the drain in that same microtask would let quiesce
 * close the channel before the already-computed reply was posted.
 */
const drainingRuntimeFileSystem = (handlers: RuntimeFileSystemHandlers) => {
  const acceptedOperation = new AsyncLocalStorage<boolean>();
  const drained = new Set<() => void>();
  let pendingReplies = 0;
  let accepting = true;
  const markReplyFlushed = (): void => {
    pendingReplies -= 1;
    if (pendingReplies === 0) {
      for (const resolve of drained) {
        resolve();
      }
      drained.clear();
    }
  };
  const tracked = new Proxy(handlers, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      const operation = value as (this: RuntimeFileSystemHandlers, ...args: unknown[]) => unknown;
      return async (...args: unknown[]): Promise<unknown> => {
        pendingReplies += 1;
        try {
          if (!accepting && acceptedOperation.getStore() !== true) {
            throw new Error('The runtime filesystem is quiescing and accepts no new operations.');
          }
          return await acceptedOperation.run(true, () => operation.apply(target, args));
        } finally {
          /* The bridge posts its reply from the promise continuation that runs
           * before this check-phase callback. */
          setImmediate(markReplyFlushed);
        }
      };
    },
  });
  return {
    handlers: tracked,
    stopAdmission(): void {
      accepting = false;
    },
    async drain(): Promise<void> {
      if (pendingReplies > 0) {
        await new Promise<void>((resolve) => {
          drained.add(resolve);
        });
      }
    },
  };
};

/**
 * One transferred port. Electron's `MessagePortMain` is both an
 * {@link EmitterPort} and the emitter-shaped port `serveAgentChannel`
 * normalises, so the two concerns take the same object without a cast.
 */
export type UtilityPort = EmitterPort & { start(): void; close(): void };

/** One `process.parentPort` message, structurally typed. */
export type UtilityMessage = {
  readonly data: unknown;
  readonly ports: readonly UtilityPort[];
};

/** Configuration main sends for launcher 2, minus the per-connection root. */
export type AgentHostConfig = {
  readonly gatewayBaseUrl: string;
  readonly systemPrompt: string;
  readonly tauApiUrl: string;
  readonly tauWebSocketUrl: string;
  /**
   * ACP adapters main resolved and probed (W4-ACP), or absent for Tau's own
   * runs only. Discovery is *main's* because main also advertises the ids to
   * the renderer through the preload bootstrap, and a second resolution here
   * could disagree with the rows the selector already drew.
   */
  readonly externalAgents?: readonly AcpAdapter[] | undefined;
};

/** Options for {@link createServicesHost}. */
export type ServicesHostOptions = {
  /** Host-owned authority metadata directory, outside every authored root. */
  readonly authorityDirectory?: string;
  /**
   * The per-user machine store, `<config>/machines`: printers, their
   * operations and requests, the store's identity and the file vault. Absent,
   * the `machines` concern is refused.
   */
  readonly machinesDirectory?: string;
  /** The app's old machine directory, imported once into the store when it is another directory. */
  readonly legacyMachinesDirectory?: string;
  /**
   * Diagnostics sink; defaults to stdout, which main forwards to
   * `userData/logs`. `level` is omitted for the ordinary informational trace
   * and named only where a line is a refusal an operator has to find.
   */
  readonly log?: (event: string, detail?: unknown, level?: 'info' | 'warn') => void;
  /** Injected for tests. */
  readonly serve?: typeof serveNodeFsProvider;
  /** Injected rooted Electron filesystem bridge server for tests. */
  readonly serveRuntimeFileSystem?: typeof serveElectronFileSystemBridgePort;
  /** Ask main to mint a runtime port for this already-admitted project. */
  readonly requestRuntimePort?: (workspaceRoot: string) => Promise<{
    readonly port: UtilityPort;
    release(reason: 'requested' | 'operation-timeout'): void;
  }>;
  /** Ask main for one runner channel into the separately supervised geometry slot. */
  readonly requestGeometryPort?: (workspaceRoot: string) => Promise<UtilityPort>;
  /**
   * Tell main a candidate turn's checkout is (or is no longer) a runtime root.
   *
   * Main answers `requestRuntimePort` only for a registered context
   * (`services-broker.ts`), and a turn checkout is not a project — so without
   * this a candidate turn's kernel and GeoSpec tools would render the project
   * tree while its file tools write the checkout (V19).
   */
  readonly runtimeContext?: (action: 'register' | 'release', checkoutRoot: string, projectRoot: string) => void;
  /**
   * The `git` this app records with (OQ-B8, OQ3).
   *
   * Absent, it comes from `PATH` — which on a Finder launch is
   * `/usr/bin:/bin:/usr/sbin:/sbin` and holds no Homebrew `git-lfs`. Main
   * passes the `git` the bundle ships, whose own exec path carries `git-lfs`;
   * `git lfs` is never a second binary this host has to name.
   */
  readonly gitExecutable?: string | undefined;
  /**
   * Answer main's `quiesce` control frame once every project is settled (W19).
   *
   * Quit used to kill this utility outright: `services-broker.dispose()` calls
   * `utility.kill()` and `ServicesHost.dispose()` is synchronous
   * fire-and-forget, so a launcher's `close()` — which is what records the
   * close revision and waits for `awaitSyncSettled` — never ran to completion.
   * Main now asks first and waits, bounded, for this reply.
   */
  readonly quiesced?: (outcome: ServicesHostQuiesceOutcome) => void;
  /**
   * Build a project's turn placement from its revisions (W8 TS-S4, D13), exactly as `createProjectHost` takes it on the
   * daemon. Absent, turns run where the host's own checkouts put them.
   */
  readonly turnPlacement?: ProjectHostOptions['turnPlacement'];
  /** Reply to main once one project launcher has fully stopped. */
  readonly agentHostReleased?: (requestId: string, error?: string) => void;
  /** Reply to main with one binding ceremony's outcome, or why it failed. */
  readonly machineBindingCompleted?: (
    requestId: string,
    result: Readonly<{ outcome: MachineBindingOutcome }> | Readonly<{ error: string }>,
  ) => void;
  /** Tell main this project can record nothing, so a person is told (W5). */
  readonly onRevisionsUnavailable?: (
    workspaceRoot: string,
    event: Readonly<{ reason: string; missing: readonly string[] }>,
  ) => void;
};

/** Result returned to main after a graceful quiesce request. */
export type ServicesHostQuiesceOutcome =
  | Readonly<{ type: 'quiesced' }>
  | Readonly<{ type: 'quiesce-failed'; message: string }>;

/** The services host, seen by its entry and by tests. */
export type ServicesHost = {
  /** Handle one `process.parentPort` message. */
  handleMessage(message: UtilityMessage): void;
  /** Whether a renderer-named root may be served. */
  isTrustedRoot(root: string): boolean;
  /** Main's agent configuration, once it has sent the frame. */
  agentHostConfig(): AgentHostConfig | undefined;
  /**
   * Settle every project this utility serves, then resolve (W19, D31).
   *
   * Each launcher wraps its project's revision actor tree (`revisions.record`),
   * so closing it takes the `close` cut and then awaits W13's `awaitSyncSettled`
   * through `ProjectRevisions.release()`. This never reimplements that wait; it
   * is the one place that lets it finish before the process goes.
   */
  quiesce(): Promise<void>;
  /** Release project runtimes when the owning utility exits. */
  dispose(): void;
};

/**
 * Build the services host.
 *
 * @param options - Diagnostics sink and injected seams.
 * @returns The host.
 */
export const createServicesHost = (options: ServicesHostOptions = {}): ServicesHost => {
  const log =
    options.log ??
    ((event: string, detail?: unknown, level?: 'info' | 'warn'): void => {
      // oxlint-disable-next-line no-console -- forwarded to userData/logs through main's stdio
      console.log(
        `[services] ${level === undefined ? '' : `${level} `}${event}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`,
      );
    });
  const {
    agentHostReleased,
    authorityDirectory,
    gitExecutable,
    legacyMachinesDirectory,
    machineBindingCompleted,
    machinesDirectory,
    onRevisionsUnavailable,
    quiesced,
    requestRuntimePort,
    requestGeometryPort,
    runtimeContext,
    turnPlacement,
  } = options;
  const serve = options.serve ?? serveNodeFsProvider;
  const serveRuntimeFileSystem = options.serveRuntimeFileSystem ?? serveElectronFileSystemBridgePort;
  const authority =
    authorityDirectory === undefined
      ? undefined
      : new NodeFsAuthorityHost({
          authorityDirectory: () => authorityDirectory,
          /* Electron enforces one app process, and this stable userData owner
           * survives utility restarts. The authority queues only overlapping
           * physical resources, so this shared OS lease does not serialize
           * unrelated files. */
          authorityIdentity: () => 'desktop',
        });
  const trustedRoots = new Set<string>();
  const candidateRoots = new Map<string, number>();
  const nodeFileSystemDisposers = new Set<() => Promise<void>>();
  const runtimeFileSystemDisposers = new Set<RuntimeFileSystemDisposer>();
  /* One `projectHost` actor per workspace root (W6 RH-S5), outliving every
   * connection to it: a run keeps executing with zero clients attached, which is
   * the whole point of the portable host. It leaves the map when it ends. */
  const projectHosts = new Map<string, ProjectHostActor>();
  const retiredProjectHosts = new Set<ProjectHostActor>();
  /* Renderer ports held for the actor that serves or refuses them, by connection id. */
  const connections = new Map<string, UtilityPort>();
  let connectionCount = 0;
  /* Quiesce and dispose wait for each actor's `shutdown` answer, by request id. */
  const shutdowns = new Map<string, (failure: string | undefined) => void>();
  type DesktopRuntime = ReturnType<typeof createDesktopRuntime>;
  type DesktopClient = ReturnType<typeof createRuntimeClient<DesktopRuntime>>;
  let disposed = false;
  let quiescing = false;
  let quiescence: Promise<void> | undefined;
  let authToken: string | undefined;
  /** The signed-in account's user id, which main reads from `get-session` and sends with the bearer. */
  let sessionPrincipal: string | undefined;
  let agentHostConfig: AgentHostConfig | undefined;
  /* One machine host per utility lifetime: opened on the first machines
   * concern or ceremony, surviving every renderer reload, closed on quiesce.
   * A job names its project by `tau.json` id; these are the project
   * roots each id was last found at. */
  let machineHost: Promise<MachineHostServices> | undefined;
  let projectRoots = new Map<string, readonly string[]>();
  /** Connections parked until main's `agentHost` frame lands. @see serveAgentHost */
  const agentHostConfigWaiters = new Set<() => void>();
  let internalAuthorityStopped: Promise<void> | undefined;
  /* V7: the utility's own MCP surface. One loopback listener for the whole
   * utility — mounted *inside* the `agentHost` concern rather than as a member
   * of `servicesConcerns`, because it faces the adapter child over HTTP, not
   * the renderer over a `MessagePortMain` (VI6). One endpoint per workspace
   * root beneath it, each on its own route, because the tool registry it
   * dispatches into is per root and one desktop app opens many projects: the
   * route belongs to the root's actor, and each host it opens mounts its own. */
  const mcpEndpoints = new Map<string, HostMcpEndpoint>();
  let mcpServer: Server | undefined;
  let mcpOrigin = '';

  /** Bind the utility's single loopback listener, once. */
  const listenForMcp = (): void => {
    if (mcpServer) {
      return;
    }
    const server = createServer((request, response) => {
      const endpoint = mcpEndpoints.get(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      if (!endpoint) {
        response.writeHead(404).end();
        return;
      }
      /* async-iife: bootstrap. The endpoint owns its own refusals; a throw here
       * would take the whole services utility down over one adapter's frame. */
      const answer = async (): Promise<void> => {
        try {
          await endpoint.handle(request, response);
        } catch (error) {
          log('mcp.failed', {
            message: error instanceof Error ? error.message : String(error),
          });
          if (!response.headersSent) {
            response.writeHead(500, { 'content-type': 'application/json' });
          }
          response.end();
        }
      };
      void answer();
    });
    mcpServer = server;
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      mcpOrigin = typeof address === 'object' && address !== null ? `http://127.0.0.1:${String(address.port)}` : '';
      log('mcp-listening', { origin: mcpOrigin });
    });
  };

  /* Physical spellings on both sides, the comparison main's own registry makes
   * (`project-roots.ts`). Main names a project by its realpath when it mints
   * the kernel's filesystem port while the grant holds the spelling the person
   * picked, and under `$TMPDIR` those differ by `/private`. */
  const isTrustedRoot = (root: string): boolean => {
    if (!isAbsolute(root)) {
      return false;
    }
    const candidate = canonicalPath(root);
    /* Descendants are admitted because projects live inside Home
     * (`userData/home/<project>`); the `sep` suffix keeps `…/home-evil` from
     * matching `…/home`. */
    return [...trustedRoots].some((trusted) => candidate === trusted || candidate.startsWith(trusted + sep));
  };

  const isInternalRoot = (root: string): boolean => {
    if (isTrustedRoot(root)) {
      return true;
    }
    const candidate = canonicalPath(root);
    /* Candidate checkouts are recorded by `resolve()` below, so they are
     * canonicalised here rather than at admission. */
    return [...candidateRoots].some(([admitted]) => {
      const trusted = canonicalPath(admitted);
      return candidate === trusted || candidate.startsWith(trusted + sep);
    });
  };

  const internalPorts = authority === undefined ? undefined : new MessageChannel();
  const stopInternalAuthority =
    authority === undefined || internalPorts === undefined
      ? undefined
      : /* The reserved layout every provider this host opens enforces, so a
         * symlink inside a checkout cannot resolve onto the control plane (G0-6). */
        serve(toNodeFsPort(internalPorts.port1), { allowRoot: isInternalRoot, authority, policy: tauPathPolicy });
  const internalChannel =
    internalPorts === undefined ? undefined : new NodeFsChannel(toNodeFsPort(internalPorts.port2));

  const providerForAgentRoot = (root: string): NodeFsProviderClient => {
    const canonicalRoot = resolve(root);
    if (!internalChannel || !isInternalRoot(canonicalRoot)) {
      throw Object.assign(new Error(`The desktop services host refused an unadmitted filesystem root: ${root}`), {
        code: 'EACCES',
      });
    }
    return new NodeFsProviderClient(internalChannel, canonicalRoot);
  };

  /**
   * The agent's view of one admitted root, for whatever executes project code.
   *
   * Typed as {@link HostToolFileSystem} for the same reason the tool registry is:
   * the client arms its watcher asynchronously, a shape `WatchableFileSystem`
   * does not describe, and a view composes over the provider's unwatched face
   * while the bridge keeps serving the client's own watch.
   */
  const executorViewFor = (root: string) => {
    const checkout: HostToolFileSystem = providerForAgentRoot(root);
    return composeView({ filesystem: checkout }, { consumer: 'agent', policy: tauPathPolicy });
  };

  // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the repeated-stop contract.
  const stopAuthority = (): Promise<void> => {
    internalAuthorityStopped ??= (async (): Promise<void> => {
      await stopInternalAuthority?.();
      internalChannel?.close();
      internalPorts?.port1.close();
      internalPorts?.port2.close();
    })();
    return internalAuthorityStopped;
  };

  /**
   * The folders directly inside `directory`, skipping dot folders such as
   * `.tau`; none when it is missing or no longer admitted.
   *
   * @param directory - An absolute directory under an admitted root.
   * @returns Their absolute paths.
   */
  const childDirectories = async (directory: string): Promise<string[]> => {
    try {
      const entries = await providerForAgentRoot(directory).readdirWithStats('');
      return entries
        .filter((entry) => entry.type === 'dir' && !entry.name.startsWith('.'))
        .map((entry) => join(directory, entry.name));
    } catch {
      return [];
    }
  };

  /**
   * Find every project the admitted roots hold, by the `tau.json` id of each
   * immediate child, and keep the answer for the next lookup.
   *
   * @returns Project roots by id; an id two folders share names both.
   */
  const scanProjectRoots = async (): Promise<ReadonlyMap<string, readonly string[]>> => {
    const children = await Promise.all([...trustedRoots].map(async (root) => childDirectories(root)));
    const found = new Map<string, string[]>();
    for (const [root, id] of await Promise.all(
      children.flat().map(async (root) => [root, await readProjectId(providerForAgentRoot(root))] as const),
    )) {
      if (id !== undefined) {
        found.set(id, [...(found.get(id) ?? []), root]);
      }
    }
    projectRoots = found;
    return found;
  };

  /**
   * Read a job's file from the project it names: each of the
   * project's roots, then its checkouts under the workspace's
   * `.tau/checkouts/<projectId>`, where a candidate turn's slice lands. Every
   * read goes through the internal authority, which refuses an unadmitted root.
   *
   * @param artifact - The request's reference.
   * @param roots - The project's roots.
   * @returns The first file whose digest matches, or `undefined`.
   */
  const readProjectArtifact = async (
    artifact: MachineArtifactReference,
    roots: readonly string[],
  ): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    const checkouts = await Promise.all(
      roots.map(async (root) => childDirectories(join(dirname(root), '.tau', 'checkouts', artifact.projectId))),
    );
    for (const candidate of [...roots, ...checkouts.flat()]) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- the project first, then its checkouts; the first digest match wins.
        const bytes = await providerForAgentRoot(candidate).readFile(artifact.path);
        if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` === artifact.digest) {
          return bytes;
        }
      } catch {
        /* Not in this tree. */
      }
    }
    return undefined;
  };

  const openMachineHost = async (storeRoot: string): Promise<MachineHostServices> => {
    const identity = await openMachineHostIdentity(storeRoot);
    const admission = createHostAdmissionAuthority({ hostId: identity.hostId });
    /* Main's allowlist forwards `TAU_SECRET_VAULT`, so automated runs keep
     * codes out of the person's keychain. Codes saved before the vault stay
     * readable from this directory's `secrets.json`. */
    const vault = openSecretVault({ directory: storeRoot, env: process.env });
    const secrets = createMachineSecretStore({ vault, legacyDirectory: storeRoot });
    log('machines.vault', { kind: vault.kind });
    const host = await createNodeMachineHost({
      storeRoot,
      ...(legacyMachinesDirectory === undefined ? {} : { legacyStoreRoots: [legacyMachinesDirectory] }),
      ...identity,
      admission,
      providers: [
        bambuMachine(),
        bambuA1MiniMachine(),
        bambuSimulatorMachine(),
        bambuA1MiniSimulatorMachine(),
        // ponytail: no native serial driver yet, so the real Grbl provider discovers nothing; add `serialport` here.
        grblMachine(),
        grblSimulatorMachine(),
        carveraMachine(),
        carveraSimulatorMachine(),
      ],
      runtime: createNodeMachineRuntime({
        secrets,
        /* The last scan's roots first; a miss, or roots that no longer hold
         * the file, rescans once, since projects appear, move and go. */
        readArtifact: async (artifact) => {
          const cached = projectRoots.get(artifact.projectId);
          let bytes = cached === undefined ? undefined : await readProjectArtifact(artifact, cached);
          if (bytes === undefined) {
            const scanned = await scanProjectRoots();
            bytes = await readProjectArtifact(artifact, scanned.get(artifact.projectId) ?? []);
          }
          if (bytes === undefined) {
            throw new Error('MACHINE_ARTIFACT_NOT_FOUND');
          }
          return bytes;
        },
        log: (entry) => {
          log('machines.provider', entry, entry.level === 'error' || entry.level === 'warning' ? 'warn' : undefined);
        },
      }),
      onError: (error) => {
        log('machines.error', error instanceof Error ? error.message : String(error), 'warn');
      },
    });
    log('machine-host-opened', { hostId: identity.hostId });
    return { host, admission, identity, secrets };
  };

  // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the once-per-utility contract.
  const ensureMachineHost = (): Promise<MachineHostServices> => {
    if (machinesDirectory === undefined) {
      return Promise.reject(new Error('The desktop services host has no machine directory.'));
    }
    machineHost ??= (async (): Promise<MachineHostServices> => {
      try {
        return await openMachineHost(machinesDirectory);
      } catch (error) {
        /* A failed open is forgotten, so the next concern retries rather than
         * inheriting a rejection for the rest of the utility's life. */
        machineHost = undefined;
        throw error;
      }
    })();
    return machineHost;
  };

  const closeMachineHost = async (): Promise<void> => {
    const pending = machineHost;
    machineHost = undefined;
    if (pending === undefined) {
      return;
    }
    const { host } = await pending;
    await host.close();
    log('machine-host-closed');
  };

  /**
   * Answer a machines connection the store cannot serve: every call and stream
   * rejects with `reason`, so the renderer can say why, and the channel closes
   * a moment after its first refusal, so the next call dials again and retries
   * the store.
   *
   * ponytail: repeats the machines protocol's hello literal, which the client
   * checks; if that protocol's version moves, a refusal reads as a failed
   * handshake instead of its code.
   *
   * @param port - The utility's leg of main's `MessageChannelMain`.
   * @param reason - Why the store is unavailable; its `code`, when it has one, travels with it.
   */
  const refuseMachines = (port: UtilityPort, reason: Error): void => {
    let closing: ReturnType<typeof setTimeout> | undefined;
    const refusal = (): Error => {
      if (closing === undefined) {
        /* Long enough for calls made together to read the same refusal. */
        closing = setTimeout(() => {
          server.dispose(reason.message);
          port.close();
        }, 1000);
        closing.unref();
      }
      return reason;
    };
    const server = createChannelServer({
      port: wrapMessagePortMain(port),
      sessionKey: 'machines-refused',
      hello: { server: 'machines', protocolVersion: 2 },
      impl: {
        call: async () => {
          throw refusal();
        },
        listen: () => {
          throw refusal();
        },
      },
    });
  };

  /**
   * Bind one renderer or agent connection to the machine host over the transferred port.
   *
   * A machines connection names no project: printers belong to the store, and a
   * job names its own project. While another Tau app owns the store,
   * the connection is answered `MACHINE_STORE_OWNED_ELSEWHERE`.
   *
   * @param port - The utility's leg of main's `MessageChannelMain`.
   */
  const serveMachines = async (port: UtilityPort): Promise<void> => {
    let services: MachineHostServices;
    try {
      services = await ensureMachineHost();
    } catch (error) {
      const ownedElsewhere = (error as { readonly code?: unknown }).code === 'AUTHORITY_ALREADY_OWNED';
      const reason = error instanceof Error ? error.message : String(error);
      log('machines.unavailable', { reason: ownedElsewhere ? 'owned-elsewhere' : reason }, 'warn');
      if (quiescing || disposed) {
        port.close();
        return;
      }
      refuseMachines(
        port,
        ownedElsewhere
          ? Object.assign(new Error('MACHINE_STORE_OWNED_ELSEWHERE'), { code: 'MACHINE_STORE_OWNED_ELSEWHERE' })
          : new Error(reason),
      );
      return;
    }
    if (quiescing || disposed) {
      port.close();
      return;
    }
    const session = services.host.issueSession({ actor: { kind: 'user', id: 'desktop' }, grants: machineRouteGrants });
    /* `@taucad/rpc` reports the port's death to the channel server, which
     * closes itself; the session is revoked with it. */
    const channel = services.host.serve({ port: wrapMessagePortMain(port), session });
    channel.onClose(() => {
      services.admission.revoke(session);
    });
    log('machines-served');
  };

  /**
   * One runtime client per tree, project or turn checkout. A client that died
   * without its port closing — a render timeout shuts the wire from this side —
   * is replaced on its next use; closing one terminates it.
   */
  const runtimeClients = keyedResource<string, DesktopClient>(
    async (root) => {
      if (!requestRuntimePort || agentHostConfig === undefined) {
        throw new Error('The desktop services host has no main runtime-port broker.');
      }
      const { tauApiUrl, tauWebSocketUrl } = agentHostConfig;
      const runtimeLease = await requestRuntimePort(root);
      /* No terminate on the port's `close`: the transport holds that close for
       * main's exit relay so the client can report the exit code and stderr,
       * and it releases the lease on its own way out. */
      return createRuntimeClient<DesktopRuntime>({
        transport: electronUtilityMainTransport({ port: runtimeLease.port, release: runtimeLease.release }),
        config: { tauApiUrl, tauWebSocketUrl },
      });
    },
    (client) => {
      client.terminate();
    },
    (client) => client.lifecycleState !== 'terminated',
  );
  /* A client close is a synchronous terminate; this only reports the rare failure. */
  const closeRuntimeClients = (close: () => Promise<void>): void => {
    // async-iife: bootstrap -- the callers release synchronously; the close owes them no answer.
    void (async (): Promise<void> => {
      try {
        await close();
      } catch (error) {
        log('runtime-client-close-failed', error instanceof Error ? error.message : String(error));
      }
    })();
  };

  /**
   * Admit a turn checkout's root for one holder (a run or a revision capture).
   * The first admission registers it with main as a runtime context, because a
   * turn checkout is not a project; the last one releases that grant and
   * terminates its runtime client (V19).
   *
   * @param projectRoot - The project the checkout belongs to.
   * @returns The admission for {@link ProjectHostOptions.fileSystem}.
   */
  const admitCheckout =
    (projectRoot: string) =>
    (root: string): (() => void) => {
      const key = resolve(root);
      const held = candidateRoots.get(key) ?? 0;
      candidateRoots.set(key, held + 1);
      if (held === 0) {
        runtimeContext?.('register', root, projectRoot);
      }
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        const remaining = (candidateRoots.get(key) ?? 1) - 1;
        if (remaining > 0) {
          candidateRoots.set(key, remaining);
          return;
        }
        candidateRoots.delete(key);
        runtimeContext?.('release', root, projectRoot);
        closeRuntimeClients(async () => runtimeClients.close(root));
      };
    };

  /**
   * One project's host options, read each time its actor opens a host.
   *
   * @param workspaceRoot - The project root, canonical.
   * @param projectId - The renderer's project id.
   * @param route - The actor's MCP route.
   * @returns The options.
   */
  const projectHostOptions = (workspaceRoot: string, projectId: string, route: string): ProjectHostOptions => {
    const config = agentHostConfig;
    if (config === undefined || internalChannel === undefined || authority === undefined) {
      throw new Error('The desktop agent host has no configuration or filesystem authority.');
    }
    return {
      workspaceRoot,
      /* The renderer's project id is the project's `tau.json` id: every slice
       * `request_job` records names it, and the artifact reader finds the
       * project by it. */
      projectId,
      /* Desktop projects are immediate children of their connected workspace.
       * Keep linked worktrees in that workspace's private area, which is the
       * physical location `/checkouts/<id>` already mounts. */
      checkoutsDirectory: join(dirname(workspaceRoot), '.tau', 'checkouts', projectId),
      ...(gitExecutable === undefined ? {} : { gitExecutable }),
      fileSystem: {
        open: providerForAgentRoot,
        admit: admitCheckout(workspaceRoot),
        mutate: async (target, mutation) =>
          authority.run({ root: target.parentRoot, paths: [target.targetPath] }, mutation),
      },
      /* Rooted per run, exactly as the daemon does it: a candidate turn's kernel
       * and GeoSpec tools read the checkout its file tools write. */
      runtimeClient: async (root) => runtimeClients.get(root),
      geospecRunner: async (root) => {
        if (!requestGeometryPort) {
          throw new Error('The desktop services host has no isolated geometry runner broker.');
        }
        const port = await requestGeometryPort(root);
        return createGeometryRunnerClient(port);
      },
      systemSkillBundles,
      apiBaseUrl: config.tauApiUrl,
      syncTelemetryPlacement: 'desktop',
      tauCredential: () => {
        const token = authToken;
        return token === undefined ? undefined : { apiBaseUrl: config.tauApiUrl, authorization: `Bearer ${token}` };
      },
      systemPrompt: config.systemPrompt,
      /* The build defines this; a missing define must fail loudly rather than
       * quietly running a Cloud build on the self-host transport. The bearer is
       * resolved per request, never captured: main refreshes it. The project id
       * is the renderer's, which `GET /v1/projects` lists, so every receipt
       * attributes to a project the usage page can name. */
      modelTransport: (tauCloudBuildEnabled ? createTauCloudGatewayModelTransport : createGatewayModelTransport)({
        baseUrl: config.gatewayBaseUrl,
        projectId,
        auth: () => authToken,
        /* The funded build names the account an attempt charges (GI-Q6); the self-host transport ignores it. */
        principal: () => sessionPrincipal,
      }),
      /* The desktop rides the signed-in session (RH-R13), naming its account so a resume refuses another's
       * attempt (GI-Q6). Read per admission: main re-sends both on every sign-in, refresh and sign-out. */
      credential: () => {
        const principal = sessionPrincipal;
        return principal === undefined ? { mode: 'session' } : { mode: 'session', principal };
      },
      ...(turnPlacement === undefined ? {} : { turnPlacement }),
      /* The adapters main resolved, with the `tau` MCP server on this utility's
       * own loopback listener (V7); the port is known once the socket binds. */
      ...(config.externalAgents?.length
        ? {
            externalAgents: {
              agents: config.externalAgents,
              mcpUrl: () => (mcpOrigin === '' ? '' : `${mcpOrigin}${route}`),
            },
          }
        : {}),
      /* Reported, never fatal: the run is already durable in its own log, and a
       * window that stopped serving over a settlement failure would lose the
       * next turn too. */
      onRevisionEvent: (event) => {
        if (event.type === 'turn.finalized') {
          return;
        }
        if (event.type === 'revision.unavailable') {
          /* Not one turn's failure but this machine's: without `git` and
           * `git-lfs` the app records no history at all (OQ-B8). */
          log('agent-host.revisions-unavailable', { workspaceRoot, reason: event.reason, missing: event.missing });
          onRevisionsUnavailable?.(workspaceRoot, event);
          return;
        }
        log('agent-host.revision-not-recorded', { workspaceRoot, event: event.type });
      },
    };
  };

  const takeConnection = (connectionId: string): UtilityPort | undefined => {
    const port = connections.get(connectionId);
    connections.delete(connectionId);
    return port;
  };

  /**
   * The root's `projectHost` actor, started on the first connect.
   *
   * @param workspaceRoot - The project root, canonical.
   * @param projectId - The renderer's project id.
   * @returns The running actor.
   */
  const projectHostFor = (workspaceRoot: string, projectId: string): ProjectHostActor => {
    const existing = projectHosts.get(workspaceRoot);
    if (existing !== undefined) {
      return existing;
    }
    const route = `/mcp/${randomUUID()}`;
    /* The agent's own machines facet: served by this utility's machine host
     * over an in-process channel once it opens, on a session of its own beside
     * the window's. One per actor, so every host it opens offers the same one. */
    const machines = localMachineFacet(async (port) => serveMachines(port));
    let servedHost: ProjectHost | undefined;
    const actor = createProjectHostActor({
      root: workspaceRoot,
      host: () => ({ ...projectHostOptions(workspaceRoot, projectId, route), machines }),
      serve: (connectionId, host) => {
        const port = takeConnection(connectionId);
        if (port === undefined) {
          return;
        }
        if (host.mcp !== undefined) {
          mcpEndpoints.set(route, host.mcp);
        }
        /* The handle owns only this connection: `@taucad/rpc` reports the
         * port's death and closes the channel itself, and always-on lives in
         * the host, which deliberately survives. */
        serveAgentChannel(port, host.launcher, {
          build: packageVersion,
          sessionKey: agentSessionKey,
          revisions: host.revisions.channel,
        });
        log('agent-host-served', { workspaceRoot, reused: servedHost === host });
        servedHost = host;
      },
      refuse: (connectionId) => {
        takeConnection(connectionId)?.close();
      },
    });
    actor.on('released', ({ requestId, outcome, message }) => {
      const failure = outcome === 'failed' ? (message ?? 'The project host could not close.') : undefined;
      const shutdown = shutdowns.get(requestId);
      if (shutdown !== undefined) {
        shutdowns.delete(requestId);
        shutdown(failure);
        return;
      }
      if (failure === undefined) {
        agentHostReleased?.(requestId);
      } else {
        agentHostReleased?.(requestId, failure);
      }
    });
    /* Ended: the root's MCP route, its machines facet and every runtime client rooted beneath it go with it. */
    const retire = (): void => {
      if (projectHosts.get(workspaceRoot) === actor) {
        projectHosts.delete(workspaceRoot);
      }
      retiredProjectHosts.add(actor);
      const settleRetired = async (): Promise<void> => {
        await actor.settled();
        retiredProjectHosts.delete(actor);
      };
      // async-iife: bootstrap -- completion has no caller; quiesce and dispose also await this actor.
      void settleRetired();
      mcpEndpoints.delete(route);
      machines.close();
      const checkoutsRoot = resolve(join(dirname(workspaceRoot), '.tau', 'checkouts', projectId));
      for (const root of runtimeClients.keys()) {
        if (root === workspaceRoot || root === checkoutsRoot || root.startsWith(`${checkoutsRoot}${sep}`)) {
          closeRuntimeClients(async () => runtimeClients.close(root));
        }
      }
    };
    actor.subscribe({ complete: retire, error: retire });
    projectHosts.set(workspaceRoot, actor);
    actor.start();
    return actor;
  };

  /**
   * Close one root's host now, without draining (quit), and wait for its answer.
   *
   * @param actor - The root's actor.
   * @returns Once the host closed; rejects with its close failure.
   */
  const shutdownProjectHost = async (actor: ProjectHostActor): Promise<void> => {
    if (actor.getSnapshot().status !== 'active') {
      await actor.settled();
      return;
    }
    const requestId = `shutdown-${randomUUID()}`;
    const failure = await new Promise<string | undefined>((resolve) => {
      shutdowns.set(requestId, resolve);
      actor.send({ type: 'shutdown', requestId });
    });
    await actor.settled();
    if (failure !== undefined) {
      throw new Error(failure);
    }
  };

  const handleControlFrame = (frame: Record<string, unknown>): void => {
    switch (frame['type']) {
      case 'allowRoots': {
        trustedRoots.clear();
        for (const root of (frame['roots'] as readonly string[] | undefined) ?? []) {
          trustedRoots.add(canonicalPath(root));
        }
        log('roots-updated', { count: trustedRoots.size });
        return;
      }
      case 'authToken': {
        /* Held, not captured: main refreshes it on better-auth's 24 h
         * `updateAge`, and launcher 2's model transport reads it per request. */
        authToken = frame['token'] as string | undefined;
        sessionPrincipal =
          authToken !== undefined && typeof frame['principal'] === 'string' ? frame['principal'] : undefined;
        log('credential-updated', { present: authToken !== undefined });
        return;
      }
      case 'quiesce': {
        /* One round trip: main asks, every launcher closes (cut, then W13's
         * `awaitSyncSettled`), and only then does main let the process die.
         * Main owns the bound; this end never cuts its own wait short. */
        // async-iife: bootstrap -- a control frame has no caller to return to.
        void (async (): Promise<void> => {
          try {
            await quiesce();
            quiesced?.({ type: 'quiesced' });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log('quiesce-failed', message);
            quiesced?.({ type: 'quiesce-failed', message });
          }
        })();
        return;
      }
      case 'agentHost': {
        agentHostConfig = frame['config'] as AgentHostConfig;
        /* Bound here rather than at the first connection: the URL is only known
         * once the socket is, and this frame arrives before any renderer has a
         * port — so no turn can outrun the listener it will be offered. */
        if (agentHostConfig.externalAgents?.length) {
          listenForMcp();
        }
        log('agent-host-config-received', {
          gatewayBaseUrl: agentHostConfig.gatewayBaseUrl,
          /* The utility's own witness that main's discovery reached it: the
           * renderer draws its rows from a different copy of this answer. */
          externalAgents: (agentHostConfig.externalAgents ?? []).map((adapter) => adapter.id),
        });
        for (const waiting of agentHostConfigWaiters) {
          waiting();
        }
        return;
      }
      case 'machine-binding-complete': {
        /* The secret half of the ceremony, and the only frame that carries a
         * code: pinned from the endpoint the provider connects to, never the
         * `address` an older renderer still sends. */
        const { requestId, ceremonyId, accessCode } = frame;
        if (typeof requestId !== 'string' || typeof ceremonyId !== 'string') {
          return;
        }
        // async-iife: bootstrap -- a control frame has no caller to await the ceremony.
        void (async () => {
          try {
            const { host, secrets } = await ensureMachineHost();
            const outcome = await completeMachineBinding({
              host,
              secrets,
              ceremonyId,
              ...(typeof accessCode === 'string' ? { accessCode } : {}),
              onEvent: ({ type, providerId }) => {
                log(`machines.${type}`, { providerId }, type === 'rollback-failed' ? 'warn' : undefined);
              },
            });
            machineBindingCompleted?.(requestId, { outcome });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log('machines.binding-failed', message, 'warn');
            machineBindingCompleted?.(requestId, { error: message });
          }
        })();
        return;
      }
      case 'agent-host-release': {
        const { attachmentGeneration, requestId, workspaceRoot: root } = frame;
        if (typeof requestId !== 'string' || typeof root !== 'string') {
          return;
        }
        /* The root's actor answers through `released`: it drains the host, or
         * answers a release of an older generation as stale (I31). */
        const actor = projectHosts.get(canonicalPath(root));
        if (actor === undefined) {
          agentHostReleased?.(requestId);
          return;
        }
        actor.send({
          type: 'release',
          gen: typeof attachmentGeneration === 'number' ? attachmentGeneration : null,
          requestId,
        });
        return;
      }
      default: {
        log('unknown-control-frame', { type: frame['type'] });
      }
    }
  };

  /**
   * Park until main's `agentHost` frame lands, or until the bound expires.
   *
   * @returns Nothing; the caller re-reads {@link agentHostConfig}.
   */
  const awaitAgentHostConfig = async (): Promise<void> =>
    new Promise((resolve) => {
      const release = (): void => {
        clearTimeout(configExpiry);
        agentHostConfigWaiters.delete(release);
        resolve();
      };
      const configExpiry = setTimeout(release, agentHostConfigTimeout);
      agentHostConfigWaiters.add(release);
    });

  /**
   * Bind one renderer connection to launcher 2 over the transferred port.
   *
   * @param port - The utility's leg of main's `MessageChannelMain`.
   * @param context - The connection's context; `workspaceRoot` scopes the launcher.
   */
  const serveAgentHost = async (port: UtilityPort, context: Record<string, unknown> | undefined): Promise<void> => {
    const requested = context?.['workspaceRoot'];
    /* Main already refused an ungranted root before minting the port; this is
     * the utility's own copy of the same check, because the utility is the
     * process that actually opens the files. */
    if (typeof requested !== 'string' || !isTrustedRoot(requested)) {
      log('agent-host.untrusted-root', { workspaceRoot: requested });
      port.close();
      return;
    }
    if (agentHostConfig === undefined) {
      /* Main does not await its external-agent discovery (D17), so the window
       * boots beside it and can ask for this port a second before the
       * `agentHost` frame arrives. Closing that port answered a request that
       * was early, not wrong: the renderer's channel client reads a remote
       * close as a dead host, and the project entered an error state it never
       * left. Park instead, and refuse only a host nobody ever configured. */
      await awaitAgentHostConfig();
    }
    if (agentHostConfig === undefined) {
      log('agent-host.not-configured', { workspaceRoot: requested });
      port.close();
      return;
    }
    const projectId = context?.['projectId'];
    if (typeof projectId !== 'string' || projectId === '') {
      log('agent-host.invalid-project-id', { projectId });
      port.close();
      return;
    }
    if (internalChannel === undefined) {
      /* The agent's tools, revisions and parameter actors all read through the
       * utility's one authority; production always has it. */
      log('agent-host.no-authority', { workspaceRoot: requested }, 'warn');
      port.close();
      return;
    }
    if (quiescing || disposed) {
      port.close();
      return;
    }
    /* The physical spelling, because main addresses this project by its
     * realpath when it releases it while the renderer holds the spelling the
     * person granted — under `$TMPDIR` those differ by `/private`, and an actor
     * filed under one of them is unreachable from the other. */
    const workspaceRoot = canonicalPath(requested);
    connectionCount += 1;
    const connectionId = `connection-${String(connectionCount)}`;
    connections.set(connectionId, port);
    const generation = Number(context?.['attachmentGeneration']);
    projectHostFor(workspaceRoot, projectId).send({
      type: 'connect',
      gen:
        context?.['attachmentGeneration'] !== undefined && Number.isSafeInteger(generation) && generation >= 0
          ? generation
          : null,
      connectionId,
    });
  };

  /**
   * Settle a batch of operations, collecting each failure.
   *
   * Quit closes every project host and waits for each one: the bytes on disk
   * are the person's, and the close revision is how they survive. `dispose()`
   * fires the same closes and waits for none, because it is the window going
   * away and nothing is left to record into.
   */
  const settleAll = async (operations: ReadonlyArray<Promise<unknown>>, failures: unknown[]): Promise<void> => {
    for (const outcome of await Promise.allSettled(operations)) {
      if (outcome.status === 'rejected') {
        failures.push(outcome.reason);
      }
    }
  };

  const beginQuiesce = async (): Promise<void> => {
    quiescing = true;
    const failures: unknown[] = [];
    const fileSystemDisposers = [...nodeFileSystemDisposers];
    const runtimeDisposers = [...runtimeFileSystemDisposers];
    const owned = [...projectHosts.values()];
    nodeFileSystemDisposers.clear();
    runtimeFileSystemDisposers.clear();
    await settleAll(
      [
        ...runtimeDisposers.map(async (disposeFileSystem) => disposeFileSystem.drain()),
        ...fileSystemDisposers.map(async (disposeFileSystem) => disposeFileSystem()),
      ],
      failures,
    );

    /* Per project: each host's close revision has to land, without a drain —
     * quit ends the utility, and the next start reconciles (D10). The runtime
     * clients and MCP routes rooted beneath it are released with it. */
    const closingHosts = owned.map(async (actor) => shutdownProjectHost(actor));
    await settleAll(closingHosts, failures);
    await settleAll(
      [...retiredProjectHosts].map(async (actor) => actor.settled()),
      failures,
    );
    /* After the hosts: a print in flight is the host's own journaled
     * effect, and closing drains its queue before the writer lock is released. */
    await settleAll([closeMachineHost()], failures);
    await settleAll([stopAuthority()], failures);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'The services host could not quiesce every accepted operation.');
    }
    log('quiesced', { projects: closingHosts.length });
  };

  // Deliberately non-async: every caller observes the same close settlement.
  // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the repeated-close contract.
  const quiesce = (): Promise<void> => {
    quiescence ??= disposed
      ? Promise.reject(new Error('The services host was forcibly disposed before graceful quiescence.'))
      : beginQuiesce();
    return quiescence;
  };

  const reportForcedFileSystemDisposal = async (disposeFileSystem: () => Promise<void>): Promise<void> => {
    try {
      await disposeFileSystem();
    } catch (error) {
      log('node-fs-dispose-failed', error instanceof Error ? error.message : String(error));
    }
  };

  const closeForDispose = async (actor: ProjectHostActor): Promise<void> => {
    try {
      await shutdownProjectHost(actor);
    } catch (error) {
      log('dispose-close-failed', error instanceof Error ? error.message : String(error));
    }
  };

  return {
    isTrustedRoot,
    agentHostConfig: () => agentHostConfig,
    quiesce,
    dispose() {
      disposed = true;
      quiescing = true;
      const gracefulSettlement = quiescence;
      const runtimeDisposers = [...runtimeFileSystemDisposers];
      runtimeFileSystemDisposers.clear();
      const closingFileSystems: Array<Promise<void>> = [];
      for (const disposeFileSystem of runtimeDisposers) {
        try {
          disposeFileSystem.force();
        } catch (error) {
          log('runtime-fs-dispose-failed', error instanceof Error ? error.message : String(error));
        }
      }
      /* Each project host owns a revision actor tree over a served root, and a
       * disposed utility must stop writing into a project it no longer serves.
       * Tracked rather than fire-and-forget: the internal authority has to stay
       * up until these closes finish. */
      const closingLaunchers = [...projectHosts.values()].map(async (actor) => closeForDispose(actor));
      for (const port of connections.values()) {
        port.close();
      }
      connections.clear();
      const closingMachines = (async (): Promise<void> => {
        try {
          await closeMachineHost();
        } catch (error) {
          log('machine-host-close-failed', error instanceof Error ? error.message : String(error));
        }
      })();
      for (const disposeFileSystem of nodeFileSystemDisposers) {
        closingFileSystems.push(reportForcedFileSystemDisposal(disposeFileSystem));
      }
      nodeFileSystemDisposers.clear();
      /* Each host closes its own MCP endpoint; only the routes and the listener are this utility's. */
      mcpEndpoints.clear();
      mcpServer?.close();
      mcpServer = undefined;
      mcpOrigin = '';
      closeRuntimeClients(async () => runtimeClients.closeAll());
      /** Keep the internal authority alive through every final revision write. */
      const settleForcedCleanup = async (): Promise<void> => {
        await Promise.allSettled(
          gracefulSettlement === undefined
            ? [...closingFileSystems, ...closingLaunchers, closingMachines]
            : [gracefulSettlement, ...closingFileSystems, ...closingLaunchers, closingMachines],
        );
        await Promise.allSettled([...retiredProjectHosts].map(async (actor) => actor.settled()));
        try {
          await stopAuthority();
        } catch (error) {
          log('node-fs-dispose-failed', error instanceof Error ? error.message : String(error));
        }
      };
      void settleForcedCleanup();
    },
    handleMessage(message) {
      const frame = message.data;
      if (frame === null || typeof frame !== 'object') {
        return;
      }
      const record = frame as Record<string, unknown>;
      if (record['type'] !== 'concern') {
        handleControlFrame(record);
        return;
      }
      const [port] = message.ports;
      if (!port) {
        log('concern-without-port', { concern: record['concern'] });
        return;
      }
      if (quiescing || disposed) {
        log('concern-refused-during-quiesce', { concern: record['concern'] });
        port.close();
        return;
      }
      const context = record['context'] as Record<string, unknown> | undefined;
      switch (record['concern']) {
        case 'nodeFs': {
          const stop = serve(toNodeFsPort(port), {
            allowRoot: isTrustedRoot,
            policy: tauPathPolicy,
            ...(authority ? { authority } : {}),
          });
          let stopped: Promise<void> | undefined;
          // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the repeated-close contract.
          const disposeFileSystem = (): Promise<void> => {
            stopped ??= (async (): Promise<void> => {
              try {
                await stop();
              } finally {
                port.close();
                nodeFileSystemDisposers.delete(disposeFileSystem);
              }
            })();
            return stopped;
          };
          nodeFileSystemDisposers.add(disposeFileSystem);
          const disposeDisconnectedFileSystem = async (): Promise<void> => {
            try {
              await disposeFileSystem();
              log('node-fs-disconnected');
            } catch (error) {
              log('node-fs-dispose-failed', error instanceof Error ? error.message : String(error));
            }
          };
          port.on('close', () => {
            if (disposed) {
              return;
            }
            // async-iife: bootstrap -- the retained disposer lets quiesce await this remote-close cleanup.
            void disposeDisconnectedFileSystem();
          });
          port.start();
          log('node-fs-served');
          return;
        }
        case 'runtimeFileSystem': {
          const requested = context?.['workspaceRoot'];
          if (typeof requested !== 'string' || !isInternalRoot(requested) || internalChannel === undefined) {
            /* Warn, not info: the kernel utility answers a refused filesystem
             * handshake by closing every port it received, and all the agent
             * ever reads is that its runtime died. */
            log('runtime-fs.untrusted-root', { workspaceRoot: requested }, 'warn');
            port.close();
            return;
          }
          /* The kernel utility executes project code the agent wrote, so it reads
           * the agent's view of the checkout and never the working copy: the
           * control plane is absent from it and the records Tau keeps itself are
           * read-only (invariant CI1, W14). */
          const lifecycle = drainingRuntimeFileSystem(executorViewFor(requested));
          const server = serveRuntimeFileSystem(lifecycle.handlers, port);
          let stopped: Promise<void> | undefined;
          const stopRuntimeFileSystem = async (): Promise<void> => {
            lifecycle.stopAdmission();
            await lifecycle.drain();
            server.dispose();
            runtimeFileSystemDisposers.delete(disposer);
          };
          const drain = async (): Promise<void> => {
            stopped ??= stopRuntimeFileSystem();
            await stopped;
          };
          const disposer: RuntimeFileSystemDisposer = {
            drain,
            force(): void {
              lifecycle.stopAdmission();
              server.dispose();
              runtimeFileSystemDisposers.delete(disposer);
            },
          };
          runtimeFileSystemDisposers.add(disposer);
          port.on('close', () => {
            try {
              disposer.force();
            } catch (error) {
              log('runtime-fs-dispose-failed', error instanceof Error ? error.message : String(error));
            }
          });
          log('runtime-fs-served', { workspaceRoot: resolve(requested) });
          return;
        }
        case 'agentHost': {
          // async-iife: bootstrap -- a port that outran main's config frame
          // parks inside; a control frame has no caller to return to.
          void serveAgentHost(port, context);
          return;
        }
        case 'machines': {
          // async-iife: bootstrap -- the host opens on first use; a control frame has no caller to return to.
          void serveMachines(port);
          return;
        }
        default: {
          log('unknown-concern', { concern: record['concern'] });
          port.close();
        }
      }
    },
  };
};
