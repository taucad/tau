/**
 * Electron main process entry.
 *
 * Main owns window creation and delegates the Tau utility-process bridge
 * to `@taucad/runtime/electron/main`.
 */

import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';
import { installElectronRuntimeHeaders, registerElectronRuntimeMain } from '@taucad/runtime/electron/main';
import utilityEntry from '../tau/kernel-host?modulePath';

process.on('uncaughtException', (error) => {
  console.error('[tau-electron:main] uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[tau-electron:main] unhandledRejection', reason);
});

const isDevelopment = process.env.ELECTRON_RENDERER_URL !== undefined;

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, '../preload/preload.mjs'),
      sandbox: false,
    },
  });

  await (isDevelopment
    ? window.loadURL(process.env.ELECTRON_RENDERER_URL!)
    : window.loadFile(join(import.meta.dirname, '../renderer/index.html')));

  window.show();
  return window;
}

export const bootstrapElectronApp = async (): Promise<void> => {
  await app.whenReady();
  installElectronRuntimeHeaders();
  registerElectronRuntimeMain({
    env: { ...process.env },
    onError(error) {
      console.error('[tau-electron:main] runtime bridge failed', error);
    },
    serviceName: 'tau-kernel-host',
    utilityEntry,
  });
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/* Electron delays `ready` until main ESM module evaluation completes, so
 * bootstrap must be detached rather than awaited at top level. */
/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- see comment above */
bootstrapElectronApp().catch((error: unknown) => {
  console.error('[tau-electron:main] bootstrap failed', error);
  app.exit(1);
});
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */
