/**
 * The runtime trace a harness measured against (D8, W28).
 *
 * `MeasurementTags.runtimeTraceJsonl` reserved this seam: both harnesses record
 * a wall clock and neither could say where that time went, because the spans
 * that answer it lived in whichever process happened to produce them. Every
 * Node realm now writes JSONL under `TAU_TELEMETRY_DIR`, one file per producer,
 * so a run's trace is the merge of that directory — one file, one clock, named
 * in the artifact so the comparator and a human open the same bytes.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A span as the runtime's JSONL sink writes it (`TelemetrySpanRecord`). */
type TraceLine = {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly epoch: number;
};

/** What a harness records about the run's spans. */
export type RuntimeTraceSummary = {
  /** Path of the merged JSONL, for `MeasurementTags.runtimeTraceJsonl`. */
  readonly file: string;
  readonly spanCount: number;
  /**
   * Total milliseconds per span name, heaviest first. Nested spans are counted
   * in both their own name and their parent's: this attributes a wall clock to
   * subsystems, it is not an exclusive-time profile.
   */
  readonly totals: Readonly<Record<string, number>>;
};

/** Span names past this are noise in an artifact; the heaviest are what a regression is read from. */
const reportedNames = 10;

/**
 * Merge every producer's JSONL in a directory into one trace.
 *
 * @param input - The directory the sinks wrote into, and where the merged file goes.
 * @returns The merged trace, or `undefined` when the run produced no spans.
 */
export async function mergeRuntimeTrace(input: {
  /** Directory holding one `.jsonl` (and rotated `.jsonl.1`) per producer. */
  readonly directory: string;
  /** Absolute path of the merged file to write. */
  readonly destination: string;
}): Promise<RuntimeTraceSummary | undefined> {
  const names = await readdir(input.directory).catch(() => []);
  const files = names.filter((name) => name.includes('.jsonl'));
  if (files.length === 0) {
    return undefined;
  }

  const texts = await Promise.all(
    files.map(async (name) => readFile(join(input.directory, name), 'utf8').catch(() => '')),
  );
  const spans: Array<{ line: string; at: number; name: string; duration: number }> = [];
  for (const line of texts.flatMap((text) => text.split('\n'))) {
    if (line === '') {
      continue;
    }
    try {
      const span = JSON.parse(line) as TraceLine;
      spans.push({ line, at: span.epoch + span.startTime, name: span.name, duration: span.duration });
    } catch {
      /* A killed process can leave half a line; the rest of the trace is still a trace. */
    }
  }
  if (spans.length === 0) {
    return undefined;
  }

  spans.sort((left, right) => left.at - right.at);
  const totals = new Map<string, number>();
  for (const span of spans) {
    totals.set(span.name, (totals.get(span.name) ?? 0) + span.duration);
  }

  await mkdir(join(input.destination, '..'), { recursive: true });
  await writeFile(input.destination, `${spans.map(({ line }) => line).join('\n')}\n`);

  return {
    file: input.destination,
    spanCount: spans.length,
    totals: Object.fromEntries([...totals].sort(([, left], [, right]) => right - left).slice(0, reportedNames)),
  };
}
