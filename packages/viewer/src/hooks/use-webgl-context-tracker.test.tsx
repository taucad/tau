import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useWebglContextRef, WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.jsx';

const stubPointer = (coarse: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: coarse && query === '(pointer: coarse)', media: query })),
  );
};

const renderLimit = (): number | undefined => {
  let limit: number | undefined;
  function Probe(): React.JSX.Element {
    limit = useWebglContextRef()?.getSnapshot().context.limit;
    return <span />;
  }
  render(
    <WebglContextTrackerProvider>
      <Probe />
    </WebglContextTrackerProvider>,
  );
  return limit;
};

describe('WebglContextTrackerProvider', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should admit two viewer contexts on a touch-first device', () => {
    stubPointer(true);

    expect(renderLimit()).toBe(2);
  });

  it('should admit eight viewer contexts on a desktop device', () => {
    stubPointer(false);

    expect(renderLimit()).toBe(8);
  });
});
