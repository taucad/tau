/**
 * `isMessagePortLike` is the runtime validator behind
 * `InitializeMemoryHandle.fileSystemPort`; every value it admits is later
 * driven through `wrapMessagePort`. These tests pin the two to the same
 * contract: a shape is accepted **iff** `wrapMessagePort` can drive it, so the
 * validator can never admit a port that crashes three frames later.
 */
import { MessageChannel } from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { wrapMessagePort } from '@taucad/rpc';
import type { MessagePortLike } from '@taucad/rpc';
import { isMessagePortLike } from '#transport/_internal/wire-transferables.js';

/** Minimal in-process port that speaks the four `MessagePortLike` methods. */
const structuralPort = () => {
  const listeners = new Set<(event: { data: unknown }) => void>();
  return {
    postMessage(data: unknown): void {
      for (const listener of listeners) {
        listener({ data });
      }
    },
    addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
      listeners.add(listener);
    },
    removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
      listeners.delete(listener);
    },
    close: vi.fn(),
    listenerCount: () => listeners.size,
  };
};

const noop = (): void => {
  /* No-op. */
};

describe('isMessagePortLike', () => {
  it.each([
    ['null', null],
    ['a primitive', 42],
    ['a function', noop],
    ['an empty object', {}],
    [
      'a port whose methods are not functions',
      { postMessage: 1, addEventListener: 1, removeEventListener: 1, close: 1 },
    ],
    ['a port missing close', { postMessage: noop, addEventListener: noop, removeEventListener: noop }],
    ['a port missing removeEventListener', { postMessage: noop, addEventListener: noop, close: noop }],
    ['a port missing addEventListener', { postMessage: noop, removeEventListener: noop, close: noop }],
    ['a port missing postMessage', { addEventListener: noop, removeEventListener: noop, close: noop }],
    [
      'an EventEmitter-shaped port (on/off) that wrapMessagePort cannot drive',
      { postMessage: noop, on: noop, off: noop, close: noop },
    ],
  ])('should reject %s', (_label, value) => {
    expect(isMessagePortLike(value)).toBe(false);
  });

  it('should reject exactly the EventEmitter shape that used to slip through and crash wrapMessagePort', () => {
    const emitterPort = { postMessage: noop, on: noop, off: noop, close: noop };

    expect(isMessagePortLike(emitterPort)).toBe(false);
    // The consumer's failure mode the validator now guards against.
    expect(() => wrapMessagePort(emitterPort as unknown as MessagePortLike).onMessage(noop)).toThrow(TypeError);
  });

  it('should accept a structural port and wrapMessagePort must drive it end to end', () => {
    const port = structuralPort();
    expect(isMessagePortLike(port)).toBe(true);

    const wrapped = wrapMessagePort<string>(port);
    const received: string[] = [];
    const unsubscribe = wrapped.onMessage((data) => received.push(data));
    wrapped.postMessage('hello');
    expect(received).toEqual(['hello']);

    unsubscribe();
    wrapped.postMessage('after-unsubscribe');
    expect(received).toEqual(['hello']);
    expect(port.listenerCount()).toBe(0);

    wrapped.close();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('should accept a Node MessageChannel port and wrapMessagePort must drive it end to end', async () => {
    const channel = new MessageChannel();
    try {
      expect(isMessagePortLike(channel.port1)).toBe(true);
      expect(isMessagePortLike(channel.port2)).toBe(true);

      const receiver = wrapMessagePort<string>(channel.port2);
      const delivered = new Promise<string>((resolve) => {
        const unsubscribe = receiver.onMessage((data) => {
          unsubscribe();
          resolve(data);
        });
      });
      receiver.start?.();
      wrapMessagePort<string>(channel.port1).postMessage('ping');
      await expect(delivered).resolves.toBe('ping');
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });
});
