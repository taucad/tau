import type { Stats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { isManagedAppImage } from '#main/managed-appimage.js';

vi.mock('node:fs/promises', () => ({ lstat: vi.fn(), realpath: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const path = '/opt/tau-staging-appimage/releases/1.0.1/Tau.AppImage';
const options = { path, channel: 'staging', version: '1.0.1' } as const;
const trusted = () => {
  vi.mocked(realpath).mockResolvedValue(path);
  vi.mocked(lstat).mockImplementation(async (entry) =>
    mock<Stats>({
      uid: 0,
      mode: 0o755,
      isFile: () => entry === path,
      isDirectory: () => entry !== path,
    }),
  );
};
describe('managed AppImage ownership', () => {
  it('should keep portable images outside the system-managed updater', async () => {
    expect(await isManagedAppImage({ ...options, path: '/home/test/Tau.AppImage' })).toBe(false);
    expect(lstat).not.toHaveBeenCalled();
  });
  it('should admit only a protected canonical generation', async () => {
    trusted();
    expect(await isManagedAppImage(options)).toBe(true);
    expect(lstat).toHaveBeenCalledWith('/');
  });
  it('should reject a selector alias instead of a pinned generation', async () => {
    trusted();
    await expect(
      isManagedAppImage({ ...options, path: '/opt/tau-staging-appimage/current/Tau.AppImage' }),
    ).rejects.toThrow('canonical immutable generation');
  });
  it.each([
    { uid: 1000, mode: 0o755 },
    { uid: 0, mode: 0o775 },
  ])('should reject writable or user-owned ancestors: %j', async (permissions) => {
    trusted();
    vi.mocked(lstat).mockImplementation(async (entry) =>
      mock<Stats>({
        uid: 0,
        mode: 0o755,
        ...(entry === '/opt' ? permissions : {}),
        isFile: () => entry === path,
        isDirectory: () => entry !== path,
      }),
    );
    await expect(isManagedAppImage(options)).rejects.toThrow('root-owned and not user-writable');
  });
  it('should reject symlink traversal', async () => {
    trusted();
    vi.mocked(realpath).mockResolvedValue('/home/test/image');
    await expect(isManagedAppImage(options)).rejects.toThrow('canonical immutable generation');
  });
});
