import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '#hooks/use-mobile.js';

type MediaListener = (event: MediaQueryListEvent) => void;

/** A `matchMedia` whose answer the test controls, with the listeners it was given. */
function stubViewport(initiallyMobile: boolean): { setMobile: (mobile: boolean) => void } {
  let mobile = initiallyMobile;
  const listeners = new Set<MediaListener>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return mobile;
      },
      media: query,
      addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
    })),
  );
  return {
    setMobile(next) {
      mobile = next;
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent);
      }
    },
  };
}

describe('useIsMobile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a phone viewport on the first render, so the desktop shell never mounts first (D-UI-08)', () => {
    stubViewport(true);
    const seen: boolean[] = [];

    renderHook(() => {
      const isMobile = useIsMobile();
      seen.push(isMobile);
      return isMobile;
    });

    expect(seen[0]).toBe(true);
    expect(seen.every(Boolean)).toBe(true);
  });

  it('follows the viewport across the breakpoint', () => {
    const viewport = stubViewport(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      viewport.setMobile(true);
    });

    expect(result.current).toBe(true);
  });

  it('renders as desktop on the server', () => {
    const probe = (): React.JSX.Element => createElement('span', undefined, String(useIsMobile()));

    expect(renderToString(createElement(probe))).toBe('<span>false</span>');
  });
});
