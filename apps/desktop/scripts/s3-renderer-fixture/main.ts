/**
 * S3 renderer comparison desktop fixture (Q3, D18). Dev-only Electron main that
 * serves the built harness (`out/s3-renderer/app`) through Tau's own `app://`
 * protocol, Content-Security-Policy, permission grants and navigation policy,
 * so both candidates load exactly as the packaged renderer would. It has no
 * preload, no IPC and no shell: external opens are recorded, never performed.
 *
 * Bundled and launched by `apps/ui/scripts/s3-renderer/run.mts`.
 */
import process from 'node:process';
import { app, BrowserWindow, clipboard, net, protocol, session } from 'electron';
import { appOrigin, appSchemePrivileges, registerAppProtocol } from '#main/app-protocol.js';
import {
  contentSecurityPolicy,
  isPermissionGranted,
  navigationDecision,
  rendererOrigins,
} from '#main/navigation-policy.js';

type MetricSample = { at: number; cpuPercent: number; workingSetKiB: number; byType: Record<string, number> };

const {
  S3_CLIENT_ROOT: clientRoot,
  S3_USER_DATA: userData,
  S3_WINDOW_WIDTH: windowWidth,
  S3_WINDOW_HEIGHT: windowHeight,
} = process.env;
if (!clientRoot) {
  throw new Error('S3_CLIENT_ROOT is required.');
}
/* A fresh profile per launch: sessions sharing one never contend for its lock or inherit its caches. */
if (userData) {
  app.setPath('userData', userData);
}
const width = Number(windowWidth ?? '1280');
const height = Number(windowHeight ?? '960');

protocol.registerSchemesAsPrivileged([...appSchemePrivileges]);
const origins = rendererOrigins({ appOrigin });
const events: string[] = [];
const samples: MetricSample[] = [];
let sampler: NodeJS.Timeout | undefined;

const sample = (): void => {
  const metrics = app.getAppMetrics();
  const byType: Record<string, number> = {};
  let cpuPercent = 0;
  let workingSetKiB = 0;
  for (const metric of metrics) {
    cpuPercent += metric.cpu.percentCPUUsage;
    workingSetKiB += metric.memory.workingSetSize;
    byType[metric.type] = (byType[metric.type] ?? 0) + metric.memory.workingSetSize;
  }
  samples.push({ at: Date.now(), cpuPercent, workingSetKiB, byType });
};

/* Reached from the driver through Playwright's `electronApp.evaluate`; nothing in the renderer can call it. */
Object.assign(globalThis, {
  s3Main: {
    events,
    /**
     * Start collecting app metrics.
     *
     * @param sampleInterval - Milliseconds between samples.
     */
    startSampling(sampleInterval: number) {
      samples.length = 0;
      app.getAppMetrics();
      sampler = setInterval(sample, sampleInterval);
    },
    stopSampling() {
      clearInterval(sampler);
      sampler = undefined;
      return [...samples];
    },
    clipboardText: () => clipboard.readText(),
    setClipboardText: (text: string) => {
      clipboard.writeText(text);
    },
    gpuFeatureStatus: () => app.getGPUFeatureStatus(),
    gpuInfo: async () => app.getGPUInfo('basic'),
  },
});

const createWindow = async (): Promise<void> => {
  const window = new BrowserWindow({
    width,
    height,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /* Measurements must not be distorted by background throttling under Xvfb or an occluded window. */
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    events.push(`window-open ${navigationDecision(url, origins)} ${url}`);
    return { action: 'deny' };
  });
  const guard =
    (event: 'will-navigate' | 'will-redirect') =>
    (navigation: { preventDefault: () => void }, url: string): void => {
      const decision = navigationDecision(url, origins);
      if (decision !== 'allow') {
        navigation.preventDefault();
        events.push(`${event} ${decision} ${url}`);
      }
    };
  window.webContents.on('will-navigate', guard('will-navigate'));
  window.webContents.on('will-redirect', guard('will-redirect'));
  window.webContents.on('render-process-gone', (_event, details) =>
    events.push(`render-process-gone ${details.reason} exit=${details.exitCode}`),
  );
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') {
      events.push(`console-${event.level} ${event.message.slice(0, 300)}`);
    }
  });
  await window.loadURL(`${appOrigin}/`);
};

const start = async (): Promise<void> => {
  await app.whenReady();
  registerAppProtocol({ clientRoot, protocol, net, contentSecurityPolicy: contentSecurityPolicy([]) });
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    const granted = isPermissionGranted(permission);
    events.push(`permission-request ${permission} ${granted ? 'granted' : 'denied'}`);
    callback(granted);
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => isPermissionGranted(permission));
  app.on('child-process-gone', (_event, details) =>
    events.push(`child-process-gone ${details.type} ${details.reason}`),
  );
  await createWindow();
};

/* Bundled as CommonJS: Playwright's Electron launcher instruments a CommonJS main, so no top-level await. */
// oxlint-disable-next-line promise/prefer-await-to-then, unicorn/prefer-top-level-await -- The esbuild CommonJS bundle cannot use top-level await; the rejection handler exits the fixture.
start().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  app.exit(1);
});
