// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlatform } from '#hooks/use-platform.js';

const probe = (seen: string[]): (() => React.JSX.Element) => {
  return function Probe(): React.JSX.Element {
    const platform = usePlatform();
    seen.push(platform);
    return createElement('span', undefined, platform);
  };
};

describe('usePlatform', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports the detected platform on the client', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');

    const { result } = renderHook(() => usePlatform());

    expect(result.current).toBe('other');
  });

  it('renders the server platform on the server, which has no navigator to read', () => {
    expect(renderToString(createElement(probe([])))).toBe('<span>mac</span>');
  });

  it('hydrates a Windows client with the server platform, then re-renders without a mismatch', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const seen: string[] = [];
    const Probe = probe(seen);
    const container = document.createElement('div');
    container.innerHTML = renderToString(createElement(Probe));
    seen.length = 0;
    const recoverableErrors: unknown[] = [];

    const root = await act(async () =>
      hydrateRoot(container, createElement(Probe), {
        onRecoverableError(error) {
          recoverableErrors.push(error);
        },
      }),
    );

    expect(seen[0]).toBe('mac');
    expect(seen.at(-1)).toBe('other');
    expect(container.textContent).toBe('other');
    expect(recoverableErrors).toEqual([]);
    act(() => {
      root.unmount();
    });
  });
});
