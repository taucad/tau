import { describe, it, expect, vi } from 'vitest';
import { SharedPool } from '@taucad/memory';
import type { Channel } from '@taucad/rpc';
import {
  materialiseGeometry,
  materialiseHashedGeometryResult,
  subscribeMaterialisedGeometry,
} from '#transport/_internal/geometry-materialiser.js';
import type {
  GeometryTransport,
  HashedGeometryResultTransport,
  RuntimeProtocol,
} from '#types/runtime-protocol.types.js';
import type { Geometry } from '@taucad/types';

type GeometryComputedArgs = {
  readonly result: HashedGeometryResultTransport;
  readonly rgen: number;
};

type FakeChannel = Pick<Channel<RuntimeProtocol>, 'onNotify'> & {
  emit: (args: GeometryComputedArgs) => void;
};

const buildChannel = (): FakeChannel => {
  const handlers = new Set<(args: GeometryComputedArgs) => void>();
  return {
    onNotify(name, handler) {
      if (name !== 'geometryComputed') {
        return () => undefined;
      }
      const typed = handler as unknown as (args: GeometryComputedArgs) => void;
      handlers.add(typed);
      return () => {
        handlers.delete(typed);
      };
    },
    emit(args) {
      for (const handler of handlers) {
        handler(args);
      }
    },
  };
};

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 4; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- sequential ticks intentional
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

const inlineGltf = (hash: string, bytes: Uint8Array<ArrayBuffer> = new Uint8Array([1])): GeometryTransport => ({
  format: 'gltf',
  content: { delivery: 'inline', bytes },
  hash,
});

const pooledGltf = (hash: string, key: string): GeometryTransport => ({
  format: 'gltf',
  content: { delivery: 'pooled', key },
  hash,
});

const successResult = (geometry: GeometryTransport): HashedGeometryResultTransport => ({
  success: true,
  data: geometry,
  issues: [],
});

const failureResult = (): HashedGeometryResultTransport => ({
  success: false,
  issues: [
    {
      message: 'kernel exploded',
      code: 'KERNEL_BINDING_FAILED',
      type: 'kernel',
      severity: 'error',
    },
  ],
});

describe('materialiseGeometry', () => {
  it('passes non-gltf payloads through unchanged', async () => {
    const svg: GeometryTransport = {
      format: 'svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>',
      name: 'test',
      hash: 'h-svg',
    };
    await expect(materialiseGeometry(svg, undefined)).resolves.toBe(svg);
  });

  it('inlines `delivery: inline` gltf payloads without touching the pool', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const resolved = await materialiseGeometry(inlineGltf('h-inline', bytes), undefined);
    expect(resolved).toEqual({ format: 'gltf', content: bytes, hash: 'h-inline' });
  });

  it('resolves `delivery: pooled` gltf payloads through the supplied pool', async () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const pool = new SharedPool(buffer, { maxEntries: 8 });
    const stored = pool.store('pool-key-a', new Uint8Array([10, 20, 30]));
    expect(stored).toBe(true);

    const resolved = await materialiseGeometry(pooledGltf('h-pool', 'pool-key-a'), pool);
    expect(resolved).toMatchObject({ format: 'gltf', hash: 'h-pool' });
    if (resolved.format === 'gltf') {
      expect(resolved.content).toBeInstanceOf(Uint8Array);
      expect([...resolved.content]).toEqual([10, 20, 30]);
    }
  });

  it('throws `SharedPoolEntryNotFoundError` when a pooled key is missing', async () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const pool = new SharedPool(buffer, { maxEntries: 8 });
    await expect(materialiseGeometry(pooledGltf('h-missing', 'no-such-key'), pool)).rejects.toThrow(/no-such-key/);
  });
});

