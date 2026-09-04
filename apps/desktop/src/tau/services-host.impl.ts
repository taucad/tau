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
 * Main sends the gateway, the model and the credential; the *workspace root*
 * arrives per connection, because one desktop app opens many projects and each
 * launcher owns exactly one directory. See
 * `docs/research/host-agnostic-transport-substrate-blueprint.md`.
 */

import { isAbsolute, resolve, sep } from 'node:path';

import { ResourceQueue } from '@taucad/filesystem';
import { NodeFsProvider, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import type { EmitterPort } from '@taucad/filesystem/backend/node';
import { createNodeAgentLauncher, serveAgentChannel } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { AgentSessionModel, ToolRegistry } from '@taucad/agent-host';
import { createChatToolRegistry, createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { createSkillResolver } from '@taucad/agent-tools/skills';

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
  readonly model: AgentSessionModel;
  readonly systemPrompt: string;
};

/** Options for {@link createServicesHost}. */
export type ServicesHostOptions = {
  /** Diagnostics sink; defaults to stdout, which main forwards to `userData/logs`. */
  readonly log?: (event: string, detail?: unknown) => void;
  /** Injected for tests. */
  readonly serve?: typeof serveNodeFsProvider;
};

/** The services host, seen by its entry and by tests. */
export type ServicesHost = {
  /** Handle one `process.parentPort` message. */
  handleMessage(message: UtilityMessage): void;
  /** Whether a renderer-named root may be served. */
  isTrustedRoot(root: string): boolean;
  /** Main's agent configuration, once it has sent the frame. */
  agentHostConfig(): AgentHostConfig | undefined;
};

/**
 * The tools launcher 2 offers over one workspace root.
 *
 * The same shared builder the daemon uses, so a desktop-placed run sees the
 * same names, descriptions and JSON Schemas a daemon-placed one does — and the
 * builder's offer-iff-client-supplied rule then lists exactly the file and
 * skill tools, because this cut attaches no runtime client. `screenshot`,
 * `export_geometry`, `get_kernel_result` and `test_model` need a brokered
 * kernel-utility port and arrive with it (substrate wave S3, second cut);
 * offering them now would cost the model a turn and a retry apiece.
 *
 * @param workspaceRoot - Absolute directory every file tool is confined to.
 * @returns The registry for that root.
 */
const createDesktopToolRegistry = (workspaceRoot: string): ToolRegistry => {
  const provider = new NodeFsProvider(workspaceRoot);
  const mutations = new ResourceQueue();
  return createChatToolRegistry({
    fileSystemFor: (signal) => createProviderRpcFileSystem({ provider, mutations, signal }),
    /* Skills are files, so the resolver reads the provider directly rather than
     * going back through the RPC filesystem. No system-skill layer: the UI's
     * catalog is built from bundler-only `?raw` imports, and this utility has no
     * bundler — the same absence the daemon has. */
    skillResolver: createSkillResolver({
      readFile: async (path) => provider.readFile(path),
      listDirectory: async (path) => {
        const names = await provider.readdir(path);
        return Promise.all(
          names.map(async (name) => {
            const entry = await provider.stat(path === '' ? name : `${path}/${name}`);
            return { name, isFolder: entry.type === 'dir' };
          }),
        );
      },
    }),
    testingEnabled: false,
  });
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
      console.log(`[tau-desktop:services] ${event}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
    });
  const serve = options.serve ?? serveNodeFsProvider;

  const trustedRoots = new Set<string>();
  /* One always-on launcher per workspace root, outliving every connection to
   * it: a run keeps executing with zero clients attached, which is the whole
   * point of the portable host. */
  const launchers = new Map<string, NodeAgentLauncher>();
  let authToken: string | undefined;
  let agentHostConfig: AgentHostConfig | undefined;

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
        log('agent-host-config-received', { model: agentHostConfig.model.id });
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
    const existing = launchers.get(workspaceRoot);
    const launcher =
      existing ??
      createNodeAgentLauncher({
        workspaceRoot,
        gatewayBaseUrl: agentHostConfig.gatewayBaseUrl,
        model: agentHostConfig.model,
        systemPrompt: agentHostConfig.systemPrompt,
        toolRegistry: createDesktopToolRegistry(workspaceRoot),
        /* Resolved per request, never captured: main refreshes the bearer and a
         * captured string would pin this host to a stale one. */
        auth: () => authToken,
      });
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
