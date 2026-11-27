import { describe, expect, it } from 'vitest';
import { awaitViewportPresented } from '#lib/await-viewport-presented.js';

type FakeCanvasState = 'ready' | 'presented' | 'failed' | 'lost';
type Observer<T> = { next?: (value: T) => void; complete?: () => void };

/* The canvas and graphics actors as the wait reads them: status, the matched state, the tier and the backend. */
const createCanvas = (state: FakeCanvasState, backend: 'webgl' | 'webgpu') => {
  const observers = new Set<Observer<unknown>>();
  let current = state;
  const snapshot = () => ({
    status: 'active',
    context: { backend, tier: { backend } },
    matches: (value: string) => value === current,
  });
  return {
    ref: {
      getSnapshot: snapshot,
      subscribe: (observer: Observer<unknown>) => {
        observers.add(observer);
        return { unsubscribe: () => observers.delete(observer) };
      },
    },
    set(next: FakeCanvasState) {
      current = next;
      for (const observer of observers) {
        observer.next?.(snapshot());
      }
    },
  };
};

const createGraphics = (canvas: { canvasId: string; ref: unknown } | undefined) => {
  const observers = new Set<Observer<unknown>>();
  let current = canvas;
  return {
    actor: {
      getSnapshot: () => ({ status: 'active', context: { canvas: current } }),
      subscribe: (observer: Observer<unknown>) => {
        observers.add(observer);
        return { unsubscribe: () => observers.delete(observer) };
      },
    },
    replace(next: { canvasId: string; ref: unknown } | undefined) {
      current = next;
      for (const observer of observers) {
        observer.next?.(undefined);
      }
    },
  };
};

const settledWithin = async (promise: Promise<void>): Promise<boolean> => {
  let settled = false;
  const marked = async (): Promise<void> => {
    await promise;
    settled = true;
  };
  void marked();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
  return settled;
};

type Graphics = Parameters<typeof awaitViewportPresented>[0];

describe('awaitViewportPresented', () => {
  it('should not hold work when no viewer shows the entry', async () => {
    await expect(awaitViewportPresented(undefined, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('should wait for the canvas to present', async () => {
    const canvas = createCanvas('ready', 'webgl');
    const graphics = createGraphics({ canvasId: 'a', ref: canvas.ref });
    const waiting = awaitViewportPresented(graphics.actor as unknown as Graphics, new AbortController().signal);

    expect(await settledWithin(waiting)).toBe(false);
    canvas.set('presented');
    expect(await settledWithin(waiting)).toBe(true);
  });

  it('should wait through a failed WebGPU canvas for its WebGL replacement to present', async () => {
    const doomed = createCanvas('ready', 'webgpu');
    const graphics = createGraphics({ canvasId: 'a', ref: doomed.ref });
    const waiting = awaitViewportPresented(graphics.actor as unknown as Graphics, new AbortController().signal);

    doomed.set('failed');
    expect(await settledWithin(waiting)).toBe(false);
    const replacement = createCanvas('ready', 'webgl');
    graphics.replace({ canvasId: 'b', ref: replacement.ref });
    expect(await settledWithin(waiting)).toBe(false);
    replacement.set('presented');
    expect(await settledWithin(waiting)).toBe(true);
  });

  it('should not hold work behind a canvas that will never draw', async () => {
    const lost = createCanvas('lost', 'webgl');
    const graphics = createGraphics({ canvasId: 'a', ref: lost.ref });

    await expect(
      awaitViewportPresented(graphics.actor as unknown as Graphics, new AbortController().signal),
    ).resolves.toBeUndefined();
  });

  it('should reject with the abort reason', async () => {
    const canvas = createCanvas('ready', 'webgl');
    const graphics = createGraphics({ canvasId: 'a', ref: canvas.ref });
    const controller = new AbortController();
    const waiting = awaitViewportPresented(graphics.actor as unknown as Graphics, controller.signal);

    controller.abort(new Error('superseded'));
    await expect(waiting).rejects.toThrow('superseded');
  });
});
