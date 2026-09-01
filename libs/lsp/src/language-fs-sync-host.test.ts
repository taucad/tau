import { describe, expect, it, vi } from 'vitest';

import type { TauLanguageFileManagerRef } from '#language-fs-sync-host.js';
import {
  clearTauLanguageHostPortFactory,
  createTauLanguageHostInit,
  openTauLanguageHostPort,
  setTauLanguageHostPortFactory,
} from '#language-fs-sync-host.js';

describe('lsp-fs-sync-host', () => {
  it('openTauLanguageHostPort posts languageFsSyncAttach with transferred port when FM is ready', () => {
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
    expect(postMessage).toHaveBeenCalledOnce();
    const [payload, transfer] = postMessage.mock.calls[0] as [unknown, Transferable[]];
    expect(payload).toMatchObject({ type: 'languageFsSyncAttach' });
    expect(transfer).toHaveLength(1);
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
