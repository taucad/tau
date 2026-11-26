import { expect, it } from 'vitest';
import { createOpfsEventLog } from '#browser.js';

/*
 * HA0 OPFS spike (Brain research/host-attachment-reliability-blueprint.md, HA0 decision rule): HA1 reads this device's
 * own segment from the file while a writer in another context appends to it. A follower (this page) reads the log
 * through `createOpfsEventLog({ access: 'read' })` while a dedicated worker holds the exclusive sync handle and makes
 * 1000 appends. Rule: every read succeeds and shows a contiguous prefix → HA1 uses the OPFS read; any failure or tear
 * → HA1 switches to the provider log kind.
 *
 * Raw tails are counted apart: a read can land mid-append and end on a partial line, which the tolerant parse (HA-I6)
 * drops. That is a torn tail, not a torn read, as long as the parsed rows stay a contiguous prefix.
 */

type WriterMessage =
  | Readonly<{ type: 'opened' }>
  | Readonly<{ type: 'done'; elapsed: number }>
  | Readonly<{ type: 'error'; error: string }>;

const appends = 1000;

it('should read a contiguous prefix from another context during 1000 appends', async () => {
  const fileName = 'agent-host-cross-context-read-test.jsonl';
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(fileName).catch(() => undefined);
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  const worker = new Worker(new URL('opfs-cross-context-read.browser.fixture.ts', import.meta.url), { type: 'module' });
  const opened = Promise.withResolvers<void>();
  const done = Promise.withResolvers<number>();
  worker.addEventListener('message', ({ data }: MessageEvent<WriterMessage>) => {
    if (data.type === 'opened') {
      opened.resolve();
    } else if (data.type === 'done') {
      done.resolve(data.elapsed);
    } else {
      opened.reject(new Error(data.error));
      done.reject(new Error(data.error));
    }
  });
  worker.postMessage({ fileName, count: appends });
  await opened.promise;

  const reader = await createOpfsEventLog({ fileHandle, access: 'read' });
  const writer = { writing: true };
  const writerElapsed = (async (): Promise<number> => {
    try {
      return await done.promise;
    } finally {
      writer.writing = false;
    }
  })();
  const stats = { reads: 0, failures: [] as string[], tears: 0, tornTails: 0, regressions: 0, lastCount: 0 };
  const decoder = new TextDecoder();
  try {
    while (writer.writing) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each read is one follower wake.
        const events = await reader.read();
        // oxlint-disable-next-line no-await-in-loop -- The raw bytes of the same moment, for torn tails.
        const file = await fileHandle.getFile();
        // oxlint-disable-next-line no-await-in-loop -- As above.
        const raw = decoder.decode(await file.arrayBuffer());
        stats.reads += 1;
        if (events.some((event, index) => event.sequence !== index)) {
          stats.tears += 1;
        }
        if (events.length < stats.lastCount) {
          stats.regressions += 1;
        }
        stats.lastCount = events.length;
        if (raw.length > 0 && !raw.endsWith('\n')) {
          stats.tornTails += 1;
        }
      } catch (error) {
        stats.failures.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
    }
    const elapsed = await writerElapsed;
    const final = await reader.read();
    console.info(`HA0 OPFS spike: ${JSON.stringify({ appends, writerMilliseconds: Math.round(elapsed), ...stats })}`);

    expect(stats.failures).toEqual([]);
    expect(stats.tears).toBe(0);
    expect(stats.regressions).toBe(0);
    expect(final).toHaveLength(appends);
  } finally {
    await reader.close();
    worker.terminate();
    await root.removeEntry(fileName).catch(() => undefined);
  }
}, 60_000);
