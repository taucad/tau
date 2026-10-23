/**
 * Out-of-container canaries for the W2 MXC isolation receipt. Reusable by the later Win11 Eval VM
 * lane: these are standalone primitives with no MXC dependency.
 *
 *   - `reapingWriterCommand`: a shell command (Git Bash, per RQ6) that starts a SESSION-ESCAPING,
 *     TERM-ignoring background writer appending to a sentinel file, then returns the foreground
 *     process immediately. If MXC's kill-on-close job reaps the whole tree when the foreground
 *     exits, the sentinel STOPS growing. The verdict is decided by an external observer watching the
 *     file size — never by an in-container claim.
 *   - `observeGrowth`: external file-size observer over a window.
 *   - `digestOf` / `readIfPresent`: external file-digest helpers for the allow/deny assertions.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

import { sha256, sleep } from './mxc-lib.mts';

/**
 * A command that:
 *   1. ignores SIGTERM in the current shell and in the child (`trap '' TERM`),
 *   2. starts a detached writer in a NEW session where available (`setsid`), so it escapes the
 *      foreground process group — the adversary case for reaping,
 *   3. appends to `sentinel` every ~100 ms,
 *   4. returns the foreground shell at once (exit 0).
 *
 * Only a kill-on-close job that reaps the ENTIRE descendant tree (not just the foreground group)
 * stops this writer. A POSIX process-group kill alone would miss the setsid child.
 */
export const reapingWriterCommand = (sentinel: string): string => {
  const f = sentinel.replaceAll('\\', '/');
  const writer = `trap '' TERM; i=0; while :; do printf '%s\\n' "$i $(date +%s%N)" >> "${f}"; i=$((i+1)); sleep 0.1; done`;
  // Prefer setsid (true session escape); fall back to a plain disowned background job.
  return `bash -c 'if command -v setsid >/dev/null 2>&1; then setsid bash -c "${writer}" >/dev/null 2>&1 < /dev/null & else ( ${writer} ) >/dev/null 2>&1 & fi; disown || true; exit 0'`;
};

/** Record file size at t0 and after `windowMs`; report whether it grew (external observation). */
export const observeGrowth = async (
  path: string,
  windowMs: number,
): Promise<{ grew: boolean; before: number; after: number }> => {
  const sizeOf = (): number => (existsSync(path) ? statSync(path).size : 0);
  const before = sizeOf();
  await sleep(windowMs);
  const after = sizeOf();
  return { grew: after > before, before, after };
};

export const readIfPresent = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, 'utf8') : undefined;

export const digestOf = (path: string): string | undefined => {
  const content = readIfPresent(path);
  return content === undefined ? undefined : sha256(content);
};
