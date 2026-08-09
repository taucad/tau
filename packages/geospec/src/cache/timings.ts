/**
 * Per-shard duration + peak-RSS telemetry (R1), persisted in the cache root
 * so the pool scheduler (R3) can do duration-informed longest-first placement
 * and memory-class-aware sizing (R15). Telemetry is an optional scheduling
 * hint, never a correctness input: a missing or torn file degrades the
 * scheduler to static heuristics.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveGeoSpecCacheRoot } from '#cache/cache-root.js';

/** Telemetry for one GeoSpec file (project-relative path key). */
export type GeoSpecFileTiming = {
  /** Wall-clock cost of the file's last run, in milliseconds. */
  durationMs: number;
  /**
   * Process-wide peak RSS observed by the end of this file, in bytes.
   * Monotonic within a process, so it over-approximates per-file peaks —
   * safe for memory-class capping, unusable for exact attribution.
   */
  processPeakRssBytes?: number;
  /** Primary model-load cache key observed for this file (R9 affinity hint). */
  primaryLoadKey?: string;
  /**
   * Executing worker's isolate-resident memory at file completion (heap +
   * external, bytes) — the per-shard memory-class signal under a pool, where
   * process RSS is shared (R15).
   */
  workerMemoryBytes?: number;
  /** ISO timestamp of the recording. */
  updatedAt: string;
};

type GeoSpecTimingsFile = {
  version: 1;
  files: Record<string, GeoSpecFileTiming>;
};

const timingsFileName = 'timings.json';

const timingsPath = (projectPath: string): string => join(resolveGeoSpecCacheRoot(projectPath), timingsFileName);

const isTimingsFile = (value: unknown): value is GeoSpecTimingsFile => {
  const candidate = value as { version?: unknown; files?: unknown } | undefined;
  return candidate?.version === 1 && typeof candidate.files === 'object';
};

/**
 * Read recorded per-file timings. Returns an empty map when the file is
 * missing or unreadable (telemetry is a hint, not a dependency).
 */
export const readGeoSpecTimings = async (projectPath: string): Promise<Record<string, GeoSpecFileTiming>> => {
  try {
    const raw = await readFile(timingsPath(projectPath), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isTimingsFile(parsed) ? parsed.files : {};
  } catch {
    return {};
  }
};

/**
 * Merge and persist per-file timings atomically (temp file + rename so a
 * concurrent reader never sees a torn file).
 */
export const writeGeoSpecTimings = async (
  projectPath: string,
  updates: Record<string, GeoSpecFileTiming>,
): Promise<void> => {
  const path = timingsPath(projectPath);
  try {
    const existing = await readGeoSpecTimings(projectPath);
    const merged: GeoSpecTimingsFile = { version: 1, files: { ...existing, ...updates } };
    await mkdir(resolveGeoSpecCacheRoot(projectPath), { recursive: true });
    const temporaryPath = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(merged, null, 2), 'utf8');
    await rename(temporaryPath, path);
  } catch {
    // Telemetry writes must never fail a run.
  }
};

/** Normalize `process.resourceUsage().maxRSS` to bytes (KiB everywhere but darwin). */
export const processPeakRssBytes = (): number => {
  const maxRss = process.resourceUsage().maxRSS;
  return process.platform === 'darwin' ? maxRss : maxRss * 1024;
};
