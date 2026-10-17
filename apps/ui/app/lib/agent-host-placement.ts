import { z } from 'zod';
import { Topic } from '@taucad/events';
import { packageVersion } from '@taucad/runtime/metadata';
import { agentChannelPort, createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelEndpoint } from '@taucad/agent-host/channel-client';
import type { CadAgentExecution, TauAgentHostId } from '@taucad/chat';
import { externalAgentDescriptorSchema } from '@taucad/agent-host/wire';
import type { AgentChannelClient } from '@taucad/agent-host';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
import { createRemoteHostSession, listRemoteHosts, RemoteHostApiError } from '#lib/remote-host-client.js';
import { desktopBridge, isDesktopTarget, nodeHomeRoot, onDesktopHostHandOff } from '#filesystem/desktop-bridge.js';
import type { DesktopBridge, DesktopHostHandOff } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { getComputeReuseMode } from '#lib/compute-reuse-preference.js';

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
 * - **5 — loopback, by URL.** `ws://127.0.0.1:<port>/agent` from a page on
 *   another origin: Tau Desktop (`app://tau`) or a website the daemon lists.
 *   Admission is a hand-off (ruling X54): `tau open --desktop` (or
 *   `--ui-origin`) gives the page the daemon's origin and a single-use code,
 *   the page redeems the code at the daemon for a session bound to its own
 *   origin, and offers that session as a WebSocket subprotocol. The token never
 *   reaches the page and a URL never carries the session. A loopback daemon
 *   with no redeemed session is still refused, naming how to hand it over.
 *
 * Rungs 3 and 4 (a local CA and a public name) need operator infrastructure and
 * are not client-side placements at all.
 *
 * `in-process` is launcher 2 — the Electron services utility's own launcher,
 * reached over a brokered `MessagePort`. It is not a rung because there is no
 * transport to climb: no origin, no socket, no admission secret.
 */
export type AgentHostPlacementRung = 'in-process' | 1 | 2 | 5;

/** The implicit local Tau-agent placement for this build target. @internal */
export const localAgentHostId = (): TauAgentHostId | undefined => (isDesktopTarget ? 'desktop' : undefined);

/**
 * The daemon one execution is placed on, or `undefined` for this page's own
 * worker.
 *
 * An external agent is *always* daemon-placed (`acpAgentExecutionSchema`
 * requires a `hostId`); a Tau turn falls back to this build's local launcher.
 *
 * @param execution - The turn's execution.
 * @returns The host id, or `undefined` for the browser worker.
 * @public
 */
export const daemonPlacementOf = (execution: CadAgentExecution): TauAgentHostId | undefined =>
  execution.kind === 'tau' ? (execution.hostId ?? localAgentHostId()) : execution.hostId;

/** Descriptors by agent id, as of the last discovery pass. */
const discoveredAgents = new Map<string, ExternalAgentDescriptor>();

/** Paired hosts that are cloud hosts, as of the last discovery pass. */
const cloudHostIds = new Set<string>();

/**
 * The telemetry placement one execution runs on: this page's worker, the
 * desktop launcher, a cloud host, or any other daemon.
 *
 * @param execution - The turn's execution.
 * @returns A bounded `agent_placement` label.
 * @public
 */
export const agentPlacementOf = (execution: CadAgentExecution): 'browser' | 'desktop' | 'daemon' | 'cloud' => {
  const hostId = daemonPlacementOf(execution);
  if (hostId === undefined) {
    return 'browser';
  }
  if (hostId === 'desktop') {
    return 'desktop';
  }
  return cloudHostIds.has(hostId) ? 'cloud' : 'daemon';
};

/**
 * The product name one external agent goes by (V14).
 *
 * The descriptor's `displayName` is the single source — the per-file name maps
 * that used to spell "Claude Code" and "Codex" in the selector *and* the
 * approval banner are gone — so a surface that has no placement in hand reads
 * it here rather than keeping a third copy.
 *
 * @param agentId - Registry id the execution names.
 * @returns The product name, falling back to the id for an agent no host has described yet.
 * @public
 */
