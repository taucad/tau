import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { useFileContent } from '#hooks/use-file-content.js';

const manager = vi.hoisted(() => {
  let service: FileContentService | undefined;
  return {
    use: () => ({ contentService: service }),
    set: (value: FileContentService | undefined) => {
      service = value;
    },
  };
});
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: manager.use }));
const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) {
    dispose();
  }
  manager.set(undefined);
});

function fixture() {
  const ready = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const watchReady = vi
    .fn()
    .mockReturnValueOnce({ ready: ready.promise, closed: closed.promise, unsubscribe: vi.fn() })
    .mockReturnValue({ ready: Promise.resolve(), closed: Promise.withResolvers<void>().promise, unsubscribe: vi.fn() });
  const proxy = mock<ComposedViewClient>();
  const readFile = proxy.readFile.mockResolvedValue(new TextEncoder().encode('safe base'));
  const channel = new WorkerChangeChannel({ transport: { listen: () => () => undefined, watchReady } });
  const service = new FileContentService({
    proxy,
    channel,
    paths: new WorkspacePathResolver('/project'),
    refreshGuard: new RefreshGenerationGuard(),
  });
  manager.set(service);
  disposals.push(() => {
    service.dispose();
    channel.dispose();
  });
  return { service, ready, closed, watchReady, readFile };
}

describe('useFileContent shared observation', () => {
  it('should dispatch one content outcome only to its selecting path among forty mounted files', async () => {
    const f = fixture();
    f.readFile.mockResolvedValue(new Uint8Array([0, 1, 2, 3]));
    let dispatched = 0;
    const global = f.service.onDidChangeOutcome.bind(f.service);
    vi.spyOn(f.service, 'onDidChangeOutcome').mockImplementation((callback) =>
      global((event) => {
        dispatched++;
        callback(event);
      }),
    );
    const scoped = f.service.subscribe.bind(f.service);
    vi.spyOn(f.service, 'subscribe').mockImplementation((path, callback) =>
      scoped(path, () => {
        dispatched++;
        callback();
      }),
    );
    const hooks = Array.from({ length: 40 }, (_, index) => renderHook(() => useFileContent(`file-${index}.bin`)));
    await act(async () => {
      f.ready.resolve();
    });
    await waitFor(() => {
      expect(hooks.every((hook) => hook.result.current.kind === 'binary')).toBe(true);
    });
    dispatched = 0;
    await act(async () => {
      await f.service.resolve('file-0.bin', { forceText: true });
    });
    expect(hooks[0]!.result.current.kind).toBe('text');
    expect(hooks.slice(1).every((hook) => hook.result.current.kind === 'binary')).toBe(true);
    expect(dispatched).toBe(1);
    expect(f.watchReady).toHaveBeenCalledTimes(40);
    for (const hook of hooks) {
      hook.unmount();
    }
  });

  it('should acknowledge its watch before acquisition and preserve a stable loading snapshot', async () => {
    const f = fixture();
    const hook = renderHook(() => useFileContent('main.ts'));
    const loading = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(loading);
    expect(f.readFile).not.toHaveBeenCalled();
    await act(async () => {
      f.ready.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('text');
    });
    expect(f.readFile).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it('should retain mounted text through isolated closure and retry fresh bytes without changing resource', async () => {
    const f = fixture();
    const hook = renderHook(() => useFileContent('main.ts'));
    await act(async () => {
      f.ready.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('text');
    });
    await act(async () => {
      f.closed.resolve();
    });
    expect(hook.result.current).toMatchObject({
      kind: 'text',
      content: new TextEncoder().encode('safe base'),
      observation: { status: 'closed' },
    });
    f.readFile.mockResolvedValue(new TextEncoder().encode('fresh bytes'));
    act(() => {
      hook.result.current.retry();
    });
    await waitFor(() => {
      expect(hook.result.current).toMatchObject({
        kind: 'text',
        content: new TextEncoder().encode('fresh bytes'),
        observation: { status: 'ready' },
      });
    });
    expect(f.watchReady).toHaveBeenCalledTimes(2);
    expect(f.readFile).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('should expose failed registration rather than loading forever', async () => {
    const f = fixture();
    const hook = renderHook(() => useFileContent('main.ts'));
    await act(async () => {
      f.ready.reject(new Error('watch refused'));
    });
    await waitFor(() => {
      expect(hook.result.current).toMatchObject({ kind: 'error', observation: { status: 'closed' } });
    });
    expect(f.readFile).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('should honor explicit force-text outcomes on the same mounted resource', async () => {
    const f = fixture();
    f.readFile.mockResolvedValue(new Uint8Array([0, 1, 2]));
    const hook = renderHook(() => useFileContent('data.bin'));
    await act(async () => {
      f.ready.resolve();
    });
    await waitFor(() => {
      expect(hook.result.current.kind).toBe('binary');
    });
    await act(async () => {
      await f.service.resolve('data.bin', { forceText: true });
    });
    expect(hook.result.current.kind).toBe('text');
    await act(async () => {
      f.closed.resolve();
    });
    expect(hook.result.current).toMatchObject({ kind: 'text', observation: { status: 'closed' } });
    hook.unmount();
  });
});
