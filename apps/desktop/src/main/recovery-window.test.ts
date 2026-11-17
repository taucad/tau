import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRecoveryActionHandler,
  createRecoveryHooks,
  createRecoveryWindowController,
  parseRecoveryAction,
  recoveryFallbackButtons,
  recoveryPartition,
} from '#main/recovery-window.js';
import type { RecoveryActions, RecoveryWindowLike } from '#main/recovery-window.js';
import { readPendingResets, requestReset } from '#main/recovery-resets.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  const observed = {
    ...actual,
    rmSync: vi.fn(actual.rmSync),
    unlinkSync: vi.fn(actual.unlinkSync),
    rmdirSync: vi.fn(actual.rmdirSync),
  };
  return { ...observed, default: observed };
});

/** A BrowserWindow stand-in whose web contents emit like Electron's. */
const fakeWindow = () => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- Electron's emitters are Node EventEmitters.
  const contents = new EventEmitter();
  // oxlint-disable-next-line unicorn/prefer-event-target -- Electron's emitters are Node EventEmitters.
  const events = new EventEmitter();
  const window = {
    contents,
    events,
    webContents: {
      id: 77,
      send: vi.fn(),
      isDestroyed: () => false,
      on: (event: string, listener: (...args: never[]) => void) =>
        contents.on(event, listener as (...args: unknown[]) => void),
    },
    loadFile: vi.fn(async () => undefined),
    focus: vi.fn(),
    show: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: () => false,
    once: (event: string, listener: (...args: unknown[]) => void) => {
      events.once(event, listener);
    },
  } satisfies RecoveryWindowLike & { readonly contents: EventEmitter; readonly events: EventEmitter };
  return window;
};

const controllerFor = (window = fakeWindow()) => {
  const createWindow = vi.fn(() => window);
  const showMessageBox = vi.fn(async () => ({ response: 3 }));
  const fallback = {
    restartInSafeMode: vi.fn(async () => true),
    downloadTau: vi.fn(async () => undefined),
    showLogs: vi.fn(),
    quit: vi.fn(),
  };
  const report = vi.fn();
  const controller = createRecoveryWindowController({
    createWindow,
    page: '/resources/recovery/index.html',
    preload: '/dist/preload/recovery-preload.cjs',
    showMessageBox,
    fallback,
    report,
    log: vi.fn(),
  });
  return { controller, createWindow, showMessageBox, fallback, report, window };
};

let userData: string | undefined;
afterEach(async () => {
  vi.clearAllMocks();
  if (userData !== undefined) {
    await rm(userData, { recursive: true, force: true });
    userData = undefined;
  }
});

