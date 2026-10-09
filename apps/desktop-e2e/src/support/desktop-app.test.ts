import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { _electron as electron } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { desktopDescendants, launchDesktopApp } from '#support/desktop-app.js';

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
        Reflect.apply(configure, undefined, [ownedWindow, title]);
        return undefined;
      });
      application.firstWindow.mockResolvedValue(page);
      application.browserWindow.mockResolvedValue(typedWindowHandle);
      const launch = vi.spyOn(electron, 'launch').mockResolvedValueOnce(application);
      try {
        const options = { token: 'fixture-token', profileRoot, visible: true, windowTitle };
        await expect(launchDesktopApp(options)).rejects.toThrow('The desktop shell did not survive launch.');
        expect(application.browserWindow).toHaveBeenCalledTimes(windowTitle === undefined ? 0 : 1);
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
