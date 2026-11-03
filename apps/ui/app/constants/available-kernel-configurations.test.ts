import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';
import { picogkBrowserAssets } from '#runtime/picogk-browser-assets.js';
import { desktopBridge } from '#filesystem/desktop-bridge.js';

vi.mock('#runtime/picogk-browser-assets.js', () => ({ picogkBrowserAssets: vi.fn() }));
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
});

describe('available kernel configurations', () => {
  it('should expose browser PicoGK only with a prepared bundle', () => {
    expect(availableKernelConfigurations().some(({ id }) => id === 'picogk')).toBe(false);
    vi.mocked(picogkBrowserAssets).mockReturnValue({ url: '/picogk/manifest.json', sha256: 'a'.repeat(64) });
    expect(availableKernelConfigurations().some(({ id }) => id === 'picogk')).toBe(true);
    expect(availableKernelConfigurations().some(({ id }) => id === 'build123d')).toBe(false);
  });

  it('should retain native host availability without browser preparation', () => {
    vi.mocked(desktopBridge, { partial: true }).mockReturnValue({ runtimeKernelIds: ['picogk', 'build123d'] });
    expect(availableKernelConfigurations().filter(({ id }) => ['picogk', 'build123d'].includes(id))).toHaveLength(2);
  });
});
