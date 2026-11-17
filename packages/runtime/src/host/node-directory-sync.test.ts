import { mkdtemp, rm } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createNodeMachineEventLog } from '#host/node-machine-event-log.js';

/* Windows refuses `fsync` on a directory handle with EPERM. This suite gives every directory handle that behaviour,
 * so the Windows path (no directory sync) and the POSIX one (a sync, whose refusal surfaces) both run on any host. */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    open: vi.fn(async (...parameters: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...parameters);
      const stats = await handle.stat();
      if (stats.isDirectory()) {
        handle.sync = async () => {
          throw Object.assign(new Error('EPERM: operation not permitted, fsync'), { code: 'EPERM' });
        };
      }
      return handle;
    }),
  };
});

const { platform } = process;
const temporaryDirectories: string[] = [];
const eventSchema = z.strictObject({ type: z.literal('fixture'), value: z.string() });
const owner = {
  assertCurrent() {
    /* The fixture keeps ownership. */
  },
};

const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true });
};

const temporaryDirectory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'tau-runtime-sync-'));
  temporaryDirectories.push(path);
  return path;
};

afterEach(async () => {
  setPlatform(platform);
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

describe('machine event log without a directory sync on Windows', () => {
  it('should create and append a machine event log on Windows, where a directory cannot be synced', async () => {
    setPlatform('win32');
    const log = await createNodeMachineEventLog({
      directory: await temporaryDirectory(),
      fileName: 'operations.jsonl',
      owner,
      parse: eventSchema.parse,
    });
    await log.append({ type: 'fixture', value: 'one' });
    await expect(log.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({
      records: [{ sequence: 0, event: { type: 'fixture', value: 'one' } }],
    });
    await log.close();
  });

  it('should sync a new machine event log directory on POSIX and surface a refused sync', async () => {
    setPlatform('linux');
    await expect(
      createNodeMachineEventLog({
        directory: await temporaryDirectory(),
        fileName: 'operations.jsonl',
        owner,
        parse: eventSchema.parse,
      }),
    ).rejects.toMatchObject({ code: 'EPERM' });
  });
});
