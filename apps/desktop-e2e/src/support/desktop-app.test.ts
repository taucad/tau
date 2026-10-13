import { EventEmitter } from 'node:events';
import type { BrowserWindow, WebContents, WebContentsDidStartNavigationEventParams } from 'electron';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { _electron as electron } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { desktopDescendants, launchDesktopApp, observeDesktopNavigation } from '#support/desktop-app.js';

describe('desktop process ownership', () => {
  const snapshot =
    '100 1 Tau\n101 100 renderer\n102 101 PicoGK Worker\n103 102 PicoGK Nested Viewer\n200 1 PicoGK Foreign Viewer\n300 301 cycle\n301 300 PicoGK Cycle Viewer';

  it('should ignore foreign Viewers and retain every owned descendant command', () => {
    expect(desktopDescendants(100, '100 1 Tau\n101 100 PicoGK Direct Viewer')).toEqual([
      { pid: 101, command: 'PicoGK Direct Viewer' },
    ]);
    expect(desktopDescendants(100, snapshot)).toEqual([
      { pid: 101, command: 'renderer' },
      { pid: 102, command: 'PicoGK Worker' },
      { pid: 103, command: 'PicoGK Nested Viewer' },
    ]);
    expect(
      desktopDescendants(100, snapshot)
        .map(({ command }) => command)
        .join('\n'),
    ).toMatch(/PicoGK.*Viewer/u);
    expect(
      desktopDescendants(100, '100 1 Tau\n101 100 renderer\n200 1 PicoGK Foreign Viewer')
        .map(({ command }) => command)
        .join('\n'),
    ).not.toMatch(/PicoGK.*Viewer/u);
  });

  it.each([undefined, 0, -1, Number.NaN, 1.5, 999])('should refuse invalid or absent owner %s', (owner) => {
    expect(() => desktopDescendants(owner, snapshot)).toThrow('Electron owner is absent or invalid');
    expect(() => desktopDescendants(owner, snapshot)).toThrow(Error);
  });
});

describe('explicit manual desktop visibility', () => {
  it.each([true, false, undefined])(
    'should honor visible=%s while preserving hidden automated default',
    async (visible) => {
      const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-visibility-test-'));
      const stopped = new Error('Fixture stops before launching Electron.');
      const launch = vi.spyOn(electron, 'launch').mockRejectedValueOnce(stopped);
      try {
        const options = { token: 'fixture-token', profileRoot, visible };
        await expect(launchDesktopApp(options)).rejects.toBe(stopped);
        const environment = launch.mock.calls[0]![0]!.env!;
        expect(environment['TAU_E2E_HIDE_WINDOW']).toBe(visible === true ? '0' : '1');
      } finally {
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        launch.mockRestore();
        await rm(profileRoot, { recursive: true, force: true });
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
      }
    },
  );
});

describe('explicit manual desktop window identity', () => {
  it.each(['Tau candidate isolated manual', undefined])(
    'should configure only the owned window title %s',
    async (windowTitle) => {
      const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-title-test-'));
      const stopped = new Error('Fixture stops after initial window configuration.');
      const setTitle = vi.fn();
      const on = vi.fn();
      const ownedWindow = { setTitle, on };
      const application = mockDeep<Awaited<ReturnType<typeof electron.launch>>>();
      application.browserWindow.mockResolvedValue(mockDeep<Awaited<ReturnType<typeof application.browserWindow>>>());
      application.process.mockReturnValue(mockDeep<ReturnType<typeof application.process>>());
      application.context.mockReturnValue(mockDeep<ReturnType<typeof application.context>>());
      const page = mockDeep<Awaited<ReturnType<typeof application.firstWindow>>>();
      page.waitForLoadState.mockResolvedValue(undefined);
      page.setDefaultTimeout.mockImplementation(() => {
        throw stopped;
      });
      const typedWindowHandle = mockDeep<Awaited<ReturnType<typeof application.browserWindow>>>();
      typedWindowHandle.evaluate.mockImplementation(async (configure, title) => {
        if (typeof configure !== 'function') {
          throw new TypeError('Expected the owned window configuration callback.');
        }
        if (!Object.is(configure, observeDesktopNavigation)) {
          Reflect.apply(configure, undefined, [ownedWindow, title]);
        }
        return undefined;
      });
      application.firstWindow.mockResolvedValue(page);
      application.browserWindow.mockResolvedValue(typedWindowHandle);
      const launch = vi.spyOn(electron, 'launch').mockResolvedValueOnce(application);
      try {
        const options = { token: 'fixture-token', profileRoot, visible: true, windowTitle };
        await expect(launchDesktopApp(options)).rejects.toThrow('The desktop shell did not survive launch.');
        expect(application.browserWindow).toHaveBeenCalledTimes(windowTitle === undefined ? 1 : 2);
        if (windowTitle !== undefined) {
          expect(application.browserWindow).toHaveBeenCalledWith(page);
          expect(setTitle).toHaveBeenCalledWith(windowTitle);
          const update = on.mock.calls.find(([event]) => event === 'page-title-updated')?.[1] as
            | ((event: { preventDefault: () => void }) => void)
            | undefined;
          expect(update).toBeDefined();
          const preventDefault = vi.fn();
          update?.({ preventDefault });
          expect(preventDefault).toHaveBeenCalledOnce();
          expect(setTitle).toHaveBeenLastCalledWith(windowTitle);
        }
      } finally {
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        launch.mockRestore();
        await rm(profileRoot, { recursive: true, force: true });
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
      }
    },
  );
});

