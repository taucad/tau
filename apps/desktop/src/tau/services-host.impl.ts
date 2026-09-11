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
  sweepTurnWorkspaces,
  withTurnRevisions,
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
};

/** The services host, seen by its entry and by tests. */
export type ServicesHost = {
  /** Handle one `process.parentPort` message. */
  handleMessage(message: UtilityMessage): void;
  /** Whether a renderer-named root may be served. */
  isTrustedRoot(root: string): boolean;
  /** Main's agent configuration, once it has sent the frame. */
  agentHostConfig(): AgentHostConfig | undefined;
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
  const { requestRuntimePort, runtimeContext } = options;
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
    /* Written by the recorder, read by the Tau tool registry and the external
     * port: candidate mode roots both the agent's session and Tau's own file
     * tools in the checkout this turn was prepared in (V19).
     *
     * The map *is* the checkout lifecycle — `withTurnRevisions` sets an entry at
     * admission and deletes it at release — so main's runtime-context
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
    const toolRegistry = createHostToolRegistry({
      workspaceRoot,
      checkouts,
      systemSkillBundles,
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
    const existing = launchers.get(workspaceRoot);
    if (!existing) {
      /* Once per root, when its launcher is first built: workspaces a previous
       * window — or a pre-V2 external run — left behind are removed, and a root
       * already serving keeps whatever its live turns hold (SR4, V19).
       *
       * async-iife: bootstrap -- this connection must be served synchronously,
       * and the sweep's orphan list is a `readdir` issued before this root has a
       * launcher at all, so no workspace a live turn owns can be in it. */
      void (async (): Promise<void> => {
        const sweep = await sweepTurnWorkspaces({ workspaceRoot });
        if (sweep.removed > 0) {
          log('agent-host.turn-workspaces-swept', { workspaceRoot, removed: sweep.removed });
        }
      })();
    }
    const launcher =
      existing ??
      /* V17 / I-EDIT: launcher 2 records the turn the same way launcher 1 does —
       * the daemon's own wrapper, over this root's own `.tau/workspaces`. */
      withTurnRevisions(
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
        {
          workspaceRoot,
          checkouts,
          onSettled: ({ chatId, runId, status }) => {
            /* Reported, never fatal: the run is already durable in its own log,
             * and a window that stopped serving over a settlement failure would
             * lose the next turn too. */
            if (status !== 'recorded') {
              log('agent-host.revision-not-recorded', { workspaceRoot, chatId, runId, status });
            }
          },
        },
      );
    launchers.set(workspaceRoot, launcher);
    /* The handle owns only this connection — disposing it would end this
     * client's streams and nothing else. It needs no explicit teardown here:
     * `@taucad/rpc` reports the port's death and closes the channel itself, and
     * always-on lives in the launcher, which deliberately survives. */
    serveAgentChannel(port, launcher, { sessionKey: agentSessionKey });
    log('agent-host-served', { workspaceRoot, reused: existing !== undefined });
  };

  return {
    isTrustedRoot,
    agentHostConfig: () => agentHostConfig,
    dispose() {
      disposed = true;
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
