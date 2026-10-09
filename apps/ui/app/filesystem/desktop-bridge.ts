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
import type { ComputeStoreControl } from '@taucad/runtime/types';
import type { MachineBindingOutcome } from '@taucad/runtime/machine';
import { z } from 'zod';
import { externalAgentDescriptorSchema } from '@taucad/agent-host/wire';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';
import type {
  BambuMachineHints,
  BambuStudioCatalog,
  BambuStudioCatalogFilter,
  BambuStudioErrorCode,
  BambuStudioSelection,
  BambuStudioSettings,
} from '@taucad/slicer/bambu-studio';
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
  readonly externalAgents?: () => Promise<unknown>;
  readonly compute?: DesktopBridge['compute'];
  readonly appIcon: { setTheme(theme: 'light' | 'dark'): void };
  /** The quit hold's renderer half (D31, P49). */
  readonly quit?: {
    isReady(): boolean;
    onAsk(handler: () => void): () => void;
    reportQuiesced(forced: boolean): void;
  };
  readonly dialog: DesktopBridge['dialog'];
  readonly openFiles: DesktopBridge['openFiles'];
  readonly generatedImages: DesktopBridge['generatedImages'];
  readonly quickLook: {
    readonly directPreviewExtensions: readonly string[];
    previewPath(request: { readonly path: string; readonly displayName?: string }): Promise<DesktopQuickLookResult>;
    previewUsdz(request: {
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly displayName: string;
    }): Promise<DesktopQuickLookResult>;
    close(): void;
  };
  readonly agentHost: {
    retain(workspaceRoot: string, projectId: string, attachmentId: string): Promise<void>;
    release(workspaceRoot: string, projectId: string, attachmentId: string): Promise<void>;
  };
  readonly machines?: {
    completeBinding(input: DesktopMachineBindingCompletion): Promise<unknown>;
  };
  /** Answers are `{ ok, value }` or `{ ok: false, error: { code, message } }`; status answers plainly. */
  readonly slicers?: {
    readonly bambuStudio: Readonly<
      Record<'status' | 'catalog' | 'resolveSelection' | 'settings', (input?: unknown) => Promise<unknown>>
    >;
  };
  /** Ask main to broker a port for one concern; answered by a relayed message. */
  requestServicesPort(requestId: string, concern: string, context?: Readonly<Record<string, string>>): void;
};

export type DesktopQuickLookResult = { readonly success: true } | { readonly success: false; readonly error: string };

/**
 * The native half of one binding ceremony (D10). The host pins trust from the
 * address discovery found the printer at, so `address` is informational. Without an
 * `accessCode` the host reuses the code it saved for this printer, and refuses
 * with `MACHINE_CREDENTIAL_REQUIRED` or `MACHINE_CREDENTIAL_TRUST_CHANGED` when
 * none is saved or the printer's certificate changed. Both are absent for the
 * simulator.
 * @public
 */
export type DesktopMachineBindingCompletion = {
  readonly ceremonyId: string;
  readonly address?: string;
  /** A newly typed code, which wins over a saved one. */
  readonly accessCode?: string;
};

/**
 * Whether this machine has a usable Bambu Studio for the Print pane.
 * @public
 */
export type DesktopBambuStudioStatus =
  | { readonly available: true; readonly version: string; readonly executable: string }
  | { readonly available: false; readonly reason: string };

/**
 * A Bambu Studio refusal from main, with the engine's code kept.
 * @public
 */
export type DesktopBambuStudioError = Error & { readonly code: BambuStudioErrorCode };

/**
 * Bambu Studio presets and settings, read in the desktop main process (blueprint D12).
 *
 * Every call except `status` rejects with a {@link DesktopBambuStudioError}
 * when the engine refuses (`BAMBU_STUDIO_UNAVAILABLE`,
 * `BAMBU_STUDIO_PRESET_NOT_FOUND`, …), and with a plain `Error` when main
 * refuses the input itself. Slicing is not here: it runs on the export route.
 * @public
 */
export type DesktopBambuStudio = {
  /** Whether Bambu Studio is installed, and which version. Never rejects for a missing install. */
  status(): Promise<DesktopBambuStudioStatus>;
  /** The selectable presets, optionally narrowed to one printer preset or a model and nozzle. */
  catalog(filter?: BambuStudioCatalogFilter): Promise<BambuStudioCatalog>;
  /** Default presets for the bound printer, keeping any the person already chose in `partial`. */
  resolveSelection(input: {
    readonly hints: BambuMachineHints;
    readonly partial?: Partial<BambuStudioSelection>;
  }): Promise<BambuStudioSelection>;
  /** JSON Schema, current values and groups of the settings the presets resolve to. */
  settings(input: Pick<BambuStudioSelection, 'printer' | 'process' | 'filaments'>): Promise<BambuStudioSettings>;
};