describe('recovery window (T-R12.6)', () => {
  it('should load its static page with loadFile in the in-memory tau-recovery partition', async () => {
    const { controller, createWindow, window, report } = controllerFor();
    controller.open('load-failed');
    expect(createWindow).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        width: 520,
        height: 560,
        webPreferences: expect.objectContaining({
          partition: recoveryPartition,
          preload: '/dist/preload/recovery-preload.cjs',
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        }) as unknown,
      }),
    );
    expect(recoveryPartition).toBe('tau-recovery');
    expect(recoveryPartition.startsWith('persist:')).toBe(false);
    expect(window.loadFile).toHaveBeenCalledExactlyOnceWith('/resources/recovery/index.html');
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { surface: 'window', trigger: 'load-failed' } }),
    );
    /* A second request focuses the window it already has. */
    controller.open('requested');
    expect(createWindow).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalled();
    expect(controller.isRecoveryContents(window.webContents)).toBe(true);
    expect(controller.isRecoveryContents({ id: 1 })).toBe(false);
  });

  it('should fall back to the native dialog with four actions when its own load fails', async () => {
    const { controller, window, showMessageBox, fallback, report } = controllerFor();
    controller.open('load-failed');
    window.contents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///missing', true);
    await vi.waitFor(() => {
      expect(showMessageBox).toHaveBeenCalledOnce();
    });
    expect(showMessageBox.mock.calls[0]).toEqual([
      expect.objectContaining({ buttons: ['Restart in Safe Mode', 'Download Tau', 'Show Logs', 'Quit'] }),
    ]);
    expect(recoveryFallbackButtons).toEqual(['Restart in Safe Mode', 'Download Tau', 'Show Logs', 'Quit']);
    await vi.waitFor(() => {
      expect(fallback.quit).toHaveBeenCalledOnce();
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { surface: 'dialog', trigger: 'load-failed' } }),
    );
  });

  it('should fall back to the native dialog when its renderer dies, and act on each choice', async () => {
    const { controller, window, showMessageBox, fallback } = controllerFor();
    showMessageBox
      .mockResolvedValueOnce({ response: 2 })
      .mockResolvedValueOnce({ response: 1 })
      .mockResolvedValueOnce({ response: 0 });
    controller.open('shell-timeout');
    window.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await vi.waitFor(() => {
      expect(fallback.restartInSafeMode).toHaveBeenCalledOnce();
    });
    expect(fallback.showLogs).toHaveBeenCalledOnce();
    expect(fallback.downloadTau).toHaveBeenCalledOnce();
    expect(showMessageBox).toHaveBeenCalledTimes(3);
  });

  it('should destroy the failed recovery window before showing the native dialog', async () => {
    const { controller, window, showMessageBox } = controllerFor();
    controller.open('load-failed');
    window.contents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///missing', true);
    expect(window.destroy).toHaveBeenCalledOnce();
    expect(controller.isOpen()).toBe(false);
    await vi.waitFor(() => {
      expect(showMessageBox).toHaveBeenCalledOnce();
    });
  });

  it('should show the native dialog again when the safe-mode restart is refused, and leave once it is accepted', async () => {
    const { controller, window, showMessageBox, fallback } = controllerFor();
    showMessageBox.mockResolvedValueOnce({ response: 0 }).mockResolvedValueOnce({ response: 0 });
    fallback.restartInSafeMode.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    controller.open('shell-timeout');
    window.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
    await vi.waitFor(() => {
      expect(fallback.restartInSafeMode).toHaveBeenCalledTimes(2);
    });
    expect(showMessageBox).toHaveBeenCalledTimes(2);
    expect(fallback.quit).not.toHaveBeenCalled();
  });

  it('should fall back to the native dialog when loadFile rejects', async () => {
    const window = fakeWindow();
    window.loadFile.mockRejectedValueOnce(new Error('ERR_FILE_NOT_FOUND'));
    const { controller, showMessageBox } = controllerFor(window);
    controller.open('load-failed');
    await vi.waitFor(() => {
      expect(showMessageBox).toHaveBeenCalledOnce();
    });
  });

  it('should ignore a sub-frame load failure in its own page', () => {
    const { controller, window, showMessageBox } = controllerFor();
    controller.open('load-failed');
    window.contents.emit('did-fail-load', {}, -6, 'ERR', 'file:///x', false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });
});

