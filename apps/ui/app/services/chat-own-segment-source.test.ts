// @vitest-environment node
/** HA1: the chat's own segment read from the file (HA-I1, HA-I3, HA-I3a) and the stale-run settler span (HA-I5). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { foreignRunStaleMilliseconds, runHeartbeatMilliseconds } from '@taucad/agent-host';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { chatProjectionLogic, selectRunPhase } from '#machines/chat-projection.logic.js';
import {
  createOwnSegmentSource,
  inPageAttachBackoffMilliseconds,
  readRefusalMilliseconds,
  unsettledReadPollMilliseconds,
} from '#services/chat-own-segment-source.js';
import type { OwnSegmentVerdict } from '#services/chat-own-segment-source.js';

const directory = '/projects/p/.tau/chats/chat_own';
const log = `${directory}/events.jsonl`;
const marker = `${log}.lock`;
const record = `${directory}/chat.json`;
const start = Date.parse('2026-11-26T12:00:00.000Z');

const line = (row: unknown): string => `${JSON.stringify(row)}\n`;
const at = (time: number) => ({ recordedAt: new Date(time).toISOString() });
const admitted = (time = start): unknown => ({
  ...lifecycleRow(0, 'admitted'),
  ...at(time),
  admission: { kind: 'tau', turnId: 'user_1' },
});
const running = (time = start): unknown => ({ ...lifecycleRow(1, 'running'), ...at(time) });
const completed = (time = start): unknown => ({ ...lifecycleRow(1, 'completed'), ...at(time) });
/* The settlement the host appends after the lifecycle's last row, once the turn's revision is recorded (W8 TS-S4). */
const finalized = (time = start): unknown => ({
  ...logRow(3, {
    type: 'turn.finalized',
    attempt: 1,
    turnId: 'user_1',
    chatId: 'chat_own',
    projectId: 'p',
    checkoutId: 'live',
    revisionId: 'a'.repeat(40),
    branch: 'main',
    changedPaths: ['main.scad'],
    treeId: 'b'.repeat(40),
    trigger: 'turn',
    runIds: ['run_1'],
  }),
  ...at(time),
});
const user = logRow(2, { type: 'message.appended', message: { id: 'user_1', role: 'user', content: 'Hi' } });

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

/** A disk in memory with modification times; `failing` paths reject with EIO. */
const createDisk = (files: Record<string, string>) => {
  const bytes = new Map(Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]));
  const mtimes = new Map<string, number>();
  const failing = new Set<string>();
  const io = (path: string): void => {
    if (failing.has(path)) {
      throw Object.assign(new Error(`EIO: ${path}`), { code: 'EIO' });
    }
  };
  return {
    failing,
    mtimes,
    write: (path: string, text: string): void => {
      bytes.set(path, new TextEncoder().encode(text));
    },
    remove: (path: string): void => {
      bytes.delete(path);
    },
    client: {
      readFile: async (path: string) => {
        io(path);
        const found = bytes.get(path);
        if (found === undefined) {
          throw notFound(path);
        }
        return new Uint8Array(found);
      },
      readdir: async (path: string) => {
        io(path);
        const names = [...bytes.keys()]
          .filter((key) => key.startsWith(`${path}/`))
          .map((key) => key.slice(path.length + 1));
        if (names.length === 0) {
          throw notFound(path);
        }
        return names;
      },
      stat: async (path: string) => {
        if (!bytes.has(path)) {
          throw notFound(path);
        }
        return { mtimeMs: mtimes.get(path) ?? 0 };
      },
    },
  };
};

type Disk = ReturnType<typeof createDisk>;

const follow = (disk: Disk, clock: { wall: number; mono: number }) => {
  const projection = createActor(chatProjectionLogic).start();
  const verdicts: OwnSegmentVerdict[] = [];
  const onStaleRun = vi.fn();
  const onRewrite = vi.fn();
  const source = createOwnSegmentSource({
    chatId: 'chat_own',
    directory,
    client: () => disk.client,
    projection,
    onVerdict: (verdict) => {
      verdicts.push(verdict);
    },
    onRewrite,
    onStaleRun,
    now: () => clock.wall,
    monotonicNow: () => clock.mono,
    visible: () => true,
  });
  return {
    projection: () => projection.getSnapshot().context,
    verdicts,
    onStaleRun,
    onRewrite,
    wake: source.wake,
    stop: () => {
      source.stop();
      projection.stop();
    },
  };
};

/** Let the source's pass and its awaits run out, advancing both clocks by `ms`. */
const pass = async (clock: { wall: number; mono: number }, ms = 0): Promise<void> => {
  clock.wall += ms;
  clock.mono += ms;
  await vi.advanceTimersByTimeAsync(ms);
  await vi.advanceTimersByTimeAsync(0);
};

