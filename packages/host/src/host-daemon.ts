import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { WebSocket } from 'ws';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { AgentSessionModel, ExternalAgentDescriptor } from '@taucad/agent-host';
import { createRuntimeClient } from '@taucad/runtime';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import type { ComputeBinding, ComputeStoreControl } from '@taucad/runtime/types';

import { startAgentServer } from '#agent-server.js';
import type { AgentServerHandle } from '#agent-server.js';
import { createAcpExternalAgentPort, discoverAcpAgents, externalAgentDescriptors } from '#acp/index.js';
import { createHostMcpEndpoint } from '#mcp-server.js';
import type { HostMcpEndpoint } from '#mcp-server.js';
import { startRunReporter } from '#run-reporter.js';
import type { RunReporter } from '#run-reporter.js';
import { createHostToolRegistry } from '#agent-tools.js';
import type { HostSystemSkillBundle } from '#agent-tools.js';
import { hostControlInboundSchema, pairingResponseSchema, pairingTokenResponseSchema } from '#host.schemas.js';
import type { HostControlInbound, HostControlOutbound } from '#host.schemas.js';
import { readHostCredential, removeHostCredential, writeHostCredential } from '#credential-store.js';
import type { HostCredential } from '#credential-store.js';
import { spliceFrameSockets } from '#frame-splice.js';
import type { FrameSpliceCloseResult, FrameSpliceHandle } from '#frame-splice.js';
import type { HostJobWorkerFactory, HostJobWorkerHandle } from '#job-worker.js';
import { hostRevisionActor } from '#revision-actor.js';
import { createProjectRevisions } from '#revisions.js';
import type { TurnCheckout } from '#revisions.js';
import { startRuntimeChild } from '#runtime-child-supervisor.js';
import type { RuntimeChildHandle } from '#runtime-child-supervisor.js';

