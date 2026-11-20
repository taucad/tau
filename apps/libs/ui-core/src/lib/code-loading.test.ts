import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCodeLoadFailure, loadCode, setCodeLoadFailureSink } from '#lib/code-loading.js';

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
