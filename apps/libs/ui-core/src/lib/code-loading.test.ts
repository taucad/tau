import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CodeLoadDeadlineError,
  isCodeLoadFailure,
  loadCode,
  setCodeLoadFailureSink,
  workerCodeLoadFailureType,
} from '#lib/code-loading.js';

const chromium = (): TypeError =>
  new TypeError('Failed to fetch dynamically imported module: https://tau.new/assets/metal-morph-spinner-D7Jh-ODB.js');

/** An importer whose `import()` rejected with `error`. */
const rejecting = (error: unknown) => async (): Promise<never> => {
  throw error;
};

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('isCodeLoadFailure', () => {
  it.each([
    ['WebKit', new TypeError('Importing a module script failed.')],
    ['Chromium', chromium()],
    ['Firefox', new TypeError('error loading dynamically imported module: https://tau.new/assets/a-1.js')],
    ['a Vite stylesheet preload', new Error('Unable to preload CSS for /assets/editor-Bq7x.css')],
    ['a wrapper that keeps it as its cause', new Error('Agent host failed', { cause: chromium() })],
    ['a load past its deadline', new CodeLoadDeadlineError(30_000)],
  ])('should recognise %s', (_label, error) => {
    expect(isCodeLoadFailure(error)).toBe(true);
  });

  it.each([
    ['an unrelated error', new TypeError("Cannot read properties of undefined (reading 'x')")],
    ['the message as a string', 'Failed to fetch dynamically imported module'],
    ['undefined', undefined],
  ])('should not match %s', (_label, error) => {
    expect(isCodeLoadFailure(error)).toBe(false);
  });
});

describe('loadCode', () => {
  it('should resolve the module the importer loads', async () => {
    const module = { value: 1 };

    await expect(loadCode(async () => module)).resolves.toBe(module);
  });

  it('should hand a failed load to the realm’s recovery once, then rethrow it, without trying again', async () => {
    const sink = vi.fn();
    restore = setCodeLoadFailureSink(sink);
    const failure = chromium();
    const importer = vi.fn(rejecting(failure));

    await expect(loadCode(importer)).rejects.toBe(failure);

    // The realm keeps the failed module: asking again in it would fail the same way (FP9, D17).
    expect(importer).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledExactlyOnceWith(failure, 'required');
  });

  it('should tell the recovery that optional code failed, so it never reloads for it', async () => {
    const sink = vi.fn();
    restore = setCodeLoadFailureSink(sink);
    const failure = chromium();

    await expect(loadCode(rejecting(failure), { optional: true })).rejects.toBe(failure);

    expect(sink).toHaveBeenCalledExactlyOnceWith(failure, 'optional');
  });

  it('should leave an error the module threw while evaluating to its caller alone', async () => {
    const sink = vi.fn();
    restore = setCodeLoadFailureSink(sink);
    const thrown = new RangeError('bad input');

    await expect(loadCode(rejecting(thrown))).rejects.toBe(thrown);

    expect(sink).not.toHaveBeenCalled();
  });

  it('should rethrow the load failure even when the recovery itself throws', async () => {
    restore = setCodeLoadFailureSink(() => {
      throw new Error('recovery fault');
    });
    const failure = chromium();

    await expect(loadCode(rejecting(failure))).rejects.toBe(failure);
  });

  it('should restore the recovery installed before', async () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const restoreOuter = setCodeLoadFailureSink(outer);
    setCodeLoadFailureSink(inner)();

    await expect(loadCode(rejecting(chromium()))).rejects.toThrow();

    expect(outer).toHaveBeenCalledOnce();
    expect(inner).not.toHaveBeenCalled();
    restoreOuter();
  });
});

describe('loadCode with a deadline (WP-03, PERF-9)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fail a load that stays unsettled past its deadline as a failed load, and tell the recovery', async () => {
    vi.useFakeTimers();
    const sink = vi.fn();
    restore = setCodeLoadFailureSink(sink);
    const stalled = Promise.withResolvers<never>();
    const loading = loadCode(async () => stalled.promise, { deadline: 30_000 });
    const settled = expect(loading).rejects.toThrow(new CodeLoadDeadlineError(30_000));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(sink).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await settled;
    expect(sink).toHaveBeenCalledExactlyOnceWith(expect.any(CodeLoadDeadlineError), 'required');
  });

  it('should resolve a load that settles within its deadline and leave no timer behind', async () => {
    vi.useFakeTimers();
    const module = { value: 1 };

    await expect(loadCode(async () => module, { deadline: 30_000 })).resolves.toBe(module);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('loadCode in a dedicated module worker (FP10)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const inWorker = (): ReturnType<typeof vi.fn> => {
    const postMessage = vi.fn();
    // Any scope is this worker's own: `globalThis instanceof DedicatedWorkerGlobalScope`.
    vi.stubGlobal('DedicatedWorkerGlobalScope', { [Symbol.hasInstance]: () => true });
    vi.stubGlobal('postMessage', postMessage);
    return postMessage;
  };

  it('should tell the page by default, which replaces the worker, and rethrow', async () => {
    const postMessage = inWorker();
    const failure = chromium();

    await expect(loadCode(rejecting(failure))).rejects.toBe(failure);

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: workerCodeLoadFailureType, message: failure.message });
  });

  it('should keep optional code inside the worker, which degrades', async () => {
    const postMessage = inWorker();

    await expect(loadCode(rejecting(chromium()), { optional: true })).rejects.toThrow();

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('should tell nobody outside a worker when no recovery is installed', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);

    await expect(loadCode(rejecting(chromium()))).rejects.toThrow();

    expect(postMessage).not.toHaveBeenCalled();
  });
});