export const externalAgentDisplayName = (agentId: string): string =>
  discoveredAgents.get(agentId)?.displayName ?? agentId;

/** Host ids of a loopback daemon reached by URL (rung 5) start with this, followed by its origin. @public */
export const loopbackHostIdPrefix = 'loopback:';

/**
 * The rung one host id is placed on.
 *
 * @param hostId - The execution's host id.
 * @returns `in-process` for this computer, 1 for this page's origin, 5 for a loopback daemon by URL, else 2.
 * @public
 */
export const placementRungOf = (hostId: TauAgentHostId): AgentHostPlacementRung => {
  if (hostId === 'desktop') {
    return 'in-process';
  }
  if (hostId === 'origin') {
    return 1;
  }
  return hostId.startsWith(loopbackHostIdPrefix) ? 5 : 2;
};

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
  | 'DESKTOP_ROOT_NOT_GRANTED'
  /** The desktop build has no browser agent worker to construct; nothing to grant or retry. */
  | 'BROWSER_HOST_UNAVAILABLE';

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
  /** External ACP agents this daemon knows about (W4-ACP); absent = Tau runs only. */
  externalAgents: z.array(externalAgentDescriptorSchema).max(16).optional(),
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
   * External ACP agents this host knows about (W4-ACP). Each becomes its own
   * row in the selector — a refused one as a row that says why it cannot run —
   * and absent or empty means Tau's own runs only.
   */
  readonly externalAgents?: readonly ExternalAgentDescriptor[] | undefined;
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
 * Read one origin's daemon descriptor.
 *
 * @param origin - The origin to ask.
 * @param options - Optional `fetch` and cancellation.
 * @returns The descriptor, or `undefined` when that origin serves no agent or does not answer this page.
 */
const fetchTauHostDescriptor = async (
  origin: string,
  options: { readonly fetch?: typeof globalThis.fetch | undefined; readonly signal?: AbortSignal | undefined } = {},
): Promise<TauHostDescriptor | undefined> => {
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
  // Dotted access: Vite substitutes `import.meta.env.X` textually (see `#lib/build-target`).
  if (import.meta.env.TAU_ORIGIN_AGENT_HOST === 'absent') {
    return undefined;
  }
  const origin = options.origin ?? pageOrigin();
  if (origin === undefined) {
    return undefined;
  }
  return fetchTauHostDescriptor(origin, options);
};

/** One loopback daemon this page redeemed a hand-off code at: its origin and the session bound to this page. */
type LoopbackAdmission = { readonly origin: string; readonly session: string };

/** Loopback daemons this page holds a session for, by host id. */
const loopbackAdmissions = new Map<TauAgentHostId, LoopbackAdmission>();
const loopbackChanges = new Topic<void>({ name: 'agentHostPlacement.loopbackChanges' });
/* Per tab: a reload keeps the daemon, a new tab is handed one of its own. */
const loopbackStorageKey = 'tau:loopback-agent-hosts';
let loopbackRestored = false;

/* The same loopback shapes the desktop shell admits from a `tau://host/…` link, and the daemon binds. */
const loopbackOriginPattern = /^http:\/\/(?:127\.0\.0\.1|localhost):([1-9]\d{0,4})$/u;

const isLoopbackOrigin = (origin: string): boolean => {
  const port = loopbackOriginPattern.exec(origin)?.[1];
  return port !== undefined && Number(port) <= 65_535;
};

const restoreLoopbackAdmissions = (): void => {
  if (loopbackRestored) {
    return;
  }
  loopbackRestored = true;
  try {
    const stored = JSON.parse(globalThis.sessionStorage.getItem(loopbackStorageKey) ?? '[]') as unknown;
    for (const entry of Array.isArray(stored) ? stored : []) {
      const { origin, session } = (entry ?? {}) as { readonly origin?: unknown; readonly session?: unknown };
      if (typeof origin === 'string' && typeof session === 'string' && isLoopbackOrigin(origin)) {
        loopbackAdmissions.set(`${loopbackHostIdPrefix}${origin}`, { origin, session });
      }
    }
  } catch {
    // Storage blocked or garbled: the page simply holds no session until it is handed one again.
  }
};

