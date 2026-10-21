import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as files from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import type * as ChildProcess from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchUpdateDescriptor,
  launchWindowsUpdate,
  verifyDownloadedUpdate,
  startPlatformUpdater,
} from '#main/update-platform.js';
import type { DesktopUpdateDescriptor } from '#main/update-identity.js';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), spawn: vi.fn(), markHealthy: vi.fn(), checkForUpdates: vi.fn() }));
/* eslint-disable @typescript-eslint/naming-convention -- Mirror the upstream constructor export names. */
// oxlint-disable-next-line typescript/no-extraneous-class -- Mock actual constructor identities used by extends and instanceof.
vi.mock('electron-updater', () => ({ Provider: class {}, NsisUpdater: class {} }));
/* eslint-enable @typescript-eslint/naming-convention -- End upstream constructor exports. */
vi.mock('#main/update-appimage.js', () => ({
  createSafeAppImageUpdater: () => ({
    markHealthy: mocks.markHealthy,
    checkForUpdates: mocks.checkForUpdates,
    on: vi.fn(),
    netSession: { webRequest: { onBeforeRequest: vi.fn() } },
  }),
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof files>();
  return { ...original, readFile: vi.fn(original.readFile), realpath: vi.fn(original.realpath) };
});
vi.mock('electron', () => ({ app: { getAppPath: () => '/app' }, net: { fetch: mocks.fetch } }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcess>()),
  spawn: mocks.spawn,
}));
afterEach(() => vi.clearAllMocks());
describe('platform update transport and launch', () => {
  it.each([false, true])(
    'observes APT generations with app updates disabled and rejects wrong qualification source=%s',
    async (wrongSource) => {
      const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
      Object.defineProperty(process, 'resourcesPath', { value: '/resources', configurable: true });
      const marker = {
        schemaVersion: 1,
        route: 'linux-apt',
        tag: 'desktop@0.1.0',
        channel: 'production',
        version: '0.1.0',
        sourceCommit: 'a'.repeat(40),
        arch: 'x64',
        trust: 'release',
        cache: 'tau-updater',
      };
      const reader = vi
        .spyOn(files, 'readFile')
        .mockImplementation(async (path) =>
          JSON.stringify(
            path === '/app/package.json'
              ? { version: marker.version, tauDesktop: { sourceCommit: marker.sourceCommit } }
              : typeof path === 'string' && path.startsWith('/opt/')
                ? { ...marker, tag: 'desktop@0.2.0', version: '0.2.0' }
                : marker,
          ),
        );
      const resolver = vi.spyOn(files, 'realpath').mockResolvedValue('/opt/tau/releases/0.2.0');
      try {
        const updater = await startPlatformUpdater({
          platform: 'linux',
          arch: 'x64',
          currentVersion: '0.1.0',
          packaged: true,
          ...(wrongSource
            ? { expectedUpdate: { tag: 'desktop@0.2.0', version: '0.2.0', sourceCommit: 'b'.repeat(40) } }
            : {}),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- These are the managed environment variable names.
          environment: { TAU_DESKTOP_UPDATES: 'off', TAU_ACQUISITION: 'locked' },
          autoUpdater: { on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn() },
          fetchJson: vi.fn(),
          prepareToRestart: vi.fn(),
          prepareToInstall: vi.fn(),
          openExternal: vi.fn(),
          log: vi.fn(),
          schedule: vi.fn(),
        });
        await updater!.check();
        if (wrongSource) {
          expect(updater!.snapshot().phase).toBe('error');
          expect(updater!.status()).toContain('expected release source');
        } else {
          expect(updater!.snapshot()).toMatchObject({ phase: 'ready', version: '0.2.0', installOnQuit: false });
          expect(updater!.status()).toContain('APT installed');
        }
        expect(mocks.fetch).not.toHaveBeenCalled();
      } finally {
        reader.mockRestore();
        resolver.mockRestore();
        if (original) {
          Object.defineProperty(process, 'resourcesPath', original);
        } else {
          Reflect.deleteProperty(process, 'resourcesPath');
        }
      }
    },
  );
  it('retries a failed running-image lookup on the same backend before acknowledging health', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
    Object.defineProperty(process, 'resourcesPath', { value: '/resources', configurable: true });
    const marker = {
      schemaVersion: 1,
      route: 'linux-appimage',
      tag: 'desktop@0.1.0',
      channel: 'production',
      version: '0.1.0',
      sourceCommit: 'a'.repeat(40),
      arch: 'x64',
      trust: 'release',
      cache: 'tau-updater',
      keys: { fixture: 'fixture public key' },
    };
    const reader = vi
      .spyOn(files, 'readFile')
      .mockImplementation(async (path) =>
        JSON.stringify(
          path === '/app/package.json'
            ? { version: marker.version, tauDesktop: { sourceCommit: marker.sourceCommit } }
            : marker,
        ),
      );
    const confirmHealthy = vi.fn(async () => true);
    mocks.fetch.mockRejectedValue(new Error('temporary offline baseline lookup'));
    try {
      const updater = await startPlatformUpdater({
        platform: 'linux',
        arch: 'x64',
        currentVersion: '0.1.0',
        packaged: true,
        environment: {},
        autoUpdater: { on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), quitAndInstall: vi.fn() },
        fetchJson: vi.fn(),
        prepareToRestart: vi.fn(),
        prepareToInstall: vi.fn(),
        openExternal: vi.fn(),
        log: vi.fn(),
        schedule: vi.fn(),
        confirmHealthy,
      });
      await updater!.check();
      expect(updater!.snapshot().phase).toBe('error');
      expect(mocks.markHealthy).not.toHaveBeenCalled();
      expect(mocks.checkForUpdates).not.toHaveBeenCalled();
      const signedBaseline = { signed: 'immutable installed A envelope' };
      mocks.fetch.mockResolvedValue(new Response(JSON.stringify(signedBaseline)));
      await updater!.check();
      expect(mocks.fetch).toHaveBeenLastCalledWith(
        'https://downloads.tau.new/releases/desktop%400.1.0/desktop-update-linux-appimage-x64.json',
        expect.any(Object),
      );
      expect(confirmHealthy).toHaveBeenCalledOnce();
      expect(mocks.markHealthy).toHaveBeenCalledWith(signedBaseline);
      expect(mocks.checkForUpdates).toHaveBeenCalledOnce();
      expect(updater!.snapshot().phase).toBe('current');
    } finally {
      reader.mockRestore();
      mocks.fetch.mockReset();
      if (original) {
        Object.defineProperty(process, 'resourcesPath', original);
      } else {
        Reflect.deleteProperty(process, 'resourcesPath');
      }
    }
  });
  it('refuses redirects and bounds metadata bytes with a request deadline', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://evil.test' } }));
    await expect(fetchUpdateDescriptor('https://downloads.tau.new/latest/test.json')).rejects.toThrow(/refused/u);
    mocks.fetch.mockResolvedValueOnce(new Response('x'.repeat(32_769)));
    await expect(fetchUpdateDescriptor('https://downloads.tau.new/latest/test.json')).rejects.toThrow(/limit/u);
    mocks.fetch.mockResolvedValueOnce(new Response('{"schemaVersion":1}'));
    await expect(fetchUpdateDescriptor('https://downloads.tau.new/latest/test.json')).resolves.toEqual({
      schemaVersion: 1,
    });
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.any(String), {
      redirect: 'manual',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });
  it('rehashes actual downloaded bytes before installing even if length is unchanged', async () => {
    const directory = await files.mkdtemp(join(tmpdir(), 'tau-update-'));
    const path = join(directory, 'candidate.exe');
    const bytes = Buffer.from('candidate');
    const descriptor: DesktopUpdateDescriptor = {
      schemaVersion: 1,
      keyId: 'authenticode',
      tag: 'desktop@0.2.0',
      channel: 'production',
      version: '0.2.0',
      sourceCommit: 'a'.repeat(40),
      arch: 'x64',
      route: 'windows-nsis',
      path: 'releases/desktop%400.2.0/Tau-win32-x64.exe',
      size: bytes.length,
      sha512: createHash('sha512').update(bytes).digest('base64'),
      issuedAt: '2026-10-21T00:00:00Z',
      expiresAt: '2026-10-22T00:00:00Z',
    };
    try {
      await files.writeFile(path, bytes);
      await expect(verifyDownloadedUpdate(path, descriptor)).resolves.toBeUndefined();
      await files.writeFile(path, 'tampered!');
      await expect(verifyDownloadedUpdate(path, descriptor)).rejects.toThrow(/hash/u);
    } finally {
      await files.rm(directory, { recursive: true, force: true });
    }
  });
  it('waits for spawn and propagates asynchronous launch failure without a shell fallback', async () => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- Node child_process delivers spawn/error through EventEmitter.
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const failure = launchWindowsUpdate('/candidate.exe');
    child.emit('error', new Error('access denied'));
    await expect(failure).rejects.toThrow('access denied');
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/candidate.exe',
      ['--updated', '/S', '--force-run'],
      expect.objectContaining({ shell: false, detached: true }),
    );
    const success = launchWindowsUpdate('/candidate.exe');
    child.emit('spawn');
    await expect(success).resolves.toBeUndefined();
    expect(child.unref).toHaveBeenCalled();
  });
});
