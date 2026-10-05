import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { toast } from 'sonner';
import type { WatchEvent } from '@taucad/filesystem';
import type { useFileManager } from '#hooks/use-file-manager.js';
import { useExportPreferences } from '#routes/w.$workspace.$project/chat-converter.js';

afterEach(() => {
  vi.useRealTimers();
});

it('keeps newer local edits through its own watch/read acknowledgement without duplicate writes or rollback', async () => {
  type Manager = ReturnType<typeof useFileManager>;
  const writeReply = Promise.withResolvers<void>();
  const readReply = Promise.withResolvers<void>();
  let listener: ((event: WatchEvent) => void) | undefined;
  let hold = false;
  let bytes = new TextEncoder().encode(
    JSON.stringify({ shouldDownload: true, zipMultiple: false, shouldSaveToProject: true }),
  );
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, options: 'utf8'): Promise<string>;
  async function readFile(_path: string, options?: 'utf8') {
    const captured = bytes;
    if (hold) {
      await readReply.promise;
    }
    return options === 'utf8' ? new TextDecoder().decode(captured) : captured;
  }
  const writeFiles = vi.fn<Manager['writeFiles']>(async (files) => {
    bytes = files['.tau/export/preferences.json']!.content;
    listener?.({ type: 'change', path: '.tau/export/preferences.json' });
    if (hold) {
      await writeReply.promise;
    }
  });
  const manager = mock<Manager>({
    readFile,
    writeFiles,
    exists: async () => true,
    contentService: mock<NonNullable<Manager['contentService']>>({
      watchReady: (_request, onEvent) => {
        listener = onEvent;
        return {
          ready: Promise.resolve(),
          closed: new Promise(() => {
            /* The fixture transport remains connected. */
          }),
          dispose: () => undefined,
        };
      },
    }),
  });
  const { result } = renderHook(() => useExportPreferences(manager));
  await waitFor(() => {
    expect(result.current[0].shouldSaveToProject).toBe(true);
  });
  // Wait until the initial authority read has settled before enabling the domain debounce clock.
  await act(async () => {
    await Promise.resolve();
  });
  vi.useFakeTimers();
  hold = true;
  act(() => {
    result.current[1]({ ...result.current[0], shouldDownload: false });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(writeFiles).toHaveBeenCalledTimes(1);
  expect(result.current[0].shouldDownload).toBe(false);
  act(() => {
    result.current[1]({ ...result.current[0], zipMultiple: true });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(writeFiles).toHaveBeenCalledTimes(1);
  expect(result.current[0].zipMultiple).toBe(true);
  hold = false;
  await act(async () => {
    writeReply.resolve();
    readReply.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(writeFiles).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(writeFiles).toHaveBeenCalledTimes(2);
  expect(result.current[0]).toMatchObject({ shouldDownload: false, zipMultiple: true });
});

it.each(['saved', 'failed'] as const)(
  'fences an old source write completing %s after the new source starts',
  async (outcome) => {
    type Manager = ReturnType<typeof useFileManager>;
    const makeSource = (zipMultiple: boolean) => {
      const gate = Promise.withResolvers<void>();
      let bytes = new TextEncoder().encode(JSON.stringify({ shouldSaveToProject: true, zipMultiple }));
      const writeFiles = vi.fn<Manager['writeFiles']>(async (files) => {
        bytes = files['.tau/export/preferences.json']!.content;
        await gate.promise;
      });
      function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
      function readFile(path: string, options: 'utf8'): Promise<string>;
      async function readFile(_path: string, options?: 'utf8') {
        return options === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
      }
      const manager = mock<Manager>({
        readFile,
        writeFiles,
        exists: async () => true,
        contentService: mock<NonNullable<Manager['contentService']>>({
          watchReady: () => ({
            ready: Promise.resolve(),
            closed: new Promise<void>(() => {
              /* This watch stays open until fixture disposal. */
            }),
            dispose: () => {
              /* No transport resources in this fixture. */
            },
          }),
        }),
      });
      return { gate, manager, writeFiles };
    };
    const errors = vi.spyOn(toast, 'error');
    errors.mockClear();
    const old = makeSource(false);
    const next = makeSource(true);
    const { result, rerender } = renderHook(({ manager }) => useExportPreferences(manager), {
      initialProps: { manager: old.manager },
    });
    await waitFor(() => {
      expect(result.current[0].shouldSaveToProject).toBe(true);
    });
    act(() => {
      result.current[1]({ ...result.current[0], shouldDownload: false });
    });
    await waitFor(() => {
      expect(old.writeFiles).toHaveBeenCalledOnce();
    });
    rerender({ manager: next.manager });
    await waitFor(() => {
      expect(result.current[0].zipMultiple).toBe(true);
    });
    act(() => {
      result.current[1]({ ...result.current[0], shouldDownload: false });
    });
    await waitFor(() => {
      expect(next.writeFiles).toHaveBeenCalledOnce();
    });
    await act(async () => {
      if (outcome === 'saved') {
        old.gate.resolve();
      } else {
        old.gate.reject(new Error('obsolete source failed'));
      }
    });
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
      });
    });
    expect(next.writeFiles).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
    expect(result.current[0]).toMatchObject({ shouldDownload: false, zipMultiple: true });
    await act(async () => {
      next.gate.resolve();
    });
    await waitFor(() => {
      expect(result.current[0]).toMatchObject({ shouldDownload: false, zipMultiple: true });
    });
    expect(next.writeFiles).toHaveBeenCalledOnce();
  },
);
