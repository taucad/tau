import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { Redis } from 'ioredis';
import { z } from 'zod';

const queuedBytesLimit = 16 * 1024 * 1024;

/**
 * `ws` refuses any status code it will not put on the wire — `isValidStatusCode`
 * rejects 1004, 1005, 1006 and 1015–2999 — and it throws *after* moving the
 * socket to CLOSING and *before* arming its close timer. One unmappable code
 * therefore wedges a socket open for ever: no close frame is ever sent, nothing
 * destroys it, and every later `close()` hits the CLOSING early return and does
 * nothing. A departure that cannot be named on the wire is 1001.
 *
 * @param code - Whatever the departing peer reported.
 * @returns A code `ws` will accept.
 */
const mirrorableCloseCode = (code: number): number =>
  (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999)
    ? code
    : 1001;

type Frame = { readonly data: RawData; readonly binary: boolean; readonly bytes: number };

const sizeOf = (data: RawData): number =>
  Array.isArray(data) ? data.reduce((total, part) => total + part.byteLength, 0) : data.byteLength;

/** Frame-preserving, callback-backpressured relay for one browser/host route. */
export const relayHostFrames = (first: WebSocket, second: WebSocket): { close(): void } => {
  let closed = false;

  const finish = (code = 1001, reason = 'relay closed'): void => {
    if (closed) {
      return;
    }
    closed = true;
    for (const socket of [first, second]) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(code, reason);
      }
    }
  };

  const forward = (source: WebSocket, destination: WebSocket): void => {
    const queue: Frame[] = [];
    let queuedBytes = 0;
    let sending = false;
    const pump = (): void => {
      if (closed || sending || destination.readyState !== WebSocket.OPEN) {
        return;
      }
      const frame = queue.shift();
      if (!frame) {
        source.resume();
        return;
      }
      sending = true;
      destination.send(frame.data, { binary: frame.binary }, (error) => {
        sending = false;
        queuedBytes -= frame.bytes;
        if (error) {
          finish(1011, 'relay send failed');
          return;
        }
        pump();
      });
    };
    source.on('message', (data, binary) => {
      const bytes = sizeOf(data);
      if (queuedBytes + bytes > queuedBytesLimit) {
        finish(1009, 'relay queue limit exceeded');
        return;
      }
      queue.push({ data, binary, bytes });
      queuedBytes += bytes;
      source.pause();
      pump();
    });
  };

  for (const [source, destination] of [
    [first, second],
    [second, first],
  ] as const) {
    source.on('close', (code, reason) => {
      finish(mirrorableCloseCode(code), reason.toString());
    });
    source.on('error', () => finish(1011, 'relay socket failed'));
    forward(source, destination);
  }

  return { close: finish };
};

/**
 * A trust boundary: these envelopes are written by another API replica and read
 * back out of Redis, so they are parsed and not cast. `code` in particular is a
 * number from another process — not one `ws` just handed us — which is why it
 * still goes through {@link mirrorableCloseCode} before reaching a socket.
 */
const distributedRelayEnvelopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({
    kind: z.literal('frame'),
    binary: z.boolean(),
    bytes: z.number().int().nonnegative(),
    data: z.string(),
  }),
  z.object({ kind: z.literal('close'), code: z.number().int(), reason: z.string() }),
]);

type DistributedRelayEnvelope = z.infer<typeof distributedRelayEnvelopeSchema>;

const parseDistributedEnvelope = (payload: string): DistributedRelayEnvelope | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return undefined;
  }
  const parsed = distributedRelayEnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const distributedQueueLimit = 16 * 1024 * 1024;
const distributedRouteLifetime = 180;
const distributedPeerTimeout = 15_000;

const asBuffer = (data: RawData): Buffer => {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data);
};

const parseStreamEntries = (value: unknown): ReadonlyArray<{ readonly id: string; readonly payload: string }> => {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: Array<{ id: string; payload: string }> = [];
  for (const stream of value) {
    if (!Array.isArray(stream) || !Array.isArray(stream[1])) {
      continue;
    }
    for (const entry of stream[1]) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) {
        continue;
      }
      const payloadIndex = entry[1].indexOf('payload');
      const payload = payloadIndex === -1 ? undefined : entry[1][payloadIndex + 1];
      if (typeof payload === 'string') {
        entries.push({ id: entry[0], payload });
      }
    }
  }
  return entries;
};

const publishDistributedEnvelope = async (input: {
  readonly redis: Redis;
  readonly stream: string;
  readonly bytesKey: string;
  readonly envelope: DistributedRelayEnvelope;
}): Promise<boolean> => {
  const bytes = input.envelope.kind === 'frame' ? input.envelope.bytes : 0;
  const result = await input.redis.eval(
    `local current = tonumber(redis.call('GET', KEYS[2]) or '0')
     local added = tonumber(ARGV[1])
     if current + added > tonumber(ARGV[2]) then return 0 end
     if added > 0 then redis.call('INCRBY', KEYS[2], added) end
     redis.call('XADD', KEYS[1], '*', 'payload', ARGV[3])
     redis.call('EXPIRE', KEYS[1], ARGV[4])
     redis.call('EXPIRE', KEYS[2], ARGV[4])
     return 1`,
    2,
    input.stream,
    input.bytesKey,
    bytes,
    distributedQueueLimit,
    JSON.stringify(input.envelope),
    distributedRouteLifetime,
  );
  return result === 1;
};

