/**
 * HA3: the remote read loop. A lost remote read is read again on every wake and on `remoteReadRetryMilliseconds`, with
 * no give-up; a revocation (4003) or a grant refusal (1008 by its reason) is residual R6, the peerless reap is not.
 */
import { createActor } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** A remote host whose connection can be failed, ended or closed with a code, and which attaches on an empty read. */
const remoteHost = () => {
  let failing = false;
  let ended: ((error?: unknown) => void) | undefined;
  let closeHandler: ((info: RemoteCloseInfo) => void) | undefined;
  const connect = vi.fn(async () => {
    if (failing) {
      throw new Error('The agent host could not be reached.');
    }
    return {
      /* A redial validates the suffix it already holds before it follows again. */
      read: vi.fn(async () => emptyBatch),
      catchUp: writerOwnedCatchUp,
      subscribe: vi.fn((...parameters: Parameters<AgentHostClient['subscribe']>) => {
        ended = parameters[2];
        queueMicrotask(() => parameters[3]?.(emptyBatch));
        return vi.fn();
      }),
      onClose: (handler: (info: RemoteCloseInfo) => void) => {
        closeHandler = handler;
        return () => undefined;
      },
      close: async () => undefined,
    };
  });
  const projection = createActor(chatProjectionLogic).start();
  const statuses: HostAttachmentStatus[] = [];
  const actor = createActor(hostAttachment, {
    input: { chatId, connect, projection, onStatus: (event) => statuses.push(event) },
  }).start();
  return {
    connect,
    statuses,
    fail: (value: boolean) => {
      failing = value;
    },
    /** The wire dies: the channel reports the close, then the follow ends. */
    drop: (info?: RemoteCloseInfo) => {
      closeHandler?.(info ?? { code: 1006 });
      ended?.(new Error('Channel closed'));
    },
    stop: () => {
      actor.stop();
      projection.stop();
    },
  };
};

const attached = (statuses: readonly HostAttachmentStatus[]): number =>
  statuses.filter((event) => event.type === 'attachment.attached').length;

describe('remoteCloseRefusal', () => {
  it.each([
    [{ code: 4003, reason: 'device revoked' }, 'revoked'],
    [{ code: 1008, reason: 'session unavailable' }, 'grant-refused'],
    [{ code: 1008, reason: 'host grant unavailable' }, 'grant-refused'],
    [{ code: 1008, reason: 'route peer did not connect' }, undefined],
    [{ code: 1008, reason: 'invalid distributed relay frame' }, undefined],
    [{ code: 4401 }, undefined],
    [{ code: 1006 }, undefined],
    [{ code: 'PEER_GONE', reason: 'port-closed' }, undefined],
  ] as const)('should map %o to %s', (info, refusal) => {
    expect(remoteCloseRefusal(info)).toBe(refusal);
  });
});

describe('hostAttachment remote read loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should dial again on the backoff, doubling to its ceiling, and never give up', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(attached(host.statuses)).toBe(1);
      host.fail(true);
      host.drop();
      const dialsAt: number[] = [];
      for (let elapsed = 0; elapsed < 10 * 60_000; elapsed += 50) {
        const before = host.connect.mock.calls.length;
        // oxlint-disable-next-line no-await-in-loop -- the clock steps serially.
        await vi.advanceTimersByTimeAsync(50);
        if (host.connect.mock.calls.length > before) {
          dialsAt.push(elapsed + 50);
        }
      }
      const gaps = dialsAt.map((at, index) => at - (dialsAt[index - 1] ?? 0));
      expect(gaps.slice(0, 5)).toEqual([250, 500, 1000, 2000, 4000]);
      expect(Math.max(...gaps)).toBe(remoteReadRetryMilliseconds.longest);
      /* Still dialling ten minutes in, every 30 s. */
      expect(gaps.slice(-5)).toEqual(Array.from({ length: 5 }, () => remoteReadRetryMilliseconds.longest));
      host.fail(false);
      await vi.advanceTimersByTimeAsync(remoteReadRetryMilliseconds.longest);
      expect(attached(host.statuses)).toBe(2);
      /* An attach starts the curve over. */
      host.drop();
      const dials = host.connect.mock.calls.length;
      await vi.advanceTimersByTimeAsync(remoteReadRetryMilliseconds.first);
      expect(host.connect.mock.calls.length).toBe(dials + 1);
    } finally {
      host.stop();
    }
  });

  it('should read again at once on a wake while a retry waits, and not for a hidden page', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.fail(true);
      host.drop();
      await vi.advanceTimersByTimeAsync(250 + 500 + 1000);
      host.fail(false);
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
        host.fail(true);
        host.drop();
        // oxlint-disable-next-line no-await-in-loop -- one wake at a time.
        await vi.advanceTimersByTimeAsync(0);
        host.fail(false);
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

  it('should report a revocation (4003) as R6 and keep retrying', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.drop({ code: 4003, reason: 'device revoked' });
      expect(host.statuses).toContainEqual({ type: 'attachment.lost', reason: 'revoked', residual: 'R6' });
      const dials = host.connect.mock.calls.length;
      await vi.advanceTimersByTimeAsync(remoteReadRetryMilliseconds.first);
      expect(host.connect.mock.calls.length).toBe(dials + 1);
    } finally {
      host.stop();
    }
  });

  it('should tell a 1008 grant refusal (R6) from the peerless reap (transient) by its reason', async () => {
    const host = remoteHost();
    try {
      await vi.advanceTimersByTimeAsync(0);
      host.drop({ code: 1008, reason: 'route peer did not connect' });
      expect(host.statuses.some((event) => event.residual !== undefined)).toBe(false);
      await vi.advanceTimersByTimeAsync(remoteReadRetryMilliseconds.first);
      expect(attached(host.statuses)).toBe(2);
      host.drop({ code: 1008, reason: 'session unavailable' });
      expect(host.statuses).toContainEqual({ type: 'attachment.lost', reason: 'grant-refused', residual: 'R6' });
    } finally {
      host.stop();
    }
  });

  it('should leave a local placement to its own source, with no retry of its own', async () => {
    const connect = vi.fn(async () => {
      throw new Error('The agent host could not be reached.');
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
