/**
 * HA3: the remote read loop. A lost remote read is read again on every wake and on `remoteReadRetryMilliseconds` (full
 * jitter), with no give-up; a revocation (4003) or a computer no longer paired (`HOST_NOT_PAIRED`) is residual R6, and
 * every other close, a 1008 included, is transient.
 */
import { createActor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { CatchUpFrame, ReadAnswer } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import {
  hostAttachment,
  remoteCloseRefusal,
  remoteReadRetryMilliseconds,
} from '#chat-clients/_internal/host-attachment.js';
import type { HostAttachmentStatus, RemoteCloseInfo } from '#chat-clients/_internal/host-attachment.js';

const chatId = 'chat_remote';
const healthy = { historyIntact: true, newerHistory: false, quarantined: false };
const { first, longest, held } = remoteReadRetryMilliseconds;

const emptyBatch: ReadAnswer = {
  status: 'batch',
  sourceHealth: healthy,
  sourceGeneration: 'writer-1',
  chatId,
  cursor: 0,
  nextCursor: 0,
  endCursor: 0,
  events: [],
};

const writerOwnedCatchUp = async function* (): AsyncIterable<CatchUpFrame> {
  yield { type: 'refused', answer: { status: 'refused', chatId, reason: 'writer-owned' } };
};

const unreachable = (code?: string): Error =>
  Object.assign(new Error('The agent host could not be reached.'), code === undefined ? {} : { code });

/** A remote host whose connection can be failed, ended, fenced or closed with a code; it attaches on an empty read. */
const remoteHost = () => {
  let failure: Error | undefined;
  let ended: ((error?: unknown) => void) | undefined;
  let answer: Parameters<AgentHostClient['subscribe']>[3];
  let closeHandler: ((info: RemoteCloseInfo) => void) | undefined;
  const subscribe = vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
    ended = parameters[2];
    answer = parameters[3];
    queueMicrotask(() => parameters[3]?.(emptyBatch));
    return vi.fn();
  });
  const connect = vi.fn(async () => {
    if (failure !== undefined) {
      throw failure;
    }
    return {
      /* A redial validates the suffix it already holds before it follows again. */
      read: vi.fn(async () => emptyBatch),
      catchUp: writerOwnedCatchUp,
      subscribe,
      onClose: (handler: (info: RemoteCloseInfo) => void) => {
        closeHandler = handler;
        return () => undefined;
      },
      close: async () => {
        throw new Error('A retired connection may fail to close.');
      },
    };
  });
  const projection = createActor(chatProjectionLogic).start();
  const statuses: HostAttachmentStatus[] = [];
  const actor = createActor(hostAttachment, {
    input: { chatId, connect, projection, onStatus: (event) => statuses.push(event) },
  }).start();
  return {
    connect,
    subscribe,
    statuses,
    fail: (error: Error | undefined) => {
      failure = error;
    },
    /** The wire dies: the channel reports the close, then the follow ends. */
    drop: (info?: RemoteCloseInfo) => {
      closeHandler?.(info ?? { code: 1006 });
      ended?.(new Error('Channel closed'));
    },
    /** Another reader took the log over: the follow is refused `owner-fenced`. */
    fence: () => {
      answer?.({ status: 'refused', chatId, reason: 'owner-fenced' });
    },
    stop: () => {
      actor.stop();
      projection.stop();
    },
  };
};

const attached = (statuses: readonly HostAttachmentStatus[]): number =>
  statuses.filter((event) => event.type === 'attachment.attached').length;

/** The time of every dial while the clock steps 50 ms at a time for `span`, from the step's start. */
const dialTimes = async (host: ReturnType<typeof remoteHost>, span: number): Promise<number[]> => {
  const times: number[] = [];
  for (let elapsed = 0; elapsed < span; elapsed += 50) {
    const before = host.connect.mock.calls.length;
    // oxlint-disable-next-line no-await-in-loop -- the clock steps serially.
    await vi.advanceTimersByTimeAsync(50);
    if (host.connect.mock.calls.length > before) {
      times.push(elapsed + 50);
    }
  }
  return times;
};
const gapsOf = (times: readonly number[]): number[] => times.map((at, index) => at - (times[index - 1] ?? 0));

describe('remoteCloseRefusal', () => {
  it.each([
    [{ code: 4003, reason: 'device revoked' }, 'revoked'],
    /* A browser route's 1008 refusals belong to one dial's session; the next dial mints a new one. */
    [{ code: 1008, reason: 'session unavailable' }, undefined],
    [{ code: 1008, reason: 'route already consumed' }, undefined],
    [{ code: 1008, reason: 'route peer did not connect' }, undefined],
    [{ code: 1008, reason: 'invalid distributed relay frame' }, undefined],
    /* A sign-in, not a pairing. */
    [{ code: 4401, reason: 'browser session required' }, undefined],
    [{ code: 1012 }, undefined],
    [{ code: 1006 }, undefined],
    [{ code: 'PEER_GONE', reason: 'port-closed' }, undefined],
  ] as const)('should map %o to %s', (info, refusal) => {
    expect(remoteCloseRefusal(info)).toBe(refusal);
  });
});

