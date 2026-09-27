import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createNodeMachineEventLog, readMachineEventLogPrefix } from '#host/node-machine-event-log.js';

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

const fileName = 'operations.jsonl';
const owner = {
  assertCurrent() {
    /* The fixture retains ownership until a test supplies a revoking owner. */
  },
};

describe.runIf(process.platform === 'darwin' || process.platform === 'linux')('Node machine event log', () => {
  it('replays committed records and truncates an uncommitted tail on restart', async () => {
    const root = await directory();
    const first = await createNodeMachineEventLog({ directory: root, fileName, owner, parse: eventSchema.parse });
    await first.append({ type: 'fixture', value: 'one' });
    await first.close();
    const path = join(root, fileName);
    const committed = await readFile(path);
    await appendFile(path, '{"partial":');

    const second = await createNodeMachineEventLog({ directory: root, fileName, owner, parse: eventSchema.parse });
    await expect(second.replay({ cursor: 0, limit: 10 })).resolves.toMatchObject({
      records: [{ sequence: 0, event: { type: 'fixture', value: 'one' } }],
      endCursor: 1,
    });
    await second.close();
    expect(await readFile(path)).toEqual(committed);
  });

  it('should refuse an over-limit record without poisoning later appends or replay', async () => {
    const root = await directory();
    const log = await createNodeMachineEventLog({ directory: root, fileName, owner, parse: eventSchema.parse });
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

  it('should read the valid prefix of a log it does not own and never write to it', async () => {
    const root = await directory();
    const log = await createNodeMachineEventLog({ directory: root, fileName, owner, parse: eventSchema.parse });
    await log.append({ type: 'fixture', value: 'one' });
    await log.append({ type: 'fixture', value: 'two' });
    await log.close();
    const path = join(root, fileName);
    const written = await readFile(path, 'utf8');
    const [first = '', second = ''] = written.split('\n');
    // A torn tail is ignored rather than truncated: every committed frame was still read.
    const torn = `${written}{"partial":`;
    await writeFile(path, torn);
    await expect(readMachineEventLogPrefix(path)).resolves.toEqual({
      events: [
        { type: 'fixture', value: 'one' },
        { type: 'fixture', value: 'two' },
      ],
      complete: true,
    });
    expect(await readFile(path, 'utf8')).toBe(torn);
    // A frame whose checksum no longer matches ends the prefix, and the read says it stopped short.
    const damaged = `${first}\n${second.replace('"two"', '"owt"')}\n${first}\n`;
    await writeFile(path, damaged);
    await expect(readMachineEventLogPrefix(path)).resolves.toEqual({
      events: [{ type: 'fixture', value: 'one' }],
      complete: false,
    });
    expect(await readFile(path, 'utf8')).toBe(damaged);
    await expect(readMachineEventLogPrefix(join(root, 'missing.jsonl'))).resolves.toEqual({
      events: [],
      complete: true,
    });
  });

  it('fences operations after authority ownership is lost', async () => {
    const root = await directory();
    let current = true;
    const log = await createNodeMachineEventLog({
      directory: root,
      fileName,
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
