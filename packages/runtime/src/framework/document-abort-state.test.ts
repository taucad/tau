import { describe, expect, it, vi } from 'vitest';
import {
  beginDocumentAbort,
  documentAbortGeneration,
  documentAbortReason,
  documentAbortSequence,
  documentAbortView,
  endDocumentAbort,
  nextDocumentAbortSequence,
} from '#framework/document-abort-state.js';
import { checkAbort, clearAbortContext, setAbortContext } from '#framework/cooperative-abort.js';
import { signalDocumentAbort } from '#transport/_internal/abort-channel.js';
import { abortReason } from '#types/runtime-wire.types.js';

describe('atomic document abort state', () => {
  it('publishes exact timeout reason with the target transition, including signed sequence values', () => {
    const buffer = new SharedArrayBuffer(8);
    const view = documentAbortView(buffer);
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    const sequence = 2_147_483_649;
    const initial = beginDocumentAbort(view, sequence);
    const onSharedAbort = vi.fn();
    setAbortContext({
      signal: new AbortController().signal,
      documentSignalView: view,
      documentSignalState: initial,
      onSharedAbort,
    });
    try {
      expect(signalDocumentAbort(buffer, String(sequence), documentAbortGeneration(initial), abortReason.timeout)).toBe(
        true,
      );
      expect(documentAbortReason(Atomics.load(view, 0))).toBe(abortReason.timeout);
      expect(checkAbort).toThrow('Render aborted');
      expect(onSharedAbort).toHaveBeenCalledExactlyOnceWith(abortReason.timeout);
    } finally {
      clearAbortContext();
      endDocumentAbort(view, sequence);
    }
  });

  it('rejects an old document during completion and successor admission', () => {
    const buffer = new SharedArrayBuffer(8);
    const view = documentAbortView(buffer);
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    const old = beginDocumentAbort(view, 1);
    endDocumentAbort(view, 1);
    expect(documentAbortSequence(Atomics.load(view, 0))).toBe(0);
    expect(signalDocumentAbort(buffer, '1', undefined, abortReason.superseded)).toBe(false);
    const current = beginDocumentAbort(view, 2);
    expect(signalDocumentAbort(buffer, '1', documentAbortGeneration(old), abortReason.timeout)).toBe(false);
    expect(signalDocumentAbort(buffer, '2', documentAbortGeneration(current), abortReason.superseded)).toBe(true);
    expect(documentAbortReason(Atomics.load(view, 0))).toBe(abortReason.superseded);
    endDocumentAbort(view, 2);
    expect(documentAbortSequence(Atomics.load(view, 0))).toBe(0);
  });

  it.each([
    [abortReason.timeout, abortReason.superseded],
    [abortReason.superseded, abortReason.timeout],
  ])('keeps the first admitted abort reason %i when a later %i arrives', (first, second) => {
    const buffer = new SharedArrayBuffer(8);
    const view = documentAbortView(buffer);
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    const state = beginDocumentAbort(view, 42);
    const generation = documentAbortGeneration(state);
    expect(signalDocumentAbort(buffer, '42', generation, first)).toBe(true);
    expect(signalDocumentAbort(buffer, '42', generation, second)).toBe(false);
    expect(documentAbortReason(Atomics.load(view, 0))).toBe(first);
    endDocumentAbort(view, 42);
  });

  it('never mints a colliding 32-bit sequence or admits its alias', () => {
    expect(nextDocumentAbortSequence(4_294_967_294)).toBe(4_294_967_295);
    expect(() => nextDocumentAbortSequence(4_294_967_295)).toThrow(RangeError);
    const buffer = new SharedArrayBuffer(8);
    const view = documentAbortView(buffer);
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    beginDocumentAbort(view, 1);
    expect(signalDocumentAbort(buffer, '4294967297', undefined, abortReason.timeout)).toBe(false);
    endDocumentAbort(view, 1);
  });
});
