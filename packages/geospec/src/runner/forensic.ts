/**
 * Env-gated millisecond forensic timing. Enabled with `GEOSPEC_FORENSIC=1` in
 * Node; browser hosts (no env) enable it via {@link setForensicEnabled} from
 * typed runtime config (the worker-runtime-config pattern).
 *
 * WS-A of `docs/research/geospec-step-load-multithreading.md`: attribute the
 * ~87s BRep-subject load across kernel STEP export, the two native STEP
 * transfers (analyze reader + XDE reader), and per-relationship proofs. Reused
 * by the single-vs-multi multi-threading benchmark (WS-D) and the suite
 * throughput blueprint's R2 spans.
 *
 * ponytail: one stderr line per span, no aggregation — the driver sums/greps.
 * Zero overhead (no timer read, no allocation) when disabled.
 */

const hasProcessEnvironment = typeof process !== 'undefined' && typeof process.env === 'object';

let enabled = hasProcessEnvironment && Boolean(process.env['GEOSPEC_FORENSIC']);

/**
 * Shard-id prefix stamped on every span line (A9): under a worker pool, N
 * workers share one stderr and interleaved spans must stay attributable. Pool
 * workers set this once at boot; empty outside a pool.
 */
let shardPrefix = '';

/** Whether forensic timing is active for this process. */
export const forensicEnabled = (): boolean => enabled;

/** Enable or disable forensic timing from a host without an environment (browser workers). */
export const setForensicEnabled = (value: boolean): void => {
  enabled = value;
};

/** Set the shard-id prefix for interleaved pool output (e.g. `shard=3`). */
export const setForensicShardPrefix = (value: string): void => {
  shardPrefix = value === '' ? '' : `${value} `;
};

const writeLine = (line: string): void => {
  if (hasProcessEnvironment && typeof process.stderr === 'object') {
    process.stderr.write(`${line}\n`);
    return;
  }
  // Browser workers have no stderr; the console is the diagnostic channel.
  console.error(line);
};

/** Emit one `[FORENSIC] <shard?> <label>\t<ms>` line when enabled. */
export const forensicLog = (label: string, ms: number): void => {
  if (enabled) {
    writeLine(`[FORENSIC] ${shardPrefix}${label}\t${ms.toFixed(1)}`);
  }
};

/** Emit one `[FORENSIC] <shard?> <label>\t<count>` counter line when enabled. */
export const forensicCount = (label: string, count: number): void => {
  if (enabled) {
    writeLine(`[FORENSIC] ${shardPrefix}${label}\t${count}`);
  }
};

/** Time a synchronous span; returns the callback result unchanged. */
export const forensicSync = <T>(label: string, function_: () => T): T => {
  if (!enabled) {
    return function_();
  }
  const start = performance.now();
  try {
    return function_();
  } finally {
    forensicLog(label, performance.now() - start);
  }
};

/** Time an asynchronous span; returns the callback result unchanged. */
export const forensicAsync = async <T>(label: string, function_: () => Promise<T>): Promise<T> => {
  if (!enabled) {
    return function_();
  }
  const start = performance.now();
  try {
    return await function_();
  } finally {
    forensicLog(label, performance.now() - start);
  }
};
