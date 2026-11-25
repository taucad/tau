import { describe, it, expect, beforeEach } from 'vitest';
import { setAbortContext, clearAbortContext, checkAbort } from '#framework/cooperative-abort.js';
import { beginDocumentAbort, documentAbortView, endDocumentAbort } from '#framework/document-abort-state.js';
import { RenderAbortedError } from '#framework/runtime-operation-errors.js';
import { signalBufferByteLength } from '#framework/runtime-framework.constants.js';

describe('cooperative-abort', () => {
  beforeEach(() => {
    clearAbortContext();
  });

  it('does not throw while the document native operation still owns its shared state', () => {
    const view = documentAbortView(new SharedArrayBuffer(signalBufferByteLength));
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    const state = beginDocumentAbort(view, 1);
    setAbortContext({ signal: new AbortController().signal, documentSignalView: view, documentSignalState: state });
    expect(checkAbort).not.toThrow();
    endDocumentAbort(view, 1);
  });

  it('throws when the document native operation loses its shared state', () => {
    const view = documentAbortView(new SharedArrayBuffer(signalBufferByteLength));
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    const state = beginDocumentAbort(view, 1);
    setAbortContext({ signal: new AbortController().signal, documentSignalView: view, documentSignalState: state });
    endDocumentAbort(view, 1);
    expect(checkAbort).toThrow(RenderAbortedError);
  });

  it('is a no-op after clearAbortContext', () => {
    const controller = new AbortController();
    setAbortContext({ signal: controller.signal });
    controller.abort(new RenderAbortedError());
    clearAbortContext();
    expect(checkAbort).not.toThrow();
  });

  it('observes an operation-scoped AbortSignal without shared memory', () => {
    const controller = new AbortController();
    setAbortContext({ signal: controller.signal });
    controller.abort(new RenderAbortedError());
    expect(checkAbort).toThrow(RenderAbortedError);
  });

  it('throws the cancellation error, not the reason, once a supersede aborted the signal', () => {
    // A superseded document aborts its signal with a numeric reason; the first check after the shared state moved
    // does so itself. Every later check must still throw a `RenderAbortedError`, which the kernels and the OCCT
    // error formatter recognise, instead of the bare reason.
    const view = documentAbortView(new SharedArrayBuffer(signalBufferByteLength));
    if (!view) {
      throw new Error('Expected the document signal view.');
    }
    const controller = new AbortController();
    const state = beginDocumentAbort(view, 1);
    setAbortContext({
      signal: controller.signal,
      documentSignalView: view,
      documentSignalState: state,
      onSharedAbort: (reason) => {
        controller.abort(reason);
      },
    });
    endDocumentAbort(view, 1);
    expect(checkAbort).toThrow(RenderAbortedError);
    expect(controller.signal.aborted).toBe(true);
    expect(checkAbort).toThrow(RenderAbortedError);

    const superseded = new AbortController();
    setAbortContext({ signal: superseded.signal });
    superseded.abort(1);
    expect(checkAbort).toThrow(RenderAbortedError);
  });
});
