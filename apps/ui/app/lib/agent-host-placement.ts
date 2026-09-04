import { z } from 'zod';
import { packageVersion } from '@taucad/runtime/metadata';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host';
import type { TauAgentHostId } from '@taucad/chat';
import { createRemoteHostSession, listRemoteHosts, RemoteHostApiError } from '#lib/remote-host-client.js';
import { desktopBridge, isDesktopTarget, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import type { DesktopBridge } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';

/**
 * The transport ladder for a daemon-placed Tau turn (`agent-host-transports-and-offline.md`, F4).
 *
 * Three rungs are reachable from a page, and only three:
 * - **1 — same origin.** The daemon served this page, so its `/agent` socket is
 *   same-origin and the browser replays the `HttpOnly` cookie the daemon set on
 *   its HTML. Nothing is sent by hand, and no secret ever reaches script.
 * - **2 — relayed.** A paired device, reached through the API's session route.
 *   The browser leg is admitted by the API session cookie; the API relays
 *   frames on to the daemon.
 * - **5 — loopback.** `ws://127.0.0.1:<port>/agent` from a page on another
 *   origin. There is no admission design for it (ruling 2 forbids inventing a
 *   token hand-off), so it is *probed* and refused with a reason that names the
 *   two rungs that do work.
 *
 * Rungs 3 and 4 (a local CA and a public name) need operator infrastructure and
 * are not client-side placements at all.
 *
 * `in-process` is launcher 2 — the Electron services utility's own launcher,
 * reached over a brokered `MessagePort`. It is not a rung because there is no
 * transport to climb: no origin, no socket, no admission secret.
 */
export type AgentHostPlacementRung = 'in-process' | 1 | 2 | 5;

/** Every way a placement can fail, as a code the banner can key copy off. @public */
export type AgentHostPlacementErrorCode =
  | 'ORIGIN_NOT_HOSTED'
  | 'HOST_NOT_PAIRED'
  | 'HOST_OFFLINE'
  | 'HOST_NO_AGENT_ROUTE'
  | 'HOST_SESSION_REFUSED'
  | 'HOST_UNREACHABLE'
  | 'RUNG5_NO_ADMISSION'
  /** Launcher 2: main never posted a port, which is how it refuses an ungranted root. */
  | 'DESKTOP_ROOT_NOT_GRANTED';

/** A placement that could not be established, carrying which rung gave up. @public */
export class AgentHostPlacementError extends Error {
  public readonly code: AgentHostPlacementErrorCode;

  public readonly rung: AgentHostPlacementRung;

  public constructor(code: AgentHostPlacementErrorCode, rung: AgentHostPlacementRung, message: string) {
    super(message);
    this.name = 'AgentHostPlacementError';
    this.code = code;
    this.rung = rung;
  }
}

/**
 * What a daemon says about itself at `GET /.well-known/tau-host` (ruling 3).
 *
 * Served only while the agent capability is on, so a 404 — or a body that fails
 * this parse — means "this origin is not an agent host", never "try again".
 *
 * @public
 */
export const tauHostDescriptorSchema = z.strictObject({
  v: z.literal(1),
  agent: z.literal(true),
  label: z.string().min(1),
  workspaceRoot: z.string().min(1),
  /** External ACP agents this daemon can start (W4-ACP); absent = Tau runs only. */
  externalAgents: z.array(z.string().min(1)).optional(),
});

/** @public */
export type TauHostDescriptor = z.infer<typeof tauHostDescriptorSchema>;

/** One daemon the page may place a turn on. @public */
export type AgentHostPlacementTarget = {
  readonly hostId: TauAgentHostId;
  readonly rung: AgentHostPlacementRung;
  readonly label: string;
  /**
   * Absolute directory the host owns. Empty for `desktop`, whose root is a
   * property of the *project* and is therefore resolved at dial time rather
   * than at discovery — see {@link desktopWorkspaceRoot}.
   */
  readonly workspaceRoot: string;
  readonly online: boolean;
  /**
   * External ACP agents this host can start (W4-ACP). Each becomes its own row
   * in the selector; absent or empty means Tau's own runs only.
   */
  readonly externalAgents?: readonly string[] | undefined;
  /**
   * Set when this host is a cloud host (launcher 3) and names the project it was
   * provisioned for. A cloud host is a paired device in every other respect —
   * same rung, same offer, same agent channel — so this is presentation, not
   * mechanism: it is how the selector knows to call the row "Tau Cloud" instead
   * of naming a machine the user has never seen.
   */
  readonly cloudProjectId?: string | undefined;
};

/**
 * What this browser can and cannot do, for the cloud placement's auto-offer.
 *
 * @public
 */
export type CloudPlacementProbe = {
  /** An iOS-class device: memory and background limits the browser host cannot work around. */
  readonly iosClass: boolean;
  /** Missing a capability the browser agent host needs to run at all. */
  readonly downlevel: boolean;
};

/**
 * Read this browser's platform constraints.
 *
 * Safari *desktop* deliberately reports neither: PH8 is explicit that the cloud
 * placement exists for detached runs, iOS-class limits and downlevel fallback,
 * and that Safari runs the browser-local host interactively like every other
 * browser. `maxTouchPoints` is what separates the two on Apple, since iPadOS
 * Safari reports itself as a Macintosh.
 *
 * @param navigatorLike - Override, for tests.
 * @returns The probe result.
 * @public
 */
export const probeCloudPlacement = (
  navigatorLike: {
    readonly userAgent?: string;
    readonly maxTouchPoints?: number;
    readonly platform?: string;
  } = (globalThis as { navigator?: Navigator }).navigator ?? {},
): CloudPlacementProbe => {
  const agent = navigatorLike.userAgent ?? '';
  const touchPoints = navigatorLike.maxTouchPoints ?? 0;
  const apple = /iPhone|iPad|iPod/u.test(agent) || (/Macintosh/u.test(agent) && touchPoints > 1);
  return {
    iosClass: apple && touchPoints > 0,
    /* The browser host is a dedicated module worker writing an append-only log:
     * without workers or a storage backend there is nothing to fall back to but
     * a host somewhere else. */
    downlevel: typeof Worker === 'undefined' || typeof WebAssembly === 'undefined',
  };
};

/**
 * Whether a cloud host should be offered *automatically* for this browser.
 *
 * The row itself is always selectable — provisioning is the owner's choice to
 * make — and this decides only whether Tau reaches for it without being asked.
 * It is `false` on Safari desktop by construction (see {@link probeCloudPlacement}).
 *
 * ponytail: the hook has no caller yet. Its consumer is the placement default
 * for a project whose browser host reports `unavailable`, which lives in
 * `use-cad-agent-config.ts` — a file outside this lane's budget.
 *
 * @param probe - Override, for tests.
 * @returns Whether to offer the cloud placement without being asked.
 * @public
 */
export const shouldAutoOfferCloudPlacement = (probe: CloudPlacementProbe = probeCloudPlacement()): boolean =>
  probe.iosClass || probe.downlevel;

/** How long a socket may take to reach `open` before the rung is called dead. Milliseconds. */
const socketOpenTimeout = 8000;
/** How long the loopback probe waits before concluding the request never landed. Milliseconds. */
const loopbackProbeTimeout = 3000;

const originAgentSocketUrl = (origin: string): string => new URL('/agent', origin).href.replace(/^http/u, 'ws');

/**
 * This page's origin, or `undefined` when there isn't one.
 *
 * `location` is declared non-nullish by the DOM lib but is genuinely absent in
 * a Node test and reads the literal string `'null'` on an opaque origin —
 * neither of which can host a same-origin upgrade.
 */
const pageOrigin = (): string | undefined => {
  const origin = (globalThis as { location?: Location }).location?.origin;
  return origin === undefined || origin === 'null' ? undefined : origin;
};

/**
 * Ask this origin whether it is a daemon.
 *
 * @param options - Optional `fetch` and origin overrides, for tests.
 * @returns The descriptor, or `undefined` when this origin serves no agent.
 * @public
 */
export const discoverOriginAgentHost = async (
  options: {
    readonly fetch?: typeof globalThis.fetch | undefined;
    readonly origin?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  } = {},
): Promise<TauHostDescriptor | undefined> => {
  const origin = options.origin ?? pageOrigin();
  if (origin === undefined) {
    return undefined;
  }
  const request = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await request(new URL('/.well-known/tau-host', origin).href, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    // A page served by anything other than a daemon simply has no descriptor.
    return undefined;
  }
  if (!response.ok) {
    return undefined;
  }
  const parsed = tauHostDescriptorSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? parsed.data : undefined;
};

/**
 * Every placement target this page can see, rung 1 first.
 *
 * A paired device only appears once the daemon has advertised the agent
 * capability (ruling 4) — the API mints an agent route for nothing else.
 *
 * @param options - Optional discovery override, for tests.
 * @returns Targets in ladder order; never throws on a discovery failure.
 * @public
 */
export const listAgentHostPlacements = async (
  options: {
    readonly discoverOrigin?: typeof discoverOriginAgentHost | undefined;
    readonly listHosts?: typeof listRemoteHosts | undefined;
    /** Desktop-build override, for tests. */
    readonly desktop?: boolean | undefined;
  } = {},
): Promise<readonly AgentHostPlacementTarget[]> => {
  const [origin, paired] = await Promise.all([
    (options.discoverOrigin ?? discoverOriginAgentHost)(),
    (options.listHosts ?? listRemoteHosts)().catch(() => []),
  ]);
  /* Launcher 2 first: on the desktop build the in-process host is always there
   * — no discovery, no network — so it is the placement a user reaches for. */
  const desktopTarget: readonly AgentHostPlacementTarget[] =
    (options.desktop ?? isDesktopTarget)
      ? [{ hostId: 'desktop', rung: 'in-process', label: 'This computer', workspaceRoot: '', online: true }]
      : [];
  const originTarget: readonly AgentHostPlacementTarget[] = origin
    ? [
        {
          hostId: 'origin',
          rung: 1,
          label: origin.label,
          workspaceRoot: origin.workspaceRoot,
          online: true,
          ...(origin.externalAgents ? { externalAgents: origin.externalAgents } : {}),
        },
      ]
    : [];
  const pairedTargets: readonly AgentHostPlacementTarget[] = paired.flatMap(
    (device): readonly AgentHostPlacementTarget[] =>
      device.agent && device.revokedAt === null
        ? [
            {
              hostId: device.id,
              rung: 2,
              label: device.label,
              workspaceRoot: device.agent.workspaceRoot,
              online: device.online,
              ...(device.agent.externalAgents ? { externalAgents: device.agent.externalAgents } : {}),
              ...(device.cloudProjectId ? { cloudProjectId: device.cloudProjectId } : {}),
            },
          ]
        : [],
  );
  return [...desktopTarget, ...originTarget, ...pairedTargets];
};

/**
 * The absolute node directory one project occupies on this machine.
 *
 * Launcher 2 is brokered **per root**, not per project id: main grants a folder
 * and refuses everything else, so this is the value `agentHost.connect` takes.
 * A Home row names no path — its `userData/home` root is ambient — and a picked
 * folder names its own, exactly as the desktop kernel preset resolves it.
 *
 * @param projectId - Project to resolve.
 * @returns The absolute root.
 * @throws When the project is not on disk, so no host path can root a launcher.
 * @public
 */
export const desktopWorkspaceRoot = async (projectId: string): Promise<string> => {
  const config = await getProjectFileSystemConfig(projectId);
  if (config?.backend !== 'node') {
    throw new AgentHostPlacementError(
      'DESKTOP_ROOT_NOT_GRANTED',
      'in-process',
      'This project is not stored on disk, so the desktop agent host has no folder to work in.',
    );
  }
  return `${config.path ?? nodeHomeRoot()}/${config.providerBasePath}`;
};

/**
 * Wait for a socket to reach `open`.
 *
 * SP-5a: Safari never fires `close` on a connection a policy blocked, so `close`
 * alone can never be the failure signal. `error` plus a deadline is what
 * actually observes both the refused and the swallowed cases.
 */
const awaitSocketOpen = async (socket: WebSocket, openTimeout = socketOpenTimeout): Promise<void> => {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const settle = (outcome?: Error): void => {
      globalThis.clearTimeout(deadline);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onError);
      if (outcome) {
        reject(outcome);
      } else {
        resolve();
      }
    };
    const onOpen = (): void => {
      settle();
    };
    const onError = (): void => {
      settle(new Error('The connection to the agent host was refused.'));
    };
    const deadline = globalThis.setTimeout(() => {
      settle(new Error('The agent host did not answer in time.'));
    }, openTimeout);
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
    socket.addEventListener('close', onError, { once: true });
  });
};

