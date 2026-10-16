// The preparation host (API 4): selection outcomes, preparation states and events, the host's verbs and options,
// verification and garbage-collection reports, and the managed profile a host reports. Types only.
import type {
  ClosureReceipt,
  DependencyTarget,
  HostIndicators,
  Integrity,
  PluginDeployment,
  PreparationErrorCode,
  ReceiptFile,
  VariantAxis,
  DependencyVariant,
} from '#preparation/preparation.types.js';

/**
 * The outcome of {@link selectVariant}: the variant this host runs, or the axis no declared variant satisfies.
 * @public
 */
export type VariantSelection =
  | {
      readonly status: 'selected';
      readonly variant: DependencyVariant;
      /** The ordered targets considered, so two machines or two runs can be diffed. */
      readonly candidates: readonly DependencyTarget[];
      /** An x64 variant chosen for an arm64 host through Rosetta 2 or Windows x64 emulation. */
      readonly emulated: boolean;
    }
  | { readonly status: 'unsupported'; readonly axis: VariantAxis; readonly nearest?: DependencyTarget };

/**
 * Options of {@link selectVariant}.
 * @public
 */
export type SelectVariantOptions = {
  /** The realm's runtime; default `'native'`. */
  readonly runtime?: 'native' | 'browser';
  /** Canonical `<os>-<arch>[-<libc>]` key that replaces the host's own (`TAU_PAYLOAD_TARGET`); never guessed. */
  readonly target?: string;
  /** `false` disables the Rosetta 2 and Windows x64 emulation fallback (`TAU_PAYLOAD_EMULATION=0`). Default `true`. */
  readonly emulation?: boolean;
};

/**
 * Which plugin, and which of its dependencies, an operation is about.
 * @public
 */
export type PluginSelection = {
  /** The declaring plugin's npm package name. */
  readonly package: string;
  /** Omitted selects every dependency the package declares. */
  readonly dependencies?: readonly string[];
};

/**
 * Why a preparation cannot proceed on this host without a change outside Tau.
 *
 * - `unsupported-target`: no declared variant fits this host, or native kernels cannot run here (Windows).
 * - `offline-miss`: the closure is not in the store and the host may not use the network.
 * - `missing-system-library`: the host lacks a system library the closure links against, such as `libGL.so.1`.
 * @public
 */
export type PreparationBlockedReason = 'unsupported-target' | 'offline-miss' | 'missing-system-library';

/**
 * Where a preparation stands. Every state but `idle` names the attempt it belongs to.
 * @public
 */
export type PreparationState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'preparing';
      readonly attemptId: string;
      /** `sealing` runs the plugin's seal step (such as bytecode compilation) after every payload is unpacked. */
      readonly phase: 'downloading' | 'verifying' | 'extracting' | 'sealing';
      /** Name of the payload the phase is about; the dependency's name while `sealing`. */
      readonly payload: string;
      readonly completedPayloads: number;
      readonly totalPayloads: number;
      readonly completedBytes: number;
      readonly totalBytes: number;
    }
  | {
      readonly status: 'ready';
      readonly attemptId: string;
      /** Dependency name to its sealed closure. */
      readonly receipts: Readonly<Record<string, ClosureReceipt>>;
      /**
       * Dependencies whose sealed closure launches as recorded although selection now prefers another declared
       * variant (an OS upgrade crossed a floor); `prepare` re-selects, `inspect` only reports.
       */
      readonly betterVariantAvailable?: Readonly<Record<string, DependencyTarget>>;
    }
  | {
      readonly status: 'blocked';
      readonly attemptId: string;
      readonly reason: PreparationBlockedReason;
      readonly message: string;
      /** The failing axis and the nearest declared variant, or the missing library. */
      readonly detail?: {
        readonly axis?: VariantAxis;
        readonly nearest?: DependencyTarget;
        readonly library?: string;
      };
    }
  | { readonly status: 'cancelled'; readonly attemptId: string }
  | {
      readonly status: 'failed';
      readonly attemptId: string;
      readonly code: PreparationErrorCode;
      readonly message: string;
    };

