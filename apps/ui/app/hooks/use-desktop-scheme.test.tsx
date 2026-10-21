// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDesktopScheme } from '#hooks/use-desktop-scheme.js';
import { machineDeepLink } from '#utils/machine-url.utils.js';

const MachineLink = (): React.JSX.Element => {
  const scheme = useDesktopScheme();
  const href = machineDeepLink({ hostId: 'local', machineId: 'Printer α' }, scheme);
  return <a href={href}>{href}</a>;
};
const originalEnvironment = globalThis.window.ENV;
afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.window.ENV = originalEnvironment;
});

describe('browser desktop channel hydration', () => {
  it('hydrates existing server links without a mismatch then selects Windows staging', async () => {
    vi.stubGlobal('location', { origin: 'https://taucad.dev' });
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    const container = document.createElement('div');
    container.innerHTML = renderToString(<MachineLink />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('tau://machines/local/Printer%20%CE%B1');
    document.body.append(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <MachineLink />, { onRecoverableError });
      });
      expect(container.querySelector('a')?.getAttribute('href')).toBe('tau-staging://machines/local/Printer%20%CE%B1');
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root?.unmount();
      });
      container.remove();
    }
  });
  it('uses the host-bound origin when copying a machine link inside the staged desktop renderer', () => {
    vi.stubGlobal('location', { protocol: 'app:', origin: 'app://tau' });
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Host-injected environment contract.
    globalThis.window.ENV = { ...originalEnvironment, TAU_FRONTEND_URL: 'https://taucad.dev' };
    const { result } = renderHook(() => useDesktopScheme());
    expect(result.current).toBe('tau-staging');
  });
  it('keeps Mac staging on the existing protocol', () => {
    vi.stubGlobal('location', { origin: 'https://taucad.dev' });
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' });
    const { result } = renderHook(() => useDesktopScheme());
    expect(result.current).toBe('tau');
  });
});