type OpenAgentHostChannelOptions = {
  readonly origin?: string | undefined;
  readonly createSocket?: ((url: string) => WebSocket) | undefined;
  readonly createSession?: typeof createRemoteHostSession | undefined;
  readonly listHosts?: typeof listRemoteHosts | undefined;
  readonly runtimeVersion?: string | undefined;
  readonly openTimeout?: number | undefined;
  /** Absolute node root for a `desktop` placement; required for that host only. */
  readonly workspaceRoot?: string | undefined;
  /** Bridge override, for tests. */
  readonly bridge?: (() => Pick<DesktopBridge, 'agentHost'> | undefined) | undefined;
};

/**
 * Claim launcher 2's brokered port.
 *
 * Main refuses a root the user never granted by simply **never posting a
 * port**, so the only honest client behaviour is a bounded wait ending in a
 * typed refusal — a bare `await` would hang the composer forever.
 */
const desktopAgentPort = async (options: OpenAgentHostChannelOptions): Promise<MessagePort> => {
  const bridge = (options.bridge ?? desktopBridge)();
  const workspaceRoot = options.workspaceRoot ?? '';
  if (!bridge || workspaceRoot === '') {
    throw new AgentHostPlacementError(
      'DESKTOP_ROOT_NOT_GRANTED',
      'in-process',
      'The desktop agent host is only available inside the Tau desktop app, on a project stored on disk.',
    );
  }
  const refusal = async (): Promise<never> => {
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, options.openTimeout ?? socketOpenTimeout);
    });
    throw new AgentHostPlacementError(
      'DESKTOP_ROOT_NOT_GRANTED',
      'in-process',
      `Tau has no permission to work in ${workspaceRoot}. Reopen the folder from the desktop app and try again.`,
    );
  };
  return Promise.race([bridge.agentHost.connect(workspaceRoot), refusal()]);
};

