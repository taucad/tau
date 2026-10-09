/* oxlint-disable no-await-in-loop -- Teardown steps are intentionally sequential. */
/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import type { BrowserWindow, DownloadItem, Event } from 'electron';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { expect } from 'vitest';
import { captureChatLogs, chatLogDestination } from '@taucad/formal/capture';
import {
  desktopE2EApiUrl,
  desktopE2ECompletedArtifact,
  desktopE2EFrontendUrl,
  desktopE2EPackagedExecutable,
} from '#support/config.js';

/**
 * Electron launch + diagnostics for the desktop smoke suite (work item Z1).
 *
 * Packaged-directory mode, exactly as the shell blueprint's L5 status section
 * describes: `electron.launch({ args: [apps/desktop] })` against the built
 * `dist/main/index.js`, with the three required environment names, the A7
 * `TAU_DESKTOP_TOKEN` seed and the `TAU_E2E_PICK_DIRECTORY` dialog override.
 * Every run gets a throwaway `--user-data-dir`, which is what makes a second
 * run idempotent: Home, the granted-root store and IndexedDB all start empty.
 */

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
/* Overridable because `nx run ui:dev:desktop` empties `apps/ui/desktop/build`
 * on start (it re-copies `public/` there): a developer's live desktop session
 * and this suite would otherwise fight over one directory. Point the suite at
 * a snapshot of a built bundle instead. */
const clientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'] ?? join(workspaceRoot, 'apps/ui/desktop/build/client');
const desktopRoot = join(workspaceRoot, 'apps/desktop');
const defaultPackagedExecutable = join(desktopRoot, 'package-out/Tau-darwin-arm64/Tau.app/Contents/MacOS/Tau');
const diagnosticsRoot = join(workspaceRoot, 'out/test-results/desktop-e2e');

/** Select the complete descendant command records from one successful ps snapshot. */
export const desktopDescendants = (
  electronPid: number | undefined,
  snapshot: string,
): ReadonlyArray<{ pid: number; command: string }> => {
  const records = snapshot
    .trim()
    .split('\n')
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
      return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? '' }] : [];
    });
  const parents = new Map(records.map(({ pid, parent }) => [pid, parent]));
  if (
    electronPid === undefined ||
    !Number.isSafeInteger(electronPid) ||
    electronPid <= 0 ||
    !parents.has(electronPid)
  ) {
    throw new Error('Electron owner is absent or invalid');
  }
  return records
    .filter(({ pid }) => {
      if (pid === electronPid) {
        return false;
      }
      const visited = new Set<number>();
      let current: number | undefined = pid;
      while (current && !visited.has(current)) {
        if (current === electronPid) {
          return true;
        }
        visited.add(current);
        current = parents.get(current);
      }
      return false;
    })
    .map(({ pid, command }) => ({ pid, command }));
};
const completedArtifactForbiddenEnvironment = [
  'NODE_OPTIONS',
  'NODE_PATH',
  'TAU_BUILD123D_RESOURCE_ROOT',
  'TAU_DESKTOP_CLIENT_ROOT',
  'TAU_PICOGK_RESOURCE_ROOT',
] as const;

/**
 * WebGPU launch profile. The default is the hardware adapter this Mac has;
 * headless runners without one set `TAU_E2E_WEBGPU_PROFILE=software`. Copied
 * from `apps/ui-e2e/src/support/webgpu-profile.ts` rather than imported —
 * cross-e2e-project source imports are not a dependency this suite should own.
 */
const webGpuArguments = (): readonly string[] => {
  const profile = process.env['TAU_E2E_WEBGPU_PROFILE'] ?? 'hardware';
  if (profile === 'software') {
    return ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'];
  }
  if (profile === 'hardware') {
    return ['--enable-unsafe-webgpu'];
  }
  throw new Error(`TAU_E2E_WEBGPU_PROFILE must be 'software' or 'hardware'; received '${profile}'.`);
};

/** One launched desktop app plus everything a spec needs to assert about it. */
export type DesktopSession = {
  readonly application: ElectronApplication;
  /** The app's node-backed Home, `<userData>/home`. */
  readonly homeRoot: string;
  readonly page: Page;
  /**
   * The shell's rotating diagnostics log. Main names this directory to the
   * kernel utility through `TAU_DESKTOP_LOG_DIR`, so the `kernel.engine` line
   * that carries the resolved engine version lands here (N6).
   */
  readonly logPath: string;
  /** The absolute path `window.tau.dialog.selectDirectory()` resolves to. */
  readonly pickedDirectory: string;
  /** Every PostHog-shaped request any renderer made since launch (D13: zero on desktop). */
  readonly analyticsRequests: readonly string[];
  /** Chromium net log begun before the first renderer navigation. */
  readonly startupNetworkLogPath: string | undefined;
  /** Write trace, screenshot, process output and `desktop.log` under `out/`. */
  readonly capture: (label: string) => Promise<string>;
  readonly close: () => Promise<void>;
};