/** Redis-Streams relay for one route side; peers may be attached to different API replicas. */
export const relayHostFramesThroughRedis = async (input: {
  readonly socket: WebSocket;
  readonly writer: Redis;
  readonly reader: Redis;
  readonly sessionId: string;
  readonly route: 'fs' | 'runtime' | 'agent';
  readonly side: 'browser' | 'host';
}): Promise<{ close(): void }> => {
  const routePrefix = `host:relay:${input.sessionId}:${input.route}`;
  const outbound = `${routePrefix}:${input.side === 'browser' ? 'browser-host' : 'host-browser'}`;
  const inbound = `${routePrefix}:${input.side === 'browser' ? 'host-browser' : 'browser-host'}`;
  const outboundBytes = `${outbound}:bytes`;
  const inboundBytes = `${inbound}:bytes`;
  if (input.reader.status === 'wait') {
    await input.reader.connect();
  }
  let closed = false;
  let peerReady = false;
  let lastId = '0-0';
  let writes = Promise.resolve();
  const peerTimer = setTimeout(() => {
    if (!peerReady) {
      input.socket.close(1008, 'route peer did not connect');
    }
  }, distributedPeerTimeout);
  peerTimer.unref();

  const publish = async (envelope: DistributedRelayEnvelope): Promise<void> => {
    const accepted = await publishDistributedEnvelope({
      redis: input.writer,
      stream: outbound,
      bytesKey: outboundBytes,
      envelope,
    });
    if (!accepted) {
      throw new Error('distributed relay queue limit exceeded');
    }
  };
  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(peerTimer);
    input.reader.disconnect();
    if (input.socket.readyState === WebSocket.OPEN || input.socket.readyState === WebSocket.CONNECTING) {
      input.socket.close(1001, 'relay closed');
    }
  };
  const send = async (envelope: Extract<DistributedRelayEnvelope, { readonly kind: 'frame' }>): Promise<void> =>
    new Promise((resolve, reject) => {
      input.socket.send(Buffer.from(envelope.data, 'base64'), { binary: envelope.binary }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  input.socket.on('message', (data, binary) => {
    const buffer = asBuffer(data);
    input.socket.pause();
    const previous = writes;
    writes = (async () => {
      await previous;
      await publish({ kind: 'frame', binary, bytes: buffer.byteLength, data: buffer.toString('base64') });
      input.socket.resume();
    })().catch(() => {
      input.socket.close(1009, 'relay queue limit exceeded');
    });
  });
  /**
   * Whatever ends this socket — a close frame, an abrupt disconnect `ws` reports
   * as 1006, or a wire error — is the peer's business. Publish it best-effort,
   * then tear the local side down whether or not the publish landed.
   */
  let departed = false;
  const depart = (code: number, reason: string): void => {
    if (departed || closed) {
      return;
    }
    departed = true;
    void publish({ kind: 'close', code, reason }).finally(close);
  };
  input.socket.once('close', (code, reason) => {
    depart(code, reason.toString());
  });
  input.socket.once('error', () => {
    depart(1011, 'relay socket failed');
  });

  const read = async (): Promise<void> => {
    await publish({ kind: 'ready' });
    while (!closed) {
      // oxlint-disable-next-line no-await-in-loop -- one blocking stream read preserves frame order.
      const response: unknown = await input.reader.xread('BLOCK', 1000, 'STREAMS', inbound, lastId);
      for (const entry of parseStreamEntries(response)) {
        lastId = entry.id;
        const envelope = parseDistributedEnvelope(entry.payload);
        if (!envelope) {
          input.socket.close(1008, 'invalid distributed relay frame');
          return;
        }
        if (envelope.kind === 'ready') {
          peerReady = true;
          clearTimeout(peerTimer);
        } else if (envelope.kind === 'close') {
          clearTimeout(peerTimer);
          input.socket.close(mirrorableCloseCode(envelope.code), envelope.reason);
          close();
        } else {
          // oxlint-disable-next-line no-await-in-loop -- callback completion is the cross-replica backpressure boundary.
          await send(envelope);
          // oxlint-disable-next-line no-await-in-loop -- release exactly the bytes just delivered.
          await input.writer.decrby(inboundBytes, envelope.bytes);
        }
        // oxlint-disable-next-line no-await-in-loop -- consumed entries are deleted to keep Redis memory bounded.
        await input.writer.xdel(inbound, entry.id);
      }
    }
  };
  void read().catch(() => {
    if (!closed) {
      input.socket.close(1011, 'distributed relay failed');
    }
    close();
  });
  /* Every listener above was attached after an await — this reader's connect,
   * and in `parkRoute` a grant read and the session keepalive — so a socket that
   * died during admission emitted its `close` to nobody. Its peer still has to
   * hear about it, or it parks a socket on a session no one is using. */
  if (input.socket.readyState === WebSocket.CLOSED) {
    depart(1001, 'relay peer closed');
  }
  return { close };
};
