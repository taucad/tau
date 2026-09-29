import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FilesystemNode from '@taucad/filesystem/backend/node';
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
    const log = await createNodeEventLog({ filePath, access: 'write' });

    await expect(log.append(event(0))).resolves.toMatchObject({ appended: true });
    await expect(log.append(event(0))).resolves.toMatchObject({ appended: false });
    await expect(log.append(event(1))).resolves.toMatchObject({ appended: true });
    await expect(log.read()).resolves.toEqual([event(0), event(1)]);
    await log.close();

    expect(parseEventLog(await readFile(filePath, 'utf8'))).toEqual([event(0), event(1)]);
  });

  it('heals a torn tail before appending the next line', async () => {
    const filePath = await temporaryLogPath();
    const emptyLog = await createNodeEventLog({ filePath, access: 'write' });
    await emptyLog.close();
    await writeFile(filePath, `${serializeLogEvent(event(0))}{"version":1`);

    const log = await createNodeEventLog({ filePath, access: 'write' });
    await expect(log.read()).resolves.toEqual([event(0)]);
    await log.append(event(1));
    await log.close();

    expect(parseEventLog(await readFile(filePath, 'utf8'))).toEqual([event(0), event(1)]);
  });

  it('rejects mutated content under an existing epoch and sequence', async () => {
    const filePath = await temporaryLogPath();
    const log = await createNodeEventLog({ filePath, access: 'write' });
    await log.append(event(0));

    await expect(log.append(event(0, 'mutated'))).rejects.toMatchObject({ code: 'EVENT_MUTATED' });
    await log.close();
  });

  it('should fence a second writer until the first writer closes', async () => {
    const filePath = await temporaryLogPath();
    const first = await createNodeEventLog({ filePath, access: 'write' });
    const secondAttempt = createNodeEventLog({ filePath, access: 'write' });

    try {
      await expect(secondAttempt).rejects.toMatchObject({ name: 'EventLogError', code: 'WRITER_LOCKED' });
    } finally {
      const second = await secondAttempt.catch(() => undefined);
      await second?.close();
      await first.close();
    }

    const reopened = await createNodeEventLog({ filePath, access: 'write' });
    await reopened.close();
  });
  it('should take over a lock whose writer process is gone and still fence a live one', async () => {
    const filePath = await temporaryLogPath();
    await mkdir(dirname(filePath), { recursive: true });
    // A daemon killed with SIGKILL never runs its release; only its pid survives in the lock.
    await writeFile(`${filePath}.lock`, '2147483647\n');
    const recovered = await createNodeEventLog({ filePath, access: 'write' });
    await recovered.close();

    await writeFile(`${filePath}.lock`, `${process.pid}\n`);
    try {
      await expect(createNodeEventLog({ filePath, access: 'write' })).rejects.toMatchObject({
        name: 'EventLogError',
        code: 'WRITER_LOCKED',
      });
    } finally {
      await rm(`${filePath}.lock`, { force: true });
    }
  });

  it('should take over a lock copied from another log path even when its writer pid is alive', async () => {
    const filePath = await temporaryLogPath();
    await mkdir(dirname(filePath), { recursive: true });
    // A project duplicated while Tau runs copies `events.jsonl.lock` naming the live services process,
    // but that process holds the original log, not this copy.
    await writeFile(`${filePath}.lock`, `${process.pid}\n/elsewhere/.tau/chats/chat-a/events.jsonl\n`);
    const copied = await createNodeEventLog({ filePath, access: 'write' });
    const recorded = await readFile(`${filePath}.lock`, 'utf8');
    await copied.close();
    expect(recorded.split('\n')[0]).toBe(String(process.pid));

    // The same live pid naming this very log is a genuine writer and still fences.
    await writeFile(`${filePath}.lock`, recorded);
    try {
      await expect(createNodeEventLog({ filePath, access: 'write' })).rejects.toMatchObject({
        name: 'EventLogError',
        code: 'WRITER_LOCKED',
      });
    } finally {
      await rm(`${filePath}.lock`, { force: true });
    }
  });

  it('should not release a lock another writer has taken over since', async () => {
    const filePath = await temporaryLogPath();
    await mkdir(dirname(filePath), { recursive: true });
    const first = await createNodeEventLog({ filePath, access: 'write' });
    // A straggling taker past the settle window: the path now names a different inode.
    await rm(`${filePath}.lock`, { force: true });
    await writeFile(`${filePath}.lock`, '424242\n');
    try {
      await first.close();
      expect(await readFile(`${filePath}.lock`, 'utf8')).toBe('424242\n');
    } finally {
      await rm(`${filePath}.lock`, { force: true });
    }
  });
  /*
   * Two takers can both unlink one stale marker, and a writer that holds a kernel lock can still race one that does not
   * (a main-thread writer and a Darwin worker, or an older build), so every takeover is told apart after a settle
   * window: only the inode the path still names holds.
   */
  const takeOverAgainstStraggler = async (create: typeof createNodeEventLog): Promise<void> => {
    const filePath = await temporaryLogPath();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(`${filePath}.lock`, '2147483646\n');
    const outcome = (async () => {
      try {
        const log = await create({ filePath, access: 'write' });
        await log.close();
        return 'opened';
      } catch (error) {
        return error;
      }
    })();
    const takenOver = async (): Promise<boolean> => {
      try {
        const contents = await readFile(`${filePath}.lock`, 'utf8');
        return contents.startsWith(`${process.pid}\n`);
      } catch {
        return false;
      }
    };
    // Polls until the taker has written its marker, inside its settle window.
    // oxlint-disable-next-line no-await-in-loop -- one probe at a time.
    while (!(await takenOver())) {
      // oxlint-disable-next-line no-await-in-loop -- one probe at a time.
      await sleep(5);
    }
    await rm(`${filePath}.lock`, { force: true });
    await writeFile(`${filePath}.lock`, '424242\n');

    await expect(outcome).resolves.toMatchObject({ code: 'WRITER_LOCKED' });
    expect(await readFile(`${filePath}.lock`, 'utf8')).toBe('424242\n');
  };

  it('should refuse a takeover whose marker a straggler replaced when no kernel lock is held', async () => {
    vi.resetModules();
    vi.doMock('@taucad/filesystem/backend/node', async (original) => {
      const actual = await original<typeof FilesystemNode>();
      return {
        ...actual,
        acquireNodeAuthorityWriter: async () => {
          throw new actual.NodeAuthorityWriterError('AUTHORITY_LOCK_UNSUPPORTED', 'no kernel lock here');
        },
      };
    });
    try {
      const { createNodeEventLog: createUnlocked } = await import('#node.js');
      await takeOverAgainstStraggler(createUnlocked);
    } finally {
      vi.doUnmock('@taucad/filesystem/backend/node');
      vi.resetModules();
    }
  });

  it('should refuse a takeover whose marker a straggler replaced while holding the kernel lock', async () => {
    await takeOverAgainstStraggler(createNodeEventLog);
  });

  // CL-A9, I1 on Node: the kernel lock is the fence; the pid marker is only a courtesy for older builds.
  describe('the kernel writer lock', () => {
    const nodeEntry = fileURLToPath(new URL('../node.ts', import.meta.url));
    const holderSource = (filePath: string) =>
      [
        `import { createNodeEventLog } from ${JSON.stringify(nodeEntry)};`,
        `globalThis.held = await createNodeEventLog({ filePath: ${JSON.stringify(filePath)}, access: 'write' });`,
        `process.stdout.write('ready\\n');`,
        'setInterval(() => undefined, 1000);',
      ].join('\n');

    it('should refuse a second writer in the same process', async () => {
      const filePath = await temporaryLogPath();
      const first = await createNodeEventLog({ filePath, access: 'write' });
      // Without the marker, the kernel lock alone still refuses: it is per open file description.
      await rm(`${filePath}.lock`, { force: true });

      await expect(createNodeEventLog({ filePath, access: 'write' })).rejects.toMatchObject({ code: 'WRITER_LOCKED' });
      await first.close();
    });

    it('should admit a writer after the holder process is killed', async () => {
      const filePath = await temporaryLogPath();
      const script = join(dirname(dirname(dirname(dirname(filePath)))), 'holder.mts');
      await writeFile(script, holderSource(filePath));
      // Node itself, with tsx's loader: the `tsx` wrapper would leave its child holding the lock after SIGKILL.
      const holder = spawn(process.execPath, ['--import', 'tsx', script], { stdio: ['ignore', 'pipe', 'inherit'] });
      try {
        await once(holder.stdout, 'data');
        await expect(createNodeEventLog({ filePath, access: 'write' })).rejects.toMatchObject({
          code: 'WRITER_LOCKED',
        });
      } finally {
        holder.kill('SIGKILL');
        await once(holder, 'exit');
      }

      // SIGKILL runs no release: the kernel dropped its lock, and its marker names a dead pid.
      const next = await createNodeEventLog({ filePath, access: 'write' });
      await next.close();
    }, 30_000);

    /* Defect (reported to the filesystem owners, RV8-F3): the kernel lock taken from a worker thread does not hold on
     * Darwin, so a main-thread writer is admitted while the worker's writer is open. The pid marker names this live
     * process, so after the worker terminates without closing, the chat stays WRITER_LOCKED until the process exits.
     * `it.fails` pins today's behaviour; it turns red when the helper holds the lock from a worker. */
    it.fails('should admit a writer after the holding worker thread terminates', async () => {
      const filePath = await temporaryLogPath();
      const worker = new Worker(
        `import(${JSON.stringify(nodeEntry)}).then(async ({ createNodeEventLog }) => {
          // Held for the worker's life: an unreachable log's handles would be closed by the collector.
          globalThis.held = await createNodeEventLog({ filePath: ${JSON.stringify(filePath)}, access: 'write' });
          require('node:worker_threads').parentPort.postMessage('ready');
        });`,
        { eval: true, execArgv: ['--import', 'tsx'] },
      );
      await once(worker, 'message');
      await rm(`${filePath}.lock`, { force: true });

      try {
        await expect(createNodeEventLog({ filePath, access: 'write' })).rejects.toMatchObject({
          code: 'WRITER_LOCKED',
        });
      } finally {
        await worker.terminate();
      }
      const next = await createNodeEventLog({ filePath, access: 'write' });
      await next.close();
    }, 30_000);

    it('should not create a log when opened for reading', async () => {
      const filePath = await temporaryLogPath();
      const reader = await createNodeEventLog({ filePath, access: 'read' });

      await expect(reader.read()).resolves.toEqual([]);
      await reader.close();
      await expect(access(dirname(filePath))).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