/** Save and await the next download emitted by the packaged Electron session. */
export const captureNextDesktopDownload = async (
  desktopSession: DesktopSession,
  savePath: string,
  trigger: () => Promise<void>,
): Promise<{ readonly filename: string; readonly path: string }> => {
  await desktopSession.application.evaluate(({ session }, path) => {
    const state = globalThis as typeof globalThis & {
      __TAU_E2E_DOWNLOAD_CLEANUP__?: () => void;
      __TAU_E2E_DOWNLOAD__?: { readonly filename: string; readonly state: string };
    };
    state.__TAU_E2E_DOWNLOAD_CLEANUP__?.();
    delete state.__TAU_E2E_DOWNLOAD__;
    const listener = (_event: Event, item: DownloadItem): void => {
      item.setSavePath(path);
      item.once('done', (_doneEvent, doneState) => {
        state.__TAU_E2E_DOWNLOAD__ = { filename: item.getFilename(), state: doneState };
      });
      session.defaultSession.off('will-download', listener);
    };
    state.__TAU_E2E_DOWNLOAD_CLEANUP__ = () => {
      session.defaultSession.off('will-download', listener);
      delete state.__TAU_E2E_DOWNLOAD_CLEANUP__;
    };
    session.defaultSession.on('will-download', listener);
  }, savePath);
  let download: { readonly filename: string; readonly state: string } | undefined;
  try {
    await trigger();
    await expect
      .poll(
        async () => {
          download = await desktopSession.application.evaluate(() => {
            const state = globalThis as typeof globalThis & {
              __TAU_E2E_DOWNLOAD__?: { readonly filename: string; readonly state: string };
            };
            return state.__TAU_E2E_DOWNLOAD__;
          });
          return download;
        },
        { timeout: 180_000 },
      )
      .toBeDefined();
  } finally {
    await desktopSession.application.evaluate(() => {
      const state = globalThis as typeof globalThis & { __TAU_E2E_DOWNLOAD_CLEANUP__?: () => void };
      state.__TAU_E2E_DOWNLOAD_CLEANUP__?.();
    });
  }
  if (!download) {
    throw new Error('Electron reported no completed download after its session event settled.');
  }
  expect(download.state).toBe('completed');
  return { filename: download.filename, path: savePath };
};

/**
 * Launch the built desktop shell against the suite's dedicated API.
 *
 * @param options - The seeded bearer handed to main through A7, plus any extra
 *   environment the shell needs (`env`) — credential persistence and the
 *   like, all read at launch.
 * @returns The live session.
 */
/** PostHog through Tau's web proxy or directly. */
export const analyticsRequestPattern = /\/api\/ph(?:\/|$)|posthog\.com/iu;

