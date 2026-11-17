// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idleFallbackDelay, scheduleNextStepWarm, whenIdleAfterLoad } from '#lib/warm-next-step.js';
import type { IdleHost, WarmingClass } from '#lib/warm-next-step.js';
import { routeClasses } from '#lib/route-classes.js';

type FakeHost = IdleHost & {
  readyState: DocumentReadyState;
  connection: { saveData?: boolean };
  fireLoad: () => void;
  runIdle: () => void;
  idlePending: () => number;
};

const fakeHost = ({ idle = true, readyState = 'loading' as DocumentReadyState } = {}): FakeHost => {
  const loadListeners = new Set<() => void>();
  const idleCallbacks = new Map<number, () => void>();
  let nextHandle = 1;
  const connection: { saveData?: boolean } = {};
  const document = { readyState };
  const host: FakeHost = {
    get readyState() {
      return document.readyState;
    },
    set readyState(value) {
      document.readyState = value;
    },
    connection,
    document,
    navigator: { connection },
    addEventListener: (_type, listener) => {
      loadListeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      loadListeners.delete(listener);
    },
    ...(idle
      ? {
          requestIdleCallback: (callback: () => void) => {
            const handle = nextHandle++;
            idleCallbacks.set(handle, callback);
            return handle;
          },
          cancelIdleCallback: (handle: number) => {
            idleCallbacks.delete(handle);
          },
        }
      : {}),
    setTimeout: (callback, fallbackDelay) => setTimeout(callback, fallbackDelay),
    clearTimeout: (handle) => {
      clearTimeout(handle);
    },
    fireLoad() {
      document.readyState = 'complete';
      for (const listener of loadListeners) {
        loadListeners.delete(listener);
        listener();
      }
    },
    runIdle() {
      for (const [handle, callback] of idleCallbacks) {
        idleCallbacks.delete(handle);
        callback();
      }
    },
    idlePending: () => idleCallbacks.size,
  };
  return host;
};

const home: WarmingClass = { id: 'home', warms: 'project' };

describe('whenIdleAfterLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should wait for load and then for an idle period', () => {
    const host = fakeHost();
    const start = vi.fn();
    whenIdleAfterLoad(start, host);
    host.runIdle();
    expect(start).not.toHaveBeenCalled();
    host.fireLoad();
    expect(start).not.toHaveBeenCalled();
    host.runIdle();
    expect(start).toHaveBeenCalledOnce();
  });

  it('should wait only for idle when the page has already loaded', () => {
    const host = fakeHost({ readyState: 'complete' });
    const start = vi.fn();
    whenIdleAfterLoad(start, host);
    expect(start).not.toHaveBeenCalled();
    host.runIdle();
    expect(start).toHaveBeenCalledOnce();
  });

  it('should fall back to a timer after load without requestIdleCallback', () => {
    const host = fakeHost({ idle: false });
    const start = vi.fn();
    whenIdleAfterLoad(start, host);
    vi.advanceTimersByTime(idleFallbackDelay * 10);
    expect(start).not.toHaveBeenCalled();
    host.fireLoad();
    vi.advanceTimersByTime(idleFallbackDelay - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledOnce();
  });

  it('should never run once cancelled, before or after load', () => {
    const before = fakeHost();
    const startBefore = vi.fn();
    whenIdleAfterLoad(startBefore, before)();
    before.fireLoad();
    before.runIdle();
    expect(startBefore).not.toHaveBeenCalled();

    const after = fakeHost();
    const startAfter = vi.fn();
    const cancel = whenIdleAfterLoad(startAfter, after);
    after.fireLoad();
    cancel();
    after.runIdle();
    expect(startAfter).not.toHaveBeenCalled();
  });
});

describe('scheduleNextStepWarm', () => {
  it("should warm the project class from Home once idle after load, naming Home's tier as loaded", async () => {
    const host = fakeHost();
    const warm = vi.fn(async () => undefined);
    scheduleNextStepWarm({ readRouteClass: () => home, warm, host });
    host.fireLoad();
    expect(warm).not.toHaveBeenCalled();
    host.runIdle();
    expect(warm).toHaveBeenCalledExactlyOnceWith('project', 'home');
    await Promise.resolve();
  });

  it('should schedule nothing under Save-Data', () => {
    const host = fakeHost();
    host.connection.saveData = true;
    const warm = vi.fn(async () => undefined);
    expect(scheduleNextStepWarm({ readRouteClass: () => home, warm, host })).toBeUndefined();
    host.fireLoad();
    host.runIdle();
    expect(host.idlePending()).toBe(0);
    expect(warm).not.toHaveBeenCalled();
  });

  it('should skip a warm-up when Save-Data is turned on before the page is idle', () => {
    const host = fakeHost();
    const warm = vi.fn(async () => undefined);
    scheduleNextStepWarm({ readRouteClass: () => home, warm, host });
    host.fireLoad();
    host.connection.saveData = true;
    host.runIdle();
    expect(warm).not.toHaveBeenCalled();
  });

  it('should read the route class at idle time and warm nothing for a class that warms none', () => {
    const host = fakeHost();
    const warm = vi.fn(async () => undefined);
    let current: WarmingClass | undefined = home;
    scheduleNextStepWarm({ readRouteClass: () => current, warm, host });
    host.fireLoad();
    // The visitor opened a project before the page went idle.
    current = { id: 'project' };
    host.runIdle();
    expect(warm).not.toHaveBeenCalled();
  });

  it('should swallow a failed warm-up', async () => {
    const host = fakeHost({ readyState: 'complete' });
    const warm = vi.fn(async () => {
      throw new Error('chunk gone');
    });
    scheduleNextStepWarm({ readRouteClass: () => home, warm, host });
    host.runIdle();
    // An unhandled rejection would fail the run once the microtasks settle.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(warm).toHaveBeenCalledOnce();
  });
});

describe('the registry warm-ups (PL8)', () => {
  it('should warm the project class from Home only', () => {
    expect(
      routeClasses.flatMap((routeClass) =>
        routeClass.warms === undefined ? [] : [[routeClass.id, routeClass.warms] as const],
      ),
    ).toEqual([['home', 'project']]);
  });

  it('should name only classes whose interactive tier the guards measure', () => {
    for (const routeClass of routeClasses) {
      if (routeClass.warms !== undefined) {
        expect(routeClasses.find((target) => target.id === routeClass.warms)?.interactive).toBeDefined();
        expect(routeClass.interactive).toBeDefined();
      }
    }
  });
});
