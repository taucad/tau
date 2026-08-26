/**
 * Diagnostic recorder for the Monaco TypeScript worker host.
 *
 * Captures bounded samples of `fileName` strings asked by the TS language service
 * (mirror lookups, module resolution probes, directory probes) so we can narrow
 * down TS2307 squiggles for closed files and bare specifiers like `replicad`.
 *
 * Usage from the worker entry:
 *   const diagnostic = new LspDiagnostic(); // logging off by default
 *   new TauSyncTsWorker(ctx, createData, syncFsClient, diagnostic);
 *
 * From the worker DevTools console (logging is off until enabled):
 *   __tauLspDiag.setEnabled(true)  // turn on `[sync-fs-host:…]` + slot probe logs
 *   __tauLspDump()                 // dump counts + sampled file names
 *   __tauLspDiag.reset()           // clear samples
 *   __tauLspDiag.setEnabled(false)
 *
 * @public
 */

/** @public */
export const lspProbeCategories = [
  'getScriptText',
  'fileExists',
  'directoryExists',
  'getDirectories',
  'getScriptVersion',
  'getCurrentDirectory',
] as const;

/** @public */
export type LspProbeCategory = (typeof lspProbeCategories)[number];

/**
 * - `mirror`   served from an open Monaco mirror model.
 * - `static`   served from `libFileMap` or a registered `extraLib` (e.g. virtual `replicad/index.d.ts`).
 * - `sync`     served from the Tier-2 sync filesystem client (closed workspace file).
 * - `miss`     not found in any of the above.
 * - `value`    informational outcome carrying a primitive value (e.g. `getCurrentDirectory`).
 *
 * @public
 */
export type LspProbeOutcome = 'mirror' | 'static' | 'sync' | 'miss' | 'value';

/** @public */
export type LspProbe = Readonly<{
  category: LspProbeCategory;
  outcome: LspProbeOutcome;
  fileName: string;
  detail?: string;
}>;

/** @public */
export type LspDiagnosticSummary = Readonly<{
  total: number;
  counts: Record<string, number>;
  samples: Record<string, string[]>;
}>;

/** @public */
export type LspDiagnosticOptions = Readonly<{
  /** First N unique fileNames per (category, outcome) bucket get inline-logged. */
  uniqueSampleLimit?: number;
  /** Auto-dump a summary every K probes. Set `0` to disable auto-dump. */
  autoDumpEvery?: number;
  /** Initial enabled state (default false). */
  enabled?: boolean;
  /** Console logger override; defaults to `console.debug`. */
  log?: (...args: unknown[]) => void;
  /**
   * Prefix used when emitting probe lines, e.g. `'sync-fs-host'` produces
   * `[sync-fs-host:fileExists:static] ...`. Defaults to `'lsp'`.
   *
   * Choose a prefix that overlaps with adjacent diagnostic streams so a single
   * DevTools filter (e.g. `[sync-fs`) captures both the low-level slot probes
   * and the higher-level TS host short-circuits.
   */
  prefix?: string;
  /** Probe outcomes excluded from logging (default: `static`, `mirror`). */
  suppressedOutcomes?: readonly LspProbeOutcome[];
}>;

/** Default cap on per-bucket unique fileName samples. */
const defaultUniqueSampleLimit = 50;

/** Default auto-dump cadence (probes-per-summary). */
const defaultAutoDumpEvery = 500;

/**
 * Bounded probe recorder. All buckets are capped to {@link LspDiagnosticOptions.uniqueSampleLimit}
 * unique fileNames so a busy editor cannot flood the console.
 *
 * @public
 */
export class LspDiagnostic {
  private readonly counts = new Map<string, number>();
  private readonly samples = new Map<string, Set<string>>();
  private totalProbes = 0;

  private readonly uniqueSampleLimit: number;
  private readonly autoDumpEvery: number;
  private readonly logFn: (...args: unknown[]) => void;
  private readonly prefix: string;
  private enabled: boolean;
  private suppressedOutcomes: Set<LspProbeOutcome>;

  public constructor(options?: LspDiagnosticOptions) {
    this.uniqueSampleLimit = options?.uniqueSampleLimit ?? defaultUniqueSampleLimit;
    this.autoDumpEvery = options?.autoDumpEvery ?? defaultAutoDumpEvery;
    this.logFn = options?.log ?? console.debug.bind(console);
    this.prefix = options?.prefix ?? 'lsp';
    this.enabled = options?.enabled ?? false;
    this.suppressedOutcomes = new Set(options?.suppressedOutcomes ?? ['mirror', 'static']);
  }

  public setSuppressedOutcomes(outcomes: readonly LspProbeOutcome[]): void {
    this.suppressedOutcomes = new Set(outcomes);
  }

  public getSuppressedOutcomes(): readonly LspProbeOutcome[] {
    return [...this.suppressedOutcomes];
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public record(probe: LspProbe): void {
    if (!this.enabled) {
      return;
    }

    const bucket = `${probe.category}:${probe.outcome}`;
    this.counts.set(bucket, (this.counts.get(bucket) ?? 0) + 1);

    let sample = this.samples.get(bucket);
    if (sample === undefined) {
      sample = new Set<string>();
      this.samples.set(bucket, sample);
    }

    const suppressInlineLog = this.suppressedOutcomes.has(probe.outcome);
    if (sample.size < this.uniqueSampleLimit && !sample.has(probe.fileName)) {
      sample.add(probe.fileName);
      if (!suppressInlineLog) {
        const detail = probe.detail === undefined ? '' : ` (${probe.detail})`;
        this.logFn(`[${this.prefix}:${probe.category}:${probe.outcome}]`, probe.fileName + detail);
      }
    }

    this.totalProbes += 1;
    if (this.autoDumpEvery > 0 && this.totalProbes % this.autoDumpEvery === 0) {
      this.dump();
    }
  }

  public dump(): LspDiagnosticSummary {
    const counts: Record<string, number> = {};
    for (const [bucket, count] of this.counts) {
      counts[bucket] = count;
    }
    const samples: Record<string, string[]> = {};
    for (const [bucket, set] of this.samples) {
      samples[bucket] = [...set];
    }
    const summary: LspDiagnosticSummary = { total: this.totalProbes, counts, samples };
    this.logFn(`[${this.prefix}:diagnostic:summary]`, summary);
    return summary;
  }

  public reset(): void {
    this.counts.clear();
    this.samples.clear();
    this.totalProbes = 0;
  }
}
