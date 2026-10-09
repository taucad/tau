import { createHash } from 'node:crypto';
import { mkdir, readdir, realpath } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MessageChannel } from 'node:worker_threads';

import { WebSocket } from 'ws';

import { createGatewayModelTransport, createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import type { AgentSessionModel } from '@taucad/agent-host';
import { credentialPrincipal } from '@taucad/agent-host/launcher';
import type { AgentLauncher, CredentialState } from '@taucad/agent-host/launcher';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createRuntimeClient } from '@taucad/runtime';
import { createHostAdmissionAuthority } from '@taucad/runtime/host';
import type { HostAdmissionAuthority } from '@taucad/runtime/host';
import { createNodeMachineHost } from '@taucad/runtime/host/node';
import type { CreateNodeMachineHostInput, NodeMachineHost } from '@taucad/runtime/host/node';
import { createFileSystemBridgePort, fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import type { ComputeBinding, ComputeStoreControl } from '@taucad/runtime/types';

import { startAgentServer } from '#agent-server.js';
import type { AgentServerHandle, AgentServerOptions } from '#agent-server.js';
import { discoverAcpAgents, externalAgentDescriptors } from '#acp/index.js';
import { chatToReport, startRunReporter } from '#run-reporter.js';
import type { RunReporter } from '#run-reporter.js';
import type { HostSystemSkillBundle, HostToolFileSystem } from '#agent-tools.js';
import { hostControlInboundSchema, pairingResponseSchema, pairingTokenResponseSchema } from '#host.schemas.js';
import type { HostControlInbound, HostControlOutbound } from '#host.schemas.js';
import {
  defaultConfigDirectory,
  readHostCredential,
  removeHostCredential,
  writeHostCredential,
} from '#credential-store.js';
import type { HostCredential } from '#credential-store.js';
import {
  createMachineSecretStore,
  createNodeMachineRuntime,
  localMachineFacet,
  machineAgentGrants,
  machineRouteGrants,
  openMachineHostIdentity,
  readProjectId,
} from '#machine-host.js';
import type { CreateNodeMachineRuntimeOptions } from '#machine-host.js';
import { openSecretVault } from '#secret-vault.js';
import { spliceFrameSockets } from '#frame-splice.js';
import type { FrameSpliceCloseResult, FrameSpliceHandle } from '#frame-splice.js';
import type { HostJobWorkerFactory, HostJobWorkerHandle } from '#job-worker.js';
import { keyedResource } from '#keyed-resource.js';
import { createProjectHost } from '#project-host.js';
import type { ProjectHost } from '#project-host.js';
import { startRuntimeChild } from '#runtime-child-supervisor.js';
import type { RuntimeChildHandle } from '#runtime-child-supervisor.js';

/** Milliseconds. */
const socketOpenTimeout = 15_000;
/** Milliseconds. */
const reconnectDelayMaximum = 30_000;
/**
 * Milliseconds a control connection must stay open before its close resets the
 * reconnect backoff. A server that keeps accepting and then closing (a replica
 * failing every control frame) would otherwise be redialled about once a second
 * forever; a connection that lived this long closed for a reason worth an
 * immediate reconnect, such as a deploy.
 */
const stableControlConnection = 30_000;
/** Milliseconds allowed for a child exit to explain its closing loopback routes. */
const childExitAttributionGrace = 50;

/**
 * Why a relayed session ended.
 *
 * `ROUTE_UNUSED` is its own outcome rather than a flavour of `RELAY_CLOSED`:
 * the relay reaps a route whose browser peer never connected, and a session
 * every one of whose routes died that way was minted and never dialled — which
 * is not the same event as the relay dropping a live wire.
 *
 * @public
 */
export type HostSessionCloseCode = 'CHILD_EXIT' | 'RELAY_CLOSED' | 'REVOKED' | 'ROUTE_UNUSED';

/** Events emitted by a running Tau Host daemon. @public */
export type HostDaemonEvent =
  | {
      readonly type: 'pairing';
      readonly userCode: string;
      readonly verificationUri: string;
      readonly expiresAt: string;
    }
  | { readonly type: 'control'; readonly state: 'connecting' | 'connected' | 'disconnected' }
  | {
      readonly type: 'session';
      readonly sessionId: string;
      readonly state: 'connecting' | 'connected' | 'disconnected';
      readonly code?: HostSessionCloseCode;
    }
  | {
      readonly type: 'jobs';
      readonly state: 'starting' | 'ready' | 'draining' | 'stopped';
      readonly runnerId?: string;
      readonly slots?: number;
      readonly capabilities?: Readonly<Record<string, boolean | number | string>>;
      readonly profiles?: readonly string[];
    }
  | {
      readonly type: 'agent';
      readonly state: 'ready' | 'stopped';
      /** Origin the agent channel — and any served UI — answers on. */
      readonly url?: string;
      /**
       * Every external ACP agent this daemon knows about (W4-ACP), as the one
       * canonical descriptor (VSC1): the startable ones carry their probed
       * model list, and one that could not be started carries its refusal code
       * instead of vanishing.
       */
      readonly externalAgents?: readonly ExternalAgentDescriptor[];
    }
  | {
      readonly type: 'warning';
      readonly code:
        | 'JOB_WORKER_FAILED'
        | 'TRUSTED_PROJECTS_ONLY'
        | 'AGENT_SERVER_FAILED'
        /* The machine host or one of its providers reported a problem; the
         * route keeps serving and the person sees it in the directory. */
        | 'MACHINE_HOST'
        | 'MACHINE_PROVIDER'
        /* Another Tau app holds the per-user machine store's writer lock, so
         * this host serves without machines rather than exiting. */
        | 'MACHINE_STORE_OWNED_ELSEWHERE'
        /* Retriable, never fatal: the compute child backs the relay sessions and
         * the geometry tools, and nothing else. The agent channel and its file
         * tools keep serving while the loop retries the child. */
        | 'RUNTIME_CHILD_FAILED'
        /* The turn ran and is durable in its own log; only its revision is
         * missing (V17). Retriable in the sense that the next turn records. */
        | 'REVISION_NOT_RECORDED'
        | 'REVISION_UNAVAILABLE'
        /* Housekeeping, reported because it deletes: turn workspaces a previous
         * host left behind were removed at start (V19, SR4). */
        | 'TURN_WORKSPACES_SWEPT';
      readonly message: string;
    };

/**
 * Launcher-1 configuration: the daemon's own agent-host capability.
 *
 * Present, the daemon serves `${pathPrefix}/agent` on a loopback port of its
 * own — a third channel concern beside the runtime child's `/runtime` and
 * `/fs`, never multiplexed onto either — and answers the T0 event-log
 * vocabulary there. Absent, `tau serve` stays the remote-compute daemon it was.
 *
 * @public
 */
export type HostDaemonAgentOptions = {
  /** Enables Tau-funded operation binding for a managed Cloud host. */
  readonly tauCloudEnabled?: boolean | undefined;
  /** Absolute workspace root; `.tau/chats/<chatId>/events.jsonl` lives under it. */
  readonly workspaceRoot: string;
  /** Host-admitted compute binding shared by direct and candidate execution roots. */
  readonly compute?: ComputeBinding | (() => ComputeBinding);
  readonly computeControl?: ComputeStoreControl;
  /** Base the model gateway hangs off, e.g. the Tau API origin. */
  readonly gatewayBaseUrl: string;
  /**
   * Bearer session token this daemon backs its projects up with (C67).
   *
   * Absent, a served project still knows *where* its Tau Cloud repository is
   * and says so when a remote refuses it; present, *Connect Tau Cloud*
   * registers the project (P51) and its pushes authenticate. Never persisted
   * here and never written under a project.
   */
  readonly tauApiToken?: string | undefined;
  /** Default model row; one admission may override it. */
  readonly model: AgentSessionModel;
  /** Default system prompt; one admission may override it. */
  readonly systemPrompt: string;
  /**
   * Offer the `test_model` tool. Defaults to `true`, which still yields the
   * tool only where `@taucad/geospec-engine` resolves — `false` withholds it
   * from an installation that has the engine, so the surface is this host's
   * own decision rather than a resolution accident.
   */
  readonly testModel?: boolean | undefined;
  /** Channel admission secret; at least 32 characters. */
  readonly token: string;
  /** Human-readable name published on `/.well-known/tau-host`; defaults to the machine hostname. */
  readonly label?: string | undefined;
  /** Loopback port. Defaults to `0` (ephemeral). */
  readonly port?: number | undefined;
  /** Absolute directory of a prebuilt Tau UI served at `/` (serve mode). */
  readonly uiRoot?: string | undefined;
  /** Extra browser origins admitted on the upgrade; own origins always are. */
  readonly allowedOrigins?: readonly string[] | undefined;
  /**
   * External ACP agents (W4-ACP). Present, the daemon resolves its pinned
   * adapters from `resolveFrom`, probes their CLIs, advertises whatever
   * survives, and mounts the host-local MCP endpoint those agents call back
   * into. Absent, `tau serve` runs Tau's own agent only.
   */
  readonly externalAgents?: { readonly resolveFrom: string } | undefined;
  /**
   * Machine providers served on the `/machines` route (`tau serve --machines`).
   * Absent, the route answers 404 and a client's machines facet negotiates
   * `unsupported`. Printers live in the per-user machine store,
   * `<config>/machines`, which the desktop app opens too; while another Tau
   * app holds it, the daemon warns `MACHINE_STORE_OWNED_ELSEWHERE` and serves
   * without machines. Machine credentials resolve from the host's secret vault (the
   * macOS keychain, else that directory). The binding ceremony's native half
   * (the secret) has no daemon surface yet, so only providers that bind
   * without one — the simulator — complete here.
   */
  readonly machines?: { readonly providers: CreateNodeMachineHostInput['providers'] } | undefined;
};

/** Options for {@link startHostDaemon}. @public */
export type HostDaemonOptions = {
  readonly relayUrl: URL;
  readonly runtimeHost: { readonly modulePath: string; readonly args?: readonly string[] };
  /** Optional durable-job worker started after device pairing and drained during shutdown. */
  readonly jobWorker?: HostJobWorkerFactory;
  /** Optional agent-host capability (Launcher 1); omit to keep the daemon compute-only. */
  readonly agent?: HostDaemonAgentOptions;
  readonly maxSessions?: number;
  readonly onEvent?: (event: HostDaemonEvent) => void;
  /** Package-owned skills supplied by the embedding application. */
  readonly systemSkillBundles?: readonly HostSystemSkillBundle[];
  /**
   * Whether this daemon may pair interactively (default `true`).
   *
   * `false` for a provisioned cloud host (`tau serve --no-pair`, set by its
   * entrypoint): it was never paired, so a refused or missing credential means
   * it was revoked, and it exits rather than offering a pairing code from a
   * container that still holds a clone (D21).
   */
  readonly pair?: boolean;
};

/** Final daemon closure result. @public */
export type HostDaemonCloseResult =
  | { readonly cause: 'requested' }
  | { readonly cause: 'fatal'; readonly error: Error };

/** Lifecycle handle returned by {@link startHostDaemon}. @public */
export type HostDaemonHandle = {
  readonly ready: Promise<void>;
  readonly closed: Promise<HostDaemonCloseResult>;
  close(): Promise<void>;
};

class HostAuthenticationError extends Error {}

type ActiveSession = {
  readonly close: (code?: Exclude<HostSessionCloseCode, 'ROUTE_UNUSED'>) => void;
  readonly closed: Promise<void>;
  /** True once this session has lost a route or been asked to close. */
  isDraining: () => boolean;
};

type AgentFileSystemAuthority = Readonly<{
  channel: NodeFsChannel;
  /** Always admitted. */
  workspaceRoot: string;
  /** Candidate and linked checkout roots, by how many holders admitted each. */
  admissions: Map<string, number>;
  stopServer: () => Promise<void>;
}>;

/**
 * The relay's reap of a route no browser ever dialled.
 *
 * `host-frame-relay.ts` closes a peerless route with exactly this code and
 * reason after 15 s, and it is the only 1008 the host side of a route can
 * receive that does not mirror a browser's own close.
 *
 * @param result - How one splice ended.
 * @returns True when the relay reaped that route for want of a peer.
 */
const isPeerlessReap = (result: FrameSpliceCloseResult): boolean =>
  result.cause === 'peer-closed' && result.code === 1008 && result.reason === 'route peer did not connect';

/**
 * A route the API closed because this device is revoked: 4003, the code the
 * control socket also treats as final. (A host route is never closed 4401;
 * the API refuses a bad grant with 1008.)
 *
 * A browser can close with any 3000–4999 code and the relay mirrors it, so
 * this ends only the one session; device-wide finality stays with the control
 * socket, which only the API writes.
 *
 * @param result - How one splice ended.
 * @returns True when the route was closed for a revoked device.
 */
const isRevokedRoute = (result: FrameSpliceCloseResult): boolean =>
  result.cause === 'peer-closed' && result.code === 4003;

const asHttpUrl = (relayUrl: URL, path: string): URL => {
  const url = new URL(path, relayUrl);
  if (url.protocol === 'ws:') {
    url.protocol = 'http:';
  } else if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Tau Host relay URL must use https:, http:, wss:, or ws:.');
  }
  return url;
};