describe('recovery actions (T-R12.6)', () => {
  const actions = () => {
    const fakes = {
      restart: vi.fn(async (_mode: 'normal' | 'safe') => undefined),
      showLogs: vi.fn(),
      copyDiagnostics: vi.fn(async () => undefined),
      openRecoveryWindow: vi.fn(),
      checkForUpdates: vi.fn(async () => undefined),
      installUpdate: vi.fn(async () => undefined),
      cancelAutoInstall: vi.fn(),
      downloadTau: vi.fn(async () => undefined),
      resetsChanged: vi.fn(),
    } satisfies RecoveryActions;
    return fakes;
  };

  it('should parse only the actions the specification names', () => {
    expect(parseRecoveryAction({ type: 'restart', mode: 'safe' })).toEqual({ type: 'restart', mode: 'safe' });
    expect(parseRecoveryAction({ type: 'reset', store: 'caches' })).toEqual({ type: 'reset', store: 'caches' });
    expect(parseRecoveryAction({ type: 'reset', store: 'home' })).toBeUndefined();
    expect(parseRecoveryAction({ type: 'restart', mode: 'turbo' })).toBeUndefined();
    expect(parseRecoveryAction({ type: 'delete-everything' })).toBeUndefined();
    expect(parseRecoveryAction('show-logs')).toBeUndefined();
  });

  it('should refuse an action from an untrusted sender', async () => {
    const run = actions();
    const handle = createRecoveryActionHandler({
      userData: '/never',
      senderOf: () => undefined,
      actions: run,
    });
    await expect(handle({ type: 'show-logs' }, { sender: { id: 9 } })).rejects.toThrow(/refused/u);
    expect(run.showLogs).not.toHaveBeenCalled();
  });

  it('should let the app renderer send only the first four actions and a local-database reset', async () => {
    userData = await mkdtemp(join(tmpdir(), 'tau-recovery-actions-'));
    const run = actions();
    const handle = createRecoveryActionHandler({ userData, senderOf: () => 'app', actions: run });
    await handle({ type: 'restart', mode: 'safe' }, {});
    await handle({ type: 'show-logs' }, {});
    await handle({ type: 'copy-diagnostics' }, {});
    await handle({ type: 'open-recovery-window' }, {});
    await handle({ type: 'reset', store: 'local-database' }, {});
    expect(run.restart).toHaveBeenCalledWith('safe');
    expect(run.openRecoveryWindow).toHaveBeenCalledOnce();
    for (const refused of [
      { type: 'install-update' },
      { type: 'check-for-updates' },
      { type: 'download-tau' },
      { type: 'cancel-auto-install' },
      { type: 'reset', store: 'folder-list' },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each refusal is checked on its own.
      await expect(handle(refused, {})).rejects.toThrow(/refused/u);
    }
    expect(run.installUpdate).not.toHaveBeenCalled();
    expect(readPendingResets(userData)).toEqual(['local-database']);
  });

  it('should let the recovery window send every action, and record a reset without deleting anything', async () => {
    userData = await mkdtemp(join(tmpdir(), 'tau-recovery-actions-'));
    await writeFile(join(userData, 'granted-roots.json'), '[]');
    const run = actions();
    const handle = createRecoveryActionHandler({ userData, senderOf: () => 'recovery', actions: run });
    await handle({ type: 'install-update' }, {});
    await handle({ type: 'check-for-updates' }, {});
    await handle({ type: 'download-tau' }, {});
    await handle({ type: 'cancel-auto-install' }, {});
    await handle({ type: 'restart', mode: 'normal' }, {});
    await handle({ type: 'reset', store: 'folder-list' }, {});
    expect(run.installUpdate).toHaveBeenCalledOnce();
    expect(run.checkForUpdates).toHaveBeenCalledOnce();
    expect(run.downloadTau).toHaveBeenCalledOnce();
    expect(run.restart).toHaveBeenCalledWith('normal');
    expect(run.resetsChanged).toHaveBeenCalledOnce();
    expect(readPendingResets(userData)).toEqual(['folder-list']);
    expect(fs.existsSync(join(userData, 'granted-roots.json'))).toBe(true);
    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(fs.rmdirSync).not.toHaveBeenCalled();
    requestReset(userData, 'folder-list');
    expect(readPendingResets(userData)).toEqual(['folder-list']);
  });
});

describe('recovery hooks for the watchdog and the reload policy', () => {
  const hooks = (prepared = true) => {
    const controller = { open: vi.fn() };
    const prepareToQuit = vi.fn(async () => prepared);
    const relaunch = vi.fn(async () => undefined);
    const quit = vi.fn();
    const log = vi.fn();
    return {
      controller,
      prepareToQuit,
      relaunch,
      quit,
      log,
      ...createRecoveryHooks({ controller, prepareToQuit, relaunch, quit, log }),
    };
  };

  it('should open the recovery window for the trigger it is given', () => {
    const { openRecovery, controller } = hooks();
    openRecovery('renderer-deaths');
    expect(controller.open).toHaveBeenCalledExactlyOnceWith('renderer-deaths');
  });

  it('should restart in safe mode through the quit owner, then relaunch with --safe-mode and quit', async () => {
    const { restartInSafeMode, prepareToQuit, relaunch, quit } = hooks();
    expect(await restartInSafeMode()).toBe(true);
    expect(prepareToQuit).toHaveBeenCalledExactlyOnceWith('restart', 'safe-mode');
    expect(relaunch).toHaveBeenCalledExactlyOnceWith(['--safe-mode']);
    expect(quit).toHaveBeenCalledOnce();
    expect(prepareToQuit.mock.invocationCallOrder[0]).toBeLessThan(relaunch.mock.invocationCallOrder[0]!);
  });

  it('should restart normally without the switch', async () => {
    const { restartNormally, relaunch } = hooks();
    await restartNormally();
    expect(relaunch).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('should neither relaunch nor quit when the quit owner keeps the app open, and say so', async () => {
    const { restartInSafeMode, relaunch, quit } = hooks(false);
    expect(await restartInSafeMode()).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });

  it('should still quit when the relaunch itself fails, and log it', async () => {
    const { restartInSafeMode, relaunch, quit, log } = hooks();
    relaunch.mockRejectedValueOnce(new Error('spawn EAGAIN'));
    await restartInSafeMode();
    expect(log).toHaveBeenCalledWith('error', 'main.relaunch-failed', expect.anything());
    expect(quit).toHaveBeenCalledOnce();
  });
});
