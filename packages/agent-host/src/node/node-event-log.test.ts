import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '#node.js';
import { parseEventLog, serializeLogEvent } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';

const temporaryDirectories: string[] = [];

const event = (sequence: number, content = `message-${sequence}`): AgentLogEvent => ({
  version: 1,
  type: 'message.appended',
  leaderEpoch: 'epoch-a',
  sequence,
  recordedAt: '2026-08-31T00:00:00.000Z',
  runId: 'run-a',
  message: { id: `message-${sequence}`, role: 'user', content },
});

const temporaryLogPath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-agent-host-'));
  temporaryDirectories.push(directory);
  return join(directory, '.tau', 'chats', 'chat-a', 'events.jsonl');
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('Node event log', () => {
  it('appends one flushed line and no-ops an exact cursor replay', async () => {
    const filePath = await temporaryLogPath();
    const log = await createNodeEventLog({ filePath });

    await expect(log.append(event(0))).resolves.toEqual({ appended: true });
    await expect(log.append(event(0))).resolves.toEqual({ appended: false });
    await expect(log.append(event(1))).resolves.toEqual({ appended: true });
    await expect(log.read()).resolves.toEqual([event(0), event(1)]);
    await log.close();

    expect(parseEventLog(await readFile(filePath, 'utf8'))).toEqual([event(0), event(1)]);
  });

  it('heals a torn tail before appending the next line', async () => {
    const filePath = await temporaryLogPath();
    const emptyLog = await createNodeEventLog({ filePath });
    await emptyLog.close();
    await writeFile(filePath, `${serializeLogEvent(event(0))}{"version":1`);

    const log = await createNodeEventLog({ filePath });
    await expect(log.read()).resolves.toEqual([event(0)]);
    await log.append(event(1));
    await log.close();

    expect(parseEventLog(await readFile(filePath, 'utf8'))).toEqual([event(0), event(1)]);
  });

  it('rejects mutated content under an existing epoch and sequence', async () => {
    const filePath = await temporaryLogPath();
    const log = await createNodeEventLog({ filePath });
    await log.append(event(0));

    await expect(log.append(event(0, 'mutated'))).rejects.toMatchObject({ code: 'EVENT_MUTATED' });
    await log.close();
  });

  it('should fence a second writer until the first writer closes', async () => {
    const filePath = await temporaryLogPath();
    const first = await createNodeEventLog({ filePath });
    const secondAttempt = createNodeEventLog({ filePath });

    try {
      await expect(secondAttempt).rejects.toMatchObject({ name: 'EventLogError', code: 'WRITER_LOCKED' });
    } finally {
      const second = await secondAttempt.catch(() => undefined);
      await second?.close();
      await first.close();
    }

    const reopened = await createNodeEventLog({ filePath });
    await reopened.close();
  });
});