const asWebSocketUrl = (relayUrl: URL, path: string): URL => {
  const url = new URL(path, relayUrl);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new TypeError('Tau Host relay URL must use https:, http:, wss:, or ws:.');
  }
  return url;
};

const jsonRequest = async (url: URL, body: unknown, signal: AbortSignal): Promise<Response> =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

const pairDevice = async (
  relayUrl: URL,
  signal: AbortSignal,
  onEvent: (event: HostDaemonEvent) => void,
): Promise<HostCredential> => {
  const pairingResponse = await jsonRequest(
    asHttpUrl(relayUrl, '/v1/agents/pairings'),
    { deviceLabel: hostname() },
    signal,
  );
  if (!pairingResponse.ok) {
    throw new Error(`Tau Host pairing request failed with HTTP ${String(pairingResponse.status)}.`);
  }
  const pairing = pairingResponseSchema.parse(await pairingResponse.json());
  onEvent({
    type: 'pairing',
    userCode: pairing.userCode,
    verificationUri: pairing.verificationUri,
    expiresAt: pairing.expiresAt,
  });

  while (Date.now() < Date.parse(pairing.expiresAt)) {
    // oxlint-disable-next-line no-await-in-loop -- device-code polling is ordered and server-paced.
    await delay(pairing.pollInterval, undefined, { signal });
    // oxlint-disable-next-line no-await-in-loop -- each poll depends on the preceding server response.
    const tokenResponse = await jsonRequest(
      asHttpUrl(relayUrl, '/v1/agents/pairings/token'),
      { deviceCode: pairing.deviceCode },
      signal,
    );
    if (tokenResponse.status === 202) {
      continue;
    }
    if (!tokenResponse.ok) {
      throw new Error(`Tau Host pairing token exchange failed with HTTP ${String(tokenResponse.status)}.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- decode the response belonging to this ordered poll.
    const token = pairingTokenResponseSchema.parse(await tokenResponse.json());
    const credential: HostCredential = { v: 1, ...token };
    // oxlint-disable-next-line no-await-in-loop -- persist the accepted credential before returning it.
    await writeHostCredential(credential);
    return credential;
  }
  throw new Error('Tau Host pairing code expired before it was approved.');
};

const waitForOpen = async (socket: WebSocket): Promise<void> => {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }
  const opened = Promise.withResolvers<void>();
  const onOpen = (): void => {
    opened.resolve();
  };
  const onError = (error: Error): void => {
    opened.reject(error);
  };
  const onClose = (code: number): void => {
    opened.reject(new Error(`WebSocket closed before opening (${String(code)}).`));
  };
  socket.once('open', onOpen);
  socket.once('error', onError);
  socket.once('close', onClose);
  try {
    const timeout = async (): Promise<never> => {
      await delay(socketOpenTimeout, undefined, { ref: false });
      throw new Error('WebSocket did not open within 15 seconds.');
    };
    await Promise.race([opened.promise, timeout()]);
  } finally {
    socket.off('open', onOpen);
    socket.off('error', onError);
    socket.off('close', onClose);
  }
};

const authorizedSocket = (url: URL, credential: string): WebSocket =>
  new WebSocket(url, { headers: { authorization: `Bearer ${credential}` } });

const rawDataText = (raw: WebSocket.RawData): string => {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString('utf8');
  }
  return raw.toString('utf8');
};

const assertRelayRoute = (route: string, relayUrl: URL): URL => {
  const url = new URL(route);
  const expected = asWebSocketUrl(relayUrl, '/');
  if (url.protocol !== expected.protocol || url.host !== expected.host) {
    throw new Error('Tau Host refused a session route outside the configured relay origin.');
  }
  return url;
};

const localRoute = (childUrl: URL, route: 'runtime' | 'fs' | 'agent', sessionId: string): URL => {
  const base = new URL(childUrl);
  if (!base.pathname.endsWith('/')) {
    base.pathname += '/';
  }
  const url = new URL(route, base);
  url.searchParams.set('session', sessionId);
  return url;
};

/**
 * Start an outbound Tau Host daemon.
 *
 * @param options - Relay, runtime child, capacity, and event configuration.
 * @returns A lazy lifecycle handle; inspect `ready` and `closed` for outcomes.
 * @public
 *
 * @example <caption>Start and stop a host daemon</caption>
 * ```typescript
 * import { startHostDaemon } from '@taucad/host';
 *
 * const daemon = startHostDaemon({
 *   relayUrl: new URL('https://api.tau.new'),
 *   runtimeHost: { modulePath: '/opt/tau/host-runtime-child.mjs' },
 * });
 * await daemon.ready;
 * await daemon.close();
 * ```
 */
export const startHostDaemon = (options: HostDaemonOptions): HostDaemonHandle => {
  const maxSessions = options.maxSessions ?? 1;
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new TypeError('startHostDaemon: maxSessions must be a positive integer');
  }
  asWebSocketUrl(options.relayUrl, '/');

  const ready = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<HostDaemonCloseResult>();
  const shutdown = new AbortController();
  const sessions = new Map<string, ActiveSession>();
  let controlSocket: WebSocket | undefined;
  let runtimeChild: RuntimeChildHandle | undefined;
  let runtimeChildStart: Promise<RuntimeChildHandle> | undefined;
  let childObserver: Promise<void> | undefined;
  let jobWorker: HostJobWorkerHandle | undefined;
  let jobWorkerObserver: Promise<void> | undefined;
  let isClosing = false;
  let isReady = false;
  /*
   * RH-R13 / RH-S6: whether this daemon may admit a Tau run, read at every admission and by the gateway per request.
   * Pairing moves it to `paired`; a rejected device credential moves it to `unpaired` before the credential is
   * removed, so nothing is admitted on a revoked credential while the daemon re-pairs.
   */
  let credentialState: CredentialState = { mode: 'unpaired' };
  const pairedWith = (stored: HostCredential): void => {
    credentialState = {
      mode: 'paired',
      bearer: stored.credential,
      ...(stored.accountId === undefined ? {} : { principal: stored.accountId }),
    };
  };
  const bearer = (): string | undefined => (credentialState.mode === 'paired' ? credentialState.bearer : undefined);
  let agentProject: ProjectHost | undefined;
  let agentServer: AgentServerHandle | undefined;
  let agentExternalAgents: readonly ExternalAgentDescriptor[] = [];
  let agentRunReporter: RunReporter | undefined;
  let agentFileSystem: AgentFileSystemAuthority | undefined;
  let agentMachines: NonNullable<AgentServerOptions['machines']> | undefined;
  /* Close failures of a released candidate root's runtime, reported by the next `stopAgent`. */
  const agentRuntimeCloseFailures: unknown[] = [];

  const emit = (event: HostDaemonEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // Observability callbacks cannot own daemon lifecycle.
    }
  };

  const resolveReady = (): void => {
    if (!isReady) {
      isReady = true;
      ready.resolve();
    }
  };

  const closeSessions = (code: Exclude<HostSessionCloseCode, 'ROUTE_UNUSED'>): void => {
    for (const session of sessions.values()) {
      session.close(code);
    }
  };

  const isAgentRootAdmitted = (filesystem: AgentFileSystemAuthority, root: string): boolean =>
    root === filesystem.workspaceRoot || filesystem.admissions.has(root);

  const providerForAgentRoot = (workspaceRoot: string): NodeFsProviderClient => {
    const filesystem = agentFileSystem;
    if (!filesystem || !isAgentRootAdmitted(filesystem, workspaceRoot)) {
      throw Object.assign(new Error(`Tau Host refused an unadmitted agent filesystem root: ${workspaceRoot}`), {
        code: 'EACCES',
      });
    }
    return new NodeFsProviderClient(filesystem.channel, workspaceRoot);
  };

  /**
   * The agent's view of one admitted root, for whatever executes project code.
   *
   * Typed as {@link HostToolFileSystem} for the same reason the tool registry is:
   * the client arms its watcher asynchronously, a shape `WatchableFileSystem`
   * does not describe, and a view composes over the provider's unwatched face
   * while the bridge keeps serving the client's own watch.
   */
  const executorViewFor = (workspaceRoot: string) => {
    const checkout: HostToolFileSystem = providerForAgentRoot(workspaceRoot);
    return composeView({ filesystem: checkout }, { consumer: 'agent', policy: tauPathPolicy });
  };

  const ensureRuntimeChild = async (): Promise<RuntimeChildHandle> => {
    if (runtimeChild) {
      return runtimeChild;
    }
    const pending = runtimeChildStart ?? startRuntimeChild(options.runtimeHost);
    runtimeChildStart = pending;
    try {
      const child = await pending;
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- a concurrent waiter can assign the shared child while this await is suspended.
      if (!runtimeChild) {
        runtimeChild = child;
        childObserver = (async () => {
          await child.closed;
          if (runtimeChild === child) {
            runtimeChild = undefined;
            /* The geometry tools' client is bound to *this* child's loopback port.
             * Leaving it memoized outlives its child: the next child listens on a
             * new port while every tool keeps dialling the dead one, so a render
             * fails with a transport error that names nothing instead of the
             * supervisor's real reason. */
            // async-iife: bootstrap -- `stopAgent` awaits these closes through `agentRuntimes.closeAll`.
            void (async (): Promise<void> => {
              try {
                await agentRuntimes.closeAll();
              } catch (error) {
                agentRuntimeCloseFailures.push(error);
              }
            })();
            closeSessions('CHILD_EXIT');
          }
        })();
      }
      return child;
    } finally {
      if (runtimeChildStart === pending) {
        runtimeChildStart = undefined;
      }
    }
  };

  /**
   * The geometry tools' runtime client, one per root a turn works in: the child process is shared, but a candidate
   * turn works in its own checkout (V19), so each root needs its own client over the files that turn writes. A client
   * a wire failure terminated is replaced on its next use.
   */
  const agentRuntimes = keyedResource<string, ReturnType<typeof createRuntimeClient>>(
    async (workspaceRoot) => {
      let child: RuntimeChildHandle;
      try {
        child = await ensureRuntimeChild();
      } catch (error) {
        /* The geometry tools' typed refusal, not a bare supervisor error: a
         * daemon whose child is down still answers every file tool. The failed
         * creation leaves no entry, so the next tool call retries the child. */
        throw Object.assign(
          new Error(`This Tau Host has no runtime attached: ${error instanceof Error ? error.message : String(error)}`),
          { code: 'RUNTIME_UNAVAILABLE' },
        );
      }
      return createRuntimeClient({
        transport: webSocketTransport({
          url: child.url,
          /* The runtime child executes project code the agent wrote, so it reads
           * the agent's view of the checkout and never the working copy, which
           * only the parameter authority and the revisions engine hold
           * (invariant CI1, W14). */
          fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(executorViewFor(workspaceRoot))),
          createSocket: (url) =>
            new WebSocket(url, { headers: { authorization: `Bearer ${child.authorizationToken}` } }),
          ...(options.agent?.compute
            ? {
                compute: typeof options.agent.compute === 'function' ? options.agent.compute() : options.agent.compute,
              }
            : {}),
        }),
      });
    },
    async (client) => client.shutdown(),
    (client) => client.lifecycleState !== 'terminated',
  );

  /**
   * Admit a candidate or linked checkout's root until its release runs. The last release closes the root's runtime
   * client, and the root stays admitted until that close ends, because the client's shutdown still reads through it.
   *
   * @param filesystem - The agent's authority.
   * @param root - The checkout root.
   * @returns The release.
   */
  const admitAgentRoot = (filesystem: AgentFileSystemAuthority, root: string): (() => void) => {
    const { admissions } = filesystem;
    admissions.set(root, (admissions.get(root) ?? 0) + 1);
    const drop = (): void => {
      const remaining = (admissions.get(root) ?? 1) - 1;
      if (remaining === 0) {
        admissions.delete(root);
      } else {
        admissions.set(root, remaining);
      }
    };
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      if ((admissions.get(root) ?? 0) > 1 || !agentRuntimes.keys().includes(root)) {
        drop();
        return;
      }
      // async-iife: bootstrap -- the release is synchronous; `stopAgent` awaits the close through `agentRuntimes.closeAll`.
      void (async (): Promise<void> => {
        try {
          await agentRuntimes.close(root);
        } catch (error) {
          agentRuntimeCloseFailures.push(error);
        } finally {
          drop();
        }
      })();
    };
  };

  /**
   * Open the per-user machine store, `<config>/machines`: the one store the
   * desktop app and every other Tau host on this computer share.
   *
   * One identity beside it, the host's secret vault (`TAU_SECRET_VAULT`
   * overrides its kind), and one trusted session for the route and the tools.
   * While another Tau app holds the store's writer lock, this host warns and
   * serves without machines instead of exiting.
   *
   * @param providers - The providers `--machines` admitted.
   * @param readArtifact - Finds a job's file in the served project.
   * @returns What the agent server needs to answer the machines route, or `undefined` while the store is owned elsewhere.
   */
  const openMachineHost = async (
    providers: CreateNodeMachineHostInput['providers'],
    readArtifact: CreateNodeMachineRuntimeOptions['readArtifact'],
  ): Promise<
    (NonNullable<AgentServerOptions['machines']> & Readonly<{ admission: HostAdmissionAuthority }>) | undefined
  > => {
    const storeRoot = join(defaultConfigDirectory(), 'machines');
    const identity = await openMachineHostIdentity(storeRoot);
    const admission = createHostAdmissionAuthority({ hostId: identity.hostId });
    let host: NodeMachineHost;
    try {
      host = await createNodeMachineHost({
        storeRoot,
        ...identity,
        admission,
        providers,
        runtime: createNodeMachineRuntime({
          secrets: createMachineSecretStore({
            vault: openSecretVault({ directory: storeRoot, env: process.env }),
            legacyDirectory: storeRoot,
          }),
          readArtifact,
          log: (entry) => {
            if (entry.level === 'error' || entry.level === 'warning') {
              emit({ type: 'warning', code: 'MACHINE_PROVIDER', message: entry.message });
            }
          },
        }),
        onError: (error) => {
          emit({
            type: 'warning',
            code: 'MACHINE_HOST',
            message: error instanceof Error ? error.message : String(error),
          });
        },
      });
    } catch (error) {
      if ((error as { readonly code?: unknown }).code !== 'AUTHORITY_ALREADY_OWNED') {
        throw error;
      }
      emit({
        type: 'warning',
        code: 'MACHINE_STORE_OWNED_ELSEWHERE',
        message:
          'machines.unavailable (owned-elsewhere): printers are in use by another Tau app on this computer, so this host serves without them. Quit it and restart `tau serve --machines` to use them here.',
      });
      return undefined;
    }
    return {
      host,
      admission,
      session: host.issueSession({ actor: { kind: 'user', id: 'daemon' }, grants: machineRouteGrants }),
    };
  };

  /**
   * Bring up Launcher 1: the always-on agent host and its `/agent` channel.
   *
   * @param agent - Workspace, gateway, model, admission secret, and binding.
   */
  const startAgent = async (agent: HostDaemonAgentOptions): Promise<void> => {
    const canonicalWorkspaceRoot = await realpath(agent.workspaceRoot);
    const authorityRoot = join(
      defaultConfigDirectory(),
      'filesystem-authority',
      createHash('sha256').update(canonicalWorkspaceRoot).digest('hex'),
    );
    await mkdir(authorityRoot, { recursive: true, mode: 0o700 });
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      /* Candidate checkouts belong to this project's writer. A second daemon
       * over another workspace hashes to another stable authority directory. */
      authorityIdentity: () => canonicalWorkspaceRoot,
    });
    const ports = new MessageChannel();
    const filesystem: AgentFileSystemAuthority = {
      channel: new NodeFsChannel(toNodeFsPort(ports.port2)),
      workspaceRoot: agent.workspaceRoot,
      admissions: new Map(),
      stopServer: serveNodeFsProvider(toNodeFsPort(ports.port1), {
        authority,
        allowRoot: (root) => isAgentRootAdmitted(filesystem, root),
        /* A checkout on disk can hold a symlink, so an ordinary name may not
         * resolve into a path the views above hide (CI1). */
        policy: tauPathPolicy,
      }),
    };
    agentFileSystem = filesystem;
    /* Resolution *and* the CLI probe happen before the channel answers, because
     * the descriptor and the control `ready` frame both carry the list: a client
     * must never see an agent this machine cannot actually start. */
    const discovery = agent.externalAgents
      ? await discoverAcpAgents({ resolveFrom: agent.externalAgents.resolveFrom })
      : { agents: [], refused: [] };
    /* Named here rather than left to the revision port's default, because a
     * job's slice can sit in one of these checkouts: the machine
     * host's artifact reader looks in the same directory the port writes. */
    const checkoutsDirectory = join(defaultConfigDirectory(), 'checkouts', basename(agent.workspaceRoot));
    /* The served root is the project, and its `tau.json` id is what a job
     * names. A root without one prints nothing: no `request_job` is
     * offered, and every artifact is refused. */
    const projectId = await readProjectId(providerForAgentRoot(agent.workspaceRoot));
    /**
     * Find a job's file: only this project's, in the served root and
     * then its checkouts, where a candidate turn's slice lands. The digest
     * decides; a checkout is admitted only for the read.
     *
     * @param artifact - The job's reference.
     * @returns The first candidate's bytes whose digest matches.
     */
    const readArtifact: CreateNodeMachineRuntimeOptions['readArtifact'] = async (artifact) => {
      if (projectId === undefined || artifact.projectId !== projectId) {
        throw new Error('MACHINE_ARTIFACT_NOT_FOUND');
      }
      const checkoutRoots = await readdir(checkoutsDirectory, { withFileTypes: true }).then(
        (entries) =>
          entries.filter((entry) => entry.isDirectory()).map((entry) => join(checkoutsDirectory, entry.name)),
        () => [],
      );
      for (const root of [agent.workspaceRoot, ...checkoutRoots]) {
        const release = root === agent.workspaceRoot ? undefined : admitAgentRoot(filesystem, root);
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- the served root first; the first digest match wins.
          const bytes = await providerForAgentRoot(root).readFile(artifact.path);
          if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` === artifact.digest) {
            return bytes;
          }
        } catch {
          /* Not in this tree. */
        } finally {
          release?.();
        }
      }
      throw new Error('MACHINE_ARTIFACT_NOT_FOUND');
    };
    /* Before the tools: the machine tools are offered only over a facet the
     * host already serves, the same rule the revisions history follows. */
    const machines = agent.machines ? await openMachineHost(agent.machines.providers, readArtifact) : undefined;
    const project = createProjectHost({
      workspaceRoot: agent.workspaceRoot,
      checkoutsDirectory,
      ...(projectId === undefined ? {} : { projectId }),
      /* The agent's facet rides an agent session of its own, so the host applies the agent rules whatever a call
       * claims; the route's session stays the person's. */
      ...(machines
        ? {
            machines: localMachineFacet((port) => {
              const session = machines.host.issueSession({
                actor: { kind: 'agent', id: 'tau' },
                grants: machineAgentGrants,
              });
              const channel = machines.host.serve({ port, session });
              /* As the desktop does: the session lives only as long as its channel. */
              channel.onClose(() => {
                machines.admission.revoke(session);
              });
              return channel;
            }),
          }
        : {}),
      fileSystem: {
        open: providerForAgentRoot,
        admit: (root) => admitAgentRoot(filesystem, root),
        /* Native Git derives the physical worktree target before this callback.
         * Claiming its existing parent plus the absent/existing target excludes
         * ordinary candidate writes; Git keeps its own repository metadata
         * ordered with the same command while this daemon holds the writer. */
        mutate: async (target, mutation) =>
          authority.run({ root: target.parentRoot, paths: [target.targetPath] }, async () => mutation()),
      },
      /* Per root, not per host: a candidate turn's kernel must read the tree
       * that turn is writing, which is its checkout and not the project. */
      runtimeClient: async (root) => agentRuntimes.get(root),
      /*
       * Where this project's Tau Cloud repository is (C67, P51).
       *
       * The relay *is* the Tau API: it is the origin this daemon paired
       * against, and `tauRemoteUrl` hangs the Hosted Remote off it. Without
       * this the connect actor throws `INVALID_TRANSPORT` and a project served
       * by `tau serve --ui` shows the Sync region it can never use.
       */
      apiBaseUrl: options.relayUrl.origin,
      syncTelemetryPlacement: 'daemon',
      /* The session, not this daemon's device credential: the Git endpoints and
       * `PUT /v1/projects/<id>` authenticate an account, and a paired device
       * credential is only ever offered to the agent relay. A terminal has no
       * cookie jar, so it is the same `TAU_API_TOKEN` `tau publish` uses. */
      ...(agent.tauApiToken === undefined
        ? {}
        : {
            tauCredential: () => ({
              apiBaseUrl: options.relayUrl.origin,
              authorization: `Bearer ${agent.tauApiToken}`,
            }),
          }),
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      /* The bearer is read per request from the credential state, never captured: pairing replaces it. */
      modelTransport:
        agent.tauCloudEnabled === true
          ? createTauCloudGatewayModelTransport({
              baseUrl: agent.gatewayBaseUrl,
              model: agent.model,
              auth: bearer,
              principal: () => credentialPrincipal(credentialState),
              /* No `projectId`: a `tau serve` workspace is a directory, not a
               * cloud project, so its receipts name no project by design. */
            })
          : createGatewayModelTransport({ baseUrl: agent.gatewayBaseUrl, model: agent.model, auth: bearer }),
      credential: () => credentialState,
      ...(options.systemSkillBundles === undefined ? {} : { systemSkillBundles: options.systemSkillBundles }),
      /* The host's own decision, not a resolution accident: `false` withholds
       * `test_model` from an installation whose GeoSpec engine resolves. */
      ...(agent.testModel === false ? { geospecRunner: false } : {}),
      /* The MCP url is only known once the server is listening, so it is read per run. */
      ...(discovery.agents.length > 0
        ? {
            externalAgents: {
              agents: discovery.agents,
              mcpUrl: () => (agentServer ? new URL('mcp', agentServer.url()).href : ''),
            },
          }
        : {}),
      /* A turn that ran but could not be recorded is a warning, never a fatal:
       * the run itself is already durable in its own log, and a host that
       * stopped answering over a settlement failure would lose the next turn
       * too. W5 puts `turn.finalized` on the wire for the client. */
      onRevisionEvent: (event) => {
        if (event.type === 'turn.finalized') {
          return;
        }
        if (event.type === 'revision.unavailable') {
          /* A fact about the machine, not about one turn: this host will record
           * nothing at all until the named binaries are installed (OQ-B8). */
          emit({ type: 'warning', code: 'REVISION_UNAVAILABLE', message: event.reason });
          return;
        }
        emit({
          type: 'warning',
          code: 'REVISION_NOT_RECORDED',
          message:
            event.type === 'turn.conflicted'
              ? `Chat ${event.chatId} run ${event.runId}: the turn's writes conflicted with the live workspace.`
              : event.type === 'turn.failed'
                ? `Chat ${event.chatId} run ${event.runId}: the turn recorded no revision — ${event.reason}`
                : `The ${event.operation} of a checkout failed: ${event.reason}`,
        });
      },
    });
    /* The run reporter follows every chat a parsed, unrefused command names,
     * once the command is answered, so the rows it wrote are there to read.
     * Durable rows are only pulled per chat (SC-R14), so it learns the chats
     * here. `attach` only reads, unless it took over a run a restart left open
     * and recorded it `failed` (`chatToReport`, W4.r2). */
    const launcher: AgentLauncher = {
      ...project.launcher,
      execute: async (command) => {
        const answer = await project.launcher.execute(command);
        const chatId = chatToReport(command, answer);
        if (chatId !== undefined) {
          agentRunReporter?.watch(chatId);
        }
        return answer;
      },
    };
    const externalAgents = externalAgentDescriptors(discovery);
    const server = startAgentServer({
      launcher,
      revisions: project.revisions.channel,
      token: agent.token,
      workspaceRoot: agent.workspaceRoot,
      ...(machines ? { machines } : {}),
      ...(agent.label ? { label: agent.label } : {}),
      ...(agent.port === undefined ? {} : { port: agent.port }),
      ...(agent.uiRoot ? { uiRoot: agent.uiRoot } : {}),
      ...(agent.allowedOrigins ? { allowedOrigins: agent.allowedOrigins } : {}),
      ...(project.mcp ? { mcp: project.mcp } : {}),
      ...(externalAgents.length > 0 ? { externalAgents } : {}),
      ...(agent.computeControl ? { computeControl: agent.computeControl } : {}),
    });
    try {
      await server.ready;
    } catch (error) {
      await project.close();
      await machines?.host.close();
      throw error;
    }
    agentProject = project;
    agentServer = server;
    agentMachines = machines;
    agentExternalAgents = externalAgents;
    /* PH19 ruling 2: the API keeps a run *directory*. The reporter reads the
     * launcher's own durable rows — the rows the log is written from — and
     * puts identity and state on the control socket, never content. It is
     * started here rather than beside the control connection because a run
     * outlives every relay reconnect, and `sendControl` is a no-op while the
     * socket is down. */
    agentRunReporter = startRunReporter({ read: project.launcher.read, send: sendControlOrThrow });
    emit({ type: 'agent', state: 'ready', url: server.url().href, externalAgents });
    /* A daemon with the agent capability is *useful* the moment this channel
     * answers: pairing, the relay, and the compute child are all downstream of
     * it, and `tau serve --ui` must not block on any of them. */
    resolveReady();
  };

  /**
   * Stop the channel first, then the runs, then release their shared filesystem
   * authority.
   *
   * Each handle is retired only once its own release has *succeeded* (C70,
   * R13's pattern). The project host's close records this project's close
   * revision and genuinely rejects when the store refuses it; a daemon that had
   * already cleared the handle could never re-attempt that cut. Failures are
   * collected rather than thrown at the first one, so a refusal in the channel
   * still leaves the runs and the authority released.
   */
  const stopAgent = async (): Promise<void> => {
    const server = agentServer;
    const project = agentProject;
    const machines = agentMachines;
    const filesystem = agentFileSystem;
    /* No job starts from here on: a start the closing channel still admits would begin as the host goes away. */
    machines?.host.quiesce();
    agentRunReporter?.close();
    agentRunReporter = undefined;
    agentExternalAgents = [];
    const failures: unknown[] = [];
    const settle = async (operation: Promise<unknown> | undefined, retire: () => void): Promise<void> => {
      try {
        await operation;
        retire();
      } catch (error) {
        failures.push(error);
      }
    };
    await settle(server?.close(), () => {
      agentServer = undefined;
    });
    await settle(machines?.host.close(), () => {
      agentMachines = undefined;
    });
    await settle(project?.close(), () => {
      agentProject = undefined;
    });
    await settle(agentRuntimes.closeAll(), () => undefined);
    failures.push(...agentRuntimeCloseFailures.splice(0));
    /* Only once the project host itself is retired: a close cut the store refused
     * is re-attempted by the next `close()`, and that attempt still has to read
     * this project's files through the same authority (C70). */
    if (agentProject === undefined) {
      filesystem?.channel.close();
      await settle(filesystem?.stopServer(), () => {
        agentFileSystem = undefined;
      });
    }
    if (server) {
      emit({ type: 'agent', state: 'stopped' });
    }
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Tau Host could not release every agent resource.');
    }
  };

  const stopJobWorker = async (): Promise<void> => {
    const active = jobWorker;
    if (!active) {
      return;
    }
    jobWorker = undefined;
    emit({
      type: 'jobs',
      state: 'draining',
      runnerId: active.registration.runnerId,
      slots: active.registration.slots,
    });
    await active.close();
    await active.closed;
    await jobWorkerObserver;
    emit({ type: 'jobs', state: 'stopped', runnerId: active.registration.runnerId });
  };

  const observeJobWorker = async (worker: HostJobWorkerHandle): Promise<void> => {
    const result = await worker.closed;
    if (shutdown.signal.aborted || jobWorker !== worker) {
      return;
    }
    jobWorker = undefined;
    emit({ type: 'jobs', state: 'stopped', runnerId: worker.registration.runnerId });
    if (result.cause === 'fatal') {
      emit({
        type: 'warning',
        code: 'JOB_WORKER_FAILED',
        message: `Tau Host job worker stopped unexpectedly: ${result.error.message}`,
      });
      return;
    }
    emit({
      type: 'warning',
      code: 'JOB_WORKER_FAILED',
      message: 'Tau Host job worker stopped without a daemon shutdown request.',
    });
  };

  const ensureJobWorker = async (credential: HostCredential): Promise<void> => {
    if (!options.jobWorker || jobWorker) {
      return;
    }
    emit({ type: 'jobs', state: 'starting' });
    const worker = await options.jobWorker.start({
      apiUrl: asHttpUrl(options.relayUrl, '/'),
      credential,
    });
    jobWorker = worker;
    await worker.ready;
    emit({
      type: 'jobs',
      state: 'ready',
      runnerId: worker.registration.runnerId,
      slots: worker.registration.slots,
      capabilities: worker.registration.capabilities,
      profiles: worker.profiles.map((profile) => profile.name),
    });
    jobWorkerObserver = observeJobWorker(worker);
  };

  const sendControl = (message: HostControlOutbound): void => {
    if (controlSocket?.readyState === WebSocket.OPEN) {
      controlSocket.send(JSON.stringify(message));
    }
  };

  /**
   * Like {@link sendControl}, but says so when there is nowhere to send.
   *
   * The offer/accept frames are answers to something the relay just asked, so
   * dropping them when the socket is gone is right. A run-state frame is not an
   * answer — it is the only thing that will ever tell the directory this run
   * exists — so the reporter has to learn that it was dropped and re-send it on
   * the next connection.
   *
   * @param message - The control frame to send.
   */
  const sendControlOrThrow = (message: HostControlOutbound): void => {
    if (controlSocket?.readyState !== WebSocket.OPEN) {
      throw new Error('Tau Host has no control connection.');
    }
    controlSocket.send(JSON.stringify(message));
  };

  const rejectOffer = (
    offer: Extract<HostControlInbound, { type: 'offer' }>,
    code: Extract<HostControlOutbound, { type: 'reject' }>['code'],
  ): void => {
    sendControl({ v: 1, type: 'reject', sessionId: offer.sessionId, code });
  };

  const openSession = async (offer: Extract<HostControlInbound, { type: 'offer' }>): Promise<void> => {
    /* Capacity counts sessions that can still carry frames. A session whose
     * client has gone — one of its routes closed, or a revoke asked it to —
     * serves nobody, and holding its slot until every splice has drained (a
     * relay round trip plus the child-exit attribution grace) refused the next
     * offer with `BUSY`: exactly the 409 the live proof's seeded first turn hit
     * 325 ms after its own reattach dial.
     * ponytail: an agent placement still parks a slot for the 15 s its
     * un-dialled compute routes take to be reaped; the upgrade is an offer that
     * carries only the routes the caller will dial, which needs the API's
     * session DTO and `apps/ui/app/lib/remote-host-client.ts`. */
    const openSessions = [...sessions.values()].filter((session) => !session.isDraining());
    if (openSessions.length >= maxSessions) {
      rejectOffer(offer, 'BUSY');
      return;
    }
    emit({ type: 'session', sessionId: offer.sessionId, state: 'connecting' });
    let child: RuntimeChildHandle;
    try {
      child = await ensureRuntimeChild();
    } catch {
      rejectOffer(offer, 'CHILD_UNAVAILABLE');
      return;
    }
    if (child.runtimeVersion !== offer.runtimeVersion) {
      rejectOffer(offer, 'VERSION_MISMATCH');
      return;
    }

    let runtimeSplice: FrameSpliceHandle | undefined;
    let fileSystemSplice: FrameSpliceHandle | undefined;
    let agentSplice: FrameSpliceHandle | undefined;
    let expiryTimer: NodeJS.Timeout | undefined;
    try {
      const publicFileSystem = authorizedSocket(
        assertRelayRoute(offer.fileSystemUrl, options.relayUrl),
        offer.fileSystemAuthorization,
      );
      const localFileSystem = authorizedSocket(localRoute(child.url, 'fs', offer.sessionId), child.authorizationToken);
      fileSystemSplice = spliceFrameSockets(publicFileSystem, localFileSystem);

      const publicRuntime = authorizedSocket(
        assertRelayRoute(offer.runtimeUrl, options.relayUrl),
        offer.runtimeAuthorization,
      );
      const localRuntime = authorizedSocket(
        localRoute(child.url, 'runtime', offer.sessionId),
        child.authorizationToken,
      );
      runtimeSplice = spliceFrameSockets(publicRuntime, localRuntime);

      /* Rung 2. The relay carries the agent channel's frames exactly like the
       * other two routes — directory and relay only, so no chat content ever
       * lands in the API's database (PH19). Spliced only when both sides have
       * it: an API without rung 2, or a daemon without `--agent-port`, still
       * gets a working runtime session. */
      const agentOpens: Array<Promise<void>> = [];
      const agentServerUrl = agentServer && options.agent ? agentServer.url() : undefined;
      if (offer.agentUrl && offer.agentAuthorization && agentServerUrl && options.agent) {
        const publicAgent = authorizedSocket(
          assertRelayRoute(offer.agentUrl, options.relayUrl),
          offer.agentAuthorization,
        );
        const localAgent = authorizedSocket(
          localRoute(new URL(`ws://${agentServerUrl.host}`), 'agent', offer.sessionId),
          options.agent.token,
        );
        agentSplice = spliceFrameSockets(publicAgent, localAgent);
        agentOpens.push(waitForOpen(publicAgent), waitForOpen(localAgent));
      }

      let closeCode: Exclude<HostSessionCloseCode, 'ROUTE_UNUSED'> | undefined;
      let isDraining = false;
      const splices: readonly FrameSpliceHandle[] = [
        runtimeSplice,
        fileSystemSplice,
        ...(agentSplice ? [agentSplice] : []),
      ];
      const closeSession = (code?: Exclude<HostSessionCloseCode, 'ROUTE_UNUSED'>): void => {
        closeCode = code;
        isDraining = true;
        for (const splice of splices) {
          splice.close();
        }
      };
      const sessionClosed = (async (): Promise<void> => {
        const closures = splices.map(async (splice) => {
          const result = await splice.closed;
          /* A revoked route is final for the session: its sibling routes would
           * otherwise idle until the relay reaps them 15 s later. */
          if (isRevokedRoute(result) && closeCode === undefined) {
            closeSession('REVOKED');
          }
          return result;
        });
        /* Each route lives and dies on its own two sockets. Racing them bound
         * three routes to one fate, so the relay's 15 s reap of a route the
         * page never dialled ended the agent channel that *was* streaming —
         * the whole rung-2 defect. The session is over when its last route is,
         * unless one route reported a revocation, which closes the rest above. */
        await Promise.race(closures);
        isDraining = true;
        const results = await Promise.all(closures);
        const observedChildExit = async (): Promise<true> => {
          await child.closed;
          return true;
        };
        const childExited = await Promise.race([
          observedChildExit(),
          delay(childExitAttributionGrace, false, { ref: false }),
        ]);
        if (childExited) {
          closeCode = 'CHILD_EXIT';
        }
        for (const splice of splices) {
          splice.close();
        }
        if (expiryTimer) {
          clearTimeout(expiryTimer);
        }
        sessions.delete(offer.sessionId);
        emit({
          type: 'session',
          sessionId: offer.sessionId,
          state: 'disconnected',
          code: closeCode ?? (results.every((result) => isPeerlessReap(result)) ? 'ROUTE_UNUSED' : 'RELAY_CLOSED'),
        });
      })();
      const session: ActiveSession = {
        close: closeSession,
        closed: sessionClosed,
        isDraining: () => isDraining,
      };
      sessions.set(offer.sessionId, session);
      /* Bounds the *unclaimed* offer: a splice whose sockets never finish
       * opening must not park them for ever. It is cleared the moment the
       * session is accepted, because from then on the API refreshes the
       * session's record for as long as it has a parked socket
       * (`HostsService.touchSession`) and a hard close here would end a
       * streaming agent channel 120 s after its offer was minted, for a reason
       * that has nothing to do with its own sockets. */
      const remainingLifetime = Math.max(0, Date.parse(offer.expiresAt) - Date.now());
      expiryTimer = setTimeout(() => {
        session.close('RELAY_CLOSED');
      }, remainingLifetime);
      expiryTimer.unref();

      await Promise.all([
        waitForOpen(publicFileSystem),
        waitForOpen(localFileSystem),
        waitForOpen(publicRuntime),
        waitForOpen(localRuntime),
        ...agentOpens,
      ]);
      clearTimeout(expiryTimer);
      expiryTimer = undefined;
      sendControl({ v: 1, type: 'accept', sessionId: offer.sessionId });
      emit({ type: 'session', sessionId: offer.sessionId, state: 'connected' });
    } catch {
      runtimeSplice?.close();
      fileSystemSplice?.close();
      agentSplice?.close();
      sessions.delete(offer.sessionId);
      rejectOffer(offer, 'CHILD_UNAVAILABLE');
    }
  };

  const handleControlMessage = async (raw: WebSocket.RawData): Promise<void> => {
    let value: unknown;
    try {
      value = JSON.parse(rawDataText(raw));
    } catch {
      controlSocket?.close(1008, 'invalid control message');
      return;
    }
    const parsed = hostControlInboundSchema.safeParse(value);
    if (!parsed.success) {
      controlSocket?.close(1008, 'invalid control message');
      return;
    }
    if (parsed.data.type === 'revoke') {
      sessions.get(parsed.data.sessionId)?.close('REVOKED');
      return;
    }
    await openSession(parsed.data);
  };

  const runControlConnection = async (credential: HostCredential, child: RuntimeChildHandle): Promise<number> => {
    /*
     * `close()` closes whatever `controlSocket` holds *at the instant it
     * aborts*, so a connection dialled after that instant is one nothing ever
     * closes: `disconnected` never resolves, `run()` never returns, and
     * `close()` waits on it forever — with the project's close cut, the last
     * thing that records what a served project changed, never attempted (C74).
     *
     * The loop re-checks the signal only at its top, and both `ensureJobWorker`
     * and `ensureRuntimeChild` await between that check and this call, so the
     * abort lands inside that window whenever a caller closes a daemon shortly
     * after `ready`. Everything from here to `controlSocket = socket` is
     * synchronous, so this guard and `close()` cannot interleave.
     */
    if (shutdown.signal.aborted) {
      return 0;
    }
    emit({ type: 'control', state: 'connecting' });
    const socket = authorizedSocket(asWebSocketUrl(options.relayUrl, '/v1/agents/control'), credential.credential);
    controlSocket = socket;
    const opened = Promise.withResolvers<void>();
    const disconnected = Promise.withResolvers<{ readonly code?: number }>();
    let didOpen = false;
    let messageChain = Promise.resolve();
    socket.once('open', () => {
      didOpen = true;
      opened.resolve();
    });
    socket.once('unexpected-response', (_request, response) => {
      if (response.statusCode === 401) {
        opened.reject(new HostAuthenticationError('Tau Host device credential was rejected.'));
      } else {
        opened.reject(new Error(`Tau Host control upgrade failed with HTTP ${String(response.statusCode)}.`));
      }
    });
    socket.on('message', (message) => {
      const previousMessage = messageChain;
      messageChain = (async () => {
        await previousMessage;
        await handleControlMessage(message);
      })();
    });
    socket.once('error', (error) => {
      if (!didOpen) {
        opened.reject(error);
      }
      disconnected.resolve({});
    });
    socket.once('close', (code) => {
      if (!didOpen) {
        opened.reject(new Error('Tau Host control socket closed before opening.'));
      }
      disconnected.resolve({ code });
    });

    try {
      await opened.promise;
    } catch (error) {
      if (controlSocket === socket) {
        controlSocket = undefined;
      }
      socket.terminate();
      throw error;
    }
    emit({ type: 'control', state: 'connected' });
    const connectedAt = Date.now();
    /* Ruling 4: the API mints the agent grant and the offer's `agentUrl` only
     * for a device that advertised the capability, so an older daemon — or this
     * one started without `--agent-port` — still pairs and gets no agent route. */
    const agentCapability =
      agentServer && options.agent
        ? {
            workspaceRoot: options.agent.workspaceRoot,
            ...(agentExternalAgents.length > 0 ? { externalAgents: agentExternalAgents } : {}),
          }
        : undefined;
    sendControl({
      v: 1,
      type: 'ready',
      deviceId: credential.deviceId,
      runtimeVersion: child.runtimeVersion,
      capacity: maxSessions,
      ...(agentCapability ? { capabilities: { agent: agentCapability } } : {}),
    });
    /* Directly after `ready`, because a run that changed state while this
     * daemon had no relay — the whole point of always-on — has no other way of
     * reaching the API's run directory. */
    agentRunReporter?.flush();
    resolveReady();
    const closeResult = await disconnected.promise;
    await messageChain;
    if (controlSocket === socket) {
      controlSocket = undefined;
    }
    emit({ type: 'control', state: 'disconnected' });
    /* Sessions ride their own relay sockets, which may sit on a Machine that is
     * staying while this control socket's Machine restarts (1012), so losing
     * control alone ends none of them: each ends when its own relay closes. Only
     * a close that says this device is gone ends them all: a refused credential
     * (4401) or a revocation (4003). */
    if (closeResult.code === 4401 || closeResult.code === 4003) {
      closeSessions('RELAY_CLOSED');
    }
    if (closeResult.code === 4401) {
      throw new HostAuthenticationError('Tau Host device credential was rejected.');
    }
    return Date.now() - connectedAt;
  };

  const run = async (): Promise<HostDaemonCloseResult> => {
    emit({
      type: 'warning',
      code: 'TRUSTED_PROJECTS_ONLY',
      message: 'Remote project code executes on this machine. Connect only projects you trust.',
    });
    /* Before pairing: the local agent channel and any served UI are reachable
     * the moment the daemon starts. Until pairing lands the credential state is
     * `unpaired`, so reads and external agents serve and a Tau run is refused
     * `HOST_NOT_PAIRED` (RH-R13). */
    if (options.agent) {
      await startAgent(options.agent);
    }
    const pair = async (): Promise<HostCredential> => {
      if (options.pair === false) {
        throw new HostAuthenticationError('Tau Host device credential was revoked; a provisioned host does not pair.');
      }
      return pairDevice(options.relayUrl, shutdown.signal, emit);
    };
    let hostCredential = (await readHostCredential()) ?? (await pair());
    pairedWith(hostCredential);
    let reconnectAttempt = 0;
    while (!shutdown.signal.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- the credential-bound job worker must be ready before relay admission.
      await ensureJobWorker(hostCredential);
      /* The control `ready` frame carries `runtimeVersion`, so a control
       * connection is only attempted with the child up. A child that will not
       * start is a retriable warning: relay offers are rejected
       * `CHILD_UNAVAILABLE` and the geometry tools answer `RUNTIME_UNAVAILABLE`,
       * while the agent channel and its file tools keep serving. */
      let child: RuntimeChildHandle | undefined;
      try {
        // oxlint-disable-next-line no-await-in-loop -- reconnect attempts are deliberately sequential.
        child = await ensureRuntimeChild();
      } catch (error) {
        emit({
          type: 'warning',
          code: 'RUNTIME_CHILD_FAILED',
          message: `Tau Host runtime child could not start; retrying: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      try {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- close can abort while ensureRuntimeChild awaits.
        if (child && !shutdown.signal.aborted) {
          // oxlint-disable-next-line no-await-in-loop -- one control connection owns the current attempt.
          const lived = await runControlConnection(hostCredential, child);
          if (lived >= stableControlConnection) {
            reconnectAttempt = 0;
          }
        }
      } catch (error) {
        if (error instanceof HostAuthenticationError) {
          /* The relay revoked this credential: nothing is admitted on it from here, and the gateway is offered no
           * bearer, until pairing returns a new one (RH-S6). */
          credentialState = { mode: 'unpaired' };
          // oxlint-disable-next-line no-await-in-loop -- credential-scoped projections must drain before credential replacement.
          await stopJobWorker();
          // oxlint-disable-next-line no-await-in-loop -- credential replacement must complete before reconnecting.
          await removeHostCredential();
          // oxlint-disable-next-line no-await-in-loop -- pairing is the next ordered authentication attempt.
          hostCredential = await pair();
          pairedWith(hostCredential);
          reconnectAttempt = 0;
          continue;
        }
      }
      const backoff = Math.min(1000 * 2 ** reconnectAttempt, reconnectDelayMaximum);
      const jitter = Math.floor(Math.random() * Math.max(1, backoff / 4));
      reconnectAttempt += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- backoff orders and bounds reconnect attempts.
        await delay(backoff + jitter, undefined, { signal: shutdown.signal });
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          throw error;
        }
      }
    }
    return { cause: 'requested' };
  };

  /** The outcome this daemon closes with, once the run itself has settled. */
  let closeResult: HostDaemonCloseResult | undefined;

  /**
   * Release everything this daemon owns, and stay retryable (C70).
   *
   * Every step here is idempotent and each keeps its own handle until it
   * succeeds, so a second call re-attempts exactly what the first could not
   * finish — which for the agent launcher is the project's close revision.
   *
   * @returns Nothing, once the last capability has stopped.
   */
  const releaseCapabilities = async (): Promise<void> => {
    const failures: unknown[] = [];
    /* Every step runs even when an earlier one refuses: a close cut the store
     * rejected must not leave the job worker and the runtime child running. */
    const settle = async (operation: () => Promise<unknown> | undefined): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    };
    await settle(async () => stopAgent());
    await settle(async () => stopJobWorker());
    await settle(async () => jobWorkerObserver);
    await settle(async () => runtimeChild?.close());
    await settle(async () => childObserver);
    if (failures.length > 0) {
      const aggregate = new AggregateError(failures, 'Tau Host shutdown did not release every accepted resource.');
      ready.reject(aggregate);
      closed.resolve({ cause: 'fatal', error: aggregate });
      /* A single refusal keeps its own reason, so a caller can act on it; the
       * release stays retryable either way (C70). */
      throw failures.length === 1 ? failures[0] : aggregate;
    }
    if (closeResult !== undefined) {
      closed.resolve(closeResult);
    }
  };

  const execute = async (): Promise<HostDaemonCloseResult> => {
    let result: HostDaemonCloseResult;
    try {
      result = await run();
    } catch (error) {
      if (shutdown.signal.aborted) {
        result = { cause: 'requested' };
      } else {
        const normalized = error instanceof Error ? error : new Error(String(error));
        ready.reject(normalized);
        result = { cause: 'fatal', error: normalized };
      }
    }
    const activeControlSocket = controlSocket;
    controlSocket = undefined;
    try {
      activeControlSocket?.close(
        result.cause === 'fatal' ? 1011 : 1000,
        result.cause === 'fatal' ? 'host worker failed' : 'host stopping',
      );
    } catch {
      activeControlSocket?.terminate();
    }
    closeSessions('RELAY_CLOSED');
    /* A session that could not close is its own owner's failure to report; it
     * must not skip the capability release that follows. */
    await Promise.allSettled([...sessions.values()].map(async (session) => session.closed));
    closeResult = result;
    await releaseCapabilities();
    return result;
  };
  const runPromise = execute();
  /* The release can reject (a close cut the store refused) and `close()` is the
   * caller that sees it; this only keeps an unobserved rejection from ending the
   * process before it asks.
   *
   * async-iife: bootstrap -- the settlement belongs to `close()`, never here. */
  void (async (): Promise<void> => {
    try {
      await runPromise;
    } catch {
      /* Answered by `close()`. */
    }
  })();

  return {
    ready: ready.promise,
    closed: closed.promise,
    async close(): Promise<void> {
      if (isClosing) {
        /* The run is over either way; what may not be is the release. A close
         * cut the store refused keeps its project, so this asks again rather
         * than answering with the first rejection forever (C70). */
        try {
          await runPromise;
        } catch {
          /* The first attempt's reason; this call re-attempts and reports its own. */
        }
        await releaseCapabilities();
        return;
      }
      isClosing = true;
      shutdown.abort();
      try {
        controlSocket?.close(1000, 'host stopping');
      } catch {
        controlSocket?.terminate();
      }
      closeSessions('RELAY_CLOSED');
      void jobWorker?.close();
      await runPromise;
    },
  };
};
