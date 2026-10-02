/**
 * Monaco Language Contribution Registry
 *
 * Manages a uniform, idempotent, two-phase lifecycle for all language contributions
 * with VS Code-style lazy activation.
 *
 * 1. **Register phase** (during `configureMonaco`): language metadata + syntax config.
 *    Cheap, eager, runs once. No services, no LSP, no WASM.
 * 2. **Activate phase** (when services ready): per-contribution `runActivate` is wired
 *    to fire on the first `monaco.languages.onLanguage(<id>)` event for any of the
 *    contribution's `activationLanguageIds`. If a matching model already exists at
 *    `registry.activate()` time the activation runs immediately (fast path).
 *
 * Heavy boot work inside `contribution.activate()` (LSP worker spawn, WASM init)
 * SHOULD be wrapped in `queueMicrotask` so the synchronous activate boundary
 * stays cheap (mirrors VS Code's TypeScript extension pattern).
 *
 * Idempotency / HMR safety:
 * - `addContribution`: keyed by `languageId`, duplicate adds are silently ignored.
 * - `registerAll`: guarded by flag, subsequent calls are no-ops.
 * - `activate`: each contribution activates at most once per epoch (incremented by
 *   `onProjectSessionChange`), regardless of how many ids fire `onLanguage`.
 */

import type * as Monaco from 'monaco-editor';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { MonacoModelService } from '#lib/monaco-model-service.js';
import type { MonacoMarkerService } from '#lib/monaco-marker-service.js';
import type { FileManagerRef, FileManagerApi } from '#machines/file-manager.machine.types.js';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import type { TauLanguageHostInit } from '@taucad/lsp/language-fs-sync-host';

export type ActivationContext = {
  monaco: typeof Monaco;
  modelService: MonacoModelService;
  markerService: MonacoMarkerService;
  workspaceFs: MonacoWorkspaceFs;
  fileManager: FileManagerApi;
  fileManagerRef: FileManagerRef;
  treeService: FileTreeService;
  /** FM-owned file pool SAB (optional when cross-origin isolated / SAB unavailable). */
  filePoolBuffer?: SharedArrayBuffer;
  /** Tier-2 sync FS init for Monaco TS worker; see {@link openTauLanguageHostPort}. */
  openLanguageHostPort?: () => TauLanguageHostInit | undefined;
};

export type ActivationResult = {
  disposables: Monaco.IDisposable[];
};

export type LanguageContribution = {
  /** Primary language id; used as a fallback when `activationLanguageIds` is omitted. */
  readonly languageId: string;

  /**
   * Monaco language ids whose first model creation triggers {@link activate}.
   * Defaults to `[languageId]`. Contributions covering a family (e.g. JS/TS)
   * declare every variant so any of them gates the activation.
   */
  readonly activationLanguageIds?: readonly string[];

  /** Phase 1: Called during `configureMonaco`. Register language metadata only. */
  register(monaco: typeof Monaco): void;

  /**
   * Phase 2: Called when services are available AND a model with one of
   * {@link activationLanguageIds} is created (or already exists). Heavy work
   * SHOULD be wrapped in `queueMicrotask` so the synchronous activate boundary
   * stays cheap.
   */
  activate(context: ActivationContext): ActivationResult;

  /** Called on project session change. Reset caches, document tracking, etc. */
  onProjectSessionChange?(projectId: string): void;

  /** Dispose all resources. Called on unmount or before re-activation. */
  dispose(): void;
};

/** Optional callback invoked whenever a contribution's deferred activation throws. */
export type ActivationErrorCallback = (languageId: string, error: Error) => void;

export type LanguageContributionRegistryOptions = {
  /**
   * Pluggable error reporter invoked alongside the existing `console.error` when
   * a deferred `runActivate()` throws. Lets the host surface a user-visible
   * toast without coupling the registry to a UI library.
   */
  onActivationError?: ActivationErrorCallback;
};

type MarkFunction = (markName: string) => void;
type MeasureFunction = (measureName: string, startMark: string, endMark: string) => void;

/**
 * Resolved performance API. Indirected through `globalThis.performance` so a
 * test can stub it via `vi.stubGlobal('performance', ...)`. Tests may supply a
 * stub that omits either method, so each is independently optional.
 */
function getPerformance(): { mark?: MarkFunction; measure?: MeasureFunction } | undefined {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: SSR / non-browser hosts may lack performance
  return globalThis.performance as { mark?: MarkFunction; measure?: MeasureFunction } | undefined;
}

export class LanguageContributionRegistry {
  private readonly contributions = new Map<string, LanguageContribution>();
  private registered = false;
  private activationEpoch = 0;
  private lastActivatedEpoch = -1;

  /** Disposables from the current activation cycle (per-contribution + onLanguage subscriptions). */
  private activationDisposables: Monaco.IDisposable[] = [];

  private onActivationError?: ActivationErrorCallback;

  /** Languages already prefetched this activation cycle so prefetch stays idempotent. */
  private prefetchedLanguageIds = new Set<string>();

  /** Active monaco instance for prefetch (set by {@link activate}). */
  private activeMonaco: typeof Monaco | undefined;

  public constructor(options: LanguageContributionRegistryOptions = {}) {
    this.onActivationError = options.onActivationError;
  }

