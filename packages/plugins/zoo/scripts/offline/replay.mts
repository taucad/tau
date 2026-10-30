/**
 * Replays a `trace.jsonl` written by `run-sample.mts` (OFFLINE_TRACE=1) through a fresh offline engine, for
 * debugging a command without re-running KCL. Ids are replayed verbatim; engine-minted ids come from the trace's
 * responses order only where the engine mints them deterministically, so prefer inspecting state, not ids.
 *
 * Usage: tsx replay.mts <trace.jsonl> [stopAtIndex] [inspect.mjs]
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { OfflineEngine } from '#offline/offline-engine.js';
import { loadLibcascade } from '#offline/offline-libcascade.js';

const [tracePath, stopArgument, inspectPath] = process.argv.slice(2) as [
  string,
  string | undefined,
  string | undefined,
];
const trace = await readFile(tracePath, 'utf8');
const lines = trace
  .split('\n')
  .filter(Boolean)
  .map(
    (line) =>
      JSON.parse(line) as {
        id: string;
        cmd: { type: string } & Record<string, unknown>;
        response?: { data?: Record<string, unknown> };
      },
  );
const oc = await loadLibcascade();
// Reuse the ids the original run minted, so later commands that reference them still resolve.
const minted: string[] = [];
for (const line of lines) {
  for (const match of JSON.stringify(line.response ?? {}).matchAll(
    /"([\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12})"/g,
  )) {
    const [, id] = match;
    if (id) {
      minted.push(id);
    }
  }
}

const seen = new Set<string>();
const queue = minted.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
const engine = new OfflineEngine(oc, undefined, { mintId: () => queue.shift() ?? randomUUID() });
const stop = stopArgument ? Number(stopArgument) : lines.length;
for (const [index, line] of lines.entries()) {
  if (index >= stop) {
    break;
  }

  try {
    engine.execute(line.id, line.cmd);
  } catch (error) {
    console.log(index, line.cmd.type, 'failed:', (error as Error).message);
  }
}

if (inspectPath) {
  const module = (await import(inspectPath)) as {
    default: (engine: OfflineEngine, oc: unknown, lines: unknown[]) => unknown;
  };
  await module.default(engine, oc, lines);
}