const admitLoopbackHost = (admission: LoopbackAdmission): TauAgentHostId => {
  restoreLoopbackAdmissions();
  const hostId: TauAgentHostId = `${loopbackHostIdPrefix}${admission.origin}`;
  loopbackAdmissions.set(hostId, admission);
  try {
    globalThis.sessionStorage.setItem(loopbackStorageKey, JSON.stringify([...loopbackAdmissions.values()]));
  } catch {
    // Kept for this page's lifetime only.
  }
  loopbackChanges.emit();
  return hostId;
};

/**
 * Listen for a loopback daemon this page was handed, so a listing can be re-run.
 *
 * @param listener - Called after each redemption.
 * @returns Unsubscribe.
 * @public
 */
export const onLoopbackAgentHostsChanged = (listener: () => void): (() => void) =>
  loopbackChanges.subscribe(() => {
    listener();
  });

/** Test-only reset of the loopback admissions. @internal */
export const resetLoopbackAgentHosts = (): void => {
  loopbackAdmissions.clear();
  loopbackRestored = false;
  try {
    globalThis.sessionStorage.removeItem(loopbackStorageKey);
  } catch {
    // Nothing stored.
  }
};

const loopbackTarget = (
  hostId: TauAgentHostId,
  origin: string,
  descriptor: TauHostDescriptor | undefined,
): AgentHostPlacementTarget => ({
  hostId,
  rung: 5,
  label: descriptor?.label ?? new URL(origin).host,
  workspaceRoot: descriptor?.workspaceRoot ?? '',
  online: descriptor !== undefined,
  ...(descriptor?.externalAgents ? { externalAgents: descriptor.externalAgents } : {}),
});

/**
 * Redeem a daemon hand-off (rung 5, ruling X54): exchange the single-use code at the loopback daemon for a session
 * bound to this page's origin, and place the daemon among this page's hosts.
 *
 * @param handOff - The loopback origin and the code `tau open --desktop` (or `--ui-origin`) handed this page.
 * @param options - Optional `fetch`, for tests.
 * @returns The daemon as a placement target.
 * @throws {AgentHostPlacementError} `RUNG5_NO_ADMISSION` for a non-loopback origin or a refused code, and
 *   `HOST_UNREACHABLE` when the daemon does not answer.
 * @public
 */
export const redeemLoopbackHandOff = async (
  handOff: DesktopHostHandOff,
  options: { readonly fetch?: typeof globalThis.fetch | undefined } = {},
): Promise<AgentHostPlacementTarget> => {
  const { origin, code } = handOff;
  if (!isLoopbackOrigin(origin)) {
    throw new AgentHostPlacementError(
      'RUNG5_NO_ADMISSION',
      5,
      `${origin} is not a daemon on this computer, so Tau will not sign in to it.`,
    );
  }
  const request = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await request(new URL('/.well-known/tau-host/session', origin).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
  } catch {
    throw new AgentHostPlacementError(
      'HOST_UNREACHABLE',
      5,
      `The daemon at ${origin} did not answer. Check that \`tau open\` is still running, then run it again.`,
    );
  }
  const body = (response.ok ? await response.json().catch(() => undefined) : undefined) as
    | { readonly v?: unknown; readonly session?: unknown }
    | undefined;
  if (body?.v !== 1 || typeof body.session !== 'string' || body.session === '') {
    throw new AgentHostPlacementError(
      'RUNG5_NO_ADMISSION',
      5,
      response.status === 403
        ? `The daemon at ${origin} does not admit this page. Run \`tau open --desktop\`, or \`tau open --ui-origin=<this site>\`, to hand it over.`
        : `That link to the daemon at ${origin} was already used or has expired. Run \`tau open --desktop\` again.`,
    );
  }
  const hostId = admitLoopbackHost({ origin, session: body.session });
  const descriptor = await fetchTauHostDescriptor(origin, options);
  return loopbackTarget(hostId, origin, descriptor);
};

