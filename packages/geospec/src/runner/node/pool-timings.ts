/**
 * Shard timings telemetry.
 *
 * The pool schedules longest-first, which needs an estimate of how long each
 * test file took last time. That estimate is **an optional scheduling hint,
 * never a correctness input**: a missing, stale or absurd timing changes the
 * order work is done in and nothing else. Peak RSS is recorded monotonically —
 * it over-approximates, which is exactly what makes it safe for capping
 * concurrency and useless for anything that must be exact.
 *
 * @module
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { ShardTiming, ShardTimings } from '#runner/pool/shard-timings.js';

const timingsPath = (root: string): string => join(root, 'telemetry', 'shard-timings.json');

const readTable = (path: string): Record<string, ShardTiming> => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, ShardTiming>) : {};
  } catch {
    // No telemetry yet, or unreadable telemetry: schedule without a hint.
    return {};
  }
};

/**
 * Open the shard-timings table under a cache root.
 *
 * @param root - Cache root, or `undefined` to keep the table in memory only.
 * @returns The table.
 * @internal
 */
export const openShardTimings = (root: string | undefined): ShardTimings => {
  const path = root === undefined ? undefined : timingsPath(root);
  const table = path === undefined ? {} : readTable(path);
  return {
    record(shard, timing) {
      const previous = table[shard];
      table[shard] = {
        durationMs: timing.durationMs,
        peakRssBytes: Math.max(previous?.peakRssBytes ?? 0, timing.peakRssBytes),
      };
    },
    read: (shard) => table[shard],
    longestFirst: () =>
      Object.keys(table).sort(
        (left, right) => table[right]!.durationMs - table[left]!.durationMs || left.localeCompare(right),
      ),
    save() {
      if (path === undefined) {
        return;
      }
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
        writeFileSync(temporary, JSON.stringify(table));
        renameSync(temporary, path);
      } catch {
        // Telemetry is a hint. Losing it costs scheduling quality, nothing else.
      }
    },
  };
};
