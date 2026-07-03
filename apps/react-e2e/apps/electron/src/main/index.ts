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
      preload: join(import.meta.dirname, '../preload/index.js'),
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

void bootstrap();
