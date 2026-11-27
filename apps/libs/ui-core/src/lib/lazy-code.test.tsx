// @vitest-environment jsdom
import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCodeLoadFailureSink } from '#lib/code-loading.js';
import { lazyCode } from '#lib/lazy-code.js';

const failure = (): TypeError =>
  new TypeError('Failed to fetch dynamically imported module: https://tau.new/assets/metal-morph-spinner-D7Jh-ODB.js');

class Boundary extends Component<{ readonly children: ReactNode }, { readonly error?: unknown }> {
  public static getDerivedStateFromError(error: unknown): { readonly error: unknown } {
    return { error };
  }

  public override state: { readonly error?: unknown } = {};

  public override render(): ReactNode {
    return this.state.error === undefined ? this.props.children : <p>Panel failed</p>;
  }
}

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.restoreAllMocks();
});

describe('lazyCode', () => {
  it('should render the loaded component', async () => {
    const View = lazyCode(async () => ({ default: ({ label }: { readonly label: string }) => <p>{label}</p> }));

    render(
      <Suspense fallback={<p>Loading</p>}>
        <View label='Loaded' />
      </Suspense>,
    );

    expect(await screen.findByText('Loaded')).toBeTruthy();
  });

  it('should degrade optional code to its fallback, and tell the recovery it was optional', async () => {
    const sink = vi.fn();
    restore = setCodeLoadFailureSink(sink);
    const error = failure();
    const Spinner = lazyCode(
      async (): Promise<{ default: (props: { readonly flat: ReactNode }) => ReactNode }> => {
        throw error;
      },
      { fallback: ({ flat }): ReactNode => flat },
    );

    render(
      <Boundary>
        <Suspense fallback={<p>Loading</p>}>
          <Spinner flat={<p>Flat spinner</p>} />
        </Suspense>
      </Boundary>,
    );

    // A decorative spinner never takes its panel down (PL7 staging defects D20).
    expect(await screen.findByText('Flat spinner')).toBeTruthy();
    expect(screen.queryByText('Panel failed')).toBeNull();
    expect(sink).toHaveBeenCalledExactlyOnceWith(error, 'optional');
  });

  it('should hand required code to the recovery and its nearest boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = vi.fn();
    restore = setCodeLoadFailureSink(sink);
    const error = failure();
    const View = lazyCode(async (): Promise<{ default: () => ReactNode }> => {
      throw error;
    });

    render(
      <Boundary>
        <Suspense fallback={<p>Loading</p>}>
          <View />
        </Suspense>
      </Boundary>,
    );

    expect(await screen.findByText('Panel failed')).toBeTruthy();
    expect(sink).toHaveBeenCalledExactlyOnceWith(error, 'required');
  });

  it('should leave a component’s own evaluation error to its boundary, even with a fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const View = lazyCode(
      async (): Promise<{ default: () => ReactNode }> => {
        throw new RangeError('module evaluation failed');
      },
      { fallback: () => <p>Fallback</p> },
    );

    render(
      <Boundary>
        <Suspense fallback={<p>Loading</p>}>
          <View />
        </Suspense>
      </Boundary>,
    );

    expect(await screen.findByText('Panel failed')).toBeTruthy();
  });
});
