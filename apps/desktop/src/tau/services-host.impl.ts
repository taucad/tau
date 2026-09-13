/**
 * Services-utility behaviour (work item E7), separated from its entry so it is
 * testable in a plain Node vitest run.
 *
 * Imports **no** `electron` — the "two launchers of one host" invariant, so
 * everything here is equally launchable from the daemon. Main talks to it over
 * `process.parentPort`, which Electron exposes as a process global rather than
 * through the `electron` module, so the invariant survives the transport.
 *
 * It hosts two concerns, one dedicated port each. The node filesystem provider
 * is a second, independent watcher over the same disk the kernel utility sees —
 * ruling D6's two authorities, one disk. The agent host is ruling C3's
 * **launcher 2**: `createNodeAgentLauncher` from `@taucad/agent-host`, bound to
 * main's `MessagePortMain` by the port-agnostic `serveAgentChannel` the daemon's
 * WebSocket route also calls. Same host, same T0 vocabulary, different wire —
 * the client projection cannot tell which one it is talking to.
 *
 * Main sends the gateway and the credential; the model rides each admission
 * from the renderer, and the *workspace root* arrives per connection, because
 * one desktop app opens many projects and each launcher owns exactly one
 * directory. See
 * `docs/research/host-agnostic-transport-substrate-blueprint.md`.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { isAbsolute, resolve, sep } from 'node:path';

import { serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import type { EmitterPort } from '@taucad/filesystem/backend/node';
import { createNodeAgentLauncher, serveAgentChannel } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import {
  createAcpExternalAgentPort,
  createHostMcpEndpoint,
  createProjectRevisions,
  hostRevisionActor,
} from '@taucad/host';
import type { AcpAdapter, HostMcpEndpoint, TurnCheckout } from '@taucad/host';
import { createHostGeoSpecRunner, createHostToolRegistry } from '@taucad/host/agent-tools';
import type { HostGeoSpecRuntimeClient } from '@taucad/host/agent-tools';
import { createRuntimeClient } from '@taucad/runtime/client';
import { electronUtilityMainTransport } from '@taucad/runtime/electron/renderer';
import { systemSkillBundles } from '@taucad/skills/resources';

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

/** What `createAcpExternalAgentPort` is handed to offer an agent the `tau` server. */
type McpBinding = NonNullable<Parameters<typeof createAcpExternalAgentPort>[0]['mcp']>;

/**
 * One transferred port. Electron's `MessagePortMain` is both an
 * {@link EmitterPort} and the emitter-shaped port `serveAgentChannel`
 * normalises, so the two concerns take the same object without a cast.
 */
export type UtilityPort = EmitterPort & { start(): void; close(): void };