let clock: { wall: number; mono: number };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  clock = { wall: start, mono: 0 };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('own segment source: reading the file', () => {
  it('should hold back a torn tail and fold it once the next append makes it whole', async () => {
    const whole = line(admitted()) + line(completed());
    const disk = createDisk({ [log]: whole.slice(0, -8) });
    const chat = follow(disk, clock);
    await pass(clock);
    expect(chat.projection().ledger.position.cursor).toBe(1);

    disk.write(log, whole);
    chat.wake();
    await pass(clock);

    expect(chat.projection().ledger.position.cursor).toBe(2);
    expect(selectRunPhase(chat.projection())).toBe('completed');
    chat.stop();
  });

  it('should take a rollback that puts a different row under the same key, within the last-row window', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(running()) });
    const chat = follow(disk, clock);
    await pass(clock);
    expect(selectRunPhase(chat.projection())).toBe('running');

    disk.write(log, line(admitted()) + line(completed()));
    chat.wake();
    await pass(clock);

    expect(selectRunPhase(chat.projection())).toBe('completed');
    expect(chat.onRewrite).not.toHaveBeenCalled();
    chat.stop();
  });

  it('should keep a shrink past the last row suspect, then take it as the truth after the refusal bound', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(running()) + line(user) });
    const chat = follow(disk, clock);
    await pass(clock);
    expect(chat.projection().ledger.position.cursor).toBe(3);

    disk.write(log, line(admitted()));
    chat.wake();
    await pass(clock);
    expect(chat.projection().ledger.position.cursor).toBe(3);

    await pass(clock, readRefusalMilliseconds);
    expect(chat.projection().ledger.position.cursor).toBe(1);
    expect(chat.onRewrite).toHaveBeenCalledOnce();
    chat.stop();
  });
});

describe('own segment source: absence judged against the record (HA-I3a)', () => {
  it('should read a new chat, record present and no own log, as an authoritative empty own read', async () => {
    const chat = follow(createDisk({ [record]: '{"id":"chat_own"}' }), clock);
    await pass(clock);
    expect(chat.verdicts).toEqual(['current']);
    chat.stop();
  });

  it('should read a chat synced from another device, record present and only a foreign segment, as current', async () => {
    const chat = follow(
      createDisk({ [record]: '{"id":"chat_own"}', [`${directory}/events/peer.jsonl`]: line(admitted()) }),
      clock,
    );
    await pass(clock);
    expect(chat.verdicts).toEqual(['current']);
    chat.stop();
  });

  it('should count a log-only directory, with no record, as present (AR4-3)', async () => {
    const chat = follow(createDisk({ [`${directory}/events/peer.jsonl`]: line(admitted()) }), clock);
    await pass(clock);
    expect(chat.verdicts).toEqual(['current']);
    chat.stop();
  });

  it('should keep what it holds and read again when the root is not mounted', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(completed()) });
    const chat = follow(disk, clock);
    await pass(clock);
    disk.failing.add(log);
    chat.wake();
    await pass(clock);
    expect(chat.verdicts).toEqual(['current', 'unreadable']);
    expect(chat.projection().ledger.position.cursor).toBe(2);
    chat.stop();
  });

  it('should answer the deleted state for a purged record', async () => {
    const chat = follow(createDisk({ [record]: '{"id":"chat_own","purgedAt":3}' }), clock);
    await pass(clock);
    expect(chat.verdicts).toEqual(['deleted']);
    chat.stop();
  });

  it('should keep held rows when the log goes absent, and answer missing only after the refusal bound', async () => {
    const disk = createDisk({ [record]: '{"id":"chat_own"}', [log]: line(admitted()) + line(completed()) });
    const chat = follow(disk, clock);
    await pass(clock);
    disk.remove(log);
    chat.wake();
    await pass(clock);
    expect(chat.verdicts).toEqual(['current']);
    expect(chat.projection().ledger.position.cursor).toBe(2);

    await pass(clock, readRefusalMilliseconds);
    expect(chat.verdicts.at(-1)).toBe('missing');
    expect(chat.projection().ledger.position.cursor).toBe(2);
    chat.stop();
  });

  it('should say missing once and stop the 1 Hz re-read until a wake finds rows again', async () => {
    const disk = createDisk({ [record]: '{"id":"chat_own"}', [log]: line(admitted()) + line(completed()) });
    const chat = follow(disk, clock);
    await pass(clock);
    disk.remove(log);
    chat.wake();
    await pass(clock);
    await pass(clock, readRefusalMilliseconds);
    expect(chat.verdicts.filter((verdict) => verdict === 'missing')).toHaveLength(1);
    const reads = vi.spyOn(disk.client, 'readFile');
    await pass(clock, 10 * unsettledReadPollMilliseconds);
    expect(reads).not.toHaveBeenCalled();
    expect(chat.verdicts.filter((verdict) => verdict === 'missing')).toHaveLength(1);

    disk.write(log, line(admitted()) + line(completed()));
    chat.wake();
    await pass(clock);
    expect(chat.verdicts.at(-1)).toBe('current');
    chat.stop();
  });

  /* A run's lifecycle ends before its settlement is appended (desktop shell row: `completed`, then `turn.finalized`
   * 0.5-0.66 s later). The turn's Save status waits on that row, so an ended run without one is still read. */
  it('should keep reading an ended run until its settlement row arrives, then stop', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(completed()) });
    const chat = follow(disk, clock);
    await pass(clock);
    expect(selectRunPhase(chat.projection())).toBe('completed');

    disk.write(log, line(admitted()) + line(completed()) + line(finalized()));
    await pass(clock, unsettledReadPollMilliseconds);
    expect(chat.projection().ledger.runs.run_1?.appendState).toBe('settled');

    const reads = vi.spyOn(disk.client, 'readFile');
    await pass(clock, 10 * unsettledReadPollMilliseconds);
    expect(reads).not.toHaveBeenCalled();
    chat.stop();
  });

  it('should stop reading an ended run without a settlement once its writer has gone stale', async () => {
    const old = start - foreignRunStaleMilliseconds;
    const disk = createDisk({ [log]: line(admitted(old)) + line(completed(old)) });
    const chat = follow(disk, clock);
    await pass(clock);
    expect(chat.projection().ledger.runs.run_1?.appendState).toBe('terminal');
    const reads = vi.spyOn(disk.client, 'readFile');
    await pass(clock, 10 * unsettledReadPollMilliseconds);
    expect(reads).not.toHaveBeenCalled();
    chat.stop();
  });

  it('should read again on the poll when its first read fails, so a failed open never strands the chat', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(completed()) });
    disk.failing.add(log);
    const chat = follow(disk, clock);
    await pass(clock);
    expect(chat.verdicts).toEqual(['unreadable']);
    disk.failing.delete(log);
    await pass(clock, unsettledReadPollMilliseconds);
    expect(chat.verdicts.at(-1)).toBe('current');
    chat.stop();
  });

  it('should answer missing for held rows when record, own log and events/ are all not found', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(completed()) });
    const chat = follow(disk, clock);
    await pass(clock);
    disk.remove(log);
    chat.wake();
    await pass(clock);
    await pass(clock, readRefusalMilliseconds);
    expect(chat.verdicts.at(-1)).toBe('missing');
    chat.stop();
  });

  it('should answer not-a-chat when nothing is held and nothing is found', async () => {
    const chat = follow(createDisk({}), clock);
    await pass(clock);
    expect(chat.verdicts).toEqual(['not-a-chat']);
    chat.stop();
  });
});

