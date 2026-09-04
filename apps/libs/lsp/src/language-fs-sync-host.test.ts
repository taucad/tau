import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TauLanguageFileManagerRef } from '#language-fs-sync-host.js';
import {
  clearTauLanguageHostPortFactory,
  createTauLanguageHostInit,
  openTauLanguageHostPort,
  setTauLanguageHostPortFactory,
} from '#language-fs-sync-host.js';

const readyRef = (postMessage: () => void, filePoolBuffer?: SharedArrayBuffer): TauLanguageFileManagerRef => {
  const snap = {
    matches: (state: string) => state === 'ready',
    context: { worker: { postMessage } as unknown as Worker, rootDirectory: '/projects/abc', filePoolBuffer },
  };
  return { getSnapshot: () => snap } as unknown as TauLanguageFileManagerRef;
};

describe('lsp-fs-sync-host', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('openTauLanguageHostPort posts languageFsSyncAttach with transferred port when FM is ready', () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const postMessage = vi.fn();
    const filePoolBuffer = new SharedArrayBuffer(8);
    const snap = {
      matches: (state: string) => state === 'ready',
      context: {
        worker: { postMessage } as unknown as Worker,
        rootDirectory: '/projects/abc',
        filePoolBuffer,
      },
    };
    const ref = { getSnapshot: () => snap } as unknown as TauLanguageFileManagerRef;

    const init = openTauLanguageHostPort(ref);

    expect(init).toBeDefined();
    expect(init?.workspaceRootAbsolute).toBe('/projects/abc');
    expect(init?.filePoolBuffer).toBe(filePoolBuffer);
    expect(init?.slotSab).toBeInstanceOf(SharedArrayBuffer);
    expect(init?.arenaSab).toBeInstanceOf(SharedArrayBuffer);
    expect(postMessage).toHaveBeenCalledOnce();
    const [payload, transfer] = postMessage.mock.calls[0] as [unknown, Transferable[]];
    expect(payload).toMatchObject({ type: 'languageFsSyncAttach', rootDirectory: '/projects/abc' });
    expect(transfer).toHaveLength(1);
  });

  it('returns undefined without touching the worker when the document is not cross-origin isolated', () => {
    /* The unguarded allocation used to throw here, past the stock-worker
     * fallback the callers rely on (Finding 10). */
    vi.stubGlobal('crossOriginIsolated', false);
    const postMessage = vi.fn();

    expect(openTauLanguageHostPort(readyRef(postMessage))).toBeUndefined();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('returns undefined without touching the worker when SharedArrayBuffer is absent', () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    const postMessage = vi.fn();

    expect(openTauLanguageHostPort(readyRef(postMessage))).toBeUndefined();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('returns undefined when FM is not ready', () => {
    const snap = {
      matches: () => false,
      context: { worker: { postMessage: vi.fn() } },
    };
    const ref = { getSnapshot: () => snap } as unknown as TauLanguageFileManagerRef;
    expect(openTauLanguageHostPort(ref)).toBeUndefined();
  });

  it('createTauLanguageHostInit delegates to the registered factory', () => {
    const init = {
      port: new MessageChannel().port1,
      slotSab: new SharedArrayBuffer(16),
      arenaSab: new SharedArrayBuffer(64),
      workspaceRootAbsolute: '/x',
    };
    setTauLanguageHostPortFactory(() => init);
    expect(createTauLanguageHostInit()).toBe(init);
    clearTauLanguageHostPortFactory();
    expect(createTauLanguageHostInit()).toBeUndefined();
  });
});
