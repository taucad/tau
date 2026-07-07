/**
 * Env-gated millisecond forensic timing. Enabled with `GEOSPEC_FORENSIC=1`.
 *
 * WS-A of `docs/research/geospec-step-load-multithreading.md`: attribute the
 * ~87s BRep-subject load across kernel STEP export, the two native STEP
 * transfers (analyze reader + XDE reader), and per-relationship proofs. Reused
 * by the single-vs-multi multi-threading benchmark (WS-D).
 *
 * ponytail: one stderr line per span, no aggregation — the driver sums/greps.
 * Zero overhead (no timer read, no allocation) when the env flag is unset.
 */

const enabled = Boolean(process.env['GEOSPEC_FORENSIC']);

/** Whether forensic timing is active for this process. */
export const forensicEnabled = enabled;

/** Emit one `[FORENSIC] <label>\t<ms>` line to stderr when enabled. */
export const forensicLog = (label: string, ms: number): void => {
  if (enabled) {
    process.stderr.write(`[FORENSIC] ${label}\t${ms.toFixed(1)}\n`);
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
