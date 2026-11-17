import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { FileContentService } from '@taucad/fs-client/file-content-service';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { withAuthorityDigest } from '@taucad/ui-core/lib/composed-view-client.fixture';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { useFileContent, useFreshContent } from '#hooks/use-file-content.js';

const manager = vi.hoisted(() => {
  let service: FileContentService | undefined;
  return {
    use: () => ({ contentService: service }),
    set: (value: FileContentService | undefined) => {
      service = value;
    },
  };
});
vi.mock('#hooks/use-file-services.js', () => ({ useFileServices: manager.use }));
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
  const proxy = withAuthorityDigest(mock<ComposedViewClient>());
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

  /* Re-review item 1: a pane that read afresh shows the failed read, never bytes held from before it opened. */
  it('should show a failed read without falling back to held bytes when not retaining', async () => {
    const f = fixture();
    const retained = renderHook(() => useFileContent('main.ts'));
    const fresh = renderHook(() => useFileContent('main.ts', { retainValue: false }));
    await act(async () => {
      f.ready.resolve();
    });
    await waitFor(() => {
      expect(fresh.result.current.kind).toBe('text');
    });
    f.readFile.mockRejectedValue(new Error('EIO'));
    await act(async () => {
      await f.service.rereadOutcome('main.ts');
    });
    expect(fresh.result.current.kind).toBe('error');
    expect(retained.result.current).toMatchObject({ kind: 'text', content: new TextEncoder().encode('safe base') });
    retained.unmount();
    fresh.unmount();
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

/* STO-25, I7: a pane that waited shows only what a read begun after it opened answered. */
describe('useFreshContent', () => {
  type Answer = FileContentResult | Error;
  const text: FileContentResult = {
    kind: 'text',
    content: new TextEncoder().encode('landed'),
  } as unknown as FileContentResult;
  const rereading = (): Readonly<{
    reread: ReturnType<typeof vi.fn>;
    settle: (answer: Answer) => void;
  }> => {
    const answers: Array<(answer: Answer) => void> = [];
    const reread = vi.fn(
      async () =>
        new Promise<FileContentResult>((resolve, reject) => {
          answers.push((answer) => {
            if (answer instanceof Error) {
              reject(answer);
            } else {
              resolve(answer);
            }
          });
        }),
    );
    manager.set({ rereadOutcome: reread } as unknown as FileContentService);
    return {
      reread,
      settle: (answer) => {
        answers.shift()?.(answer);
      },
    };
  };

  it('waits after its gate opens until a read begun then answers, and marks the content read afresh', async () => {
    const { reread, settle } = rereading();
    const { result, rerender } = renderHook(({ open }) => useFreshContent('lib/gear.ts', open, false), {
      initialProps: { open: false },
    });
    expect(result.current.state).toBe('waiting');
    expect(reread).not.toHaveBeenCalled();

    rerender({ open: true });
    expect(result.current.state).toBe('waiting');
    await waitFor(() => {
      expect(reread).toHaveBeenCalledExactlyOnceWith('lib/gear.ts');
    });
    expect(result.current.readAfresh).toBe(true);
    await act(async () => {
      settle(text);
    });
    expect(result.current.state).toBe('open');
  });

  it('owes a read again each time it closes and opens', async () => {
    const { reread, settle } = rereading();
    const { result, rerender } = renderHook(({ open }) => useFreshContent('lib/gear.ts', open, false), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      settle(text);
    });
    rerender({ open: false });
    rerender({ open: true });
    expect(result.current.state).toBe('waiting');
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      settle(text);
    });
    expect(result.current.state).toBe('open');
  });

  it('opens at once when it never waited and no open is owed, and reads first when one is', async () => {
    const { reread, settle } = rereading();
    const immediate = renderHook(() => useFreshContent('lib/gear.ts', true, false)).result.current;
    expect(immediate.state).toBe('open');
    expect(immediate.readAfresh).toBe(false);
    expect(reread).not.toHaveBeenCalled();

    const { result } = renderHook(() => useFreshContent('tau.json', true, true));
    expect(result.current.state).toBe('waiting');
    await waitFor(() => {
      expect(reread).toHaveBeenCalledExactlyOnceWith('tau.json');
    });
    await act(async () => {
      settle(text);
    });
    expect(result.current.state).toBe('open');
  });

  /* After the open, the pane retains last good bytes again; it owes the guarantee anew each time it waits. */
  it('reads afresh until settled, and again after it next waits', async () => {
    const { reread, settle } = rereading();
    const { result, rerender } = renderHook(({ open }) => useFreshContent('lib/gear.ts', open, false), {
      initialProps: { open: false },
    });
    rerender({ open: true });
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      settle(text);
    });
    expect(result.current).toMatchObject({ state: 'open', readAfresh: true });
    act(() => {
      result.current.settled();
    });
    expect(result.current).toMatchObject({ state: 'open', readAfresh: false });

    rerender({ open: false });
    expect(result.current).toMatchObject({ state: 'waiting', readAfresh: true });
  });

  /* Re-review item 1: an I/O error on the fresh read never opens the pane. */
  it('fails with the cause when the fresh read answers an error, and reads again on retry', async () => {
    const { reread, settle } = rereading();
    const cause = new Error('EIO');
    const { result } = renderHook(() => useFreshContent('lib/gear.ts', true, true));
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      settle({ kind: 'error', cause } as unknown as FileContentResult);
    });
    expect(result.current).toMatchObject({ state: 'failed', cause });

    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toBe('waiting');
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      settle(text);
    });
    expect(result.current.state).toBe('open');
    expect(result.current.cause).toBeUndefined();
  });

  /* Re-review item 3: a throwing read is shown failed, never left waiting. */
  it('fails with the thrown cause when the fresh read throws, and reads again on retry', async () => {
    const { reread, settle } = rereading();
    const thrown = new Error('outside the workspace scope');
    const { result } = renderHook(() => useFreshContent('lib/gear.ts', true, true));
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      settle(thrown);
    });
    expect(result.current).toMatchObject({ state: 'failed', cause: thrown });

    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      settle(text);
    });
    expect(result.current.state).toBe('open');
  });

  it('forgets a failure when its gate closes and owes a fresh read when it opens again', async () => {
    const { reread, settle } = rereading();
    const { result, rerender } = renderHook(({ open }) => useFreshContent('lib/gear.ts', open, true), {
      initialProps: { open: true },
    });
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      settle(new Error('gone'));
    });
    expect(result.current.state).toBe('failed');
    rerender({ open: false });
    expect(result.current.state).toBe('waiting');
    rerender({ open: true });
    await waitFor(() => {
      expect(reread).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      settle(text);
    });
    expect(result.current.state).toBe('open');
  });
});
