/**
 * Renderer-side seam onto the Electron shell.
 *
 * Everything the desktop build needs from the main process arrives through one
 * preload-installed object, so the browser build reaches exactly one `undefined`
 * check and nothing else. The shell (lane L5) owns the other half; the shape
 * declared here is the contract.
 *
 * `contextBridge` can only carry plain values and functions, so the shell
 * exposes those and this module builds `connect()` on top: the services
 * `MessagePort` is relayed into the page and claimed through
 * `@taucad/runtime/electron/renderer`, whose same-window guard is the tree's
 * one relay-acceptance predicate.
 */
import { isDesktopTarget as isDesktopBuildTarget } from '#lib/build-target.js';

/**
 * The `window.tau` object the preload script installs on the desktop build:
 * plain values and functions only, which is all `contextBridge` can carry.
 */
type DesktopShell = {
  /** Relay tag preload stamps on the message carrying a services port. */
  readonly relayTag: string;
  readonly nodeFs: { readonly homeRoot: string };
  readonly runtimeKernelIds?: readonly string[];
  readonly nativeCode?: DesktopBridge['nativeCode'];
  readonly appIcon: { setTheme(theme: 'light' | 'dark'): void };
  readonly dialog: DesktopBridge['dialog'];
  readonly openFiles: DesktopBridge['openFiles'];
  readonly quickLook: {
    readonly directPreviewExtensions: readonly string[];
    previewPath(request: { readonly path: string; readonly displayName?: string }): Promise<DesktopQuickLookResult>;
    previewUsdz(request: {
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly displayName: string;
    }): Promise<DesktopQuickLookResult>;
    close(): void;
  };
  /** Ask main to broker a port for one concern; answered by a relayed message. */
  requestServicesPort(requestId: string, concern: string, context?: Readonly<Record<string, string>>): void;
};

export type DesktopQuickLookResult = { readonly success: true } | { readonly success: false; readonly error: string };

/** Keep the native app icon aligned with Tau's resolved local theme. */
export const setDesktopAppIconTheme = (theme: 'light' | 'dark'): void => {
  if (!isDesktopBuildTarget()) {
    return;
  }
  (globalThis as { tau?: DesktopShell }).tau?.appIcon.setTheme(theme);
};

/**
 * The desktop seam, as `apps/ui` consumes it.
 * @public
 */
export type DesktopBridge = {
  readonly runtimeKernelIds: readonly string[];
  readonly nativeCode: {
    isTrusted(projectRoot: string): Promise<boolean>;
    grant(projectRoot: string): Promise<boolean>;
    revoke(projectRoot: string): Promise<void>;
  };
  readonly nodeFs: {
    /**
     * Absolute host directory backing the node Home workspace
     * (`app.getPath('userData')/home`). Known at preload time, so it is a plain
     * value rather than a call: `handle-store` needs it synchronously to build
     * the project-root configuration.
     */
    readonly homeRoot: string;
    /**
     * Ask main to broker a fresh `MessageChannelMain` to the node filesystem
     * host in the services utility, and hand back this side of it.
     */
    connect(): Promise<MessagePort>;
  };
  readonly agentHost: {
    /**
     * Ask main to broker a fresh `MessageChannelMain` to the portable agent
     * host's Node launcher for `workspaceRoot`, and hand back this side of it.
     *
     * The far end is `serveAgentChannel(port, launcher)` in the services
     * utility — ruling C3's launcher 2 — so the page drives it with
     * `createAgentChannelClient` from `@taucad/agent-host/channel-client`:
     * structured frames, no codec, the same T0 vocabulary the daemon serves
     * over a WebSocket. Main refuses a root the user never granted, and the
     * promise then never settles rather than resolving onto a port to nowhere.
     */
    connect(workspaceRoot: string): Promise<MessagePort>;
  };
  readonly dialog: {
    /**
     * Native directory picker. Resolves to the chosen absolute path, or
     * `undefined` when the user cancels — the shape `showDirectoryPicker`'s
     * `AbortError` is normalized to.
     */
    selectDirectory(options?: { readonly id?: string }): Promise<string | undefined>;
  };
  readonly openFiles: {
    /** Consume paths delivered by macOS Open With as bounded file payloads. */
    consume(): Promise<readonly { readonly bytes: Uint8Array<ArrayBuffer>; readonly name: string }[]>;
  };
  readonly quickLook: DesktopShell['quickLook'];
};

