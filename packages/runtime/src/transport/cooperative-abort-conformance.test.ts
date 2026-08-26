/**
 * Conformance test C7 — preview admission and targeted timeout signalling.
 *
 * End-to-end cancellation and hard-recovery behavior is covered by the
 * worker/client/packaged-Electron suites. These tests pin only the transport
 * encoder contract without synthetic polling-latency simulations.
 */

import { describe, expect, it, vi } from 'vitest';
import { createChannelClient, createChannelServer, wrapMessagePort } from '@taucad/rpc';
import type { Channel } from '@taucad/rpc';
import { signalSlot, abortReason } from '#types/runtime-protocol.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { reservePreview, triggerRenderTimeout } from '#transport/_internal/abort-channel.js';
import { signalBufferByteLength, signalBufferMaxByteLength } from '#framework/runtime-framework.constants.js';

const renderId = '550e8400-e29b-41d4-a716-446655440000';

describe('cooperative-abort transport conformance (C7)', () => {
  it('captures a distinct SAB generation for every preview admission', () => {
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength, {
      maxByteLength: signalBufferMaxByteLength,
    });
    const view = new Int32Array(signalBuffer);

    const first = reservePreview(signalBuffer);
    const second = reservePreview(signalBuffer);

    expect(first.abortGeneration).toBe(1);
    expect(second.abortGeneration).toBe(2);
    expect(Atomics.load(view, signalSlot.abortGeneration)).toBe(2);
    expect(Atomics.load(view, signalSlot.abortReason)).toBe(abortReason.superseded);
  });

  it('normalizes signed SAB storage to the uint32 wire domain (T13)', () => {
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength, {
      maxByteLength: signalBufferMaxByteLength,
    });
    const view = new Int32Array(signalBuffer);
    Atomics.store(view, signalSlot.abortGeneration, 2_147_483_647);

    const first = reservePreview(signalBuffer);
    const second = reservePreview(signalBuffer);

    expect(first.abortGeneration).toBe(2_147_483_648);
    expect(second.abortGeneration).toBe(2_147_483_649);
    expect(Atomics.load(new Uint32Array(signalBuffer), signalSlot.abortGeneration)).toBe(2_147_483_649);
  });

  it('does not let a stale timeout target advance the current SAB generation', () => {
    const signalBuffer = new SharedArrayBuffer(signalBufferByteLength, {
      maxByteLength: signalBufferMaxByteLength,
    });
    const view = new Int32Array(signalBuffer);
    const first = reservePreview(signalBuffer);
    const second = reservePreview(signalBuffer);
    const notify = vi.fn();
    const channel = { notify } as unknown as Channel<RuntimeProtocol>;

    triggerRenderTimeout(channel, signalBuffer, { renderId, abortGeneration: first.abortGeneration });
    expect(Atomics.load(view, signalSlot.abortGeneration)).toBe(second.abortGeneration);
    expect(Atomics.load(view, signalSlot.abortReason)).toBe(abortReason.superseded);

    triggerRenderTimeout(channel, signalBuffer, { renderId, abortGeneration: second.abortGeneration });
    expect(Atomics.load(view, signalSlot.abortGeneration)).toBe(3);
    expect(Atomics.load(view, signalSlot.abortReason)).toBe(abortReason.timeout);
    expect(notify).toHaveBeenNthCalledWith(1, 'abort', {
      renderId,
      reason: abortReason.timeout,
    });
    expect(notify).toHaveBeenNthCalledWith(2, 'abort', {
      renderId,
      reason: abortReason.timeout,
    });
  });

  it('delivers one exact targeted timeout over a real wire-only channel', async () => {
    const channelPair = new MessageChannel();
    const clientPort = wrapMessagePort<unknown>(channelPair.port1, { label: 'c7:client' });
    const serverPort = wrapMessagePort<unknown>(channelPair.port2, { label: 'c7:server' });
    const received = Promise.withResolvers<RuntimeProtocol['notifies']['abort']['args']>();

    const server = createChannelServer<RuntimeProtocol>({
      port: serverPort,
      sessionKey: 'c7-wire-notify',
      hello: { server: 'kernel-runtime-worker', runtimeVersion: 'test', protocolVersion: 1 },
      impl: {
        async call() {
          throw new Error('C7 transport test does not call');
        },
        notify(_context, name, args) {
          if (name !== 'abort') {
            return;
          }
          received.resolve(args as RuntimeProtocol['notifies']['abort']['args']);
        },
        listen: () => {
          throw new Error('C7 transport test does not subscribe');
        },
      },
    });
    const client = createChannelClient<RuntimeProtocol>({
      port: clientPort,
      sessionKey: 'c7-wire-notify',
    });
    await client.ready;

    triggerRenderTimeout(client, undefined, { renderId });

    await expect(received.promise).resolves.toEqual({ renderId, reason: abortReason.timeout });
    client.close();
    server.dispose();
  });
});