/** One `process.parentPort` message, structurally typed. */
export type UtilityMessage = { readonly data: unknown; readonly ports: readonly UtilityPort[] };

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
  /** Diagnostics sink; defaults to stdout, which main forwards to `userData/logs`. */
  readonly log?: (event: string, detail?: unknown) => void;
  /** Injected for tests. */
  readonly serve?: typeof serveNodeFsProvider;
  /** Ask main to mint a runtime port for this already-admitted project. */
  readonly requestRuntimePort?: (workspaceRoot: string) => Promise<{
    readonly port: UtilityPort;
    release(reason: 'requested' | 'render-timeout'): void;
  }>;
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
   * The `git` and `git-lfs` this app records with (OQ-B8).
   *
   * Absent, both come from `PATH` — which on a Finder launch is
   * `/usr/bin:/bin:/usr/sbin:/sbin` and holds no Homebrew `git-lfs`. Main
   * passes the binaries the bundle ships once it ships them.
   */
  readonly gitExecutable?: string | undefined;
  readonly gitLfsExecutable?: string | undefined;
  /**
   * Answer main's `quiesce` control frame once every project is settled (W19).
   *
   * Quit used to kill this utility outright: `services-broker.dispose()` calls
   * `utility.kill()` and `ServicesHost.dispose()` is synchronous
   * fire-and-forget, so a launcher's `close()` — which is what records the
   * close revision and waits for `awaitSyncSettled` — never ran to completion.
   * Main now asks first and waits, bounded, for this reply.
   */
  readonly quiesced?: () => void;
  /** Tell main this project can record nothing, so a person is told (W5). */
  readonly onRevisionsUnavailable?: (
    workspaceRoot: string,
    event: Readonly<{ reason: string; missing: readonly string[] }>,
  ) => void;
};

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
    ((event: string, detail?: unknown): void => {
      // oxlint-disable-next-line no-console -- forwarded to userData/logs through main's stdio
      console.log(`[services] ${event}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
    });
  const { gitExecutable, gitLfsExecutable, onRevisionsUnavailable, quiesced, requestRuntimePort, runtimeContext } =
    options;
  const serve = options.serve ?? serveNodeFsProvider;

  const trustedRoots = new Set<string>();
  /* One always-on launcher per workspace root, outliving every connection to
   * it: a run keeps executing with zero clients attached, which is the whole
   * point of the portable host. */
  const launchers = new Map<string, NodeAgentLauncher>();
  type DesktopRuntime = ReturnType<typeof createDesktopRuntime>;
  type DesktopClient = ReturnType<typeof createRuntimeClient<DesktopRuntime>>;
  const runtimeClients = new Map<string, Promise<DesktopClient>>();
  const connectedRuntimeClients = new Map<string, DesktopClient>();
  let disposed = false;
  let authToken: string | undefined;
  let agentHostConfig: AgentHostConfig | undefined;
  /* V7: the utility's own MCP surface. One loopback listener for the whole
   * utility — mounted *inside* the `agentHost` concern rather than as a member
   * of `servicesConcerns`, because it faces the adapter child over HTTP, not
   * the renderer over a `MessagePortMain` (VI6). One endpoint per workspace
   * root beneath it, each on its own route, because the tool registry it
   * dispatches into is per root and one desktop app opens many projects. */
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
          log('mcp.failed', { message: error instanceof Error ? error.message : String(error) });
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

  /**
   * Mount one workspace's endpoint on that listener.
   *
   * @param registry - The launcher's own tool registry; the endpoint dispatches into it.
   * @returns The URL and minter each external session is offered.
   */
  const mountMcp = (registry: Parameters<typeof createHostMcpEndpoint>[0]['registry']): McpBinding => {
    listenForMcp();
    /* Deliberately not the agent channel token (VI4): this secret signs a
     * capability that travels into a vendor adapter's process. */
    const endpoint = createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), registry });
    const route = `/mcp/${randomUUID()}`;
    mcpEndpoints.set(route, endpoint);
    return {
      /* The port is known only once the socket is bound, so the URL is read per
       * run rather than captured here — the daemon resolves its own the same
       * way. It is stable for the utility's lifetime, which is what keeps a
       * long-lived agent session from losing its server mid-chat. */
      get url(): string {
        return mcpOrigin === '' ? '' : `${mcpOrigin}${route}`;
      },
      /* A pass-through, not a re-shaping: the claim is `mcp-server.ts`'s. */
      mint: (input) => endpoint.mint(input),
    };
  };

  const isTrustedRoot = (root: string): boolean => {
    if (!isAbsolute(root)) {
      return false;
    }
    const candidate = resolve(root);
    /* Descendants are admitted because projects live inside Home
     * (`userData/home/<project>`); the `sep` suffix keeps `…/home-evil` from
     * matching `…/home`. */
    return [...trustedRoots].some((trusted) => candidate === trusted || candidate.startsWith(trusted + sep));
  };

  const handleControlFrame = (frame: Record<string, unknown>): void => {
    switch (frame['type']) {
      case 'allowRoots': {
        trustedRoots.clear();
        for (const root of (frame['roots'] as readonly string[] | undefined) ?? []) {
          trustedRoots.add(resolve(root));
        }
        log('roots-updated', { count: trustedRoots.size });
        return;
      }
      case 'authToken': {
        /* Held, not captured: main refreshes it on better-auth's 24 h
         * `updateAge`, and launcher 2's model transport reads it per request. */
        authToken = frame['token'] as string | undefined;
        log('credential-updated', { present: authToken !== undefined });
        return;
      }
      case 'quiesce': {
        /* One round trip: main asks, every launcher closes (cut, then W13's
         * `awaitSyncSettled`), and only then does main let the process die.
         * Main owns the bound; this end never cuts its own wait short. */
        // async-iife: bootstrap -- a control frame has no caller to return to.
        void quiesce().then(
          () => quiesced?.(),
          (error: unknown) => {
            log('quiesce-failed', error instanceof Error ? error.message : String(error));
            quiesced?.();
          },
        );
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
        return;
      }
      default: {
        log('unknown-control-frame', { type: frame['type'] });
      }
    }
  };

  /**
   * Bind one renderer connection to launcher 2 over the transferred port.
   *
   * @param port - The utility's leg of main's `MessageChannelMain`.
   * @param context - The connection's context; `workspaceRoot` scopes the launcher.
   */
  const serveAgentHost = (port: UtilityPort, context: Record<string, unknown> | undefined): void => {
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
      log('agent-host.not-configured', { workspaceRoot: requested });
      port.close();
      return;
    }
    const workspaceRoot = resolve(requested);
    /**
     * One runtime client per tree, project or turn checkout.
     *
     * @param root - The tree the calling turn works in.
     * @returns Its connected runtime client.
     */
    const runtimeClient = async (root: string): Promise<DesktopClient> => {
      const existingClient = runtimeClients.get(root);
      if (existingClient) {
        return existingClient;
      }
      if (!requestRuntimePort) {
        throw new Error('The desktop services host has no main runtime-port broker.');
      }
      let pending = Promise.resolve(undefined as unknown as DesktopClient);
      pending = (async (): Promise<DesktopClient> => {
        const runtimeLease = await requestRuntimePort(root);
        const runtimePort = runtimeLease.port;
        const client = createRuntimeClient<DesktopRuntime>({
          transport: electronUtilityMainTransport({ port: runtimePort, release: runtimeLease.release }),
          config: {
            tauApiUrl: agentHostConfig!.tauApiUrl,
            tauWebSocketUrl: agentHostConfig!.tauWebSocketUrl,
          },
        });
        runtimePort.on('close', () => {
          if (runtimeClients.get(root) === pending) {
            runtimeClients.delete(root);
            connectedRuntimeClients.delete(root);
            // async-iife: bootstrap -- MessagePort close callbacks cannot return client termination.
            void (async () => {
              try {
                const staleClient = await pending;
                staleClient.terminate();
              } catch {
                /* A failed connection has no client left to terminate. */
              }
            })();
          }
        });
        return client;
      })();
      runtimeClients.set(root, pending);
      try {
        const connected = await pending;
        if (disposed) {
          connected.terminate();
          throw new Error('The desktop services host was disposed while its runtime connected.');
        }
        connectedRuntimeClients.set(root, connected);
        return connected;
      } catch (error) {
        if (runtimeClients.get(root) === pending) {
          runtimeClients.delete(root);
        }
        throw error;
      }
    };
    /* Written when a turn is placed, read by the Tau tool registry and the
     * external port: both root the turn's agent in the checkout the placement
     * resolved (V19).
     *
     * The map *is* the checkout lifecycle — the revision tree sets an entry at
     * placement and deletes it at settlement — so main's runtime-context
     * registration hangs off it rather than off a second bookkeeping seam. */
    const checkouts = new (class extends Map<string, TurnCheckout> {
      public override set(runId: string, checkout: TurnCheckout): this {
        if (checkout.mode === 'candidate') {
          runtimeContext?.('register', checkout.cwd, workspaceRoot);
        }
        return super.set(runId, checkout);
      }

      public override delete(runId: string): boolean {
        const checkout = this.get(runId);
        if (checkout?.mode === 'candidate') {
          runtimeContext?.('release', checkout.cwd, workspaceRoot);
          /* The tree is about to be destroyed; a runtime still rooted in it
           * would answer the next turn from a directory that no longer exists. */
          connectedRuntimeClients.get(checkout.cwd)?.terminate();
          runtimeClients.delete(checkout.cwd);
          connectedRuntimeClients.delete(checkout.cwd);
        }
        return super.delete(runId);
      }
    })();
    const existing = launchers.get(workspaceRoot);
    /* Only when this window is actually creating a launcher: a reconnect to a
     * project this host already serves must not start a second revision tree
     * over the same directory. */
    const launcher =
      existing ??
      (() => {
        /* Before the tool registry, because the registry hands the agent this
         * project's read-only history (S28), and before the launcher it wraps.
         * V17 / I-EDIT: launcher 2 records the turn the same way launcher 1 does —
         * the same revision actor tree over this root. Leases a previous window
         * left behind are retired by the registry's own open sweep (F13). */
        const revisions = createProjectRevisions({
          workspaceRoot,
          checkouts,
          ...(gitExecutable === undefined ? {} : { gitExecutable }),
          ...(gitLfsExecutable === undefined ? {} : { gitLfsExecutable }),
          /* AC15: who this window records for. The desktop's own signed-in
           * session is W13's to pass here; until it does, the identity the
           * person already keeps on this machine is the truthful answer. */
          actor: hostRevisionActor(),
          events: (event) => {
            /* Reported, never fatal: the run is already durable in its own log,
             * and a window that stopped serving over a settlement failure would
             * lose the next turn too. */
            if (event.type === 'turn.finalized') {
              return;
            }
            if (event.type === 'revision.unavailable') {
              /* Not one turn's failure but this machine's: without `git` and
               * `git-lfs` the app records no history at all (OQ-B8). It is
               * named here as its own fact — reason and missing binaries — and
               * reaches the person's window when W5 puts host revision events
               * on the wire, beside `turn.failed`. */
              log('agent-host.revisions-unavailable', {
                workspaceRoot,
                reason: event.reason,
                missing: event.missing,
              });
              onRevisionsUnavailable?.(workspaceRoot, event);
              return;
            }
            log('agent-host.revision-not-recorded', { workspaceRoot, event: event.type });
          },
        });
        const toolRegistry = createHostToolRegistry({
          workspaceRoot,
          checkouts,
          systemSkillBundles,
          revisions: revisions.history,
          /* Rooted per run, exactly as the daemon does it: a candidate turn's kernel
           * and GeoSpec tools read the checkout its file tools write, because the
           * checkout was registered with main as a runtime context above. */
          runtimeClient: async (root) => runtimeClient(root),
          geospecRunner: async (root) => {
            const client = await runtimeClient(root);
            /* GeoSpec's deliberately wide export-format carrier accepts every
             * plugin format, while this concrete desktop recipe exposes the
             * actual narrower set. Its loader requests only formats supported
             * by that recipe; bridge the generic variance at this boundary. */
            return createHostGeoSpecRunner(root, client as unknown as HostGeoSpecRuntimeClient);
          },
        });
        return revisions.record(
          createNodeAgentLauncher({
            workspaceRoot,
            gatewayBaseUrl: agentHostConfig.gatewayBaseUrl,
            systemPrompt: agentHostConfig.systemPrompt,
            toolRegistry,
            /* Resolved per request, never captured: main refreshes the bearer and a
             * captured string would pin this host to a stale one. */
            auth: () => authToken,
            /* The adapters main resolved, wired through the daemon's own port —
             * same factory, same branch confinement, same refusal for an agent this
             * machine cannot start, and the same `tau` MCP server over this
             * utility's own loopback endpoint (V7). Mounted here, in the branch
             * that actually creates a launcher, so a second window on the same
             * project reuses the endpoint its first one mounted. */
            ...(agentHostConfig.externalAgents?.length
              ? {
                  externalAgents: createAcpExternalAgentPort({
                    agents: agentHostConfig.externalAgents,
                    workspaceRoot,
                    checkouts,
                    mcp: mountMcp(toolRegistry),
                  }),
                }
              : {}),
          }),
        );
      })();
    launchers.set(workspaceRoot, launcher);
    /* The handle owns only this connection — disposing it would end this
     * client's streams and nothing else. It needs no explicit teardown here:
     * `@taucad/rpc` reports the port's death and closes the channel itself, and
     * always-on lives in the launcher, which deliberately survives. */
    serveAgentChannel(port, launcher, { sessionKey: agentSessionKey });
    log('agent-host-served', { workspaceRoot, reused: existing !== undefined });
  };

  /**
   * Close every launcher and wait for each one.
   *
   * `dispose()` below fires the same closes and waits for none, because it is
   * the window going away and nothing is left to record into. Quit is the other
   * case: the bytes on disk are the person's, and the close revision is how
   * they survive.
   *
   * @returns Once every project this utility serves has settled.
   */
  const quiesce = async (): Promise<void> => {
    const closing = [...launchers.values()].map(async (launcher) => launcher.close());
    launchers.clear();
    await Promise.allSettled(closing);
    log('quiesced', { projects: closing.length });
  };

  return {
    isTrustedRoot,
    agentHostConfig: () => agentHostConfig,
    quiesce,
    dispose() {
      disposed = true;
      /* The launchers first: each one owns a revision actor tree over a served
       * root, and a disposed host must stop writing into a project it no longer
       * serves. Fire-and-forget like the endpoints below — `dispose` is the
       * window closing, and nothing waits on it. */
      for (const launcher of launchers.values()) {
        void launcher.close();
      }
      launchers.clear();
      for (const endpoint of mcpEndpoints.values()) {
        void endpoint.close();
      }
      mcpEndpoints.clear();
      mcpServer?.close();
      mcpServer = undefined;
      mcpOrigin = '';
      for (const client of connectedRuntimeClients.values()) {
        client.terminate();
      }
      runtimeClients.clear();
      connectedRuntimeClients.clear();
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
      const context = record['context'] as Record<string, unknown> | undefined;
      switch (record['concern']) {
        case 'nodeFs': {
          serve(toNodeFsPort(port), { allowRoot: isTrustedRoot });
          port.start();
          log('node-fs-served');
          return;
        }
        case 'agentHost': {
          serveAgentHost(port, context);
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
