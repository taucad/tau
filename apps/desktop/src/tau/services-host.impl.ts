/**
 * Services-utility behaviour (work item E7), separated from its entry so it is
 * testable in a plain Node vitest run.
 *
 * Imports **no** `electron` — the "two launchers of one host" invariant, so
 * everything here is equally launchable from the daemon. Main talks to it over
 * `process.parentPort`, which Electron exposes as a process global rather than
 * through the `electron` module, so the invariant survives the transport.
 *
 * It hosts three concerns, one dedicated port each. Renderer filesystem,
 * runtime filesystem, agent tools, and revision preparation all derive rooted
 * clients from one internal authority channel. The agent host is ruling C3's
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

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import type { EmitterPort } from '@taucad/filesystem/backend/node';
import { createNodeAgentLauncher, serveAgentChannel } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import { createGatewayModelTransport, createTauCloudGatewayModelTransport } from '@taucad/agent-host';
import {
  createAcpExternalAgentPort,
  createHostMcpEndpoint,
  createProjectRevisions,
  hostRevisionActor,
} from '@taucad/host';
import type { AcpAdapter, HostMcpEndpoint, ProjectRevisions, TurnCheckout } from '@taucad/host';
import { createHostGeoSpecRunner, createHostToolRegistry } from '@taucad/host/agent-tools';
import type { HostGeoSpecRuntimeClient, HostToolFileSystem } from '@taucad/host/agent-tools';
import { createRuntimeClient } from '@taucad/runtime/client';
import { electronUtilityMainTransport } from '@taucad/runtime/electron/renderer';
import { serveElectronFileSystemBridgePort } from '@taucad/runtime/electron/utility';
import { systemSkillBundles } from '@taucad/skills/resources';

import { canonicalPath } from '#main/project-roots.js';
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

/** What `createAcpExternalAgentPort` is handed to offer an agent the `tau` server. */
type McpBinding = NonNullable<Parameters<typeof createAcpExternalAgentPort>[0]['mcp']>;

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
  /** Reply to main once one project launcher has fully stopped. */
  readonly agentHostReleased?: (requestId: string, error?: string) => void;
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
    onRevisionsUnavailable,
    quiesced,
    requestRuntimePort,
    runtimeContext,
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
  /* One always-on launcher per workspace root, outliving every connection to
   * it: a run keeps executing with zero clients attached, which is the whole
   * point of the portable host. */
  const launchers = new Map<string, NodeAgentLauncher>();
  const launcherGenerations = new Map<string, number>();
  const launcherProjectIds = new Map<string, string>();
  const revisionRoots = new Map<string, ProjectRevisions>();
  type DesktopRuntime = ReturnType<typeof createDesktopRuntime>;
  type DesktopClient = ReturnType<typeof createRuntimeClient<DesktopRuntime>>;
  const runtimeClients = new Map<string, Promise<DesktopClient>>();
  const connectedRuntimeClients = new Map<string, DesktopClient>();
  let disposed = false;
  let quiescing = false;
  let quiescence: Promise<void> | undefined;
  let authToken: string | undefined;
  let agentHostConfig: AgentHostConfig | undefined;
  /** Connections parked until main's `agentHost` frame lands. @see serveAgentHost */
  const agentHostConfigWaiters = new Set<() => void>();
  let internalAuthorityStopped: Promise<void> | undefined;
  /* V7: the utility's own MCP surface. One loopback listener for the whole
   * utility — mounted *inside* the `agentHost` concern rather than as a member
   * of `servicesConcerns`, because it faces the adapter child over HTTP, not
   * the renderer over a `MessagePortMain` (VI6). One endpoint per workspace
   * root beneath it, each on its own route, because the tool registry it
   * dispatches into is per root and one desktop app opens many projects. */
  const mcpEndpoints = new Map<string, HostMcpEndpoint>();
  const mcpRoutes = new Map<string, string>();
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

  /**
   * Mount one workspace's endpoint on that listener.
   *
   * @param workspaceRoot - The project root whose launcher owns the endpoint.
   * @param registry - The launcher's own tool registry; the endpoint dispatches into it.
   * @returns The URL and minter each external session is offered.
   */
  const mountMcp = (
    workspaceRoot: string,
    registry: Parameters<typeof createHostMcpEndpoint>[0]['registry'],
  ): McpBinding => {
    listenForMcp();
    /* Deliberately not the agent channel token (VI4): this secret signs a
     * capability that travels into a vendor adapter's process. */
    const endpoint = createHostMcpEndpoint({
      secret: randomBytes(32).toString('base64url'),
      registry,
    });
    const route = `/mcp/${randomUUID()}`;
    mcpEndpoints.set(route, endpoint);
    mcpRoutes.set(workspaceRoot, route);
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
      activate: (input) => endpoint.activate(input),
    };
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

  /** Stop one project's launcher and every utility resource rooted beneath it. */
  const releaseAgentHost = async (
    workspaceRoot: string,
    projectId: string,
    attachmentGeneration?: number,
  ): Promise<void> => {
    if (attachmentGeneration !== undefined && launcherGenerations.get(workspaceRoot) !== attachmentGeneration) {
      return;
    }
    const launcher = launchers.get(workspaceRoot);
    if (launcher !== undefined) {
      await launcher.close();
    }
    if (attachmentGeneration !== undefined && launcherGenerations.get(workspaceRoot) !== attachmentGeneration) {
      return;
    }
    if (launcher !== undefined && launchers.get(workspaceRoot) !== launcher) {
      return;
    }
    launchers.delete(workspaceRoot);
    launcherGenerations.delete(workspaceRoot);
    launcherProjectIds.delete(workspaceRoot);
    revisionRoots.delete(workspaceRoot);
    const checkoutsRoot = resolve(join(dirname(workspaceRoot), '.tau', 'checkouts', projectId));
    for (const [root, client] of connectedRuntimeClients) {
      if (root === workspaceRoot || root === checkoutsRoot || root.startsWith(`${checkoutsRoot}${sep}`)) {
        client.terminate();
        connectedRuntimeClients.delete(root);
        runtimeClients.delete(root);
      }
    }
    const route = mcpRoutes.get(workspaceRoot);
    if (route !== undefined) {
      mcpRoutes.delete(workspaceRoot);
      const endpoint = mcpEndpoints.get(route);
      mcpEndpoints.delete(route);
      await endpoint?.close();
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
      case 'agent-host-release': {
        const { attachmentGeneration, requestId, workspaceRoot: root, projectId } = frame;
        if (typeof requestId !== 'string' || typeof root !== 'string' || typeof projectId !== 'string') {
          return;
        }
        // async-iife: bootstrap -- a control frame has no caller to await project release.
        void (async () => {
          try {
            await releaseAgentHost(
              canonicalPath(root),
              projectId,
              typeof attachmentGeneration === 'number' ? attachmentGeneration : undefined,
            );
            agentHostReleased?.(requestId);
          } catch (error) {
            agentHostReleased?.(requestId, error instanceof Error ? error.message : String(error));
          }
        })();
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
    /* The physical spelling, because main addresses this project by its
     * realpath when it releases it while the renderer holds the spelling the
     * person granted — under `$TMPDIR` those differ by `/private`, and a
     * launcher filed under one of them is unreachable from the other. Every map
     * keyed off this root (launchers, generations, project ids, revision trees,
     * MCP routes, runtime clients through the checkouts beneath it) shares the
     * one key. */
    const workspaceRoot = canonicalPath(requested);
    launcherProjectIds.set(workspaceRoot, projectId);
    const requestedGeneration = Number(context?.['attachmentGeneration']);
    if (Number.isSafeInteger(requestedGeneration) && requestedGeneration >= 0) {
      launcherGenerations.set(workspaceRoot, requestedGeneration);
    }
    /**
     * One runtime client per tree, project or turn checkout.
     *
     * @param root - The tree the calling turn works in.
     * @returns Its connected runtime client.
     */
    const runtimeClient = async (root: string): Promise<DesktopClient> => {
      const existingClient = runtimeClients.get(root);
      if (existingClient) {
        const cached = await existingClient;
        if (cached.lifecycleState !== 'terminated') {
          return cached;
        }
        /* A client can die without its port closing — a render timeout shuts
         * the wire from this side — and a cached corpse answers every later
         * call with the same terminal sentence. */
        if (runtimeClients.get(root) === existingClient) {
          runtimeClients.delete(root);
          connectedRuntimeClients.delete(root);
        }
        /* Re-read after the await, the daemon's own shape (`host-daemon.ts`):
         * a concurrent caller waking from the same corpse may already have
         * installed its reconnect, and overwriting it here would leave its
         * client and main lease live with nothing left holding them. */
        const reconnect = runtimeClients.get(root);
        if (reconnect !== undefined) {
          return reconnect;
        }
      }
      if (!requestRuntimePort) {
        throw new Error('The desktop services host has no main runtime-port broker.');
      }
      let pending = Promise.resolve(undefined as unknown as DesktopClient);
      pending = (async (): Promise<DesktopClient> => {
        const runtimeLease = await requestRuntimePort(root);
        const runtimePort = runtimeLease.port;
        const client = createRuntimeClient<DesktopRuntime>({
          transport: electronUtilityMainTransport({
            port: runtimePort,
            release: runtimeLease.release,
          }),
          config: {
            tauApiUrl: agentHostConfig!.tauApiUrl,
            tauWebSocketUrl: agentHostConfig!.tauWebSocketUrl,
          },
        });
        /* Evict only. The transport is watching this same port, and it holds
         * the close for main's exit relay so the client can report the exit
         * code and stderr; terminating here would win that race and turn every
         * kernel-utility death into "RuntimeClient has been terminated." It
         * releases the lease on its own way out, so no utility leaks. */
        runtimePort.on('close', () => {
          if (runtimeClients.get(root) === pending) {
            runtimeClients.delete(root);
            connectedRuntimeClients.delete(root);
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
        /* Only while this is still the cached attempt: a settlement that landed
         * mid-connect already evicted and terminated it, and recording it now
         * would leave an orphan nothing can reach. */
        if (runtimeClients.get(root) === pending) {
          connectedRuntimeClients.set(root, connected);
        }
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
          const candidateRoot = resolve(checkout.cwd);
          candidateRoots.set(candidateRoot, (candidateRoots.get(candidateRoot) ?? 0) + 1);
          runtimeContext?.('register', checkout.cwd, workspaceRoot);
        }
        return super.set(runId, checkout);
      }

      public override delete(runId: string): boolean {
        const checkout = this.get(runId);
        const deleted = super.delete(runId);
        if (!deleted || checkout?.mode !== 'candidate') {
          return deleted;
        }
        const candidateRoot = resolve(checkout.cwd);
        const remaining = (candidateRoots.get(candidateRoot) ?? 1) - 1;
        if (remaining === 0) {
          candidateRoots.delete(candidateRoot);
        } else {
          candidateRoots.set(candidateRoot, remaining);
        }
        /* One checkout serves every turn on its branch, and main refcounts
         * nothing: releasing the grant while another run still holds this cwd
         * would disarm that run's next runtime request. The daemon's own guard
         * (`host-daemon.ts`), not `remaining === 0` — `candidateRoots` also
         * counts revision-filesystem admissions, so a settlement capture in
         * flight would skip the teardown forever. */
        if ([...this.values()].some((held) => held.mode === 'candidate' && held.cwd === checkout.cwd)) {
          return deleted;
        }
        /* The last run has left. The tree itself survives — only `discard`
         * removes a checkout — but nothing holds its runtime any more. */
        runtimeContext?.('release', checkout.cwd, workspaceRoot);
        const pending = runtimeClients.get(checkout.cwd);
        runtimeClients.delete(checkout.cwd);
        connectedRuntimeClients.delete(checkout.cwd);
        if (pending !== undefined) {
          /* Through the promise, not `connectedRuntimeClients`: a client still
           * connecting at settlement is recorded nowhere and would outlive
           * every reference to it. */
          // async-iife: bootstrap -- a checkout settlement cannot await the client it evicts.
          void (async () => {
            try {
              const evicted = await pending;
              evicted.terminate();
            } catch {
              /* A failed connection has no client left to terminate. */
            }
          })();
        }
        return deleted;
      }
    })();
    const useRevisionFileSystem = async <Result>(
      checkout: Readonly<{ root: string; kind: 'live' | 'linked' }>,
      operation: (provider: NodeFsProviderClient) => Promise<Result>,
    ): Promise<Result> => {
      const root = checkout.kind === 'live' ? workspaceRoot : resolve(checkout.root);
      if (checkout.kind === 'linked') {
        candidateRoots.set(root, (candidateRoots.get(root) ?? 0) + 1);
      }
      try {
        return await operation(providerForAgentRoot(root));
      } finally {
        if (checkout.kind === 'linked') {
          const remaining = (candidateRoots.get(root) ?? 1) - 1;
          if (remaining === 0) {
            candidateRoots.delete(root);
          } else {
            candidateRoots.set(root, remaining);
          }
        }
      }
    };
    const existing = launchers.get(workspaceRoot);
    let projectRevisions = revisionRoots.get(workspaceRoot);
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
          projectId,
          /* Desktop projects are immediate children of their connected
           * workspace. Keep linked worktrees in that workspace's private area,
           * which is the physical location `/checkouts/<id>` already mounts. */
          checkoutsDirectory: join(dirname(workspaceRoot), '.tau', 'checkouts', projectId),
          checkouts,
          ...(internalChannel === undefined
            ? {}
            : {
                filesystem: (checkout) =>
                  providerForAgentRoot(checkout.kind === 'live' ? workspaceRoot : checkout.root),
                useFileSystem: useRevisionFileSystem,
                checkoutMutation: async (target, mutation) =>
                  authority!.run({ root: target.parentRoot, paths: [target.targetPath] }, mutation),
              }),
          ...(gitExecutable === undefined ? {} : { gitExecutable }),
          /* AC15: who this window records for. The desktop's own signed-in
           * session is W13's to pass here; until it does, the identity the
           * person already keeps on this machine is the truthful answer. */
          actor: hostRevisionActor(),
          apiBaseUrl: agentHostConfig.tauApiUrl,
          tauCredential: () => {
            const token = authToken;
            return token === undefined
              ? undefined
              : {
                  apiBaseUrl: agentHostConfig!.tauApiUrl,
                  authorization: `Bearer ${token}`,
                };
          },
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
            log('agent-host.revision-not-recorded', {
              workspaceRoot,
              event: event.type,
            });
          },
        });
        projectRevisions = revisions;
        revisionRoots.set(workspaceRoot, revisions);
        const toolRegistry = createHostToolRegistry({
          workspaceRoot,
          checkouts,
          systemSkillBundles,
          revisions: revisions.history,
          ...(internalChannel === undefined ? {} : { filesystem: providerForAgentRoot }),
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
        const transportOptions = {
          baseUrl: agentHostConfig.gatewayBaseUrl,
          /* The renderer's own project id, which is the id `GET /v1/projects`
           * lists, so every receipt this launcher produces attributes to the
           * project the usage page can name. */
          projectId,
          auth: () => authToken,
        } as const;
        return revisions.record(
          createNodeAgentLauncher({
            workspaceRoot,
            gatewayBaseUrl: agentHostConfig.gatewayBaseUrl,
            systemPrompt: agentHostConfig.systemPrompt,
            toolRegistry,
            /* Resolved per request, never captured: main refreshes the bearer and a
             * captured string would pin this host to a stale one. */
            auth: () => authToken,
            /* The build defines this; a missing define must fail loudly rather than
             * quietly running a Cloud build on the self-host transport. */
            modelTransport: (tauCloudBuildEnabled ? createTauCloudGatewayModelTransport : createGatewayModelTransport)(
              transportOptions,
            ),
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
                    systemSkillBundles,
                    mcp: mountMcp(workspaceRoot, toolRegistry),
                  }),
                }
              : {}),
          }),
        );
      })();
    launchers.set(workspaceRoot, launcher);
    if (projectRevisions === undefined) {
      log('agent-host.revisions-unavailable', { workspaceRoot });
      port.close();
      return;
    }
    /* The handle owns only this connection — disposing it would end this
     * client's streams and nothing else. It needs no explicit teardown here:
     * `@taucad/rpc` reports the port's death and closes the channel itself, and
     * always-on lives in the launcher, which deliberately survives. */
    serveAgentChannel(port, launcher, {
      sessionKey: agentSessionKey,
      revisions: projectRevisions.channel,
    });
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
    const ownedRoots = [...launchers.keys()];
    nodeFileSystemDisposers.clear();
    runtimeFileSystemDisposers.clear();
    await settleAll(
      [
        ...runtimeDisposers.map(async (disposeFileSystem) => disposeFileSystem.drain()),
        ...fileSystemDisposers.map(async (disposeFileSystem) => disposeFileSystem()),
      ],
      failures,
    );

    /* Per project: each launcher's close revision has to land, and the runtime
     * clients and MCP routes rooted beneath it are released with it. */
    const closingLaunchers = ownedRoots.map(async (workspaceRoot) =>
      releaseAgentHost(
        workspaceRoot,
        launcherProjectIds.get(workspaceRoot) ?? '',
        launcherGenerations.get(workspaceRoot),
      ),
    );
    await settleAll(closingLaunchers, failures);
    await settleAll([stopAuthority()], failures);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'The services host could not quiesce every accepted operation.');
    }
    log('quiesced', { projects: closingLaunchers.length });
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

  const closeForDispose = async (launcher: NodeAgentLauncher): Promise<void> => {
    try {
      await launcher.close();
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
      /* Each launcher owns a revision actor tree over a served root, and a
       * disposed host must stop writing into a project it no longer serves.
       * Tracked rather than fire-and-forget: the internal authority has to stay
       * up until these closes finish. */
      const closingLaunchers = [...launchers.values()].map(async (launcher) => closeForDispose(launcher));
      launchers.clear();
      for (const disposeFileSystem of nodeFileSystemDisposers) {
        closingFileSystems.push(reportForcedFileSystemDisposal(disposeFileSystem));
      }
      nodeFileSystemDisposers.clear();
      launcherGenerations.clear();
      launcherProjectIds.clear();
      revisionRoots.clear();
      for (const endpoint of mcpEndpoints.values()) {
        void endpoint.close();
      }
      mcpEndpoints.clear();
      mcpRoutes.clear();
      mcpServer?.close();
      mcpServer = undefined;
      mcpOrigin = '';
      for (const client of connectedRuntimeClients.values()) {
        client.terminate();
      }
      runtimeClients.clear();
      connectedRuntimeClients.clear();
      /** Keep the internal authority alive through every final revision write. */
      const settleForcedCleanup = async (): Promise<void> => {
        await Promise.allSettled(
          gracefulSettlement === undefined
            ? [...closingFileSystems, ...closingLaunchers]
            : [gracefulSettlement, ...closingFileSystems, ...closingLaunchers],
        );
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
        default: {
          log('unknown-concern', { concern: record['concern'] });
          port.close();
        }
      }
    },
  };
};