/**
 * Resolve the socket URL for one rung-2 device, or say why it has none.
 *
 * Every failure here is typed: an offline device, a device that never
 * advertised the agent capability, and an API that refused the session are
 * three different things the user can act on differently.
 */
const relayedAgentUrl = async (deviceId: string, options: OpenAgentHostChannelOptions): Promise<string> => {
  const devices = await (options.listHosts ?? listRemoteHosts)().catch(() => undefined);
  const device = devices?.find((candidate) => candidate.id === deviceId);
  if (devices && !device) {
    throw new AgentHostPlacementError('HOST_NOT_PAIRED', 2, 'This computer is no longer paired with your account.');
  }
  if (device && !device.online) {
    throw new AgentHostPlacementError(
      'HOST_OFFLINE',
      2,
      `${device.label} is offline. Start \`tau serve\` on it and try again.`,
    );
  }
  if (device && !device.agent) {
    throw new AgentHostPlacementError(
      'HOST_NO_AGENT_ROUTE',
      2,
      `${device.label} is online but is not running an agent workspace. Restart it with \`tau serve --agentPort\`.`,
    );
  }
  let session: Awaited<ReturnType<typeof createRemoteHostSession>>;
  try {
    session = await (options.createSession ?? createRemoteHostSession)(
      deviceId,
      options.runtimeVersion ?? packageVersion,
    );
  } catch (error) {
    throw new AgentHostPlacementError(
      'HOST_SESSION_REFUSED',
      2,
      error instanceof RemoteHostApiError || error instanceof Error
        ? error.message
        : 'Tau could not open a session on that computer.',
    );
  }
  if (!session.agentUrl) {
    throw new AgentHostPlacementError(
      'HOST_NO_AGENT_ROUTE',
      2,
      'That computer accepted the session but offered no agent route.',
    );
  }
  return session.agentUrl;
};

