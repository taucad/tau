import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '#contract.js';
import type { PendingEvidenceStore } from '#delivery.js';
import { createEvidenceOutbox, memoryPendingStore } from '#delivery.js';
import { evidenceKeys } from '#identity.js';
import { filePendingStore, indexedDbPendingStore } from '#pending-stores.js';
import { projectRun } from '#projection.js';

const at = Date.parse('2026-10-29T00:00:00.000Z');

const envelopes = async (count: number, policyEpoch = 'epoch-1', offset = 0): Promise<Evidence[]> => {
  const projections = await Promise.all(
    Array.from({ length: count }, async (_, index) =>
      projectRun(
        {
          chatId: 'chat-1',
          runId: `run-${index}`,
          termination: 'completed',
          tools: [],
          intervals: [],
          ending: { source: { chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence: index + offset }, at: at + index },
        },
        {
          principal: 'user-a',
          project: 'project-a',
          policyEpoch,
          protection: 'free',
          uploader: 'device-a',
          ownsEpoch: () => true,
          grantedAt: at,
          hostBuild: undefined,
        },
      ),
    ),
  );
  return projections.flatMap((projection) => projection.evidence);
};

const item = (evidence: Evidence) => ({ key: evidenceKeys(evidence).source, evidence, bytes: 100 });

/** An in-memory stand-in for the host's atomic file access. */
const memoryFiles = () => {
  const files = new Map<string, string>();
  return {
    files,
    access: {
      readFile: async (path: string) => files.get(path),
      replaceFile: async (path: string, contents: string) => {
        files.set(path, contents);
      },
    },
  };
};

let databases = 0;
const stores: ReadonlyArray<readonly [string, () => PendingEvidenceStore]> = [
  ['memory', memoryPendingStore],
  [
    'IndexedDB',
    // A real browser's IndexedDB when the suite runs in Chromium, a faithful fake under Node.
    () => {
      databases += 1;
      return indexedDbPendingStore(
        `pending-${databases}`,
        typeof indexedDB === 'undefined' ? new IDBFactory() : indexedDB,
      );
    },
  ],
  ['file', () => filePendingStore('/queue.json', memoryFiles().access)],
];

describe.each(stores)('%s pending store', (_, create) => {
  it('holds a source once, in arrival order, and releases and purges by key and match', async () => {
    const store = create();
    const [first, second, third] = await envelopes(3);
    const stale = await envelopes(1, 'epoch-0', 10);

    expect(await store.hold(item(first!))).toBe('held');
    expect(await store.hold(item(second!))).toBe('held');
    expect(await store.hold(item(first!))).toBe('duplicate');
    await store.hold(item(third!));
    await store.hold(item(stale[0]!));

    const oldest = await store.oldest(2);
    expect(oldest.map((held) => held.evidence)).toEqual([first, second]);
    expect(await store.size()).toEqual({ items: 4, bytes: 400 });

    await store.release([item(second!).key, 'never-held']);
    expect(await store.purge((evidence) => evidence.scope.policyEpoch === 'epoch-0')).toBe(1);
    const remaining = await store.oldest(10);
    expect(remaining.map((held) => held.evidence)).toEqual([first, third]);
  });

  it('serves an outbox end to end', async () => {
    const store = create();
    const sent: Evidence[] = [];
    const outbox = createEvidenceOutbox({
      store,
      now: () => at,
      submit: async (evidence) => {
        sent.push(evidence);
        return {
          kind: 'receipt',
          receipt: { receipt: 'r', disposition: 'accepted', duplicate: false, receivedAt: '', expiresAt: '' },
        };
      },
    });
    await outbox.bind({ principal: 'user-a', project: 'project-a', policyEpoch: 'epoch-1' });
    const evidence = await envelopes(3);
    await outbox.enqueue(evidence);

    expect(await outbox.drain()).toEqual({ stop: 'empty' });
    expect(sent).toEqual(evidence);
    expect(await store.size()).toEqual({ items: 0, bytes: 0 });
  });
});

describe('file pending store', () => {
  it('survives a restart, and treats an unreadable file as empty rather than trusted', async () => {
    const { files, access } = memoryFiles();
    const [evidence] = await envelopes(1);
    await filePendingStore('/queue.json', access).hold(item(evidence!));

    const restarted = await filePendingStore('/queue.json', access).oldest(10);
    expect(restarted.map((held) => held.evidence)).toEqual([evidence]);

    files.set('/queue.json', '{not json');
    expect(await filePendingStore('/queue.json', access).size()).toEqual({ items: 0, bytes: 0 });
  });
});