/**
 * Take every daemon hand-off this page is given (X54): from the desktop shell's `tau://host/…` links, and on the web
 * from a `#tau-host=<origin>&tau-code=<code>` fragment, which is removed from the address at once.
 *
 * @param notify - Told of each redemption's outcome, for a toast.
 * @param options - Location, history and redemption overrides, for tests.
 * @returns Unsubscribe from the desktop shell.
 * @public
 */
export const installLoopbackHandOff = (
  notify: (outcome: { readonly target: AgentHostPlacementTarget } | { readonly error: Error }) => void,
  options: {
    readonly location?: Pick<Location, 'hash' | 'pathname' | 'search'> | undefined;
    readonly history?: Pick<History, 'replaceState' | 'state'> | undefined;
    readonly redeem?: typeof redeemLoopbackHandOff | undefined;
    readonly onDesktopHandOff?: typeof onDesktopHostHandOff | undefined;
  } = {},
): (() => void) => {
  const redeem = (handOff: DesktopHostHandOff): void => {
    // async-iife: bootstrap -- a hand-off arrives from an event, and its outcome goes to `notify`.
    void (async () => {
      try {
        notify({ target: await (options.redeem ?? redeemLoopbackHandOff)(handOff) });
      } catch (error) {
        notify({ error: error instanceof Error ? error : new Error(String(error)) });
      }
    })();
  };
  const location = options.location ?? (globalThis as { location?: Location }).location;
  if (location?.hash.includes('tau-code=')) {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const origin = fragment.get('tau-host') ?? '';
    const code = fragment.get('tau-code') ?? '';
    fragment.delete('tau-host');
    fragment.delete('tau-code');
    const rest = fragment.toString();
    const history = options.history ?? (globalThis as { history?: History }).history;
    /* The code is spent on first use either way; keeping it out of the address keeps it out of bookmarks and shares. */
    history?.replaceState(history.state, '', `${location.pathname}${location.search}${rest === '' ? '' : `#${rest}`}`);
    redeem({ origin, code });
  }
  return (options.onDesktopHandOff ?? onDesktopHostHandOff)(redeem);
};

let directoryOutage: string | undefined;

/**
 * The host directory's own refusal, once `GET /v1/agents` has failed.
 *
 * Discovery still must not throw — rung 1 and launcher 2 are placeable without
 * the directory — but swallowing its message left a *persisted* rung-2
 * selection with no availability at all, so its dispatch waited out the whole
 * probe timeout and then refused naming nothing.
 *
 * @returns The refusal, or `undefined` while the directory is answering.
 * @internal
 */
export const hostDirectoryOutage = (): string | undefined => directoryOutage;

let discoveryIncomplete = false;

/**
 * Whether the last listing lost a source and is missing rows it should carry.
 *
 * A failed external-agent call used to be indistinguishable from a computer
 * that simply has no Claude Code or Codex installed, and discovery runs once
 * per project — so one transient IPC failure hid them until the project
 * changed. Callers re-run discovery while this is true.
 *
 * @returns Whether the listing is worth retrying.
 * @internal
 */
export const hostPlacementsIncomplete = (): boolean => discoveryIncomplete;

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
    /** Desktop-bridge override, for tests. */
    readonly bridge?: typeof desktopBridge | undefined;
    /** Loopback descriptor override, for tests. */
    readonly describeLoopback?: ((origin: string) => Promise<TauHostDescriptor | undefined>) | undefined;
  } = {},
): Promise<readonly AgentHostPlacementTarget[]> => {
  directoryOutage = undefined;
  discoveryIncomplete = false;
  const bridge = (options.bridge ?? desktopBridge)();
  restoreLoopbackAdmissions();
  const [origin, paired, desktopAgents, loopbackTargets] = await Promise.all([
    (options.discoverOrigin ?? discoverOriginAgentHost)(),
    (options.listHosts ?? listRemoteHosts)().catch((error: unknown) => {
      directoryOutage = error instanceof Error ? error.message : 'Tau could not reach your paired computers.';
      return [];
    }),
    /* Asked for beside the other two rather than read off the launch bootstrap:
     * main answers when its CLI and model probes settle, and the window no
     * longer waits on them (D17). */
    bridge?.externalAgents().catch((error: unknown) => {
      /* Keep the row, mark the listing incomplete: an empty answer here reads
       * as "nothing is installed", which is the wrong story to tell. */
      discoveryIncomplete = true;
      console.error('[agentHostPlacement] external agent listing failed', error);
      return [];
    }) ?? [],
    /* Each daemon this page was handed (rung 5) answers its own descriptor across origins, or reads as offline. */
    Promise.all(
      [...loopbackAdmissions].map(async ([hostId, admission]) =>
        loopbackTarget(
          hostId,
          admission.origin,
          await (options.describeLoopback ?? (async (next: string) => fetchTauHostDescriptor(next)))(admission.origin),
        ),
      ),
    ),
  ]);
  /* Launcher 2 first: on the desktop build the in-process host is always there
   * — no discovery, no network — so it is the placement a user reaches for. The
   * external agents are the one thing it *cannot* assume: main resolved and
   * CLI-probed them at startup, so they arrive on the bridge exactly as the
   * daemon's arrive on its descriptor. */
  const desktopTarget: readonly AgentHostPlacementTarget[] =
    (options.desktop ?? isDesktopTarget)
      ? [
          {
            hostId: 'desktop',
            rung: 'in-process',
            label: 'This computer',
            workspaceRoot: '',
            online: true,
            ...(desktopAgents.length > 0 ? { externalAgents: desktopAgents } : {}),
          },
        ]
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
  const targets = [...desktopTarget, ...originTarget, ...pairedTargets, ...loopbackTargets];
  discoveredAgents.clear();
  cloudHostIds.clear();
  for (const target of targets) {
    if (target.cloudProjectId !== undefined) {
      cloudHostIds.add(target.hostId);
    }
    for (const agent of target.externalAgents ?? []) {
      discoveredAgents.set(agent.id, agent);
    }
  }
  return targets;
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
  readonly createSocket?: ((url: string, protocols?: readonly string[]) => WebSocket) | undefined;
  readonly createSession?: typeof createRemoteHostSession | undefined;
  readonly listHosts?: typeof listRemoteHosts | undefined;
  readonly runtimeVersion?: string | undefined;
  readonly openTimeout?: number | undefined;
  /** Absolute node root for a `desktop` placement; required for that host only. */
  readonly workspaceRoot?: string | undefined;
  /** Canonical manifest project id for a `desktop` placement. */
  readonly projectId?: string | undefined;
  /** Bridge override, for tests. */
  readonly bridge?: (() => { readonly agentHost: Pick<DesktopBridge['agentHost'], 'connect'> } | undefined) | undefined;
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
  const projectId = options.projectId ?? '';
  if (!bridge || workspaceRoot === '' || projectId === '') {
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
  return Promise.race([
    bridge.agentHost.connect({
      workspaceRoot,
      projectId,
      computeMode: getComputeReuseMode(),
    }),
    refusal(),
  ]);
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

/** The client's liveness bound on a daemon that keeps alive every two seconds (T9 E3, E4). Milliseconds. */
const daemonLivenessTimeout = 10_000;

/**
 * Dial one daemon and hand back its agent channel client.
 *
 * No token is ever assembled here (ruling 2): rung 1 rides the daemon's own
 * `HttpOnly` cookie on a same-origin upgrade, rung 2 rides the API session
 * cookie, and rung 5 offers the session this page redeemed from a single-use
 * hand-off code (X54) as a subprotocol. A URL never carries a secret.
 *
 * The first dial happens here, and its refusal is thrown with the rung that gave
 * up. The client redials through the same ladder when the wire dies (a relayed
 * session is minted afresh each time) and re-sends its unanswered commands by key.
 *
 * @param hostId - `origin` for rung 1, `loopback:<origin>` for rung 5, otherwise a paired device id.
 * @param options - Socket, session and discovery overrides for tests.
 * @returns A channel client whose first connection is open.
 * @throws {AgentHostPlacementError} With the rung that gave up.
 * @public
 */
export const openAgentHostChannel = async (
  hostId: TauAgentHostId,
  options: OpenAgentHostChannelOptions = {},
): Promise<AgentChannelClient> => {
  const dial = async (): Promise<AgentChannelEndpoint> => {
    if (hostId === 'desktop') {
      /* Wrapped the instant the port arrives: the utility posts its channel
       * hello on claim, and wrapping is what starts the port. */
      return agentChannelPort(await desktopAgentPort(options));
    }
    const rung = placementRungOf(hostId);
    let url: string;
    let protocols: readonly string[] | undefined;
    if (rung === 1) {
      const origin = options.origin ?? pageOrigin();
      if (origin === undefined) {
        throw new AgentHostPlacementError('ORIGIN_NOT_HOSTED', 1, 'This page was not served by an agent host.');
      }
      url = originAgentSocketUrl(origin);
    } else if (rung === 5) {
      restoreLoopbackAdmissions();
      const admission = loopbackAdmissions.get(hostId);
      if (admission === undefined) {
        throw loopbackAdmissionRefusal(hostId.slice(loopbackHostIdPrefix.length));
      }
      url = originAgentSocketUrl(admission.origin);
      protocols = ['tau-agent', `tau-session.${admission.session}`];
    } else {
      url = await relayedAgentUrl(hostId, options);
    }
    const socket = (
      options.createSocket ??
      ((next: string, offered?: readonly string[]) => new WebSocket(next, offered ? [...offered] : undefined))
    )(url, protocols);
    /* Wrapped before `open`, deliberately: the daemon posts its channel hello the
     * instant the upgrade completes, and a listener attached later never sees it. */
    const port = agentChannelPort(socket);
    try {
      await awaitSocketOpen(socket, options.openTimeout);
    } catch (error) {
      port.close();
      throw new AgentHostPlacementError(
        rung === 1 ? 'ORIGIN_NOT_HOSTED' : 'HOST_UNREACHABLE',
        rung,
        error instanceof Error ? error.message : 'The agent host could not be reached.',
      );
    }
    return port;
  };
  const first = await dial();
  let firstUnused = true;
  return createAgentChannelClient({
    connect: async () => {
      if (firstUnused) {
        firstUnused = false;
        return first;
      }
      return dial();
    },
    livenessTimeout: daemonLivenessTimeout,
    sessionKey: 'tau-agent',
  });
};

/**
 * Probe a loopback daemon from a page on another origin (rung 5), before any hand-off.
 *
 * Reachability only, never admission: without a redeemed hand-off code a page has
 * no way to sign in across origins, and Local Network Access blocks the request
 * outright in browsers that ship it — often without the request ever reaching the
 * daemon, so a "connection refused" here proves nothing about whether the daemon
 * is running.
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

/** The refusal a rung-5 selection gets while this page holds no session for that daemon, naming the hand-off. @public */
export const loopbackAdmissionRefusal = (label = 'That daemon'): AgentHostPlacementError =>
  new AgentHostPlacementError(
    'RUNG5_NO_ADMISSION',
    5,
    `${label} is running on this machine, but this page has not been handed it. Run \`tau open --desktop\` (or \`tau open --ui-origin=<this site>\`) to hand it over, open the daemon's own address, or pair it with your account.`,
  );