/**
 * Dial one daemon and hand back an open T0 channel.
 *
 * No secret is ever assembled here (ruling 2): rung 1 rides the daemon's own
 * `HttpOnly` cookie on a same-origin upgrade, and rung 2 rides the API session
 * cookie. A URL never carries a token.
 *
 * @param hostId - `origin` for rung 1, otherwise a paired device id.
 * @param options - Socket, session and discovery overrides for tests.
 * @returns An open channel client.
 * @throws {AgentHostPlacementError} With the rung that gave up.
 * @public
 */
export const openAgentHostChannel = async (
  hostId: TauAgentHostId,
  options: OpenAgentHostChannelOptions = {},
): Promise<AgentChannelClient> => {
  if (hostId === 'desktop') {
    /* Wrapped the instant the port arrives, before any command: the utility
     * posts its channel hello on claim, and `wrapMessagePort` is what starts
     * the port — a listener attached later never sees that first frame. */
    return createAgentChannelClient(await desktopAgentPort(options), { sessionKey: 'tau-agent' });
  }
  const rung: AgentHostPlacementRung = hostId === 'origin' ? 1 : 2;
  let url: string;
  if (rung === 1) {
    const origin = options.origin ?? pageOrigin();
    if (origin === undefined) {
      throw new AgentHostPlacementError('ORIGIN_NOT_HOSTED', 1, 'This page was not served by an agent host.');
    }
    url = originAgentSocketUrl(origin);
  } else {
    url = await relayedAgentUrl(hostId, options);
  }
  const socket = (options.createSocket ?? ((next: string) => new WebSocket(next)))(url);
  /* Wrapped before `open`, deliberately: the daemon posts its channel hello the
   * instant the upgrade completes, and a listener attached later never sees it. */
  const client = createAgentChannelClient(socket);
  try {
    await awaitSocketOpen(socket, options.openTimeout);
  } catch (error) {
    client.close('open-failed');
    throw new AgentHostPlacementError(
      rung === 1 ? 'ORIGIN_NOT_HOSTED' : 'HOST_UNREACHABLE',
      rung,
      error instanceof Error ? error.message : 'The agent host could not be reached.',
    );
  }
  return client;
};