/**
 * True on the Electron renderer build.
 *
 * Delegates to `#lib/build-target.js` so exactly one module reads the define.
 * The previous bracket read (`import.meta.env['TAU_TARGET']`) was never
 * substituted by Vite's textual `define`, so it evaluated to `undefined` at
 * runtime and left every desktop branch in the web bundle.
 */
export const isDesktopTarget = isDesktopBuildTarget();

let built: DesktopBridge | undefined;
/** Correlates one `connect()` with its own relayed port. */
let servicesRequests = 0;

/**
 * The installed bridge, or `undefined` on the web build (and on a desktop
 * renderer whose preload has not run yet).
 *
 * Built once per document from the shell's plain seam: `connect()` mints a
 * request id, subscribes to the relay, *then* asks — a shell that answers
 * synchronously must not beat its own listener.
 *
 * @returns The desktop bridge when present.
 */
export const desktopBridge = (): DesktopBridge | undefined => {
  const shell = isDesktopTarget ? (globalThis as { tau?: DesktopShell }).tau : undefined;
  if (!shell) {
    return undefined;
  }
  /**
   * One brokered concern port: mint a request id, subscribe to the relay,
   * *then* ask. Shared by both concerns so the listener-before-request order —
   * the thing a shell answering synchronously would break — exists once.
   */
  const connectServices = async (concern: string, context?: Readonly<Record<string, string>>): Promise<MessagePort> => {
    /* Dynamic so the electron renderer module never enters the web bundle's
     * eager graph — this module is reached from it. */
    const { awaitElectronRelayedPort } = await import('@taucad/runtime/electron/renderer');
    servicesRequests += 1;
    const requestId = `tau-services-${servicesRequests}`;
    const relayed = awaitElectronRelayedPort(shell.relayTag, (payload) => payload['requestId'] === requestId);
    shell.requestServicesPort(requestId, concern, context);
    return relayed;
  };

  built ??= {
    runtimeKernelIds: shell.runtimeKernelIds ?? [],
    nativeCode: shell.nativeCode ?? {
      isTrusted: async () => false,
      grant: async () => false,
      revoke: async () => undefined,
    },
    nodeFs: {
      homeRoot: shell.nodeFs.homeRoot,
      connect: async () => connectServices('nodeFs'),
    },
    agentHost: {
      connect: async (workspaceRoot: string) => connectServices('agentHost', { workspaceRoot }),
    },
    dialog: shell.dialog,
    openFiles: shell.openFiles,
    quickLook: shell.quickLook,
  };
  return built;
};

/**
 * Display name of an absolute host directory: its last segment.
 *
 * A picked node folder has no `FileSystemDirectoryHandle` to read `name` from,
 * and the dialog answers with a platform-native path — so both separators are
 * accepted and a trailing one is ignored. A path that is nothing but separators
 * (a drive root) keeps its own spelling rather than collapsing to an empty label.
 *
 * @param path - Absolute host directory.
 * @returns The folder's display name.
 */
export const hostPathName = (path: string): string => /[^/\\]+(?=[/\\]*$)/.exec(path)?.[0] ?? path;

/**
 * Absolute host directory of the node Home workspace.
 *
 * @returns The Home root path.
 * @throws When called off the desktop build, where Home is browser-backed.
 */
export const nodeHomeRoot = (): string => {
  const bridge = desktopBridge();
  if (!bridge) {
    throw new Error('The node filesystem backend is only available in the desktop app.');
  }
  return bridge.nodeFs.homeRoot;
};