/**
 * Unwrap main's answer, turning a refusal back into an error with its code.
 *
 * @param answer - `{ ok: true, value }` or `{ ok: false, error: { code, message } }`.
 * @returns The value.
 */
const bambuStudioValue = <Value>(answer: unknown): Value => {
  const result = answer as { ok?: unknown; value?: unknown; error?: { code?: unknown; message?: unknown } } | undefined;
  if (result?.ok === true) {
    return result.value as Value;
  }
  const message = typeof result?.error?.message === 'string' ? result.error.message : 'Bambu Studio did not answer.';
  throw Object.assign(new Error(message), { name: 'BambuStudioError', code: result?.error?.code });
};

/* Parsed, not trusted: main answers with whatever the utility said. A failure resolves as data, since an error
 * crossing the context bridge keeps only its message. */
const bindingAnswerSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('bound'), machineId: z.string().min(1).max(256) }),
  z.object({ status: z.literal('operator-action-required'), ceremonyId: z.string().min(1).max(256) }),
  z.object({
    status: z.literal('failed'),
    code: z.string().min(1).max(128).optional(),
    message: z.string().max(4096),
  }),
]);

/** Keep the native app icon aligned with Tau's resolved local theme. */
export const setDesktopAppIconTheme = (theme: 'light' | 'dark'): void => {
  if (!isDesktopBuildTarget()) {
    return;
  }
  (globalThis as { tau?: DesktopShell }).tau?.appIcon.setTheme(theme);
};

/**
 * Listen for main's quit ask (D31, P49).
 *
 * Returns a no-op unsubscribe on the browser build, so the caller has one
 * shape and no host branch.
 *
 * @param handler - Run every live session's closing.
 * @returns The unsubscribe.
 * @public
 */
export const onDesktopQuitRequested = (handler: () => void): (() => void) => {
  const shell = isDesktopBuildTarget() ? (globalThis as { tau?: DesktopShell }).tau : undefined;
  return shell?.quit?.onAsk(handler) ?? ((): void => undefined);
};

/** Tell main every session has closed, or that the person cut it short. @public */
export const reportDesktopQuiesced = (forced: boolean): void => {
  if (!isDesktopBuildTarget()) {
    return;
  }
  (globalThis as { tau?: DesktopShell }).tau?.quit?.reportQuiesced(forced);
};

/**
 * The desktop seam, as `apps/ui` consumes it.
 * @public
 */
export type DesktopAgentHostConnectInput = {
  readonly workspaceRoot: string;
  readonly projectId: string;
  readonly computeMode: 'off' | 'memory' | 'durable';
};

export type DesktopBridge = {
  /** Exact AP242 measurement in the desktop services utility. */
  readonly exactMeasurement: { connect(): Promise<MessagePort> };
  /** Debug-only native GeoSpec comparisons, with byte-only inputs. */
  readonly geoSpecPerformance: { connect(): Promise<MessagePort> };
  readonly runtimeKernelIds: readonly string[];
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
     * `createAgentChannelClient` from `@taucad/agent-host/channel-client`,
     * whose `connect` calls this again for every redial: structured frames, no
     * codec, the same keyed wire vocabulary the daemon serves over a WebSocket.
     * Main refuses a root the user never granted, and the promise then never
     * settles rather than resolving onto a port to nowhere.
     */
    connect(input: DesktopAgentHostConnectInput): Promise<MessagePort>;
    /** Keep launcher 2 alive for one project session in this renderer. */
    retain(workspaceRoot: string, projectId: string, attachmentId: string): Promise<void>;
    /** Release that hold and await launcher shutdown when it was the last one. */
    release(workspaceRoot: string, projectId: string, attachmentId: string): Promise<void>;
  };
  readonly machines: {
    /**
     * Ask main to broker a fresh `MessageChannelMain` to the node machine host
     * in the services utility, and hand back this side.
     *
     * The far end is `NodeMachineHost.serve` over that port, so the page
     * drives it with `connectMachineChannel` from `@taucad/runtime/machine` —
     * the same wire the daemon serves over a WebSocket. Printers belong to
     * this computer, not a project, so no root is named (blueprint D6).
     */
    connect(): Promise<MessagePort>;
    /**
     * Complete a ceremony `beginBinding` answered with `operator-action-required`.
     *
     * A typed access code goes straight to the host, which keeps it in the OS
     * keychain once the printer accepts it, and is never kept in page state;
     * the outcome is the host's own. A refusal rejects with the host's
     * message and, when it has one, its typed `code` on the error.
     */
    completeBinding(input: DesktopMachineBindingCompletion): Promise<MachineBindingOutcome>;
  };
  readonly compute: {
    inspect(projectRoot: string): ReturnType<ComputeStoreControl['inspect']>;
    clear(projectRoot: string): ReturnType<ComputeStoreControl['clear']>;
    collect(
      projectRoot: string,
      input: Omit<Parameters<ComputeStoreControl['collect']>[0], 'signal'>,
    ): ReturnType<ComputeStoreControl['collect']>;
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
    consume(): Promise<
      ReadonlyArray<{
        readonly bytes: Uint8Array<ArrayBuffer>;
        readonly name: string;
      }>
    >;
  };
  readonly generatedImages: {
    read(path: string): Promise<{ readonly path: string; readonly bytes: Uint8Array<ArrayBuffer> }>;
  };
  readonly quickLook: DesktopShell['quickLook'];
  /** Slicers that need the desktop host; absent on a shell built before them. */
  readonly slicers?: { readonly bambuStudio: DesktopBambuStudio };
  /**
   * External ACP agents launcher 2 knows about (W4-ACP), as the one canonical
   * descriptor (VSC1), which the execution selector draws one row each from.
   * Main CLI-probes and model-probes them; asked for rather than read off the
   * launch bootstrap, because that made the window wait on a 5 s vendor probe
   * (D17). Empty means Tau's own runs only.
   */
  externalAgents(): Promise<readonly ExternalAgentDescriptor[]>;
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

