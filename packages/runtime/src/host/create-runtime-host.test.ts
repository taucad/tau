// @vitest-environment node
/**
 * Tests for {@link createRuntimeHost} — the symmetric host-side entry
 * point that mirrors {@link createRuntimeClient}. The host's job is
 * narrow: take a pre-built {@link RuntimeTransportHost} and drive its
 * `open()` / `close()` lifecycle, exposing a single `dispose()` for
 * symmetric teardown.
 */

import { describe, it, expect, vi } from 'vitest';

import { createRuntimeHost, createRuntimeHostConfig } from '#host/create-runtime-host.js';
import type { RuntimeTransportHost, TransportHostReady } from '#transport/runtime-transport.types.js';

type RecordingHost = RuntimeTransportHost & {
  readonly counters: { opened: number; closed: number };
  readonly channelDispose: ReturnType<typeof vi.fn>;
};

function createRecordingHost(id = 'recording'): RecordingHost {
  const counters = { opened: 0, closed: 0 };
  const channelDispose = vi.fn();
  let closedResolve: (() => void) | undefined;
  const closedPromise = new Promise<void>((resolve) => {
    closedResolve = resolve;
  });

  const ready: TransportHostReady = {
    /* Minimal channel surface — only `dispose` is touched by
     * createRuntimeHost on tear-down. */
    channel: { dispose: channelDispose } as unknown as TransportHostReady['channel'],
    peerHello: { server: 'kernel-runtime-worker', runtimeVersion: '0.0.0-test', transportId: id },
  };

  const host: RuntimeTransportHost = {
    id,
    open: vi.fn(async () => {
      counters.opened += 1;
      return ready;
    }),
    adoptInitialize: vi.fn(() => {
      throw new Error('adoptInitialize not used by createRuntimeHost contract');
    }),
    encodeGeometry: vi.fn(() => {
      throw new Error('encodeGeometry not used by createRuntimeHost contract');
    }),
    close: vi.fn(async () => {
      counters.closed += 1;
      closedResolve?.();
    }),
    closed: closedPromise,
  };

  return Object.assign(host, { counters, channelDispose });
}

describe('createRuntimeHost', () => {
  it('drives the transport host lifecycle: open() on construction, close() on dispose', async () => {
    const transport = createRecordingHost();
    const host = createRuntimeHost({ transport });

    /* Yield so the eager `transport.open()` promise settles. */
    await Promise.resolve();
    expect(transport.counters.opened).toBe(1);

    host.dispose();
    /* Dispose is best-effort and asynchronous; await the host's
     * `closed` promise so the assertion is deterministic. */
    await transport.closed;
    expect(transport.counters.closed).toBe(1);
    expect(transport.channelDispose).toHaveBeenCalledTimes(1);
  });

  it('exposes the transport host id on the returned RuntimeHostHandle', () => {
    const transport = createRecordingHost('custom-id');
    const host = createRuntimeHost({ transport });
    expect(host.id).toBe('custom-id');
    host.dispose();
  });

  it('dispose() is idempotent — close() runs at most once across repeated calls', async () => {
    const transport = createRecordingHost();
    const host = createRuntimeHost({ transport });

    host.dispose();
    host.dispose();
    host.dispose();

    await transport.closed;
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  it('rejects executable capability arrays on the host config type', () => {
    const transport = createRecordingHost();
    createRuntimeHost({
      transport,
      // @ts-expect-error -- executable capabilities are declared in `defineRuntime`, not on host config.
      kernels: [],
    }).dispose();
  });
});

describe('createRuntimeHostConfig', () => {
  it('returns the configuration object as-is (identity helper for type-inference)', () => {
    const transport = createRecordingHost();
    const config = createRuntimeHostConfig({ transport });
    expect(config.transport).toBe(transport);
  });
});