/** Milliseconds. */
const socketOpenTimeout = 15_000;
/** Milliseconds. */
const reconnectDelayMaximum = 30_000;
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
  /** Absolute workspace root; `.tau/chats/<chatId>/events.jsonl` lives under it. */
  readonly workspaceRoot: string;
  /** Host-admitted compute binding shared by direct and candidate execution roots. */
  readonly compute?: ComputeBinding | (() => ComputeBinding);
  readonly computeControl?: ComputeStoreControl;
  /** Base the model gateway hangs off, e.g. the Tau API origin. */
  readonly gatewayBaseUrl: string;
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
  let childObserver: Promise<void> | undefined;
  let jobWorker: HostJobWorkerHandle | undefined;
  let jobWorkerObserver: Promise<void> | undefined;
  let isClosing = false;
  let isReady = false;
  /* Hoisted out of `run()` so the agent host's gateway `auth` seam reads the
   * *current* credential: pairing may replace it while a run is in flight, and
   * a captured string would pin the host to a rotated token. */
  let currentCredential: HostCredential | undefined;
  let agentLauncher: NodeAgentLauncher | undefined;
  let agentServer: AgentServerHandle | undefined;
  let agentMcp: HostMcpEndpoint | undefined;
  let agentExternalAgents: readonly ExternalAgentDescriptor[] = [];
  let agentRunReporter: RunReporter | undefined;
  /**
   * The geometry tools' runtime client, one per root a turn works in.
   *
   * Keyed rather than single because a candidate turn works in its own checkout
   * (V19): the child process is shared, but each root needs its own client so
   * the files the kernel reads are the ones that turn is writing.
   */
  const agentRuntimes = new Map<string, Promise<ReturnType<typeof createRuntimeClient>>>();

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

  const ensureRuntimeChild = async (): Promise<RuntimeChildHandle> => {
    if (runtimeChild) {
      return runtimeChild;
    }
    const child = await startRuntimeChild(options.runtimeHost);
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
        agentRuntimes.clear();
        closeSessions('CHILD_EXIT');
      }
    })();
    return child;
  };

  /**
   * The agent's kernel tools run on the *same* supervised runtime child the
   * relay sessions use, started on first use and shared from then on.
   *
   * @param workspaceRoot - Root served to the child over its `/fs` socket.
   * @returns A render client bound to the loopback child.
   */
  const ensureAgentRuntime = async (workspaceRoot: string): Promise<ReturnType<typeof createRuntimeClient>> => {
    const pending =
      agentRuntimes.get(workspaceRoot) ??
      (async (): Promise<ReturnType<typeof createRuntimeClient>> => {
        let child: RuntimeChildHandle;
        try {
          child = await ensureRuntimeChild();
        } catch (error) {
          /* Never memoize the rejection: the relay loop retries the child, and a
           * cached failure would keep the geometry tools refusing long after it
           * recovered. Deleting it here is safe because every caller during the
           * pending window was handed this same promise. */
          agentRuntimes.delete(workspaceRoot);
          /* The geometry tools' typed refusal, not a bare supervisor error: a
           * daemon whose child is down still answers every file tool. */
          throw Object.assign(
            new Error(
              `This Tau Host has no runtime attached: ${error instanceof Error ? error.message : String(error)}`,
            ),
            { code: 'RUNTIME_UNAVAILABLE' },
          );
        }
        return createRuntimeClient({
          transport: webSocketTransport({
            url: child.url,
            fileSystem: fromNodeFs(workspaceRoot),
            createSocket: (url) =>
              new WebSocket(url, { headers: { authorization: `Bearer ${child.authorizationToken}` } }),
            ...(options.agent?.compute
              ? {
                  compute:
                    typeof options.agent.compute === 'function' ? options.agent.compute() : options.agent.compute,
                }
              : {}),
          }),
        });
      })();
    agentRuntimes.set(workspaceRoot, pending);
    return pending;
  };

  /**
   * Bring up Launcher 1: the always-on agent host and its `/agent` channel.
   *
   * @param agent - Workspace, gateway, model, admission secret, and binding.
   */
  const startAgent = async (agent: HostDaemonAgentOptions): Promise<void> => {
    /* Where each admitted turn runs, written by the recorder and read by the
     * Tau tool registry and the external port alike: the port is built inside
     * the launcher the recorder wraps, so the three share the map rather than a
     * call (V19). */
    const checkouts = new (class extends Map<string, TurnCheckout> {
      /**
       * Give back the checkout's runtime client with the checkout.
       *
       * The map *is* the checkout lifecycle — the revision tree sets an entry
       * at placement and deletes it at settlement — and `agentRuntimes` is keyed by
       * root, so nothing else would ever evict a candidate turn's client: it
       * would hold a live socket to the child over a tree that no longer exists,
       * one per turn, for the life of the daemon (5-review S4). The desktop
       * composition hangs its own eviction off the same seam.
       *
       * @param runId - The run whose checkout is released.
       * @returns Whether the entry was there.
       */
      public override delete(runId: string): boolean {
        const checkout = this.get(runId);
        if (checkout?.mode === 'candidate') {
          const pending = agentRuntimes.get(checkout.cwd);
          agentRuntimes.delete(checkout.cwd);
          // async-iife: bootstrap -- the map holds a promise; nothing waits for the client it gives back.
          void (async (): Promise<void> => {
            try {
              const client = await pending;
              client?.terminate();
            } catch {
              /* A client that never connected has nothing to give back. */
            }
          })();
        }
        return super.delete(runId);
      }
    })();
    /* Before the tool registry, because the registry hands the agent this
     * project's read-only history (S28) — and before the launcher, because the
     * tree wraps it. */
    const revisions = createProjectRevisions({
      workspaceRoot: agent.workspaceRoot,
      checkouts,
      /* AC15: the person this machine belongs to, as Git already knows them —
       * a daemon serves one machine, and `tau-host` in a clone's `git log` is
       * an opaque id nobody outside Tau can read. */
      actor: hostRevisionActor(),
      /* A turn that ran but could not be recorded is a warning, never a fatal:
       * the run itself is already durable in its own log, and a host that
       * stopped answering over a settlement failure would lose the next turn
       * too. W5 puts `turn.finalized` on the wire for the client. */
      events: (event) => {
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
    const toolRegistry = createHostToolRegistry({
      workspaceRoot: agent.workspaceRoot,
      checkouts,
      revisions: revisions.history,
      ...(options.systemSkillBundles === undefined ? {} : { systemSkillBundles: options.systemSkillBundles }),
      /* Per root, not per host: a candidate turn's kernel must read the tree
       * that turn is writing, which is its checkout and not the project. */
      runtimeClient: async (root) => ensureAgentRuntime(root),
      /* The host's own decision, not a resolution accident: `false` withholds
       * `test_model` from an installation whose GeoSpec engine resolves. */
      geospecRunner: agent.testModel === false ? false : undefined,
    });
    /* Resolution *and* the CLI probe happen before the channel answers, because
     * the descriptor and the control `ready` frame both carry the list: a client
     * must never see an agent this machine cannot actually start. */
    const discovery = agent.externalAgents
      ? await discoverAcpAgents({ resolveFrom: agent.externalAgents.resolveFrom })
      : { agents: [], refused: [] };
    /* The MCP capability secret is minted per daemon and is deliberately *not*
     * the channel token: it travels into a vendor adapter's process. */
    const mcp =
      discovery.agents.length > 0
        ? createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), registry: toolRegistry })
        : undefined;
    /* V17 / I-EDIT: the host records the turn, so the revision tree wraps the
     * launcher rather than sitting beside it — the turn has to be placed and
     * leased before the launcher admits anything. Leases a dead daemon left
     * behind are retired by the registry's own open sweep (F13); nothing
     * sweeps a directory any more, because a turn no longer has one. */
    const base = createNodeAgentLauncher({
      workspaceRoot: agent.workspaceRoot,
      gatewayBaseUrl: agent.gatewayBaseUrl,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      toolRegistry,
      auth: () => currentCredential?.credential,
      ...(discovery.agents.length > 0
        ? {
            externalAgents: createAcpExternalAgentPort({
              agents: discovery.agents,
              workspaceRoot: agent.workspaceRoot,
              checkouts,
              /* The MCP url is only known once the server is listening, so it is
               * resolved per run rather than captured here. */
              ...(mcp
                ? {
                    mcp: {
                      get url(): string {
                        return agentServer ? new URL('mcp', agentServer.url()).href : '';
                      },
                      mint: (input) => mcp.mint(input),
                    },
                  }
                : {}),
            }),
          }
        : {}),
    });
    const launcher = revisions.record(base);
    const externalAgents = externalAgentDescriptors(discovery);
    const server = startAgentServer({
      launcher,
      token: agent.token,
      workspaceRoot: agent.workspaceRoot,
      ...(agent.label ? { label: agent.label } : {}),
      ...(agent.port === undefined ? {} : { port: agent.port }),
      ...(agent.uiRoot ? { uiRoot: agent.uiRoot } : {}),
      ...(agent.allowedOrigins ? { allowedOrigins: agent.allowedOrigins } : {}),
      ...(mcp ? { mcp } : {}),
      ...(externalAgents.length > 0 ? { externalAgents } : {}),
      ...(agent.computeControl ? { computeControl: agent.computeControl } : {}),
    });
    try {
      await server.ready;
    } catch (error) {
      await launcher.close();
      await mcp?.close();
      throw error;
    }
    agentLauncher = launcher;
    agentServer = server;
    agentMcp = mcp;
    agentExternalAgents = externalAgents;
    /* PH19 ruling 2: the API keeps a run *directory*. The reporter reads the
     * launcher's own durable stream — the same stream the log is written from —
     * and puts identity and state on the control socket, never content. It is
     * started here rather than beside the control connection because a run
     * outlives every relay reconnect, and `sendControl` is a no-op while the
     * socket is down.
     *
     * The *base* stream, not the recorder's: the wrapper holds a terminal
     * marker until the turn's revision is durable, which is a guarantee clients
     * need and the run directory does not — it keeps no content. Riding the
     * wrapper delayed every terminal frame by a whole-tree capture and, worse,
     * grew this subscriber's queue for the length of it, past which the
     * launcher's fan-out errors it and the reporter never resubscribes
     * (5-review S2). */
    agentRunReporter = startRunReporter({ events: (signal) => base.events(signal), send: sendControlOrThrow });
    emit({ type: 'agent', state: 'ready', url: server.url().href, externalAgents });
    /* A daemon with the agent capability is *useful* the moment this channel
     * answers: pairing, the relay, and the compute child are all downstream of
     * it, and `tau serve --ui` must not block on any of them. */
    resolveReady();
  };

  /** Stop the channel first, then the runs: a client must never outlive its host. */
  const stopAgent = async (): Promise<void> => {
    const server = agentServer;
    const launcher = agentLauncher;
    const mcp = agentMcp;
    agentRunReporter?.close();
    agentRunReporter = undefined;
    agentServer = undefined;
    agentLauncher = undefined;
    agentMcp = undefined;
    agentExternalAgents = [];
    await server?.close();
    await launcher?.close();
    await mcp?.close();
    if (server) {
      emit({ type: 'agent', state: 'stopped' });
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
      const sessionClosed = (async (): Promise<void> => {
        const closures = splices.map(async (splice) => splice.closed);
        /* Each route lives and dies on its own two sockets. Racing them bound
         * three routes to one fate, so the relay's 15 s reap of a route the
         * page never dialled ended the agent channel that *was* streaming —
         * the whole rung-2 defect. The session is over when its last route is. */
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
        close(code): void {
          closeCode = code;
          isDraining = true;
          for (const splice of splices) {
            splice.close();
          }
        },
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

  const runControlConnection = async (credential: HostCredential, child: RuntimeChildHandle): Promise<void> => {
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
    closeSessions('RELAY_CLOSED');
    if (closeResult.code === 4401) {
      throw new HostAuthenticationError('Tau Host device credential was rejected.');
    }
  };

  const run = async (): Promise<HostDaemonCloseResult> => {
    emit({
      type: 'warning',
      code: 'TRUSTED_PROJECTS_ONLY',
      message: 'Remote project code executes on this machine. Connect only projects you trust.',
    });
    /* Before pairing: the local agent channel and any served UI are reachable
     * the moment the daemon starts, and the gateway credential is resolved per
     * request once pairing lands. */
    if (options.agent) {
      await startAgent(options.agent);
    }
    let credential = (await readHostCredential()) ?? (await pairDevice(options.relayUrl, shutdown.signal, emit));
    currentCredential = credential;
    let reconnectAttempt = 0;
    while (!shutdown.signal.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- the credential-bound job worker must be ready before relay admission.
      await ensureJobWorker(credential);
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
        if (child) {
          // oxlint-disable-next-line no-await-in-loop -- one control connection owns the current attempt.
          await runControlConnection(credential, child);
          reconnectAttempt = 0;
        }
      } catch (error) {
        if (error instanceof HostAuthenticationError) {
          // oxlint-disable-next-line no-await-in-loop -- credential-scoped projections must drain before credential replacement.
          await stopJobWorker();
          // oxlint-disable-next-line no-await-in-loop -- credential replacement must complete before reconnecting.
          await removeHostCredential();
          // oxlint-disable-next-line no-await-in-loop -- pairing is the next ordered authentication attempt.
          credential = await pairDevice(options.relayUrl, shutdown.signal, emit);
          currentCredential = credential;
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
    await Promise.all([...sessions.values()].map(async (session) => session.closed));
    await stopAgent();
    await stopJobWorker();
    await jobWorkerObserver;
    await runtimeChild?.close();
    await childObserver;
    closed.resolve(result);
    return result;
  };
  const runPromise = execute();

  return {
    ready: ready.promise,
    closed: closed.promise,
    async close(): Promise<void> {
      if (isClosing) {
        await runPromise;
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
