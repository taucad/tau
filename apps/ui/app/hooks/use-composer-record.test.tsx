// @vitest-environment jsdom
/**
 * `useComposerRecord` owns one record actor per store (G4): a new store gets a
 * fresh actor that reads its own record, and the old one stops.
 */

import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ComposerRecordStore } from '#db/composer-record-store.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import { useComposerRecord } from '#hooks/composer-record.js';

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

const storeHolding = (mode: 'plan' | 'agent'): ComposerRecordStore => {
  const path = composerRecordPaths.chat('project_1', `chat_${mode}`);
  const files = new Map([[path, new TextEncoder().encode(JSON.stringify({ version: 1, mode }))]]);
  return createComposerRecordStore(
    {
      readFile: async (file: string) => {
        const bytes = files.get(file);
        if (bytes === undefined) {
          throw notFound(file);
        }
        return bytes;
      },
      writeFile: async (file: string, data: Uint8Array<ArrayBuffer>) => {
        files.set(file, data);
      },
      exists: async (file: string) => files.has(file),
      readdir: async (file: string) => {
        throw notFound(file);
      },
      unlink: async (file: string) => {
        files.delete(file);
      },
      rmdir: async () => undefined,
    },
    path,
  );
};

const strict = ({ children }: { readonly children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe('useComposerRecord', () => {
  it('should keep its actor running through Strict Mode', async () => {
    const store = storeHolding('plan');
    const { result } = renderHook(() => useComposerRecord(store), { wrapper: strict });

    await waitFor(() => {
      expect(result.current.getSnapshot().context.record).toEqual({ version: 1, mode: 'plan' });
    });
    expect(result.current.getSnapshot().status).toBe('active');
  });

  it('should read the new record on a fresh actor and stop the old one when the store changes', async () => {
    const first = storeHolding('plan');
    const second = storeHolding('agent');
    const { result, rerender } = renderHook(({ store }) => useComposerRecord(store), {
      initialProps: { store: first },
      wrapper: strict,
    });
    await waitFor(() => {
      expect(result.current.getSnapshot().context.record).toEqual({ version: 1, mode: 'plan' });
    });
    const previous = result.current;

    rerender({ store: second });

    expect(result.current).not.toBe(previous);
    await waitFor(() => {
      expect(result.current.getSnapshot().context.record).toEqual({ version: 1, mode: 'agent' });
    });
    await waitFor(() => {
      expect(previous.getSnapshot().status).toBe('stopped');
    });
  });

  it('should stop its actor on unmount', async () => {
    const store = storeHolding('plan');
    const { result, unmount } = renderHook(() => useComposerRecord(store), { wrapper: strict });
    const ref = result.current;

    unmount();

    await waitFor(() => {
      expect(ref.getSnapshot().status).toBe('stopped');
    });
  });
});
