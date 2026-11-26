/** HA-I10: the Node writer touches its own marker through the handle it holds, never a successor at the same path. */
import { mkdir, mkdtemp, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '#node.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

const logPath = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-touch-'));
  directories.push(directory);
  return join(directory, '.tau', 'chats', 'chat', 'events.jsonl');
};

const old = new Date('2020-01-01T00:00:00.000Z');

describe('Node writer touch', () => {
  it('should refresh its own marker’s mtime', async () => {
    const filePath = await logPath();
    const log = await createNodeEventLog({ filePath, access: 'write' });
    try {
      await utimes(`${filePath}.lock`, old, old);
      await log.touch?.();
      const { mtimeMs } = await stat(`${filePath}.lock`);
      expect(mtimeMs).toBeGreaterThan(old.getTime() + 1000);
    } finally {
      await log.close();
    }
  });

  it('should never touch a successor marker a taker wrote at the same path', async () => {
    const filePath = await logPath();
    const log = await createNodeEventLog({ filePath, access: 'write' });
    try {
      await unlink(`${filePath}.lock`);
      await writeFile(`${filePath}.lock`, '1\n');
      await utimes(`${filePath}.lock`, old, old);
      await log.touch?.();
      const { mtimeMs } = await stat(`${filePath}.lock`);
      expect(mtimeMs).toBe(old.getTime());
    } finally {
      await log.close();
    }
  });
});

/* Finding 14: a crashed browser tab's provider marker (epoch ms, no process) must not lock `tau serve` out forever. */
describe('Node open on a provider marker (HA-I10)', () => {
  const withMarker = async (touchedAt: Date): Promise<string> => {
    const filePath = await logPath();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(`${filePath}.lock`, `${String(touchedAt.getTime())}\n`);
    await utimes(`${filePath}.lock`, touchedAt, touchedAt);
    return filePath;
  };

  it('should take a provider marker over once it is past the XD3 bound', async () => {
    const filePath = await withMarker(new Date(Date.now() - foreignRunStaleMilliseconds - 60_000));
    const log = await createNodeEventLog({ filePath, access: 'write' });
    await log.close();
  });

  it('should refuse WRITER_LOCKED while a live browser writer keeps its provider marker fresh', async () => {
    const filePath = await withMarker(new Date());
    await expect(createNodeEventLog({ filePath, access: 'write' })).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
  });
});
