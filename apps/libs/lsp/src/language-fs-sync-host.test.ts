import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TauLanguageFileManagerRef } from '#language-fs-sync-host.js';
import { openTauLanguageHostPort } from '#language-fs-sync-host.js';

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

  it('should attach each language service to its own project worker', () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const firstPost = vi.fn();
    const secondPost = vi.fn();
    const first = openTauLanguageHostPort(readyRef(firstPost));
    const second = openTauLanguageHostPort(readyRef(secondPost));
    try {
      expect(firstPost).toHaveBeenCalledOnce();
      expect(secondPost).toHaveBeenCalledOnce();
      expect(first?.port).not.toBe(second?.port);
      expect(first?.slotSab).not.toBe(second?.slotSab);
    } finally {
      first?.port.close();
      second?.port.close();
    }
  });
});