  /**
   * Override the activation-error callback. Used by hosts that want to wire a
   * UI toast onto the singleton registry post-construction (the production
   * wiring done by `MonacoModelServiceProvider`).
   */
  public setActivationErrorHandler(callback: ActivationErrorCallback | undefined): void {
    this.onActivationError = callback;
  }

  /**
   * Add a contribution. Idempotent: silently skips if `languageId` already added.
   */
  public addContribution(contribution: LanguageContribution): void {
    if (this.contributions.has(contribution.languageId)) {
      return;
    }

    this.contributions.set(contribution.languageId, contribution);
  }

  /**
   * Phase 1: Register all contributions (language metadata only). Idempotent.
   */
  public registerAll(monaco: typeof Monaco): void {
    if (this.registered) {
      return;
    }

    this.registered = true;

    for (const contribution of this.contributions.values()) {
      contribution.register(monaco);
    }
  }

  /**
   * Phase 2: Wire each contribution's deferred activation to its
   * `activationLanguageIds` via `monaco.languages.onLanguage`.
   */
  public activate(context: ActivationContext): void {
    if (this.lastActivatedEpoch >= this.activationEpoch) {
      return;
    }

    this.disposeActivation();

    this.prefetchedLanguageIds = new Set();
    this.activeMonaco = context.monaco;

    const existingLanguageIds = new Set(context.monaco.editor.getModels().map((model) => model.getLanguageId()));

    for (const contribution of this.contributions.values()) {
      const ids = contribution.activationLanguageIds ?? [contribution.languageId];
      let activated = false;

      const runActivate = (): void => {
        if (activated) {
          return;
        }
        activated = true;

        const performance = getPerformance();
        const willMark = `code/willActivateLanguage/${contribution.languageId}`;
        const didMark = `code/didActivateLanguage/${contribution.languageId}`;

        performance?.mark?.(willMark);

        try {
          const result = contribution.activate(context);

          this.activationDisposables.push(...result.disposables);
        } catch (error) {
          // oxlint-disable-next-line no-console -- fail-open: surface activation failure without breaking other contributions
          console.error(`Failed to activate language contribution "${contribution.languageId}":`, error);
          const errorObject = error instanceof Error ? error : new Error(String(error));
          this.onActivationError?.(contribution.languageId, errorObject);
        } finally {
          performance?.mark?.(didMark);
          try {
            performance?.measure?.(`code/activateLanguage/${contribution.languageId}`, willMark, didMark);
          } catch {
            // Measure throws when one of the marks is missing in the timeline
            // (e.g. host without User Timing). Swallow — diagnostic-only.
          }
        }
      };

      const hasExistingModel = ids.some((id) => existingLanguageIds.has(id));
      if (hasExistingModel) {
        runActivate();
        continue;
      }

      for (const id of ids) {
        const subscription = context.monaco.languages.onLanguage(id, runActivate);
        this.activationDisposables.push(subscription);
      }
    }

    this.lastActivatedEpoch = this.activationEpoch;
  }

  /**
   * Warm up the contributions gated on the supplied Monaco language ids by
   * creating-and-disposing a throwaway model per id. Triggers `onLanguage`
   * via the same code path real model creation uses, so the deduplication
   * inside {@link activate} guarantees each contribution still activates
   * exactly once. Safe to call repeatedly: per-id idempotency is maintained
   * via an internal `Set`.
   *
   * Used by the host to mitigate first-keystroke latency for the project's
   * active kernel — pre-warming the language activation avoids the first
   * keystroke paying the full activation cost (LSP worker spawn, WASM init).
   */
  public prefetch(ids: readonly string[]): void {
    const monaco = this.activeMonaco;
    if (!monaco) {
      return;
    }
    for (const id of ids) {
      if (this.prefetchedLanguageIds.has(id)) {
        continue;
      }
      this.prefetchedLanguageIds.add(id);
      const model = monaco.editor.createModel('', id);
      model.dispose();
    }
  }

  /**
   * Forward project session change to all contributions. Increments activation epoch.
   */
  public onProjectSessionChange(projectId: string): void {
    this.activationEpoch++;

    for (const contribution of this.contributions.values()) {
      contribution.onProjectSessionChange?.(projectId);
    }
  }

  /**
   * Dispose all contributions and activation resources.
   */
  public dispose(): void {
    this.disposeActivation();

    for (const contribution of this.contributions.values()) {
      contribution.dispose();
    }

    this.registered = false;
    this.lastActivatedEpoch = -1;
    this.activationEpoch = 0;
    this.prefetchedLanguageIds = new Set();
    this.activeMonaco = undefined;
  }

  /**
   * Dispose current activation disposables (includes per-contribution disposables
   * AND the `onLanguage` subscriptions that gate them).
   */
  private disposeActivation(): void {
    for (const disposable of this.activationDisposables) {
      disposable.dispose();
    }

    this.activationDisposables = [];
  }
}

/**
 * Global singleton registry instance.
 * Contributions register during module load, activated later by the provider.
 *
 * Host code (e.g. `MonacoModelServiceProvider`) is welcome to construct its own
 * {@link LanguageContributionRegistry} with custom options (e.g. `onActivationError`)
 * for tests; production wiring uses this singleton.
 */
export const registry = new LanguageContributionRegistry();