describe('materialiseHashedGeometryResult', () => {
  it('passes failure results through untouched', async () => {
    const failure = failureResult();
    await expect(materialiseHashedGeometryResult(failure, undefined)).resolves.toBe(failure);
  });

  it('resolves the payload in a successful result and preserves issues', async () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const pool = new SharedPool(buffer, { maxEntries: 8 });
    pool.store('result-key-b', new Uint8Array([1, 2]));

    const transport: HashedGeometryResultTransport = {
      success: true,
      data: pooledGltf('h-b', 'result-key-b'),
      issues: [{ message: 'warn', code: 'UNKNOWN', type: 'runtime', severity: 'warning' }],
    };

    const resolved = await materialiseHashedGeometryResult(transport, pool);
    expect(resolved.success).toBe(true);
    if (resolved.success) {
      expect(resolved.data.hash).toBe('h-b');
      expect(resolved.issues).toEqual(transport.issues);
    }
  });
});

describe('subscribeMaterialisedGeometry', () => {
  it('invokes the handler with a resolved result on every emission when dedupe is disabled', async () => {
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    subscribeMaterialisedGeometry(channel, handler, { dedupeByHash: false });

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 1 });
    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 2 });
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('suppresses duplicate emissions with identical hashes by default', async () => {
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    subscribeMaterialisedGeometry(channel, handler);

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 1 });
    await flushMicrotasks();

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 2 });
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits when the render hash changes', async () => {
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    subscribeMaterialisedGeometry(channel, handler);

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 1 });
    await flushMicrotasks();
    channel.emit({ result: successResult(inlineGltf('h-b')), rgen: 2 });
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('emits when two successful renders have different hashes', async () => {
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    subscribeMaterialisedGeometry(channel, handler);

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 1 });
    await flushMicrotasks();
    channel.emit({ result: successResult(inlineGltf('h-b')), rgen: 2 });
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('always emits failure results and resets the dedupe key after a failure', async () => {
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    subscribeMaterialisedGeometry(channel, handler);

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 1 });
    await flushMicrotasks();
    channel.emit({ result: failureResult(), rgen: 2 });
    await flushMicrotasks();
    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 3 });
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(3);
    const calls = handler.mock.calls.map(([result]) => (result as { success: boolean }).success);
    expect(calls).toEqual([true, false, true]);
  });

  it('surfaces pool-miss errors as a synthetic failure result', async () => {
    const buffer = new SharedArrayBuffer(64 * 1024);
    const pool = new SharedPool(buffer, { maxEntries: 8 });
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    subscribeMaterialisedGeometry(channel, handler, { pool });

    channel.emit({ result: successResult(pooledGltf('h-x', 'no-such-key')), rgen: 1 });
    await flushMicrotasks();

    expect(handler).toHaveBeenCalledTimes(1);
    const [result, rgen] = handler.mock.calls[0]!;
    expect(rgen).toBe(1);
    const failure = result as { success: boolean; issues: Array<{ code: string; message: string }> };
    expect(failure.success).toBe(false);
    expect(failure.issues[0]?.code).toBe('RUNTIME');
    expect(failure.issues[0]?.message).toMatch(/no-such-key/);
  });

  it('returns an unsubscribe handle that detaches the underlying onNotify', async () => {
    const channel = buildChannel();
    const handler = vi.fn<(result: unknown, rgen: number) => void>();

    const unsubscribe = subscribeMaterialisedGeometry(channel, handler);
    unsubscribe();

    channel.emit({ result: successResult(inlineGltf('h-a')), rgen: 1 });
    await flushMicrotasks();

    expect(handler).not.toHaveBeenCalled();
  });

  it('passes through resolved data unchanged for non-gltf formats', async () => {
    const channel = buildChannel();
    const seen: Geometry[] = [];

    subscribeMaterialisedGeometry(channel, (result) => {
      if (result.success) {
        seen.push(result.data);
      }
    });

    const svg: GeometryTransport = {
      format: 'svg',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>',
      name: 'test',
      hash: 'h-svg',
    };
    channel.emit({ result: successResult(svg), rgen: 1 });
    await flushMicrotasks();

    expect(seen).toEqual([svg]);
  });
});