describe('hostAttachment remote read loop', () => {
  let random: MockInstance<() => number>;
  beforeEach(() => {
    vi.useFakeTimers();
    /* The jitter's top: each delay is the curve's whole step. */
    random = vi.spyOn(Math, 'random').mockReturnValue(1);
  });
  afterEach(() => {
    random.mockRestore();
    vi.useRealTimers();
  });

  it('should dial again on the backoff, doubling to its ceiling, and never give up', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(attached(host.statuses)).toBe(1);
      host.fail(unreachable());
      host.drop();
      const gaps = gapsOf(await dialTimes(host, 10 * 60_000));
      expect(gaps.slice(0, 5)).toEqual([first, 2 * first, 4 * first, 8 * first, 16 * first]);
      expect(Math.max(...gaps)).toBe(longest);
      /* Still dialling ten minutes in, every 30 s. */
      expect(gaps.slice(-5)).toEqual(Array.from({ length: 5 }, () => longest));
    } finally {
      host.stop();
    }
  });

  it('should spread its delays with full jitter', async () => {
    random.mockReturnValue(0.5);
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.fail(unreachable());
      host.drop();
      expect(gapsOf(await dialTimes(host, 1000)).slice(0, 3)).toEqual([150, 250, 500]);
    } finally {
      host.stop();
    }
  });

  it('should start the curve over only once an attach has held', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.fail(unreachable());
      host.drop();
      await vi.advanceTimersByTimeAsync(first + 2 * first + 4 * first);
      host.fail(undefined);
      await vi.advanceTimersByTimeAsync(8 * first);
      expect(attached(host.statuses)).toBe(2);
      /* Dropped at once: the next delay goes on up the curve. */
      host.drop();
      expect(gapsOf(await dialTimes(host, 16 * first))).toEqual([16 * first]);
      /* Held past the bound: the next delay is the first again. */
      await vi.advanceTimersByTimeAsync(held);
      host.drop();
      expect(gapsOf(await dialTimes(host, first))).toEqual([first]);
    } finally {
      host.stop();
    }
  });

  it('should read again at once on a wake while a retry waits, and not for a hidden page', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.fail(unreachable());
      host.drop();
      await vi.advanceTimersByTimeAsync(first + 2 * first + 4 * first);
      host.fail(undefined);
      const dials = host.connect.mock.calls.length;
      /* The next retry is 2 s away; each wake below comes long before it. */
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(host.connect.mock.calls.length).toBe(dials);
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(host.connect.mock.calls.length).toBe(dials + 1);
      expect(attached(host.statuses)).toBe(2);
      visibility.mockRestore();
      for (const type of ['online', 'pageshow']) {
        host.fail(unreachable());
        host.drop();
        // oxlint-disable-next-line no-await-in-loop -- one wake at a time.
        await vi.advanceTimersByTimeAsync(0);
        host.fail(undefined);
        const before = host.connect.mock.calls.length;
        globalThis.dispatchEvent(new Event(type));
        // oxlint-disable-next-line no-await-in-loop -- one wake at a time.
        await vi.advanceTimersByTimeAsync(0);
        expect(host.connect.mock.calls.length).toBe(before + 1);
      }
    } finally {
      host.stop();
    }
  });

  it('should dial no more once stopped while a retry waits, on its timer or a wake', async () => {
    const host = remoteHost();
    await vi.advanceTimersByTimeAsync(0);
    host.fail(unreachable());
    host.drop();
    const dials = host.connect.mock.calls.length;
    host.stop();
    globalThis.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10 * longest);
    expect(host.connect.mock.calls.length).toBe(dials);
  });

  it('should read a fenced follow again on the same connection, without dialling', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(host.subscribe).toHaveBeenCalledOnce();
      host.fence();
      expect(host.statuses).toContainEqual({ type: 'attachment.lost', reason: 'owner-fenced' });
      await vi.advanceTimersByTimeAsync(first);
      expect(host.subscribe).toHaveBeenCalledTimes(2);
      expect(host.connect).toHaveBeenCalledOnce();
    } finally {
      host.stop();
    }
  });

  it('should report a revocation (4003) as R6 and keep retrying', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.drop({ code: 4003, reason: 'device revoked' });
      expect(host.statuses).toContainEqual({ type: 'attachment.lost', reason: 'revoked', residual: 'R6' });
      const dials = host.connect.mock.calls.length;
      await vi.advanceTimersByTimeAsync(first);
      expect(host.connect.mock.calls.length).toBe(dials + 1);
    } finally {
      host.stop();
    }
  });

  it.each([
    [1008, 'session unavailable'],
    [1008, 'route already consumed'],
    [1008, 'route peer did not connect'],
    [4401, 'browser session required'],
  ])('should keep a %i %s close transient', async (code, reason) => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.drop({ code, reason });
      expect(host.statuses.some((event) => event.type === 'attachment.lost')).toBe(true);
      expect(host.statuses.some((event) => event.residual !== undefined)).toBe(false);
      await vi.advanceTimersByTimeAsync(first);
      expect(attached(host.statuses)).toBe(2);
    } finally {
      host.stop();
    }
  });

  it('should report a computer no longer paired as R6 on the first loss of a first open', async () => {
    const projection = createActor(chatProjectionLogic).start();
    const statuses: HostAttachmentStatus[] = [];
    const connect = vi.fn(async () => {
      throw unreachable('HOST_NOT_PAIRED');
    });
    const actor = createActor(hostAttachment, {
      input: { chatId, connect, projection, onStatus: (event) => statuses.push(event) },
    }).start();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(connect).toHaveBeenCalledOnce();
      expect(statuses[0]).toMatchObject({ type: 'attachment.lost', residual: 'R6' });
    } finally {
      actor.stop();
      projection.stop();
    }
  });

  it('should leave a local placement to its own source, with no retry of its own', async () => {
    const connect = vi.fn(async () => {
      throw unreachable();
    });
    const projection = createActor(chatProjectionLogic).start();
    const actor = createActor(hostAttachment, {
      input: { chatId, connect, projection, local: async () => true },
    }).start();
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(connect).toHaveBeenCalledOnce();
    } finally {
      actor.stop();
      projection.stop();
    }
  });
});