describe('explicit automated trace snapshot accommodation', () => {
  it.each([
    { configured: undefined, visible: false, manual: undefined, snapshots: true },
    { configured: 'true', visible: false, manual: undefined, snapshots: true },
    { configured: 'false', visible: false, manual: undefined, snapshots: false },
    { configured: 'false', visible: true, manual: undefined, snapshots: true },
    { configured: 'false', visible: false, manual: 'plugins', snapshots: true },
  ])(
    'should preserve trace controls for $configured / visible=$visible / manual=$manual',
    async ({ configured, visible, manual, snapshots }) => {
      vi.stubEnv('TAU_E2E_TRACE_SNAPSHOTS', configured);
      vi.stubEnv('TAU_E2E_OBSERVATION_MANUAL', manual);
      const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-trace-test-'));
      const stopped = new Error('Fixture stops at trace initialization.');
      const application = mockDeep<Awaited<ReturnType<typeof electron.launch>>>();
      application.browserWindow.mockResolvedValue(mockDeep<Awaited<ReturnType<typeof application.browserWindow>>>());
      application.process.mockReturnValue(mockDeep<ReturnType<typeof application.process>>());
      application.context.mockReturnValue(mockDeep<ReturnType<typeof application.context>>());
      const page = mockDeep<Awaited<ReturnType<typeof application.firstWindow>>>();
      const context = mockDeep<ReturnType<typeof page.context>>();
      context.tracing.start.mockRejectedValueOnce(stopped);
      page.context.mockReturnValue(context);
      application.firstWindow.mockResolvedValue(page);
      const launch = vi.spyOn(electron, 'launch').mockResolvedValueOnce(application);
      try {
        await expect(launchDesktopApp({ token: 'fixture-token', profileRoot, visible })).rejects.toThrow(
          'The desktop shell did not survive launch.',
        );
        expect(context.tracing.start).toHaveBeenCalledWith({ screenshots: true, snapshots });
        expect(page.setDefaultTimeout).toHaveBeenCalledWith(60_000);
      } finally {
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        launch.mockRestore();
        vi.unstubAllEnvs();
        await rm(profileRoot, { recursive: true, force: true });
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
      }
    },
  );

  it('should reject an invalid trace selector before launching', async () => {
    vi.stubEnv('TAU_E2E_TRACE_SNAPSHOTS', 'off');
    const launch = vi.spyOn(electron, 'launch');
    try {
      await expect(launchDesktopApp({ token: 'fixture-token' })).rejects.toThrow(
        'TAU_E2E_TRACE_SNAPSHOTS must be true or false.',
      );
      expect(launch).not.toHaveBeenCalled();
    } finally {
      launch.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe('initial main navigation readiness', () => {
  it.each([true, false])(
    'should reach owned exit with pending optional diagnostics after capture=%s',
    async (capture) => {
      const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-diagnostics-test-'));
      await mkdir(join(profileRoot, 'home'));
      await writeFile(join(profileRoot, 'home', 'retained.txt'), 'retained');
      const application = mockDeep<Awaited<ReturnType<typeof electron.launch>>>();
      const child = mockDeep<ReturnType<typeof application.process>>({ exitCode: 0 });
      application.evaluate.mockResolvedValue(undefined);
      application.process.mockReturnValue(child);
      application.context.mockReturnValue(mockDeep<ReturnType<typeof application.context>>());
      application.browserWindow.mockResolvedValue(mockDeep<Awaited<ReturnType<typeof application.browserWindow>>>());
      const page = mockDeep<Awaited<ReturnType<typeof application.firstWindow>>>();
      page.url.mockReturnValue('app://tau/');
      page.screenshot.mockResolvedValue(Buffer.alloc(0));
      const context = mockDeep<ReturnType<typeof page.context>>();
      context.tracing.stop.mockReturnValue(Promise.withResolvers<void>().promise);
      page.evaluate.mockReturnValue(Promise.withResolvers<string>().promise);
      page.context.mockReturnValue(context);
      application.firstWindow.mockResolvedValue(page);
      const launch = vi.spyOn(electron, 'launch').mockResolvedValueOnce(application);
      let directory: string | undefined;
      try {
        const session = await launchDesktopApp({ token: 'fixture-token', profileRoot, preserveProfile: true });
        application.evaluate.mockClear();
        if (capture) {
          const pending = session.capture(`bounded-${profileRoot.split('/').at(-1)}`);
          await vi.waitFor(() => {
            expect(context.tracing.stop).toHaveBeenCalledOnce();
          });
          const tracePath = context.tracing.stop.mock.calls[0]?.[0]?.path;
          if (!tracePath) {
            throw new Error('Expected the owned capture destination');
          }
          directory = dirname(tracePath);
          expect(await readFile(join(directory, 'diagnostics.log'), 'utf8')).toContain('retained.txt');
          expect(page.evaluate).not.toHaveBeenCalled();
          expect(await pending).toBe(directory);
          expect(await readFile(join(directory, 'diagnostics.log'), 'utf8')).toContain(
            '(unavailable: renderer collection deadline)',
          );
        }
        await session.close();
        expect(application.evaluate).toHaveBeenCalledOnce();
        expect(child.kill).not.toHaveBeenCalled();
        expect(context.tracing.stop).toHaveBeenCalledOnce();
      } finally {
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        launch.mockRestore();
        await rm(profileRoot, { recursive: true, force: true });
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
        if (directory) {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
    20_000,
  );

  it('should hold fixture setup until the initial document load finishes after DOM readiness', async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-load-test-'));
    const loaded = Promise.withResolvers<void>();
    const stopped = new Error('Fixture stops after initial load readiness.');
    const application = mockDeep<Awaited<ReturnType<typeof electron.launch>>>();
    const navigationHandle = mockDeep<Awaited<ReturnType<typeof application.browserWindow>>>();
    navigationHandle.evaluate.mockReturnValue(Promise.withResolvers<string>().promise);
    application.browserWindow.mockResolvedValue(navigationHandle);
    application.process.mockReturnValue(mockDeep<ReturnType<typeof application.process>>());
    application.context.mockReturnValue(mockDeep<ReturnType<typeof application.context>>());
    const page = mockDeep<Awaited<ReturnType<typeof application.firstWindow>>>();
    page.url.mockReturnValue('app://tau/');
    page.waitForURL.mockImplementation(async () => {
      await loaded.promise;
    });
    const context = mockDeep<ReturnType<typeof page.context>>();
    context.tracing.start.mockRejectedValueOnce(stopped);
    page.context.mockReturnValue(context);
    application.firstWindow.mockResolvedValue(page);
    const launch = vi.spyOn(electron, 'launch').mockResolvedValueOnce(application);
    const observeLaunch = async (): Promise<unknown> => {
      try {
        return await launchDesktopApp({ token: 'fixture-token', profileRoot });
      } catch (error) {
        return error;
      }
    };
    const pending = observeLaunch();
    try {
      await vi.waitFor(() => {
        expect(page.waitForURL).toHaveBeenCalledOnce();
      });
      const [acceptUrl, loadOptions] = page.waitForURL.mock.calls[0]!;
      if (typeof acceptUrl !== 'function') {
        throw new TypeError('Expected the initial app document URL predicate.');
      }
      expect(acceptUrl(new URL('about:blank'))).toBe(false);
      expect(acceptUrl(new URL('app://tau/'))).toBe(true);
      expect(acceptUrl(new URL('app://tau/import?desktop-open=1'))).toBe(true);
      expect(acceptUrl(new URL('https://foreign.example/'))).toBe(false);
      expect(loadOptions).toEqual({ waitUntil: 'load' });
      expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded');
      expect(application.evaluate).not.toHaveBeenCalled();
      expect(context.tracing.start).not.toHaveBeenCalled();
      loaded.resolve();
      const outcome = await pending;
      expect(outcome).toBeInstanceOf(Error);
      if (!(outcome instanceof Error)) {
        throw new TypeError('Expected the fixture trace stop.');
      }
      expect(outcome.message).toContain('The desktop shell did not survive launch.');
      expect(application.evaluate).toHaveBeenCalledOnce();
      expect(context.tracing.start).toHaveBeenCalledOnce();
    } finally {
      loaded.resolve();
      await pending;
      const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
      launch.mockRestore();
      await rm(profileRoot, { recursive: true, force: true });
      if (picked) {
        await rm(dirname(picked), { recursive: true, force: true });
      }
    }
  });
});

describe('owned main navigation diagnostics', () => {
  it('should retain bounded scalar navigation evidence without credentials or event interference', () => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- Electron WebContents uses Node EventEmitter semantics.
    const events = new EventEmitter();
    // oxlint-disable-next-line unicorn/prefer-event-target -- Electron BrowserWindow uses Node EventEmitter semantics.
    const windowEvents = new EventEmitter();
    const contents = mockDeep<WebContents>({ id: 37 });
    const window = mockDeep<BrowserWindow>({ webContents: contents });
    contents.on.mockImplementation((event, handler) => {
      events.on(event, handler);
      return contents;
    });
    contents.removeListener.mockImplementation((event, handler) => {
      events.removeListener(event, handler);
      return contents;
    });
    window.once.mockImplementation((event, handler) => {
      windowEvents.once(event, handler);
      return window;
    });
    window.removeListener.mockImplementation((event, handler) => {
      windowEvents.removeListener(event, handler);
      return window;
    });
    contents.getOSProcessId.mockReturnValue(91);
    contents.isDestroyed.mockReturnValue(false);
    contents.isLoading.mockReturnValue(true);
    contents.isLoadingMainFrame.mockReturnValue(true);
    contents.getURL.mockReturnValue('app://tau/workspace?token=secret#private');
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const preventDefault = vi.fn();
    try {
      observeDesktopNavigation(window, 'install');
      const navigation: WebContentsDidStartNavigationEventParams = {
        url: 'https://user:password@example.test/path?code=sensitive#fragment',
        isSameDocument: false,
        isMainFrame: true,
        frame: null,
      };
      // Installed Electron supplies details first and retains these deprecated positional arguments.
      events.emit('did-start-navigation', { ...navigation, preventDefault }, navigation.url, false, true, 92, 7);
      expect(log.mock.lastCall?.[1]).toContain('"frameProcessId":92');
      expect(log.mock.lastCall?.[1]).toContain('"isMainFrame":true');
      events.emit(
        'did-fail-provisional-load',
        { preventDefault },
        -3,
        'private error text',
        'app://tau/fixture?secret=value',
        true,
        92,
        7,
      );
      events.emit('will-prevent-unload', { preventDefault });
      const output = log.mock.calls.map(([, value]) => String(value)).join('\n');
      expect(output).toContain('"rendererPid":91');
      expect(output).toContain('"webContentsId":37');
      expect(output).toContain('"pathname":"/path"');
      expect(output).toContain('"frameRoutingId":7');
      expect(output).toContain('"errorCode":-3');
      expect(output).not.toMatch(/secret|password|sensitive|private|fragment|user:/u);
      expect(preventDefault).not.toHaveBeenCalled();
      for (let index = 0; index < 140; index++) {
        events.emit('did-start-loading');
      }
      expect(log).toHaveBeenCalledTimes(128);
      observeDesktopNavigation(window, 'snapshot');
      expect(log).toHaveBeenCalledTimes(129);
      expect(log.mock.lastCall?.[1]).toContain('"dropped":16');
      observeDesktopNavigation(window, 'dispose');
      observeDesktopNavigation(window, 'dispose');
      expect(events.eventNames()).toEqual([]);
      events.emit('did-finish-load');
      expect(log).toHaveBeenCalledTimes(129);
      observeDesktopNavigation(window, 'install');
      windowEvents.emit('closed');
      expect(events.eventNames()).toEqual([]);
    } finally {
      observeDesktopNavigation(window, 'dispose');
      log.mockRestore();
    }
  });
});