/**
 * One `preparation` event, and what `inspect` answers.
 * @public
 */
export type PluginPreparation = {
  readonly selection: PluginSelection;
  /** Strictly increasing per selection within one host; subscribers reconcile by revision. */
  readonly revision: number;
  readonly state: PreparationState;
};

/**
 * Input of {@link PreparationHost.prepare}.
 * @public
 */
export type PrepareInput = PluginSelection & {
  /**
   * Use the store, the seed and a `file://` mirror only: a miss is `blocked: offline-miss` with no request made,
   * never a substitute version.
   */
  readonly offline?: boolean;
  /** Aborting resolves this caller's promise with `cancelled`; the attempt stops once every joined caller aborted. */
  readonly signal: AbortSignal;
};

/**
 * How a `prepare` call ends when it does not reject.
 * @public
 */
export type PrepareOutcome = Extract<PreparationState, { status: 'ready' | 'blocked' | 'cancelled' }>;

/**
 * Input of {@link PreparationHost.verify}.
 * @public
 */
export type VerifyInput = PluginSelection & {
  /** Re-unpack, from verified blobs, only the payloads whose files differ, and remove files the receipt does not list. */
  readonly repair?: boolean;
  /** When a repair needs a blob the store no longer holds, refuse instead of downloading it. */
  readonly offline?: boolean;
  readonly signal: AbortSignal;
};

/**
 * What a full re-verification found for one dependency's sealed closure.
 *
 * - `intact`: every file matches its receipt row and no other file exists.
 * - `stale`: some files differ (`receipt-stale`); `payloads` names the payloads that wrote them.
 * - `repaired`: it was stale and the differing payloads were re-unpacked.
 * - `absent`: no sealed closure for the selected variant.
 * @public
 */
export type ClosureVerification = {
  readonly package: string;
  readonly dependency: string;
  readonly closureIntegrity?: Integrity;
  readonly status: 'intact' | 'stale' | 'repaired' | 'absent';
  /** Payload names whose files differ, in manifest order. */
  readonly payloads: readonly string[];
  /** Closure-relative paths that differ, are missing or are not in the receipt; at most 100. */
  readonly files: readonly string[];
};

/**
 * Input of {@link PreparationHost.collectGarbage}.
 * @public
 */
export type CollectGarbageInput = {
  /** Report what would be removed and remove nothing. */
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
};

/**
 * What a garbage collection removed, or would remove under `dryRun`.
 * @public
 */
export type GarbageReport = {
  readonly dryRun: boolean;
  /** `closures/sha256/<hex>` keys no live link names. */
  readonly closures: readonly string[];
  /** `blobs/sha256/<hex>` keys no live receipt lists, older than 24 hours. */
  readonly blobs: readonly string[];
  /** `tmp/` entries whose owner process is gone or that are older than 24 hours. */
  readonly staging: readonly string[];
  /** `links/` entries whose host path no longer exists. */
  readonly links: readonly string[];
  /** Bytes removed, or that would be removed. */
  readonly byteLength: number;
};

/**
 * What the store holds for one plugin dependency on this host, as `tau prepare --inspect` reports it.
 *
 * - `ready`: a sealed closure for a declared variant is in the store.
 * - `stale`: a sealed closure exists but was prepared by another Tau version; `prepare` re-verifies it locally.
 * - `absent`: nothing sealed for any declared variant.
 * - `unsupported`: no declared variant fits this host.
 * @public
 */
export type ClosureDescription = {
  readonly package: string;
  readonly dependency: string;
  readonly state: 'ready' | 'stale' | 'absent' | 'unsupported';
  /** The closure a launch would use (`ready`, `stale`) or `prepare` would create (`absent`). */
  readonly closureIntegrity?: Integrity;
  readonly target?: DependencyTarget;
  /** Bytes `prepare` would download at most: the selected variant's payload sizes. */
  readonly byteLength?: number;
  readonly betterVariantAvailable?: DependencyTarget;
};

