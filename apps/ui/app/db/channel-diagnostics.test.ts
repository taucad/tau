import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';
import { readChannelDiagnostics, saveChannelDiagnostic } from '#db/channel-diagnostics.js';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});

it('should retain only bounded metadata across independent connections and concurrent writers', async () => {
  const secret = 'prompt and bearer credential';
  const event = {
    event: 'placement.closed',
    tabId: 'tab',
    hostId: 'host',
    generation: 1,
    code: 'PEER_UNRESPONSIVE',
    reason: secret,
    payload: secret,
  } as const;
  expect(await saveChannelDiagnostic(event)).toBe(true);
  expect(await readChannelDiagnostics()).toMatchObject([{ event: 'placement.closed', generation: 1, reason: 'other' }]);
  expect(JSON.stringify(await readChannelDiagnostics())).not.toContain(secret);
  await Promise.all(
    Array.from({ length: 210 }, async (_, generation) =>
      saveChannelDiagnostic({ event: 'placement.replaced', tabId: 'tab', generation }),
    ),
  );
  const rows = await readChannelDiagnostics();
  expect(rows).toHaveLength(200);
  expect(new Set(rows.map((row) => row.generation)).size).toBe(200);
});

it('should expire old records on a subsequent write and report unavailable persistence without throwing', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(0);
  await saveChannelDiagnostic({ event: 'worker.opened', tabId: 'old' });
  now.mockReturnValue(8 * 24 * 60 * 60 * 1000);
  await saveChannelDiagnostic({ event: 'worker.opened', tabId: 'new' });
  expect(await readChannelDiagnostics()).toMatchObject([{ tabId: 'new' }]);
  now.mockRestore();
  vi.stubGlobal('indexedDB', undefined);
  await expect(saveChannelDiagnostic({ event: 'worker.closed', tabId: 'new' })).resolves.toBe(false);
});
