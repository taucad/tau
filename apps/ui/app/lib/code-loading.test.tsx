// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { Component, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isModuleLoadFailure, load, setCodeLoadFailureHandler } from '#lib/code-loading.js';
import { lazy } from '#lib/lazy-component.js';

const chunkFailure = (): TypeError =>
  new TypeError('Failed to fetch dynamically imported module: https://tau.new/assets/agent-host.impl-Bu.js');

class Boundary extends Component<
  { readonly children: ReactNode; readonly onCatch: (error: unknown) => void },
  { readonly hasCaught: boolean }
> {
  public static getDerivedStateFromError(): { readonly hasCaught: boolean } {
    return { hasCaught: true };
  }

  public override state = { hasCaught: false };

  public override componentDidCatch(error: unknown): void {
    this.props.onCatch(error);
  }

  public override render(): ReactNode {
    return this.state.hasCaught ? <p role='alert'>Failed</p> : this.props.children;
  }
}

afterEach(() => {
  setCodeLoadFailureHandler(undefined);
});

describe('isModuleLoadFailure', () => {
  it.each([
    ['WebKit', new TypeError('Importing a module script failed.')],
    ['Chromium', chunkFailure()],
    ['Firefox', new TypeError('error loading dynamically imported module: https://tau.new/assets/a-1.js')],
    ['a Vite stylesheet preload', new Error('Unable to preload CSS for /assets/editor-Bq7x.css')],
  ])('should recognise the %s module load failure', (_label, error) => {
    expect(isModuleLoadFailure(error)).toBe(true);
  });

  it('should recognise a module load failure a test runner wrapped as its cause', () => {
    expect(isModuleLoadFailure(new Error('[vitest] failed to load', { cause: chunkFailure() }))).toBe(true);
  });

  it('should not match an error the module threw while it ran', () => {
    expect(isModuleLoadFailure(new ReferenceError('window is not defined'))).toBe(false);
  });
});

describe('load', () => {
  it('should resolve the module the importer loaded, handing nothing over', async () => {
    const handler = vi.fn();
    setCodeLoadFailureHandler(handler);

    await expect(load(async () => ({ value: 1 }))).resolves.toStrictEqual({ value: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should hand a failed load to the recovery once and reject with the same failure', async () => {
    const handler = vi.fn();
    setCodeLoadFailureHandler(handler);
    const failure = chunkFailure();

    await expect(
      load(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(handler).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it('should leave an error the module threw while it ran to its caller', async () => {
    const handler = vi.fn();
    setCodeLoadFailureHandler(handler);
    const thrown = new ReferenceError('window is not defined');

    await expect(
      load(async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should leave the failure of optional code to its caller, which degrades instead of reloading', async () => {
    const handler = vi.fn();
    setCodeLoadFailureHandler(handler);
    const failure = chunkFailure();

    await expect(
      load(
        async () => {
          throw failure;
        },
        { optional: true },
      ),
    ).rejects.toBe(failure);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should reject unchanged where no recovery is installed (a worker, the server)', async () => {
    const failure = chunkFailure();

    await expect(
      load(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});

describe('lazy', () => {
  it('should render the declared fallback when optional code fails to load', async () => {
    const Fancy = lazy(
      async () => ({
        default: await load<ComponentType>(
          async () => {
            throw chunkFailure();
          },
          { optional: true },
        ),
      }),
      { fallback: () => <span>flat</span> },
    );

    render(
      <Suspense fallback={<span>loading</span>}>
        <Fancy />
      </Suspense>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('flat')).toBeInTheDocument();
  });

  it('should throw a failure to the nearest boundary when no fallback is declared', async () => {
    const failure = chunkFailure();
    const View = lazy(async () => ({
      default: await load<ComponentType>(async () => {
        throw failure;
      }),
    }));
    const caught = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <Boundary onCatch={caught}>
        <Suspense fallback={<span>loading</span>}>
          <View />
        </Suspense>
      </Boundary>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(caught).toHaveBeenCalledWith(failure);
  });
});
