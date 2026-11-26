import { expect, it } from 'vitest';
import { createReplayView, isBytePrefix } from '#launchers/replay-view.js';
import type { ReplayView } from '#launchers/replay-view.js';

/*
 * HA0 poll-cost spike (Brain research/host-attachment-reliability-blueprint.md, HA0 decision rule): while an own run is
 * unsettled, HA1's own-segment source re-reads the log on every `unsettledReadPollMilliseconds` wake. One wake is the
 * full read (`getFile` + `arrayBuffer` from OPFS), the byte-prefix check against the held bytes, and `extend` with the
 * new tail (HA-I3). Rule: p95 ≤ 4 ms per wake on the 200-run fixture and on one long chat → full reads; otherwise HA1
 * adds a ranged read. The numbers are printed for the HA0 results; the test asserts only that each fold stays whole,
 * so a slow CI machine records a number instead of failing.
 */

const wakes = 100;

/** The 200-run fixture of the chat-projection tests (`chat-projection.transcript.test.ts`), as log bytes. */
const twoHundredRuns = (): string => {
  const rows = Array.from({ length: 200 }, (_, index) => {
    const runId = `run_${String(index)}`;
    const at = index * 5;
    const row = (sequence: number, fields: Record<string, unknown>): Record<string, unknown> => ({
      version: 1,
      leaderEpoch: 'g1',
      sequence,
      recordedAt: '2026-09-28T00:00:00.000Z',
      runId,
      ...fields,
    });
    return [
      row(at, { type: 'run.lifecycle', state: 'admitted', attempt: 1 }),
      row(at + 1, { type: 'run.lifecycle', state: 'running', attempt: 1 }),
      row(at + 2, {
        type: 'message.appended',
        message: { id: `user-${String(index)}`, role: 'user', content: `Turn ${String(index)}` },
      }),
      row(at + 3, {
        type: 'message.appended',
        message: { id: `step-${String(index)}`, role: 'assistant', content: `Answer ${String(index)}` },
      }),
      row(at + 4, { type: 'run.lifecycle', state: 'completed', attempt: 1 }),
    ];
  }).flat();
  return rows.map((row) => `${JSON.stringify(row)}\n`).join('');
};

const longChat = async (): Promise<string> => {
  const response = await fetch(
    new URL('../../specs/ChatLog/recorded/daemon-reattach-hexnut-4runs.jsonl', import.meta.url),
  );
  return response.text();
};

/** One row an unsettled run appends between two wakes. */
const tailRow = (sequence: number): string =>
  `${JSON.stringify({
    version: 1,
    leaderEpoch: 'tail',
    sequence,
    recordedAt: '2026-11-26T00:00:00.000Z',
    runId: 'run_live',
    type: 'message.appended',
    message: { id: `live-${String(sequence)}`, role: 'assistant', content: 'still working' },
  })}\n`;

const percentile = (samples: readonly number[], fraction: number): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!;
};

const summary = (samples: readonly number[]): Record<string, number> => ({
  p50: Number(percentile(samples, 0.5).toFixed(3)),
  p95: Number(percentile(samples, 0.95).toFixed(3)),
  max: Number(Math.max(...samples).toFixed(3)),
});

const appendTo = async (handle: FileSystemFileHandle, text: string): Promise<void> => {
  const { size } = await handle.getFile();
  const writable = await handle.createWritable({ keepExistingData: true });
  await writable.write({ type: 'write', position: size, data: text });
  await writable.close();
};

const readBytes = async (handle: FileSystemFileHandle): Promise<Uint8Array<ArrayBuffer>> => {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
};

/** One wake: the full read, the prefix check and the fold; returns the next view and the wake's milliseconds. */
const wake = async (
  handle: FileSystemFileHandle,
  view: ReplayView,
): Promise<Readonly<{ view: ReplayView; milliseconds: number }>> => {
  const started = performance.now();
  const bytes = await readBytes(handle);
  const next = isBytePrefix(view.bytes, bytes) ? view.extend(bytes) : createReplayView(bytes, 'rebuilt');
  return { view: next, milliseconds: performance.now() - started };
};

it.each([
  ['the 200-run fixture', async () => twoHundredRuns()],
  ['one long chat (daemon-reattach-hexnut-4runs)', longChat],
])(
  'should measure one own-segment poll wake on %s',
  async (name, load) => {
    const text = await load();
    const fileName = 'agent-host-poll-cost-test.jsonl';
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(fileName).catch(() => undefined);
    const handle = await root.getFileHandle(fileName, { create: true });
    try {
      await appendTo(handle, text);
      let view = createReplayView(await readBytes(handle), 'initial');
      const rows = view.ledger.position.cursor;
      const idle: number[] = [];
      const appended: number[] = [];
      const rebuilt: number[] = [];
      /* Warm the read path once, as a page that has been polling would be. */
      ({ view } = await wake(handle, view));
      for (let index = 0; index < wakes; index++) {
        // oxlint-disable-next-line no-await-in-loop -- Wakes are sequential by definition.
        const quiet = await wake(handle, view);
        idle.push(quiet.milliseconds);
        view = quiet.view;
        // oxlint-disable-next-line no-await-in-loop -- The run writes between two wakes, outside the timed wake.
        await appendTo(handle, tailRow(100_000 + index));
        // oxlint-disable-next-line no-await-in-loop -- Wakes are sequential by definition.
        const grown = await wake(handle, view);
        appended.push(grown.milliseconds);
        view = grown.view;
      }
      for (let index = 0; index < wakes / 4; index++) {
        const started = performance.now();
        // oxlint-disable-next-line no-await-in-loop -- Sequential, as a rebuild per wake would be.
        createReplayView(await readBytes(handle), 'full');
        rebuilt.push(performance.now() - started);
      }
      const { size: bytes } = await handle.getFile();
      console.info(
        `HA0 poll cost (${name}): ${JSON.stringify({ bytes, rows, wakes, idle: summary(idle), appended: summary(appended), rebuiltPerWake: summary(rebuilt) })}`,
      );

      expect(view.sourceHealth.quarantined).toBe(false);
      expect(view.ledger.position.cursor).toBe(rows + wakes);
    } finally {
      await root.removeEntry(fileName).catch(() => undefined);
    }
  },
  120_000,
);
