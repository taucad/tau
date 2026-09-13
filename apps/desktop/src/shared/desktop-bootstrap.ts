/**
 * The two names main and preload must agree on, in the one module both may
 * import: preload runs `contextBridge` at load, so main cannot import it, and
 * a duplicated string literal across a process boundary is how relays go quiet.
 *
 * The page needs the relay tag too, but `apps/ui` may not import from here
 * (ruling D3), so preload re-exposes it on `window.tau` rather than letting the
 * renderer repeat the literal.
 */

import type { ExternalAgentDescriptor } from '@taucad/agent-host';

/** Argument prefix main uses to hand the preload its bootstrap payload. */
export const bootstrapArgumentPrefix = '--tau-bootstrap=';

/** Relay tag shared by main's `ipcMain` channel and the page-side listener. */
export const servicesPortRelayTag = 'tau:services-port';

/** Theme notification shared by main and preload for the native app icon. */
export const appIconThemeChannel = 'tau:app-icon-theme';

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
  /**
   * External ACP agents launcher 2 knows about (W4-ACP), as the one canonical
   * descriptor (VSC1) — model list included, refusal code for one that cannot
   * be started — which the selector draws one row each from. Same lifetime as
   * {@link DesktopBootstrap.runtimeKernelIds}: a capability main resolved, and
   * probed, before the window existed, so the page reads it rather than
   * probing for it.
   */
  readonly externalAgents: readonly ExternalAgentDescriptor[];
  /**
   * Revision modes launcher 2 records a turn in (V17 / VSC5). The composer
   * offers its revision selector from this and nothing else, so a desktop build
   * that published none would silently take the choice away. Same shape and
   * lifetime as {@link DesktopBootstrap.externalAgents}: a capability of the
   * host main starts, known before the window existed.
   */
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
    return { env: {}, homeRoot: '', runtimeKernelIds: [], externalAgents: [] };
  }
  try {
    const parsed = JSON.parse(argument.slice(bootstrapArgumentPrefix.length)) as Partial<DesktopBootstrap>;
    return {
      env: parsed.env ?? {},
      homeRoot: parsed.homeRoot ?? '',
      runtimeKernelIds: parsed.runtimeKernelIds ?? [],
      externalAgents: parsed.externalAgents ?? [],
    };
  } catch {
    /* A malformed payload is a shell bug, not a renderer input; boot with
     * nothing so the renderer's own `Missing TAU_API_URL` names the failure. */
    return { env: {}, homeRoot: '', runtimeKernelIds: [], externalAgents: [] };
  }
};
