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
});
