import { act, renderHook, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from '@taucad/ui/components/sonner';
import { afterEach, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
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
  const observed = new ObservationService<FileContentResult>({
    resource: '.tau/export/preferences.json',
    watch: (invalidate, reset) => {
      listener = (event) => {
        if (event.type === 'reset') {
          reset();
        } else {
          invalidate();
        }
      };
      return {
        ready: Promise.resolve(),
        closed: new Promise<void>(() => {
          /* Connected until source release. */
        }),
        dispose: () => undefined,
      };
    },
    read: async () => ({ kind: 'text', content: await readFile('.tau/export/preferences.json') }),
  });
  const manager = mock<Manager>({
    readFile,
    writeFiles,
    exists: async () => true,
    contentService: mock<NonNullable<Manager['contentService']>>({
      observeContent: () => observed,
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
      const observed = new ObservationService<FileContentResult>({
        resource: '.tau/export/preferences.json',
        watch: () => ({
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            /* Source remains connected. */
          }),
          dispose: () => undefined,
        }),
        read: async () => ({ kind: 'text', content: await readFile('.tau/export/preferences.json') }),
      });
      const manager = mock<Manager>({
        readFile,
        writeFiles,
        exists: async () => true,
        contentService: mock<NonNullable<Manager['contentService']>>({ observeContent: () => observed }),
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

it('settles physical export preferences after held acknowledgement while preserving a pending local patch', async () => {
  type Manager = ReturnType<typeof useFileManager>;
  const path = '.tau/export/preferences.json';
  const provider = new MemoryProvider();
  const oldBytes = new TextEncoder().encode(JSON.stringify({ shouldDownload: true, zipMultiple: false }));
  await provider.writeFile(path, oldBytes);
  const paths = new WorkspacePathResolver('/project');
  const proxy = mock<ComposedViewClient>();
  proxy.readFile.mockImplementation(async (absolute) => {
    const relative = paths.toRelativePath(absolute);
    if (relative === undefined) {
      throw new Error(`Unexpected preferences read: ${absolute}`);
    }
    return provider.readFile(relative);
  });
  const ready = Promise.withResolvers<void>();
  let held = false;
  const channel = new WorkerChangeChannel({
    transport: {
      listen: () => () => undefined,
      watchReady: () => ({
        ready: held ? ready.promise : Promise.resolve(),
        closed: new Promise<void>(() => {
          /* Remain open until the source is released. */
        }),
        unsubscribe: () => undefined,
      }),
    },
  });
  const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
  expect(await content.resolveBytes(path)).toEqual(oldBytes);
  held = true;
  function readFile(file: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(file: string, options: 'utf8'): Promise<string>;
  async function readFile(file: string, options?: 'utf8') {
    const bytes = await content.resolveBytes(file);
    return options === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
  }
  const writeFiles = vi.fn<Manager['writeFiles']>(async (files) => {
    const write = files[path];
    if (!write) {
      throw new Error('Expected preferences write');
    }
    await provider.writeFile(path, write.content);
  });
  const manager: Manager = {
    ...mock<Manager>(),
    readFile,
    contentService: content,
    writeFiles,
    exists: async () => true,
  };
  const mounted = renderHook(() => useExportPreferences(manager));
  try {
    act(() => {
      mounted.result.current[1]({ ...mounted.result.current[0], shouldDownload: false });
    });
    const fresh = new TextEncoder().encode(JSON.stringify({ shouldDownload: true, zipMultiple: true }));
    await provider.writeFile(path, fresh);
    expect(await content.resolveBytes(path)).toEqual(oldBytes);
    expect(writeFiles).not.toHaveBeenCalled();
    await act(async () => {
      ready.resolve();
    });
    await waitFor(() => {
      expect(mounted.result.current[0]).toMatchObject({ shouldDownload: false, zipMultiple: true });
    });
    await waitFor(() => {
      expect(writeFiles).toHaveBeenCalledOnce();
    });
    const persisted = JSON.parse(new TextDecoder().decode(await provider.readFile(path))) as Record<string, unknown>;
    expect(persisted).toMatchObject({ shouldDownload: false, zipMultiple: true });
  } finally {
    mounted.unmount();
    content.dispose();
  }
});

it('clears a successful local patch before a later same-key external change despite delayed own-write watch delivery', async () => {
  type Manager = ReturnType<typeof useFileManager>;
  const path = '.tau/export/preferences.json';
  const provider = new MemoryProvider();
  const encode = (shouldDownload: boolean) =>
    new TextEncoder().encode(JSON.stringify({ shouldDownload, zipMultiple: false }));
  await provider.writeFile(path, encode(true));
  const paths = new WorkspacePathResolver('/project');
  const proxy = mock<ComposedViewClient>();
  proxy.readFile.mockImplementation(async (absolute) => {
    const relative = paths.toRelativePath(absolute);
    if (relative === undefined) {
      throw new Error(`Unexpected preferences read: ${absolute}`);
    }
    return provider.readFile(relative);
  });
  proxy.writeFiles.mockImplementation(async (files) => {
    await Promise.all(
      Object.entries(files).map(async ([absolute, file]) => {
        const relative = paths.toRelativePath(absolute);
        if (relative === undefined) {
          throw new Error(`Unexpected preferences write: ${absolute}`);
        }
        await provider.writeFile(relative, file.content);
      }),
    );
  });
  const callbacks = new Set<(event: WatchEvent) => void>();
  const channel = new WorkerChangeChannel({
    transport: {
      listen: () => () => undefined,
      watchReady: (_request, callback) => {
        callbacks.add(callback);
        return {
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            /* Successful writes need not deliver their watch event before their receipt. */
          }),
          unsubscribe: () => {
            callbacks.delete(callback);
          },
        };
      },
    },
  });
  const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
  function readFile(file: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(file: string, options: 'utf8'): Promise<string>;
  async function readFile(file: string, options?: 'utf8') {
    const bytes = await content.resolveBytes(file);
    return options === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
  }
  const written = Promise.withResolvers<void>();
  const writeFiles = vi.fn<Manager['writeFiles']>(async (files) => {
    await content.writeFiles(files, 'user');
    written.resolve();
  });
  const manager: Manager = {
    ...mock<Manager>(),
    contentService: content,
    readFile,
    writeFiles,
    exists: async () => true,
  };
  const mounted = renderHook(() => useExportPreferences(manager));
  try {
    await waitFor(() => {
      expect(content.observeContent(path).getSnapshot().status).toBe('ready');
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      mounted.result.current[1]({ ...mounted.result.current[0], shouldDownload: false });
    });
    await waitFor(() => {
      expect(writeFiles).toHaveBeenCalledOnce();
    });
    await act(async () => {
      await written.promise;
    });
    expect(mounted.result.current[0].shouldDownload).toBe(false);
    expect(JSON.parse(new TextDecoder().decode(await provider.readFile(path)))).toMatchObject({
      shouldDownload: false,
    });
    expect(await content.resolveBytes(path)).toEqual(await provider.readFile(path));
    await provider.writeFile(path, encode(true));
    act(() => {
      for (const callback of callbacks) {
        callback({ type: 'change', path });
      }
    });
    await waitFor(() => {
      expect(mounted.result.current[0].shouldDownload).toBe(true);
    });
    expect(writeFiles).toHaveBeenCalledOnce();
  } finally {
    mounted.unmount();
    content.dispose();
  }
});

it('retries closed export settings in the same mounted toast surface through held acknowledgment with its local patch retained', async () => {
  type Manager = ReturnType<typeof useFileManager>;
  const path = '.tau/export/preferences.json';
  const provider = new MemoryProvider();
  await provider.writeFile(
    path,
    new TextEncoder().encode(JSON.stringify({ shouldDownload: true, zipMultiple: false })),
  );
  const paths = new WorkspacePathResolver('/project');
  const proxy = mock<ComposedViewClient>();
  proxy.readFile.mockImplementation(async (absolute) => {
    const relative = paths.toRelativePath(absolute);
    if (relative === undefined) {
      throw new Error(`Unexpected preferences read: ${absolute}`);
    }
    return provider.readFile(relative);
  });
  proxy.writeFiles.mockImplementation(async (files) => {
    await Promise.all(
      Object.entries(files).map(async ([absolute, file]) => {
        const relative = paths.toRelativePath(absolute);
        if (relative === undefined) {
          throw new Error(`Unexpected preferences write: ${absolute}`);
        }
        await provider.writeFile(relative, file.content);
      }),
    );
  });
  const closed = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  let held = false;
  const registrations = vi.fn();
  const channel = new WorkerChangeChannel({
    transport: {
      listen: () => () => undefined,
      watchReady: () => {
        registrations();
        return {
          ready: held ? ready.promise : Promise.resolve(),
          closed: held
            ? new Promise<void>(() => {
                /* Replacement remains connected. */
              })
            : closed.promise,
          unsubscribe: () => undefined,
        };
      },
    },
  });
  const content = new FileContentService({ proxy, paths, channel, refreshGuard: new RefreshGenerationGuard() });
  function readFile(file: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(file: string, options: 'utf8'): Promise<string>;
  async function readFile(file: string, options?: 'utf8') {
    const bytes = await content.resolveBytes(file);
    return options === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
  }
  const writeFiles = vi.fn<Manager['writeFiles']>(async (files) => content.writeFiles(files, 'user'));
  const manager: Manager = {
    ...mock<Manager>(),
    contentService: content,
    readFile,
    writeFiles,
    exists: async () => true,
  };
  toast.dismiss();
  const mounted = renderHook(() => useExportPreferences(manager), {
    wrapper: ({ children }) => (
      <>
        <Toaster theme='light' />
        {children}
      </>
    ),
  });
  try {
    await waitFor(() => {
      expect(content.observeContent(path).getSnapshot().status).toBe('ready');
    });
    await act(async () => {
      await Promise.resolve();
    });
    const initialRegistrations = registrations.mock.calls.length;
    await act(async () => {
      closed.resolve();
    });
    act(() => {
      mounted.result.current[1]({ ...mounted.result.current[0], shouldDownload: false });
    });
    expect(mounted.result.current[0].shouldDownload).toBe(false);
    expect(writeFiles).not.toHaveBeenCalled();
    held = true;
    const retry = await screen.findByRole('button', { name: 'Retry', exact: true });
    retry.focus();
    await userEvent.keyboard('{Enter}');
    expect(registrations).toHaveBeenCalledTimes(initialRegistrations + 1);
    await provider.writeFile(
      path,
      new TextEncoder().encode(JSON.stringify({ shouldDownload: true, zipMultiple: true })),
    );
    expect(mounted.result.current[0]).toMatchObject({ shouldDownload: false, zipMultiple: false });
    expect(writeFiles).not.toHaveBeenCalled();
    await act(async () => {
      ready.resolve();
    });
    await waitFor(() => {
      expect(mounted.result.current[0]).toMatchObject({ shouldDownload: false, zipMultiple: true });
    });
    await waitFor(() => {
      expect(writeFiles).toHaveBeenCalledOnce();
    });
    await expect
      .poll(async () => {
        const value: unknown = JSON.parse(new TextDecoder().decode(await provider.readFile(path)));
        return value;
      })
      .toMatchObject({ shouldDownload: false, zipMultiple: true });
    expect(content.observeContent(path).activeLeaseCount).toBe(1);
  } finally {
    mounted.unmount();
    content.dispose();
    toast.dismiss();
  }
});