/**
 * Build the typed Bambu Studio surface over preload's plain calls.
 *
 * @param calls - `window.tau.slicers.bambuStudio`.
 * @returns The typed surface.
 */
const bambuStudioBridge = (calls: NonNullable<DesktopShell['slicers']>['bambuStudio']): DesktopBambuStudio => ({
  status: async () => (await calls.status()) as DesktopBambuStudioStatus,
  catalog: async (filter) => bambuStudioValue(await calls.catalog(filter)),
  resolveSelection: async (input) => bambuStudioValue(await calls.resolveSelection(input)),
  settings: async (input) => bambuStudioValue(await calls.settings(input)),
});

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
    exactMeasurement: {
      connect: async () => connectServices('exactMeasurement'),
    },
    geoSpecPerformance: {
      connect: async () => connectServices('geospecPerformance'),
    },
    runtimeKernelIds: shell.runtimeKernelIds ?? [],
    /* Parsed, not trusted: the names and model ids main put here came out of a
     * vendor adapter's own config options, and this page renders them. */
    externalAgents: async () =>
      z
        .array(externalAgentDescriptorSchema)
        .max(16)
        .safeParse(await (shell.externalAgents?.() ?? [])).data ?? [],
    nodeFs: {
      homeRoot: shell.nodeFs.homeRoot,
      connect: async () => connectServices('nodeFs'),
    },
    agentHost: {
      connect: async ({ workspaceRoot, projectId, computeMode }) =>
        connectServices('agentHost', {
          workspaceRoot,
          projectId,
          computeMode,
        }),
      retain: async (workspaceRoot, projectId, attachmentId) =>
        shell.agentHost.retain(workspaceRoot, projectId, attachmentId),
      release: async (workspaceRoot, projectId, attachmentId) =>
        shell.agentHost.release(workspaceRoot, projectId, attachmentId),
    },
    machines: {
      connect: async () => connectServices('machines'),
      completeBinding: async (input) => {
        if (!shell.machines) {
          throw new Error('This desktop build has no machine binding ceremony.');
        }
        const answer = bindingAnswerSchema.parse(await shell.machines.completeBinding(input));
        if (answer.status === 'failed') {
          throw Object.assign(new Error(answer.message), answer.code === undefined ? {} : { code: answer.code });
        }
        return answer;
      },
    },
    compute: shell.compute ?? {
      inspect: async () => {
        throw new Error('Native compute controls are unavailable.');
      },
      clear: async () => {
        throw new Error('Native compute controls are unavailable.');
      },
      collect: async () => {
        throw new Error('Native compute controls are unavailable.');
      },
    },
    dialog: shell.dialog,
    openFiles: shell.openFiles,
    generatedImages: shell.generatedImages,
    quickLook: shell.quickLook,
    ...(shell.slicers === undefined ? {} : { slicers: { bambuStudio: bambuStudioBridge(shell.slicers.bambuStudio) } }),
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
