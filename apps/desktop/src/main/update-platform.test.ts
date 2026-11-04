import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as files from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import type * as ChildProcess from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appImageRelaunchEnvironment,
  appImageRelaunchScript,
  fetchUpdateDescriptor,
  launchWindowsUpdate,
  relaunchAppImage,
  relaunchSwitches,
  verifyDownloadedUpdate,
  startPlatformUpdater,
} from '#main/update-platform.js';
import type { DesktopUpdateDescriptor } from '#main/update-identity.js';
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  spawn: vi.fn(),
  markHealthy: vi.fn(),
  checkForUpdates: vi.fn(),
  managed: vi.fn().mockResolvedValue(false),
}));
/* eslint-disable @typescript-eslint/naming-convention -- Mirror the upstream constructor export names. */
// oxlint-disable-next-line typescript/no-extraneous-class -- Mock actual constructor identities used by extends and instanceof.
vi.mock('electron-updater', () => ({ Provider: class {}, NsisUpdater: class {} }));
/* eslint-enable @typescript-eslint/naming-convention -- End upstream constructor exports. */
vi.mock('#main/managed-appimage.js', () => ({ isManagedAppImage: mocks.managed }));
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
afterEach(() => {
  vi.clearAllMocks();
  mocks.managed.mockResolvedValue(false);
});
describe('platform update transport and launch', () => {
  it('carries launch switches but not files, deep links or anything after -- into the updated process', () => {
    expect(
      relaunchSwitches([
        '/usr/bin/tau-staging',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--tau-route-qualification=nonce',
        'tau-staging://machines',
        '/home/tau/model.glb',
        '--',
        '--after-separator.glb',
      ]),
    ).toEqual([
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--tau-route-qualification=nonce',
    ]);
  });

  it.each([
    { wrongSource: false, managed: false },
    { wrongSource: true, managed: false },
    { wrongSource: false, managed: true },
    { wrongSource: true, managed: true },
  ])(
    'observes package-managed generations and rejects wrong qualification source: %j',
    async ({ wrongSource, managed }) => {
      mocks.managed.mockResolvedValue(managed);
      const original = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
      Object.defineProperty(process, 'resourcesPath', { value: '/resources', configurable: true });
      const marker = {
        schemaVersion: 1,
        route: managed ? 'linux-appimage' : 'linux-apt',
        ...(managed ? { keys: { fixture: 'fixture public key' } } : {}),
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
      const resolver = vi
        .spyOn(files, 'realpath')
        .mockResolvedValue(`/opt/tau${managed ? '-appimage' : ''}/releases/0.2.0`);
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
        expect(mocks.checkForUpdates).not.toHaveBeenCalled();
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
describe('AppImage relaunch', () => {
  const mount = '/tmp/.mount_Tau.Ap1fvY1k';
  it('drops the running image identity and every search path under its mount', () => {
    /* eslint-disable @typescript-eslint/naming-convention -- Environment names are the AppImage runtime's external contract. */
    expect(
      appImageRelaunchEnvironment({
        APPDIR: mount,
        APPIMAGE: '/opt/tau-staging-appimage/releases/1.7.43/Tau.AppImage',
        ARGV0: 'Tau.AppImage',
        OWD: '/home/tau',
        LD_LIBRARY_PATH: `${mount}/usr/lib:/opt/other/lib`,
        XDG_DATA_DIRS: `${mount}/usr/share:/usr/local/share:/usr/share`,
        DISPLAY: ':0',
      }),
    ).toEqual({ LD_LIBRARY_PATH: '/opt/other/lib', XDG_DATA_DIRS: '/usr/local/share:/usr/share', DISPLAY: ':0' });
    expect(appImageRelaunchEnvironment({ APPDIR: mount, LD_LIBRARY_PATH: `${mount}/usr/lib` })).toEqual({});
    expect(appImageRelaunchEnvironment({ LD_LIBRARY_PATH: '/opt/lib', PATH: '/usr/bin' })).toEqual({
      LD_LIBRARY_PATH: '/opt/lib',
      PATH: '/usr/bin',
    });
    /* eslint-enable @typescript-eslint/naming-convention -- End environment names. */
  });
  it('starts a detached host bash waiter instead of Electron relaunch and waits until it exists', async () => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- Node child_process delivers spawn/error through EventEmitter.
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    vi.stubEnv('APPDIR', mount);
    let relaunched: Promise<void>;
    try {
      relaunched = relaunchAppImage('/usr/bin/tau-staging-appimage', ['--ozone-platform=x11']);
    } finally {
      vi.unstubAllEnvs();
    }
    child.emit('spawn');
    await expect(relaunched).resolves.toBeUndefined();
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/bin/bash',
      ['-c', appImageRelaunchScript, 'tau-relaunch', '/usr/bin/tau-staging-appimage', '--ozone-platform=x11'],
      expect.objectContaining({ shell: false, detached: true, stdio: ['pipe', 'ignore', 'ignore'] }),
    );
    const options = (mocks.spawn.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }])[2];
    expect(options.env['APPDIR']).toBeUndefined();
    expect(child.unref).toHaveBeenCalled();
    await expect(relaunchAppImage('tau-staging-appimage', [])).rejects.toThrow(/absolute/u);
    const failure = relaunchAppImage('/usr/bin/tau-staging-appimage', []);
    child.emit('error', new Error('spawn EAGAIN'));
    await expect(failure).rejects.toThrow('spawn EAGAIN');
  });
  it.runIf(process.platform === 'linux')(
    'closes inherited descriptors and starts the target only after the parent end closes',
    async () => {
      const actual = await vi.importActual<typeof ChildProcess>('node:child_process');
      const directory = await files.mkdtemp(join(tmpdir(), 'tau-appimage-relaunch-'));
      const marker = join(directory, 'started');
      const target = join(directory, 'target.sh');
      const held = join(directory, 'held-on-old-mount');
      await files.writeFile(held, '');
      await files.writeFile(
        target,
        `#!/bin/sh\nfor f in /proc/$$/fd/*; do readlink "$f"; done > '${marker}.fds'\nprintf '%s\\n' "$@" > '${marker}'\n`,
        { mode: 0o755 },
      );
      const inherited = await files.open(held, 'r');
      try {
        const waiter = actual.spawn(
          '/bin/bash',
          ['-c', appImageRelaunchScript, 'tau-relaunch', target, '--ozone-platform=x11'],
          { stdio: ['pipe', 'ignore', 'ignore', inherited.fd] },
        );
        const exited = new Promise((resolve) => {
          waiter.once('exit', resolve);
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });
        await expect(files.access(marker)).rejects.toThrow();
        waiter.stdin?.destroy();
        await exited;
        expect(await files.readFile(marker, 'utf8')).toBe('--ozone-platform=x11\n');
        const descriptors = await files.readFile(`${marker}.fds`, 'utf8');
        expect(descriptors).not.toContain(held);
        expect(descriptors).not.toMatch(/pipe:|socket:/u);
      } finally {
        await inherited.close();
        await files.rm(directory, { recursive: true, force: true });
      }
    },
  );
});