/**
 * The preparation host (API 4) for Node hosts: downloads, verifies, unpacks and seals runtime payload closures into
 * one digest-keyed store shared by every Tau host on the machine.
 * @public
 */
export type PreparationHost = {
  /** Current state from receipts alone: no network, no plugin code, no download. */
  inspect(input: PluginSelection): Promise<PluginPreparation>;
  /**
   * What a launch uses, read from each closure's launch index and its receipt's version stamp: the per-launch read,
   * whose cost does not grow with the closure (I11). It reports `ready` exactly when {@link inspect} does.
   */
  inspectLaunch(input: PluginSelection): Promise<LaunchInspection>;
  /**
   * Prepare a selection, joining an attempt already running in this host for the same selection.
   * @throws {PreparationError} After emitting `failed`.
   */
  prepare(input: PrepareInput): Promise<PrepareOutcome>;
  /** Re-verify sealed closures file by file (seconds, never per launch) and optionally repair them. */
  verify(input: VerifyInput): Promise<readonly ClosureVerification[]>;
  /** Every declared dependency of every registered plugin, as this host sees it in the store. */
  describe(): Promise<readonly ClosureDescription[]>;
  /** Remove closures no live host links, old orphan blobs and abandoned staging. */
  collectGarbage(input?: CollectGarbageInput): Promise<GarbageReport>;
  /** Subscribe to state changes of every selection; returns the unsubscribe function. */
  on(
    event: 'preparation',
    handler: (event: PluginPreparation) => void,
    options?: { readonly signal?: AbortSignal },
  ): () => void;
  /** Abort running attempts and drop every subscriber. */
  dispose(): void;
};

/**
 * Input of a plugin's {@link PreparationPlugin.seal} step.
 * @public
 */
export type SealClosureInput = {
  /** The declaring plugin's npm package name. */
  readonly package: string;
  readonly dependency: string;
  /** The selected variant's target. */
  readonly target: DependencyTarget;
  /**
   * Absolute closure root: the staging directory while preparing, the sealed closure while repairing. It holds only
   * the payloads' files and what an earlier run of the step added: the host's own `receipt.json` and launch index are
   * never there while the step runs.
   */
  readonly root: string;
  /** Rows of the files the payloads wrote, sorted by path. */
  readonly files: readonly ReceiptFile[];
  readonly signal: AbortSignal;
};

/**
 * Why a seal step refuses a closure this host cannot run, such as a missing system library. Preparation then ends
 * `blocked` with this reason; nothing is sealed and the verified blobs are kept.
 * @public
 */
export type SealClosureRefusal = {
  readonly reason: PreparationBlockedReason;
  readonly message: string;
  readonly detail?: Extract<PreparationState, { status: 'blocked' }>['detail'];
};

/**
 * One plugin the host can prepare.
 * @public
 */
export type PreparationPlugin = {
  /** The plugin's npm package name, as the receipts record it. */
  readonly package: string;
  /** The parsed `tau-plugin.json`. */
  readonly deployment: PluginDeployment;
  /** Absolute package root; required when a payload's origin is `packagePath` or `packageAsset`. */
  readonly directory?: string;
  /**
   * Seal-time compute, run after every payload of a closure is unpacked and before its receipt is written: it may
   * only add files, which the host receipts (with no payload name, regular files normalised to mode `0o644`, or
   * `0o755` when executable) so `treeIntegrity` covers them. A repair that touches the closure runs it again in place.
   * It runs verified bytes only and must be deterministic: the same closure must give the same files on every host.
   * @param input - The closure being sealed.
   * @returns A refusal when this host cannot run the closure, else `undefined`.
   */
  readonly seal?: (input: SealClosureInput) => Promise<SealClosureRefusal | undefined>;
  /**
   * The launch set: closure-relative paths of the files the kernel's process loads first, which every launch hashes
   * (D8, ruling X29). The host writes their rows to the closure's launch index at seal time, so a launch reads that
   * small file instead of the full receipt; the rest of the closure is re-verified after a failed handshake. Keep it
   * to the executable and the few files the process opens before it is ready.
   * @param files - Every row of the closure being sealed.
   * @returns Paths that `files` lists.
   */
  readonly launchSet?: (files: readonly ReceiptFile[]) => readonly string[];
};

