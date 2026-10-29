import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSurfaceProvider, useIsMobile } from '#hooks/use-mobile.js';

import { useResponsiveSurfaceContainer } from '#hooks/responsive-surface.js';

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

  it('hydrates a phone with the server value, then re-renders with the viewport without a mismatch (D13)', async () => {
    stubViewport(true);
    const seen: boolean[] = [];
    const probe = (): React.JSX.Element => {
      const isMobile = useIsMobile();
      seen.push(isMobile);
      return createElement('span', undefined, String(isMobile));
    };
    const container = document.createElement('div');
    container.innerHTML = renderToString(createElement(probe));
    seen.length = 0;
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, createElement(probe), {
        onRecoverableError(error) {
          recoverableErrors.push(error);
        },
      }),
    );

    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
    expect(container.textContent).toBe('true');
    expect(recoverableErrors).toEqual([]);
    act(() => {
      root.unmount();
    });
  });
});

it('scopes an embedded mobile surface without changing the document viewport', () => {
  stubViewport(false);
  const container = document.createElement('div');
  const { result } = renderHook(() => ({ mobile: useIsMobile(), container: useResponsiveSurfaceContainer() }), {
    wrapper: ({ children }) => createElement(ResponsiveSurfaceProvider, { isMobile: true, container }, children),
  });
  expect(result.current).toEqual({ mobile: true, container });
  const outside = renderHook(() => useIsMobile());
  expect(outside.result.current).toBe(false);
  vi.unstubAllGlobals();
});
