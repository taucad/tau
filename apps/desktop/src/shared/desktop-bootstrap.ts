/**
 * The two names main and preload must agree on, in the one module both may
 * import: preload runs `contextBridge` at load, so main cannot import it, and
 * a duplicated string literal across a process boundary is how relays go quiet.
 *
 * The page needs the relay tag too, but `apps/ui` may not import from here
 * (ruling D3), so preload re-exposes it on `window.tau` rather than letting the
 * renderer repeat the literal.
 */

/** Argument prefix main uses to hand the preload its bootstrap payload. */
export const bootstrapArgumentPrefix = '--tau-bootstrap=';

/** Relay tag shared by main's `ipcMain` channel and the page-side listener. */
export const servicesPortRelayTag = 'tau:services-port';

/** Project-session ownership calls for launcher 2. */
export const agentHostSessionChannels = {
  retain: 'tau:agent-host:retain',
  release: 'tau:agent-host:release',
} as const;

/** Theme notification shared by main and preload for the native app icon. */
export const appIconThemeChannel = 'tau:app-icon-theme';

/**
 * The renderer's half of the quit hold (D31, P49).
 *
 * `ask` is main telling the page to run every session's closing; `quiesced` is
 * the page saying it is done — by finishing, or because the person pressed
 * *Quit anyway*. The accompanying boolean lets main distinguish a completed
 * close from that explicit bypass before it quiesces the services utility.
 */
export const quitChannels = {
  ask: 'tau:quit:ask',
  quiesced: 'tau:quit:quiesced',
} as const;

/**
 * The external ACP agents launcher 2 can start (W4-ACP).
 *
 * A call rather than a bootstrap value (D17): resolving them runs a CLI probe
 * and a real vendor model session on a 5 s clock, and freezing the answer into
 * `additionalArguments` made the window's *existence* wait on both. Main
 * answers when discovery settles, which is before any chat surface asks.
 */
export const externalAgentsChannel = 'tau:external-agents';

/**
 * The native half of the machine binding ceremony (blueprint D9, D10).
 *
 * `beginBinding` travels over the brokered `machines` port and answers with a
 * ceremony id; the secret that completes it never rides that channel. The
 * renderer posts it here, main forwards it to the services utility, and the
 * utility saves it in the host's vault, keyed by the printer, once the
 * printer accepts it. An omitted code reuses the saved one.
 */
export const machinesChannels = {
  completeBinding: 'tau:machines:complete-binding',
} as const;

/**
 * What `completeBinding` resolves when the ceremony fails: the host's typed `code`, when it has one, beside its
 * message. A failure resolves as data rather than rejecting, because an error crossing the context bridge keeps only
 * its message.
 */
export type DesktopMachineBindingFailure = Readonly<{ status: 'failed'; code?: string; message: string }>;

/**
 * Read-only Bambu Studio presets and settings for the Print pane (blueprint D12).
 *
 * Request/response only: the slice itself runs in the kernel utility on the
 * export route, never over these channels.
 */
export const slicersChannels = {
  bambuStudio: {
    status: 'tau:slicers:bambu-studio:status',
    catalog: 'tau:slicers:bambu-studio:catalog',
    resolveSelection: 'tau:slicers:bambu-studio:resolve-selection',
    settings: 'tau:slicers:bambu-studio:settings',
  },
} as const;

/** IPC methods for bounded compute-store authority controls. */
export const computeControlChannels = {
  inspect: 'tau:compute:inspect',
  clear: 'tau:compute:clear',
  collect: 'tau:compute:collect',
} as const;

/** Native kernels included by the desktop runtime recipe. */
export const desktopNativeKernelIds = [
  'build123d',
  ...(process.platform === 'darwin' && process.arch === 'arm64' ? (['picogk'] as const) : []),
] as const;

/** The two native app-icon variants. */
export type AppIconTheme = 'light' | 'dark';

/** What main puts behind {@link bootstrapArgumentPrefix}. */
export type DesktopBootstrap = {
  /** The `window.ENV` allowlist, resolved in main. */
  readonly env: Record<string, string>;
  /** `app.getPath('userData')/home` — known at preload time, per L2's contract. */
  readonly homeRoot: string;
  /** Capability advertisement used by the shared renderer's product catalog. */
  readonly runtimeKernelIds: readonly string[];
};

/**
 * Read the bootstrap payload from `webPreferences.additionalArguments`.
 *
 * @param argv - The renderer process's arguments.
 * @returns The payload, or empty defaults when main sent none.
 */
export const readBootstrap = (argv: readonly string[]): DesktopBootstrap => {
  const argument = argv.find((entry) => entry.startsWith(bootstrapArgumentPrefix));
  if (!argument) {
    return { env: {}, homeRoot: '', runtimeKernelIds: [] };
  }
  try {
    const parsed = JSON.parse(argument.slice(bootstrapArgumentPrefix.length)) as Partial<DesktopBootstrap>;
    return {
      env: parsed.env ?? {},
      homeRoot: parsed.homeRoot ?? '',
      runtimeKernelIds: parsed.runtimeKernelIds ?? [],
    };
  } catch {
    /* A malformed payload is a shell bug, not a renderer input; boot with
     * nothing so the renderer's own `Missing TAU_API_URL` names the failure. */
    return { env: {}, homeRoot: '', runtimeKernelIds: [] };
  }
};
