import { describe, it, expect, vi, afterEach } from 'vitest';
import { createActor } from 'xstate';
import type { ThumbnailInput, ThumbnailRenderRequest } from '#machines/thumbnail.machine.js';
import { thumbnailMachine } from '#machines/thumbnail.machine.js';

const deferred = <T>() => {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
};

const createDeps = (overrides: Partial<ThumbnailInput> = {}): Required<ThumbnailInput> => ({
  render: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    identity: 'h1',
    generation: 1,
    locatorIdentity: 'locator-1',
  }),
  store: vi.fn().mockResolvedValue({ status: 'stored' }),
  onManualResult: vi.fn(),
  debounceDelay: 2000,
  ...overrides,
});

describe('thumbnailMachine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render once after the debounce window and store the bytes', async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      expect(deps.render).not.toHaveBeenCalled(); // Still debouncing

      await vi.advanceTimersByTimeAsync(2000);

      expect(deps.render).toHaveBeenCalledOnce();
      expect(deps.store).toHaveBeenCalledOnce();
    } finally {
      actor.stop();
    }
  });

  it('should coalesce a burst of settles into a single render for the latest hash', async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(1000);
      actor.send({ type: 'settled', hash: 'h2' }); // Restarts the debounce window
      await vi.advanceTimersByTimeAsync(1000);
      expect(deps.render).not.toHaveBeenCalled(); // Only 1s since h2

      await vi.advanceTimersByTimeAsync(1000); // Now 2s since h2

      expect(deps.render).toHaveBeenCalledOnce();
    } finally {
      actor.stop();
    }
  });

  it('should skip regeneration when the hash matches the last rendered thumbnail', async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(deps.render).toHaveBeenCalledOnce();

      actor.send({ type: 'settled', hash: 'h1' }); // Unchanged geometry
      await vi.advanceTimersByTimeAsync(2000);

      expect(deps.render).toHaveBeenCalledOnce(); // Deduped
    } finally {
      actor.stop();
    }
  });

  it('should force a render on regenerate regardless of the hash', async () => {
    vi.useFakeTimers();
    const deps = createDeps();
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(deps.render).toHaveBeenCalledOnce();

      actor.send({ type: 'regenerate' }); // Immediate, ignores dedupe + debounce
      await vi.advanceTimersByTimeAsync(0);

      expect(deps.render).toHaveBeenCalledTimes(2);
    } finally {
      actor.stop();
    }
  });

  it('should keep the last thumbnail and retry when a render fails', async () => {
    vi.useFakeTimers();
    const deps = createDeps({ render: vi.fn().mockRejectedValue(new Error('adapter-unavailable: none')) });
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(deps.render).toHaveBeenCalledOnce();
      expect(deps.store).not.toHaveBeenCalled();

      actor.send({ type: 'settled', hash: 'h1' }); // Failed hash was not committed, so it retries
      await vi.advanceTimersByTimeAsync(2000);

      expect(deps.render).toHaveBeenCalledTimes(2);
    } finally {
      actor.stop();
    }
  });

  it('should retry the same identity when storing the rendered thumbnail fails', async () => {
    vi.useFakeTimers();
    const store = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('project storage is unavailable'))
      .mockResolvedValueOnce({ status: 'stored' });
    const deps = createDeps({ store });
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(deps.render).toHaveBeenCalledOnce();
      expect(store).toHaveBeenCalledOnce();

      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);

      expect(deps.render).toHaveBeenCalledTimes(2);
      expect(store).toHaveBeenCalledTimes(2);
    } finally {
      actor.stop();
    }
  });

  it('should remember the latest automatic settle that arrives during a render', async () => {
    vi.useFakeTimers();
    const first = deferred<{
      bytes: Uint8Array<ArrayBuffer>;
      identity: string;
      generation: number;
      locatorIdentity: string;
    }>();
    const render = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockResolvedValueOnce({
        bytes: new Uint8Array([2]),
        identity: 'h2',
        generation: 2,
        locatorIdentity: 'locator-1',
      });
    const deps = createDeps({ render, debounceDelay: 10 });
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(10);
      actor.send({ type: 'settled', hash: 'h2' });
      first.resolve({
        bytes: new Uint8Array([1]),
        identity: 'h1',
        generation: 1,
        locatorIdentity: 'locator-1',
      });
      await vi.waitFor(() => {
        expect(deps.store).toHaveBeenCalledOnce();
      });

      await vi.advanceTimersByTimeAsync(10);
      await vi.waitFor(() => {
        expect(render).toHaveBeenCalledTimes(2);
      });
      expect(render.mock.calls[1]![0]).toMatchObject({ kind: 'automatic-thumbnail', identity: 'h2' });
      expect(render.mock.calls[1]![0].signal).toBeInstanceOf(AbortSignal);
    } finally {
      actor.stop();
    }
  });

  it('should retry an automatic identity when storage skips after a locator change', async () => {
    vi.useFakeTimers();
    const store = vi
      .fn()
      .mockResolvedValueOnce({ status: 'skipped', reason: 'locator-changed' })
      .mockResolvedValueOnce({ status: 'stored' });
    const deps = createDeps({ store });
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(deps.render).toHaveBeenCalledOnce();

      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(2000);

      expect(deps.render).toHaveBeenCalledTimes(2);
      expect(store).toHaveBeenCalledTimes(2);
    } finally {
      actor.stop();
    }
  });

  it('should report the actual terminal result of a manual regeneration', async () => {
    vi.useFakeTimers();
    const onManualResult = vi.fn();
    const deps = createDeps({ onManualResult });
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'regenerate' });
      await vi.advanceTimersByTimeAsync(0);

      expect(onManualResult).toHaveBeenCalledWith({ status: 'stored', kind: 'manual-thumbnail', identity: 'h1' });
    } finally {
      actor.stop();
    }
  });

  it('should never drop manual requests and should run them before a pending automatic settle', async () => {
    vi.useFakeTimers();
    const releases = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];
    const render = vi.fn(async (request: ThumbnailRenderRequest) => {
      const index = render.mock.calls.length - 1;
      await releases[index]!.promise;
      return {
        bytes: new Uint8Array([index]),
        identity: request.identity ?? `manual-${index}`,
        generation: index,
        locatorIdentity: 'locator-1',
      };
    });
    const deps = createDeps({ render, debounceDelay: 10 });
    const actor = createActor(thumbnailMachine, { input: deps }).start();
    try {
      actor.send({ type: 'settled', hash: 'h1' });
      await vi.advanceTimersByTimeAsync(10);
      expect(render.mock.calls[0]![0]).toMatchObject({ kind: 'automatic-thumbnail', identity: 'h1' });
      expect(render.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);

      actor.send({ type: 'settled', hash: 'h2' });
      actor.send({ type: 'regenerate' });
      actor.send({ type: 'regenerate' });
      releases[0]!.resolve();
      await vi.waitFor(() => {
        expect(render).toHaveBeenCalledTimes(2);
      });
      expect(render.mock.calls[1]![0]).toMatchObject({ kind: 'manual-thumbnail' });
      expect(render.mock.calls[1]![0].signal).toBeInstanceOf(AbortSignal);

      releases[1]!.resolve();
      await vi.waitFor(() => {
        expect(render).toHaveBeenCalledTimes(3);
      });
      expect(render.mock.calls[2]![0]).toMatchObject({ kind: 'manual-thumbnail' });
      expect(render.mock.calls[2]![0].signal).toBeInstanceOf(AbortSignal);

      releases[2]!.resolve();
      await vi.advanceTimersByTimeAsync(10);
      await vi.waitFor(() => {
        expect(render).toHaveBeenCalledTimes(4);
      });
      expect(render.mock.calls[3]![0]).toMatchObject({ kind: 'automatic-thumbnail', identity: 'h2' });
      expect(render.mock.calls[3]![0].signal).toBeInstanceOf(AbortSignal);
      releases[3]!.resolve();
    } finally {
      actor.stop();
    }
  });

  it('should abort an active render and never store its late bytes after stop', async () => {
    const pending = deferred<{
      bytes: Uint8Array<ArrayBuffer>;
      identity: string;
      generation: number;
      locatorIdentity: string;
    }>();
    const render = vi.fn(async (_request: ThumbnailRenderRequest) => pending.promise);
    const deps = createDeps({ render });
    const actor = createActor(thumbnailMachine, { input: deps }).start();

    actor.send({ type: 'regenerate' });
    await vi.waitFor(() => {
      expect(render).toHaveBeenCalledOnce();
    });
    const { signal } = render.mock.calls[0]![0];
    actor.stop();

    expect(signal.aborted).toBe(true);
    pending.resolve({
      bytes: new Uint8Array([1]),
      identity: 'late',
      generation: 1,
      locatorIdentity: 'locator-1',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.store).not.toHaveBeenCalled();
  });
});
