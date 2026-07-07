import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';
import { installElectronRuntimeHeaders, registerElectronRuntimeMain } from '@taucad/runtime/electron/main';

const isDevelopment = process.env['ELECTRON_RENDERER_URL'] !== undefined;

const createMainWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, '../preload/preload.js'),
      sandbox: false,
    },
  });

  await (isDevelopment
    ? window.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    : window.loadFile(join(import.meta.dirname, '../renderer/index.html')));

  window.show();
  return window;
};

const bootstrap = async (): Promise<void> => {
  await app.whenReady();
  installElectronRuntimeHeaders();
  registerElectronRuntimeMain({
    env: {
      ...process.env,
      TAU_PROJECT_ROOT: process.env['TAU_PROJECT_ROOT'] ?? join(process.cwd(), 'workspace'),
    },
    serviceName: 'tau-react-e2e-kernel-host',
    utilityEntry: join(import.meta.dirname, 'kernel-host.js'),
  });
  await createMainWindow();
};

app.on('window-all-closed', () => {
  app.quit();
});

/* Electron delays `ready` until main ESM module evaluation completes, so
 * bootstrap must be detached rather than awaited at top level. */
/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- see comment above */
bootstrap().catch((error: unknown) => {
  console.error('[tau-react-e2e:main] bootstrap failed', error);
  app.exit(1);
});
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */
