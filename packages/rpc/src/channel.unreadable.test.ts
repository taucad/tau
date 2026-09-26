import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import type { Port } from '#port.js';
import { createChannelClient, createChannelServer } from '#index.js';

type ManualPort = { port: Port<unknown>; sent: unknown[]; deliver: (data: unknown) => void };

const createManualPort = (): ManualPort => {
  const sent: unknown[] = [];
  const handlers = new Set<(data: unknown) => void>();
  return {
    sent,
    deliver: (data) => {
      for (const handler of handlers) {
        handler(data);
      }
    },
    port: {
      postMessage: (data) => {
        sent.push(data);
      },
      onMessage: (handler) => {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
      close: () => undefined,
    },
  };
};

const impl = {
  call: async (): Promise<unknown> => 'ok',
  async *listen(): AsyncGenerator {
    yield 0;
  },
};

const findFrame = (sent: unknown[], kind: string): { i: string } => {
  const frame = sent.find((item) => (item as { k?: unknown }).k === kind);
  if (frame === undefined) {
    expect.fail(`no "${kind}" frame was posted`);
  }
  return frame as { i: string };
};

describe('@taucad/rpc answers what can be answered', () => {
  beforeEach(() => {
    // The version-mismatch reporter still reports the dropped frame once.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('server', () => {
    it('should answer a request of another wire version with WIRE_VERSION_UNSUPPORTED', () => {
      const wire = createManualPort();
      createChannelServer({ port: wire.port, sessionKey: 's', impl });

      wire.deliver({ v: 2, k: 'rq', i: 'r1', n: 'add', a: null });

      expect(wire.sent.at(-1)).toMatchObject({ v: 1, k: 'rs', i: 'r1', o: 0, e: { c: 'WIRE_VERSION_UNSUPPORTED' } });
    });

    it('should answer a request without a name with FRAME_UNREADABLE', () => {
      const wire = createManualPort();
      createChannelServer({ port: wire.port, sessionKey: 's', impl });

      wire.deliver({ v: 1, k: 'rq', i: 'r2', a: null });

      expect(wire.sent.at(-1)).toMatchObject({ v: 1, k: 'rs', i: 'r2', o: 0, e: { c: 'FRAME_UNREADABLE' } });
    });

    it('should answer a subscribe of another wire version with a stream error', () => {
      const wire = createManualPort();
      createChannelServer({ port: wire.port, sessionKey: 's', impl });

      wire.deliver({ v: 2, k: 'ss', i: 's1', n: 'ticks', a: null });

      expect(wire.sent.at(-1)).toMatchObject({ v: 1, k: 'se', i: 's1', e: { c: 'WIRE_VERSION_UNSUPPORTED' } });
    });

    it('should drop an unreadable frame that carries no readable id', () => {
      const wire = createManualPort();
      createChannelServer({ port: wire.port, sessionKey: 's', impl });

      wire.deliver({ v: 2, k: 'rq', n: 'add', a: null });
      wire.deliver({ v: 1, k: 'rq', i: '', n: 'add', a: null });

      expect(wire.sent).toEqual([{ v: 1, k: 'lh', o: 1 }]);
    });

    it('should answer a request whose args fail validation with WIRE_VALIDATION_FAILED', () => {
      const wire = createManualPort();
      createChannelServer({
        port: wire.port,
        sessionKey: 's',
        impl,
        protocolSchemas: {
          calls: { add: { args: z.object({ a: z.number() }), result: z.number() } },
          notifies: {},
          listens: {},
        },
      });

      wire.deliver({ v: 1, k: 'rq', i: 'r3', n: 'add', a: { a: 'one' } });

      expect(wire.sent.at(-1)).toMatchObject({ v: 1, k: 'rs', i: 'r3', o: 0, e: { c: 'WIRE_VALIDATION_FAILED' } });
    });
  });

  describe('client', () => {
    it('should reject a pending call whose response is unreadable with FRAME_UNREADABLE', async () => {
      const wire = createManualPort();
      const client = createChannelClient({ port: wire.port, sessionKey: 's' });
      wire.deliver({ v: 1, k: 'lh', o: 1 });
      await client.ready;

      const pending = client.call('add', null);
      const { i } = findFrame(wire.sent, 'rq');
      wire.deliver({ v: 1, k: 'rs', i, o: 7 });

      await expect(pending).rejects.toMatchObject({ code: 'FRAME_UNREADABLE' });
    });

    it('should reject a pending call answered in another wire version with WIRE_VERSION_UNSUPPORTED', async () => {
      const wire = createManualPort();
      const client = createChannelClient({ port: wire.port, sessionKey: 's' });
      wire.deliver({ v: 1, k: 'lh', o: 1 });
      await client.ready;

      const pending = client.call('add', null);
      const { i } = findFrame(wire.sent, 'rq');
      wire.deliver({ v: 2, k: 'rs', i, o: 1, d: 5 });

      await expect(pending).rejects.toMatchObject({ code: 'WIRE_VERSION_UNSUPPORTED' });
    });

    it('should fail a listen whose stream frame is unreadable and unsubscribe it', async () => {
      const wire = createManualPort();
      const client = createChannelClient({ port: wire.port, sessionKey: 's' });
      wire.deliver({ v: 1, k: 'lh', o: 1 });
      await client.ready;

      const iterator = client.listen('ticks')[Symbol.asyncIterator]();
      const next = iterator.next();
      await Promise.resolve();
      const { i } = findFrame(wire.sent, 'ss');
      wire.deliver({ v: 2, k: 'sn', i, d: 1 });

      await expect(next).rejects.toMatchObject({ code: 'WIRE_VERSION_UNSUPPORTED' });
      expect(wire.sent).toContainEqual({ v: 1, k: 'su', i });
    });
  });
});
