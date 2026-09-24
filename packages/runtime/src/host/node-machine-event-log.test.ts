import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createNodeMachineEventLog } from '#host/node-machine-event-log.js';

const temporaryDirectories: string[] = [];
const eventSchema = z.strictObject({ type: z.literal('fixture'), value: z.string() });

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

const directory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'tau-machine-event-log-'));
  temporaryDirectories.push(path);
  return path;
};

const owner = {
  assertCurrent() {
    /* The fixture retains ownership until a test supplies a revoking owner. */
  },
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('Node machine event log', () => {
  it('replays committed records and truncates an uncommitted tail on restart', async () => {
    const root = await directory();
    const first = await createNodeMachineEventLog({ authorityRoot: root, owner, parse: eventSchema.parse });
    await first.append({ type: 'fixture', value: 'one' });
    await first.close();
    const path = join(root, 'machine-events.jsonl');
    const committed = await readFile(path);
    await appendFile(path, '{"partial":');

    const second = await createNodeMachineEventLog({ authorityRoot: root, owner, parse: eventSchema.parse });
    await expect(second.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({
      records: [{ sequence: 0, event: { type: 'fixture', value: 'one' } }],
      endCursor: 1,
    });
    await second.close();
    expect(await readFile(path)).toEqual(committed);
  });

  it('should refuse an over-limit record without poisoning later appends or replay', async () => {
    const root = await directory();
    const log = await createNodeMachineEventLog({ authorityRoot: root, owner, parse: eventSchema.parse });
    await log.append({ type: 'fixture', value: 'one' });
    await expect(log.append({ type: 'fixture', value: 'x'.repeat(1024 * 1024) })).rejects.toThrow(
      'MACHINE_EVENT_LOG_FILE_LIMIT',
    );
    await log.append({ type: 'fixture', value: 'two' });
    await expect(log.replay({ cursor: 0, limit: 10 })).resolves.toEqual({
      records: [
        { sequence: 0, event: { type: 'fixture', value: 'one' } },
        { sequence: 1, event: { type: 'fixture', value: 'two' } },
      ],
      nextCursor: 2,
      endCursor: 2,
    });
    await log.close();
  });

  it('fences operations after authority ownership is lost', async () => {
    const root = await directory();
    let current = true;
    const log = await createNodeMachineEventLog({
      authorityRoot: root,
      owner: {
        assertCurrent() {
          if (!current) {
            throw new Error('owner lost');
          }
        },
      },
      parse: eventSchema.parse,
    });
    current = false;
    await expect(log.append({ type: 'fixture', value: 'one' })).rejects.toThrow('owner lost');
    current = true;
    await log.close();
  });
});