/**
 * What a launch needs of one sealed closure: where it is, which pins it holds and the rows of its launch set (every
 * row, for a closure sealed without a launch index).
 * @public
 */
export type ClosureLaunch = Pick<ClosureReceipt, 'package' | 'dependency' | 'root' | 'closureIntegrity' | 'files'>;

/**
 * {@link PreparationHost.inspectLaunch}'s answer: the closures a launch uses, or why there are none.
 * @public
 */
export type LaunchInspection =
  | { readonly status: 'ready'; readonly closures: Readonly<Record<string, ClosureLaunch>> }
  | { readonly status: 'idle' }
  | Extract<PreparationState, { status: 'blocked' }>;

/**
 * Options of {@link createPreparationHost}.
 * @public
 */
export type CreatePreparationHostOptions = {
  readonly plugins: readonly PreparationPlugin[];
  /** Absolute digest-keyed store root: `defaultPayloadStore()` for the CLI, `tau mcp`, the daemon and the desktop. */
  readonly store: string;
  /** Absolute path that identifies this host installation; its `links/` entry roots the closures it uses. */
  readonly hostPath?: string;
  /** The host's indicators; default {@link detectHostIndicators}. */
  readonly indicators?: HostIndicators;
  /** `TAU_PAYLOAD_TARGET` and `TAU_PAYLOAD_EMULATION`; absent selects on the host's own indicators. */
  readonly selection?: { readonly target?: string; readonly emulation?: boolean };
  /** Transport for mirrors and origins; default the global `fetch`. */
  readonly fetch?: typeof fetch;
  /** Digest-addressed mirror tried before every manifest URL; `noFallback` never tries a manifest URL. */
  readonly mirror?: { readonly baseUrl: string; readonly noFallback?: boolean };
  /** A directory in the seed layout (`blobs/sha256/<hex>`, `tau-seed.json`); a file is used only when it hashes to its name. */
  readonly seed?: string;
  /** Version recorded in receipts; a receipt from another version is re-verified before use. Default the runtime's. */
  readonly tauVersion?: string;
};

/**
 * `TAU_ACQUISITION`: `locked` uses only the store, the seed and the mirror, with no fallback to manifest URLs.
 * @public
 */
export type AcquisitionProfile = 'open' | 'locked';

/**
 * The managed variables a Node host entry reads, already interpreted.
 * @public
 */
export type ManagedPreparation = {
  readonly profile: AcquisitionProfile;
  readonly mirror?: { readonly baseUrl: string; readonly noFallback: boolean };
  readonly seed?: string;
  readonly selection: { readonly target?: string; readonly emulation?: boolean };
  /** `locked` without a mirror: payloads come from the store and the seed only. */
  readonly offline: boolean;
};

/**
 * `tau prepare --inspect --json`: how this machine is configured, for an auditor.
 * @public
 */
export type EffectiveProfile = {
  readonly profile: AcquisitionProfile;
  readonly store: string;
  /** The indicators this machine selects on; absent on an OS or architecture no Tau closure targets. */
  readonly host?: HostIndicators;
  readonly mirror?: string;
  readonly noFallback: boolean;
  readonly seed?: string;
  readonly target?: string;
  readonly emulation: boolean;
  /** Whether Node routes `fetch` through `HTTPS_PROXY`/`HTTP_PROXY` (only under `NODE_USE_ENV_PROXY=1`). */
  readonly proxy: 'env-proxy' | 'none';
  /** Which certificate authorities Node trusts for downloads. */
  readonly ca: 'bundled' | 'extra' | 'system';
  readonly closures: readonly ClosureDescription[];
};