/**
 * Probe a loopback daemon from a page on another origin (rung 5).
 *
 * Always refuses, and that is the finding, not a stub: a page has no way to
 * present the daemon's cookie across origins, and Local Network Access blocks
 * the request outright in browsers that ship it — often without the request
 * ever reaching the daemon, so a "connection refused" here proves nothing about
 * whether the daemon is running.
 *
 * @param port - The loopback port to probe.
 * @param options - Socket and permission overrides, for tests.
 * @returns The observation, alongside the refusal reason.
 * @public
 */
export const probeLoopbackAgentHost = async (
  port: number,
  options: {
    readonly createSocket?: ((url: string) => WebSocket) | undefined;
    readonly queryPermission?: (() => Promise<PermissionState | undefined>) | undefined;
    readonly probeTimeout?: number | undefined;
  } = {},
): Promise<{ readonly reachable: boolean; readonly permission?: PermissionState | undefined }> => {
  const queryPermission =
    options.queryPermission ??
    (async (): Promise<PermissionState | undefined> => {
      const permissions = (globalThis as { navigator?: Navigator }).navigator?.permissions as
        | { query?: (descriptor: { name: string }) => Promise<PermissionStatus> }
        | undefined;
      if (typeof permissions?.query !== 'function') {
        return undefined;
      }
      /* Not in every browser's descriptor enum yet; a browser that rejects the
       * name simply reports nothing rather than throwing out of the probe. */
      try {
        const status = await permissions.query({ name: 'local-network-access' });
        return status.state;
      } catch {
        return undefined;
      }
    });
  const permission = await queryPermission();
  const socket = (options.createSocket ?? ((url: string) => new WebSocket(url)))(
    `ws://127.0.0.1:${String(port)}/agent`,
  );
  let reachable = false;
  try {
    await awaitSocketOpen(socket, options.probeTimeout ?? loopbackProbeTimeout);
    reachable = true;
  } catch {
    reachable = false;
  } finally {
    socket.close();
  }
  return { reachable, ...(permission === undefined ? {} : { permission }) };
};

/** The refusal every rung-5 selection gets, with the two rungs that do work. @public */
export const loopbackAdmissionRefusal = (label = 'That daemon'): AgentHostPlacementError =>
  new AgentHostPlacementError(
    'RUNG5_NO_ADMISSION',
    5,
    `${label} is running on this machine, but a page on this origin has no way to sign in to it. Open the daemon's own address (\`tau serve --ui\`), or pair it with your account and use it from there.`,
  );
