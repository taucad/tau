import { describe, it, expect, beforeEach } from 'vitest';
import { setAbortContext, clearAbortContext, checkAbort } from '#framework/cooperative-abort.js';
import { RenderAbortedError } from '#framework/runtime-worker-client.js';
import { signalSlot } from '#types/runtime-protocol.types.js';
import { signalBufferByteLength } from '#framework/runtime-framework.constants.js';

describe('cooperative-abort', () => {
  let sab: SharedArrayBuffer;
  let view: Int32Array;

  beforeEach(() => {
    clearAbortContext();
    sab = new SharedArrayBuffer(signalBufferByteLength);
    view = new Int32Array(sab);
  });

  it('should throw RenderAbortedError when abort generation changes', () => {
    Atomics.store(view, signalSlot.abortGeneration, 1);
    setAbortContext({ signal: new AbortController().signal, signalView: view, generation: 1 });

    Atomics.store(view, signalSlot.abortGeneration, 2);

    expect(() => {
      checkAbort();
    }).toThrow(RenderAbortedError);
  });

  it('should not throw when generation matches', () => {
    Atomics.store(view, signalSlot.abortGeneration, 5);
    setAbortContext({ signal: new AbortController().signal, signalView: view, generation: 5 });

    expect(() => {
      checkAbort();
    }).not.toThrow();
  });

  it('should compare wrapped SAB storage in the uint32 generation domain', () => {
    const generation = 2_147_483_648;
    Atomics.store(view, signalSlot.abortGeneration, generation);
    setAbortContext({ signal: new AbortController().signal, signalView: view, generation });

    expect(() => {
      checkAbort();
    }).not.toThrow();
  });

  it('should be a no-op after clearAbortContext', () => {
    Atomics.store(view, signalSlot.abortGeneration, 1);
    setAbortContext({ signal: new AbortController().signal, signalView: view, generation: 1 });

    Atomics.store(view, signalSlot.abortGeneration, 2);
    clearAbortContext();

    expect(() => {
      checkAbort();
    }).not.toThrow();
  });

  it('should observe an operation-scoped AbortSignal without a SharedArrayBuffer', () => {
    const controller = new AbortController();
    setAbortContext({ signal: controller.signal, generation: 1 });

    controller.abort(new RenderAbortedError());

    expect(() => {
      checkAbort();
    }).toThrow(RenderAbortedError);
  });
});