describe('own segment source: the stale-run settler span (HA-I5)', () => {
  const twoBeats = 2 * runHeartbeatMilliseconds;

  it('should settle a crashed tau serve within the XD3 bound, two heartbeats and one poll of its last row', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(running()), [marker]: '4242\n/x\n' });
    disk.mtimes.set(marker, start);
    const chat = follow(disk, clock);
    await pass(clock);
    expect(chat.onStaleRun).not.toHaveBeenCalled();

    /* Poll until the bound: nothing changes, so the marker and the row age together. */
    const bound = foreignRunStaleMilliseconds + twoBeats + unsettledReadPollMilliseconds;
    for (let elapsed = 0; elapsed < bound && chat.onStaleRun.mock.calls.length === 0; ) {
      // oxlint-disable-next-line no-await-in-loop -- each poll waits for the one before it.
      await pass(clock, unsettledReadPollMilliseconds);
      elapsed += unsettledReadPollMilliseconds;
    }
    expect(chat.onStaleRun).toHaveBeenCalled();
    expect(clock.wall - start).toBeLessThanOrEqual(bound);

    /* Re-sent on each poll until the run settles. */
    const sent = chat.onStaleRun.mock.calls.length;
    await pass(clock, unsettledReadPollMilliseconds);
    expect(chat.onStaleRun.mock.calls.length).toBeGreaterThan(sent);
    disk.write(log, line(admitted()) + line(completed()));
    await pass(clock, unsettledReadPollMilliseconds);
    const settled = chat.onStaleRun.mock.calls.length;
    await pass(clock, unsettledReadPollMilliseconds * 3);
    expect(chat.onStaleRun.mock.calls.length).toBe(settled);
    chat.stop();
  });

  it('should back the re-sent attach off to the cap, and start over when the span restarts', async () => {
    const old = start - foreignRunStaleMilliseconds * 2;
    const disk = createDisk({ [log]: line(admitted(old)) + line(running(old)), [marker]: '4242\n/x\n' });
    disk.mtimes.set(marker, old);
    const chat = follow(disk, clock);
    await pass(clock);
    await pass(clock, twoBeats);
    expect(chat.onStaleRun).toHaveBeenCalledOnce();
    const sendsOver = async (milliseconds: number): Promise<number> => {
      const before = chat.onStaleRun.mock.calls.length;
      for (let elapsed = 0; elapsed < milliseconds; elapsed += unsettledReadPollMilliseconds) {
        // oxlint-disable-next-line no-await-in-loop -- each poll waits for the one before it.
        await pass(clock, unsettledReadPollMilliseconds);
      }
      return chat.onStaleRun.mock.calls.length - before;
    };
    /* 1, 2, 4 and then the 8 s cap: four in the first 15 s, then one each 8 s. */
    expect(await sendsOver(15_000)).toBe(4);
    expect(await sendsOver(inPageAttachBackoffMilliseconds * 4)).toBe(4);

    /* The writer comes back and touches its marker: the span restarts, so nothing goes while it is fresh. */
    disk.mtimes.set(marker, clock.wall);
    expect(await sendsOver(twoBeats)).toBe(0);

    /* It goes quiet again: a new span completes, sends, and backs off from 1 s again, not from the cap. */
    disk.mtimes.set(marker, old);
    expect(await sendsOver(twoBeats + unsettledReadPollMilliseconds)).toBe(1);
    expect(await sendsOver(unsettledReadPollMilliseconds)).toBe(1);
    chat.stop();
  });

  it('should send nothing after a 15-minute wall-clock jump with no monotonic advance (a simulated sleep)', async () => {
    const disk = createDisk({ [log]: line(admitted()) + line(running()), [marker]: '4242\n/x\n' });
    disk.mtimes.set(marker, start);
    const chat = follow(disk, clock);
    await pass(clock);

    clock.wall += 15 * 60 * 1000;
    for (let poll = 0; poll < 5; poll++) {
      // oxlint-disable-next-line no-await-in-loop -- each poll waits for the one before it.
      await vi.advanceTimersByTimeAsync(unsettledReadPollMilliseconds);
    }
    expect(chat.onStaleRun).not.toHaveBeenCalled();
    chat.stop();
  });

  it('should restart the span whenever a live writer touches its marker, so it never claims against it', async () => {
    const old = start - foreignRunStaleMilliseconds * 2;
    const disk = createDisk({ [log]: line(admitted(old)) + line(running(old)), [marker]: '4242\n/x\n' });
    disk.mtimes.set(marker, old);
    const chat = follow(disk, clock);
    await pass(clock);
    /* Stale by both times; the writer then wakes and touches each heartbeat, so the span never completes. */
    for (let elapsed = 0; elapsed < twoBeats * 3; elapsed += unsettledReadPollMilliseconds) {
      if (elapsed % runHeartbeatMilliseconds === runHeartbeatMilliseconds / 2) {
        disk.mtimes.set(marker, old + elapsed + 1);
      }
      // oxlint-disable-next-line no-await-in-loop -- each poll waits for the one before it.
      await pass(clock, unsettledReadPollMilliseconds);
    }
    expect(chat.onStaleRun).not.toHaveBeenCalled();
    chat.stop();
  });

  it('should leave an unshared live Node run quiet for 11 minutes alone while its marker is fresh', async () => {
    const quietSince = start - 11 * 60 * 1000;
    const disk = createDisk({ [log]: line(admitted(quietSince)) + line(running(quietSince)), [marker]: '4242\n/x\n' });
    disk.mtimes.set(marker, start - 1000);
    const chat = follow(disk, clock);
    for (let elapsed = 0; elapsed < twoBeats * 2; elapsed += unsettledReadPollMilliseconds) {
      disk.mtimes.set(marker, clock.wall - 1000);
      // oxlint-disable-next-line no-await-in-loop -- each poll waits for the one before it.
      await pass(clock, unsettledReadPollMilliseconds);
    }
    expect(chat.onStaleRun).not.toHaveBeenCalled();
    chat.stop();
  });

  it('should settle a paused run past its hold on a stale marker, as XD3 does (R5)', async () => {
    const pausedAt = start - foreignRunStaleMilliseconds - 60_000;
    const paused = { ...lifecycleRow(1, 'paused'), ...at(pausedAt) };
    const disk = createDisk({ [log]: line(admitted(pausedAt)) + line(paused), [marker]: '4242\n/x\n' });
    disk.mtimes.set(marker, pausedAt);
    const chat = follow(disk, clock);
    await pass(clock);
    await pass(clock, twoBeats);
    await pass(clock, unsettledReadPollMilliseconds);
    expect(chat.onStaleRun).toHaveBeenCalled();
    chat.stop();
  });
});