export const launchDesktopApp = async (options: {
  readonly token: string;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly packaged?: boolean | undefined;
  readonly useProductionEndpointDefaults?: boolean | undefined;
  /** Reuse a prior throwaway profile for returning-user smoke checks. */
  readonly profileRoot?: string | undefined;
  /** The caller will relaunch this profile and dispose it after the final run. */
  readonly preserveProfile?: boolean | undefined;
  /** Show the isolated fixture window for a manual operator session. */
  readonly visible?: boolean | undefined;
  /** Give the isolated operator window a persistent, unambiguous title. */
  readonly windowTitle?: string | undefined;
  /** Capture startup traffic before Playwright can attach its request listener. */
  readonly captureStartupNetwork?: boolean | undefined;
  /** WAV input for Chromium's fake capture driver; leaves the OS microphone unchanged. */
  readonly fakeMicrophonePath?: string | undefined;
}): Promise<DesktopSession> => {
  if (desktopE2ECompletedArtifact && options.packaged === false) {
    throw new Error('A completed-artifact run cannot launch the workspace desktop app.');
  }
  if (
    desktopE2ECompletedArtifact &&
    completedArtifactForbiddenEnvironment.some((name) => options.env?.[name] !== undefined)
  ) {
    throw new Error('A completed-artifact run cannot override Node or packaged runtime resource paths.');
  }
  const configuredSnapshots = process.env['TAU_E2E_TRACE_SNAPSHOTS'];
  if (configuredSnapshots !== undefined && configuredSnapshots !== 'true' && configuredSnapshots !== 'false') {
    throw new Error('TAU_E2E_TRACE_SNAPSHOTS must be true or false.');
  }
  const manual =
    options.visible === true ||
    Object.entries(process.env).some(
      ([key, value]) =>
        key.startsWith('TAU_E2E_') && key.endsWith('_MANUAL') && value !== undefined && value !== 'false',
    );
  const snapshots = manual || configuredSnapshots !== 'false';
  const userData = options.profileRoot ?? (await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-user-')));
  const startupNetworkLogPath = options.captureStartupNetwork ? join(userData, 'startup-network.json') : undefined;
  /* A fixed, already-lowercase leaf inside the random parent: the workspace
   * slug the UI mints is the folder name slugified, so a `mkdtemp` name with
   * capitals would make the routed URL differ from the directory on disk for
   * no reason. */
  const pickedParent = await mkdtemp(join(tmpdir(), 'tau-desktop-e2e-pick-'));
  const pickedDirectory = join(pickedParent, 'tau-desktop-workspace');
  await mkdir(pickedDirectory, { recursive: true });
  const output: string[] = [];
  const startupStarted = performance.now();
  const startupPhases: Array<{ phase: string; elapsedMilliseconds: number }> = [];
  const recordStartupPhase = (phase: string, url?: string): void => {
    const receipt = { phase, elapsedMilliseconds: Math.round(performance.now() - startupStarted) };
    startupPhases.push(receipt);
    const location = url === undefined ? undefined : new URL(url);
    console.info(
      'DESKTOP STARTUP',
      JSON.stringify({
        ...receipt,
        userData,
        ...(location === undefined
          ? {}
          : { protocol: location.protocol, host: location.host, pathname: location.pathname }),
      }),
    );
  };
  const preserveStartupFailure = async (error: unknown): Promise<void> => {
    const directory = join(diagnosticsRoot, `launch-${basename(userData)}`);
    const desktopLog = await readFile(join(userData, 'logs/desktop.log'), 'utf8').catch(() => '(no desktop.log)');
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'diagnostics.log'),
      [
        `userData: ${userData}`,
        `pickedDirectory: ${pickedDirectory}`,
        `failure: ${error instanceof Error ? error.stack : String(error)}`,
        '--- startup phases ---',
        JSON.stringify(startupPhases),
        '--- process output ---',
        output.join(''),
        '--- desktop.log ---',
        desktopLog,
      ].join('\n'),
      'utf8',
    );
    console.info('DESKTOP STARTUP FAILURE', directory);
  };
  const inheritedEnvironment = { ...(process.env as Record<string, string>) };
  const packaged = desktopE2ECompletedArtifact || options.packaged === true;
  const packagedExecutable = desktopE2ECompletedArtifact ? desktopE2EPackagedExecutable() : defaultPackagedExecutable;
  if (desktopE2ECompletedArtifact) {
    delete inheritedEnvironment['NODE_OPTIONS'];
    delete inheritedEnvironment['NODE_PATH'];
    delete inheritedEnvironment['TAU_BUILD123D_RESOURCE_ROOT'];
    delete inheritedEnvironment['TAU_DESKTOP_CLIENT_ROOT'];
    delete inheritedEnvironment['TAU_PICOGK_RESOURCE_ROOT'];
  }
  if (options.useProductionEndpointDefaults) {
    delete inheritedEnvironment['TAU_API_URL'];
    delete inheritedEnvironment['TAU_WEBSOCKET_URL'];
    delete inheritedEnvironment['TAU_FRONTEND_URL'];
  }

  let application: ElectronApplication;
  recordStartupPhase('launch.before');
  try {
    application = await electron.launch({
      ...(packaged ? { executablePath: packagedExecutable } : {}),
      args: [
        ...(packaged ? [] : [desktopRoot]),
        `--user-data-dir=${userData}`,
        ...(startupNetworkLogPath ? [`--log-net-log=${startupNetworkLogPath}`] : []),
        ...webGpuArguments(),
        ...(options.fakeMicrophonePath
          ? [
              '--use-fake-device-for-media-stream',
              '--use-fake-ui-for-media-stream',
              // Chromium's sandboxed audio service cannot read the test-owned WAV on macOS.
              '--no-sandbox',
              `--use-file-for-fake-audio-capture=${options.fakeMicrophonePath}`,
            ]
          : []),
      ],
      cwd: packaged ? userData : desktopRoot,
      env: {
        ...inheritedEnvironment,
        NODE_ENV: 'production',
        /* Forwarded into `window.ENV` by the shell's client allowlist, where it
         * turns on the `tauDebug` feature flag that mounts
         * `SectionViewTestBridge` — the viewport-framing observable. `ui-e2e`
         * sets the same variable on its UI server for the same reason. */
        TAU_DEBUG: process.env['TAU_DEBUG'] ?? 'true',
        TAU_S3_ENDPOINT: process.env['TAU_S3_ENDPOINT'] ?? 'http://localhost:9000',
        ...(options.useProductionEndpointDefaults
          ? {}
          : {
              TAU_API_URL: desktopE2EApiUrl,
              TAU_WEBSOCKET_URL: desktopE2EApiUrl.replace(/^http/u, 'ws'),
              TAU_FRONTEND_URL: desktopE2EFrontendUrl,
            }),
        ...(packaged ? {} : { TAU_DESKTOP_CLIENT_ROOT: clientRoot }),
        TAU_DESKTOP_TOKEN: options.token,
        TAU_E2E_PICK_DIRECTORY: pickedDirectory,
        /* Printer access codes go to the throwaway profile's file vault, never the
         * person's login keychain, whatever the shell running the suite sets. */
        TAU_SECRET_VAULT: 'file',
        /* The per-user machine store and every other Tau config live in the
         * throwaway profile too, never the person's own. */
        TAU_CONFIG_DIR: join(userData, 'config'),
        ...options.env,
        TAU_E2E_HIDE_WINDOW: options.visible === true ? '0' : '1',
        ...(packaged ? { TAU_E2E_WAIT_FOR_PLAYWRIGHT: '1' } : {}),
      },
    });
  } catch (error) {
    await preserveStartupFailure(error).catch(() => undefined);
    throw error;
  }
  recordStartupPhase('launch.after');
  const child = application.process();
  /* Installed before the first window loads, and kept for the whole session, so
   * startup and late traffic are both observed. */
  const analyticsRequests: string[] = [];
  application.context().on('request', (request) => {
    if (analyticsRequestPattern.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  child.stdout?.on('data', (chunk: unknown) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk: unknown) => output.push(String(chunk)));

  /* Anything that throws between `launch` and the returned session would
   * otherwise strand a live Electron — and a stranded shell keeps polling the
   * API, which blows better-auth's 100-per-10 s bucket and 429s the *next*
   * run's sign-up. Kill it here rather than leaving it to a caller that never
   * received a session to close. */
  const consoleErrors: string[] = [];
  let page: Page;
  try {
    /* A packaged launch releases main bootstrap before its first window exists.
     * Configure the main-process test overrides only after that startup boundary. */
    recordStartupPhase('firstWindow.before');
    page = await application.firstWindow();
    recordStartupPhase('firstWindow.after', page.url());
    recordStartupPhase('domcontentloaded.before');
    await page.waitForLoadState('domcontentloaded');
    recordStartupPhase('domcontentloaded.after', page.url());
    // Main bootstrap still awaits its initial loadURL after DOM readiness.
    recordStartupPhase('initial-app-load.before', page.url());
    await page.waitForURL((url) => url.protocol === 'app:' && url.host === 'tau', { waitUntil: 'load' });
    recordStartupPhase('initial-app-load.after', page.url());
    if (options.windowTitle !== undefined) {
      const ownedWindow = await application.browserWindow(page);
      await ownedWindow.evaluate((window: BrowserWindow, title) => {
        window.setTitle(title);
        window.on('page-title-updated', (event: { preventDefault: () => void }) => {
          event.preventDefault();
          window.setTitle(title);
        });
      }, options.windowTitle);
    }
    if (options.fakeMicrophonePath) {
      // Chromium recommends disabling DSP for calibrated file microphone input.
      // Keep the real capture driver; change only its audio-processing constraints.
      await page.addInitScript(() => {
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (!constraints?.audio) {
            return capture(constraints);
          }
          return capture({
            ...constraints,
            audio: {
              ...(typeof constraints.audio === 'object' ? constraints.audio : {}),
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
        };
      });
    }
    recordStartupPhase('main-overrides.before');
    await application.evaluate(({ dialog, shell }, selectedDirectory) => {
      const testState = globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string };
      shell.openExternal = async (url): Promise<void> => {
        testState.__TAU_E2E_EXTERNAL_URL__ = url;
      };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedDirectory] });
      dialog.showMessageBox = async () => ({ checkboxChecked: false, response: 1 });
    }, pickedDirectory);
    recordStartupPhase('main-overrides.after');
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    console.info('DESKTOP TRACE OPTIONS', JSON.stringify({ screenshots: true, snapshots, manual }));
    recordStartupPhase('tracing.before');
    await page.context().tracing.start({ screenshots: true, snapshots });
    recordStartupPhase('tracing.after', page.url());
  } catch (error) {
    child.kill('SIGKILL');
    await preserveStartupFailure(error).catch(() => undefined);
    /* The shell's own output is the only account of why it went away, and the
     * caller has no session to read it from. */
    throw new Error(`The desktop shell did not survive launch.\n${output.join('')}`, { cause: error });
  }

  let tracing = true;
  let captured = false;

  /** Shallow-ish listing of a directory tree, for the failure report. */
  const tree = async (directory: string, depth = 3): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    const lines: string[] = [];
    for (const entry of entries) {
      lines.push(join(directory, entry.name));
      if (entry.isDirectory() && depth > 0) {
        lines.push(...(await tree(join(directory, entry.name), depth - 1)));
      }
    }
    return lines;
  };

  const capture = async (label: string): Promise<string> => {
    captured = true;
    const directory = join(diagnosticsRoot, label);
    await mkdir(directory, { recursive: true });
    const location = new URL(page.url());
    const url = { protocol: location.protocol, host: location.host, pathname: location.pathname };
    const desktopLog = await readFile(join(userData, 'logs/desktop.log'), 'utf8').catch(() => '(no desktop.log)');
    // Persist available evidence before any renderer or trace operation can stall.
    await writeFile(
      join(directory, 'diagnostics.log'),
      [
        `url: ${JSON.stringify(url)}`,
        `userData: ${userData}`,
        `pickedDirectory: ${pickedDirectory}`,
        '--- console errors ---',
        consoleErrors.join('\n'),
        '--- process output ---',
        output.join(''),
        '--- desktop.log ---',
        desktopLog,
        '--- renderer/trace collection pending ---',
      ].join('\n'),
      'utf8',
    );
    if (tracing) {
      tracing = false;
      /* A quit-path failure can close the renderer before diagnostics run;
       * retain Home/process/event logs even when its trace can no longer stop. */
      await page
        .context()
        .tracing.stop({ path: join(directory, 'trace.zip') })
        .catch(() => undefined);
    }
    await page
      .screenshot({ path: join(directory, 'screenshot.png'), fullPage: true, timeout: 10_000 })
      .catch(() => undefined);
    const bodyText = await page
      // oxlint-disable-next-line unicorn/prefer-dom-node-text-content -- `innerText` keeps the rendered line breaks that make this readable.
      .evaluate(() => document.body.innerText.slice(0, 2000))
      .catch(() => '(unavailable)');
    const pickedTree = await tree(pickedDirectory);
    const homeTree = await tree(join(userData, 'home'));
    const grants = await readFile(join(userData, 'granted-roots.json'), 'utf8').catch(() => '(none)');
    await writeFile(
      join(directory, 'diagnostics.log'),
      [
        `url: ${JSON.stringify(url)}`,
        `body: ${bodyText}`,
        `userData: ${userData}`,
        `pickedDirectory: ${pickedDirectory}`,
        '--- console errors ---',
        consoleErrors.join('\n'),
        '--- process output ---',
        output.join(''),
        '--- picked directory ---',
        pickedTree.join('\n'),
        '--- home root ---',
        homeTree.join('\n'),
        '--- granted roots ---',
        grants,
        '--- desktop.log ---',
        desktopLog,
      ].join('\n'),
      'utf8',
    );
    return directory;
  };

  const close = async (): Promise<void> => {
    if (tracing) {
      tracing = false;
      await page
        .context()
        .tracing.stop()
        .catch(() => undefined);
    }
    const exited =
      child.exitCode === null && child.signalCode === null
        ? new Promise<void>((resolve) => {
            child.once('exit', () => {
              resolve();
            });
          })
        : Promise.resolve();
    /* Routine fixture disposal bypasses quit holds exercised by their own specs. */
    await Promise.race([
      application
        .evaluate(({ app }) => {
          app.exit(0);
        })
        .catch(() => undefined),
      wait(5000),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await exited;
    /* Field trace validation (formal-verification policy): copy every chat log the
     * app wrote under Home or the picked project before the roots go. */
    const chatLogs = chatLogDestination('desktop-e2e', expect.getState().testPath);
    await captureChatLogs(userData, chatLogs);
    await captureChatLogs(pickedParent, chatLogs);
    if (captured) {
      /* Keep the evidence a failing run just produced. */
      return;
    }
    if (!options.preserveProfile) {
      await rm(userData, { force: true, recursive: true });
    }
    await rm(pickedParent, { force: true, recursive: true });
  };

  return {
    analyticsRequests,
    startupNetworkLogPath,
    application,
    capture,
    close,
    homeRoot: join(userData, 'home'),
    logPath: join(userData, 'logs/desktop.log'),
    page,
    pickedDirectory,
  };
};

/**
 * Hand the shell one `tau://` link the way the OS does.
 *
 * macOS raises `open-url` on `app`; Windows and Linux pass the link in argv and
 * main re-raises it through the same slot. Main's listener is a module-scope
 * `app.on('open-url', …)`, so emitting the event in the main process is the
 * whole delivery — no packaged bundle and no protocol registration required.
 *
 * @param session - The launched shell.
 * @param link - The `tau://` URL, admitted or not.
 * @returns Nothing.
 */
export const deliverDesktopDeepLink = async (session: DesktopSession, link: string): Promise<void> => {
  await session.application.evaluate(({ app }, url) => {
    app.emit('open-url', { preventDefault: () => undefined }, url);
  }, link);
};

/**
 * Complete the production sign-in handoff for a packaged app.
 *
 * The shell opens `${TAU_FRONTEND_URL}/auth/sign-in?redirectTo=/auth/desktop?state=…`
 * in the system browser (captured here by the `shell.openExternal` override) and
 * waits for a `tau://auth/callback` deep link. R4 deleted the loopback listener,
 * so there is no port to fetch: this mints the one-time token the web route would
 * have minted and delivers the callback through `open-url`, the same event macOS
 * raises. Main's listener is installed at module scope, so emitting on `app`
 * reaches it exactly as the OS would.
 */
export const authenticatePackagedDesktop = async (session: DesktopSession, bearerToken: string): Promise<void> => {
  let signInError: unknown;
  // async-iife: the deep-link callback must arrive while renderer sign-in is pending.
  const signIn = (async (): Promise<void> => {
    try {
      await session.page.evaluate(async () => {
        const { tauAuth } = globalThis as typeof globalThis & { tauAuth: { signIn(): Promise<void> } };
        await tauAuth.signIn();
      });
    } catch (error) {
      signInError = error;
    }
  })();
  let externalUrl = '';
  await expect
    .poll(
      async () => {
        externalUrl = await session.application.evaluate(() => {
          const testState = globalThis as typeof globalThis & { __TAU_E2E_EXTERNAL_URL__?: string };
          return testState.__TAU_E2E_EXTERNAL_URL__ ?? '';
        });
        return externalUrl;
      },
      { timeout: 30_000 },
    )
    .not.toBe('');
  const redirect = new URL(externalUrl).searchParams.get('redirectTo');
  if (!redirect) {
    throw new Error(`Packaged desktop sign-in emitted no redirect target: ${externalUrl}`);
  }
  const handoff = new URL(redirect, desktopE2EFrontendUrl);
  const state = handoff.searchParams.get('state');
  if (!state) {
    throw new Error(`Packaged desktop sign-in emitted an invalid handoff target: ${handoff.toString()}`);
  }
  const generated = await fetch(`${desktopE2EApiUrl}/v1/auth/one-time-token/generate`, {
    headers: { authorization: `Bearer ${bearerToken}` },
  });
  if (!generated.ok) {
    throw new Error(`Packaged desktop token generation failed with HTTP ${String(generated.status)}.`);
  }
  const oneTimeToken = ((await generated.json()) as { readonly token?: string }).token;
  if (!oneTimeToken) {
    throw new Error('Packaged desktop token generation returned no token.');
  }
  const callback = new URL('tau://auth/callback');
  callback.searchParams.set('ott', oneTimeToken);
  callback.searchParams.set('state', state);
  await deliverDesktopDeepLink(session, callback.toString());
  await signIn;
  if (signInError !== undefined) {
    throw signInError instanceof Error
      ? signInError
      : new Error('Packaged desktop sign-in failed.', { cause: signInError });
  }
};
