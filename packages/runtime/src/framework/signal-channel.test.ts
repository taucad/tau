/** The SAB signal channel holds only the V2 atomic document-operation word. */
import { describe, expect, it } from 'vitest';
import { documentAbortView } from '#framework/document-abort-state.js';
import { signalBufferByteLength, signalBufferMaxByteLength } from '#framework/runtime-framework.constants.js';

describe('signal channel layout', () => {
  it('allocates one atomic document word without preview slots', () => {
    expect(signalBufferByteLength).toBe(8);
    const view = documentAbortView(new SharedArrayBuffer(signalBufferByteLength));
    expect(view?.byteOffset).toBe(0);
    expect(view?.byteLength).toBe(8);
    expect(documentAbortView(new SharedArrayBuffer(signalBufferByteLength - 1))).toBeUndefined();
  });

  it('keeps growable buffer max byte length within a small bounded headroom', () => {
    expect(signalBufferMaxByteLength).toBeGreaterThanOrEqual(signalBufferByteLength);
    expect(signalBufferMaxByteLength).toBeLessThanOrEqual(32);
  });
});
