import { desktopNativeKernelChannels } from '@taucad/types/desktop-native-kernels';
import { desktopUpdateChannels } from '@taucad/types/desktop-updates';
import { isMachinesFeatureEnabled, machinesDisabledMessage } from '@taucad/types/constants';
import { randomUUID } from 'node:crypto';
import { createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import { createShutdownActor } from '#main/shutdown.machine.js';
import type { ShutdownDriverInput, ShutdownMachineEvent } from '#main/shutdown.machine.js';
import { installBrowserHost } from '#main/browser-host.js';
/**
 * Electron main process (work item E2).
 *
 * Main brokers and nothing else: the window, `app://` delivery, response and
 * request headers, one kernel utility per client, one singleton services
 * utility, the auth service, native dialogs, and the diagnostics sinks. Heavy
 * work — kernels, disk, the agent host — lives in the utilities.
 */

import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  app,
  autoUpdater,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageChannelMain,
  Menu,
  MenuItem,
  net,
  powerSaveBlocker,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
  utilityProcess,
} from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { installElectronRuntimeHeaders, registerElectronRuntimeMain } from '@taucad/runtime/electron/main';
import { createZooProxyTokenSource } from '@taucad/zoo/proxy';
import { connectSqliteComputeStoreWorker } from '@taucad/runtime/node';
import { machineStartWaitMilliseconds } from '@taucad/runtime/machine';
import type { ComputeBinding } from '@taucad/runtime/types';
import {
  defaultConfigDirectory,
  defaultPayloadStore,
  discoverAcpAgents,
  externalAgentDescriptors,
  keepAwakeWhileStreaming,
  projectCloseMilliseconds,
  projectReleaseMilliseconds,
} from '@taucad/host';
import type { ExternalAgentDescriptor } from '@taucad/agent-host/wire';

import { appOrigin, appSchemePrivileges, registerAppProtocol } from '#main/app-protocol.js';
import { createAuthService } from '#main/auth-service.js';
import {
  createDiagnosticsLog,
  forwardRendererDiagnostics,
  forwardUtilityDiagnostics,
  kernelUtilityDiagnostics,
} from '#main/diagnostics.js';
import {
  clientEnvironment,
  desktopAgentGatewayBaseUrl,
  desktopAgentSystemPrompt,
  desktopEnvironment,
  packagedChannel,
  packagedOverridesEnabled,
  stripPackagedOverrides,
} from '#main/environment.js';
import { installTauHeaderInjection, originOf } from '#main/header-injection.js';
import {
  contentSecurityPolicy,
  isMicrophonePermissionGranted,
  isPermissionGranted,
  isTrustedSender,
  navigationDecision,
  rendererOrigins,
} from '#main/navigation-policy.js';
import type { SenderFrame } from '#main/navigation-policy.js';
import {
  createKernelForkResolver,
  createProjectRootRegistry,
  kernelForkEnvAllowlist,
  sanitizeServicesContext,
} from '#main/project-roots.js';
import { createServicesBroker, rendererServicesConcerns, ServicesQuiescingError } from '#main/services-broker.js';
import type { ServicesConcern } from '#main/services-broker.js';
import { createGeometryBroker } from '#main/geometry-broker.js';
import {
  bundledGitEnvironment,
  compileCacheEnvironment,
  loginShellEnvironment,
  packagedEsbuildEnvironment,
  utilityEnvironment,
} from '#main/utility-environment.js';
import { createQuickLookController, removeStaleQuickLookSessions } from '#main/quick-look.js';
import type { QuickLookController } from '#main/quick-look.js';
import { deepLinkArgument, parseDeepLink } from '#main/deep-links.js';
import { createOpenFileQueue } from '#main/open-files.js';
import { readGeneratedImage } from '#main/generated-image.js';
import { createBambuStudioService } from '#main/bambu-studio-service.js';
import { readWindowState, writeWindowState } from '#main/window-state.js';
import { prepareOtaProbe } from '#main/ota-probe.js';
import type { DesktopUpdater } from '#main/updater.js';
import { startDesktopUpdater } from '#main/updater.js';
import { preparableNativeDeployments } from '#tau/desktop-native-deployments.js';
import { createDesktopKernelPreparer } from '#tau/native-preparation.js';
import { desktopNativeKernelIds, startNativeStore } from '#tau/native-store.js';
import {
  appIconThemeChannel,
  openDirectoryChannel,
  revealPathChannel,
  agentHostSessionChannels,
  machinesChannels,
  externalAgentsChannel,
  hostHandOffChannel,
  quitChannels,
  bootstrapArgumentPrefix,
  computeControlChannels,
  servicesPortRelayTag,
  slicersChannels,
  windowFullscreenChannel,
} from '#shared/desktop-bootstrap.js';
import type { AppIconTheme, DesktopMachineBindingFailure } from '#shared/desktop-bootstrap.js';
import {
  generatedImageIpcChannel,
  isQuickLookEnabled,
  openFilesIpcChannel,
  quickLookIpcChannels,
} from '#shared/quick-look.js';
import type { QuickLookResult } from '#shared/quick-look.js';
import quickLookManifest from '#macos/quick-look-formats.json' with { type: 'json' };

/* Must precede `app.whenReady()`: a scheme cannot gain `standard`/`secure`
 * privileges once the network service has started. */
protocol.registerSchemesAsPrivileged([...appSchemePrivileges]);

/* A packaged build ignores endpoint, renderer, client-root, executable-path and
 * `TAU_E2E_*` overrides unless it was packaged to honour them (ad-hoc and
 * certificate-signed or unsigned development packages; never a release). Scrubbed before anything below
 * reads `process.env`, so every later read and every child sees the result. */
const environmentLocked = app.isPackaged && !packagedOverridesEnabled(app.getAppPath());
if (environmentLocked) {
  stripPackagedOverrides(process.env);
}
/* A staging package (`TAU_DESKTOP_CHANNEL=staging` at packaging time) defaults
 * to taucad.dev and never follows the production update feed. */
const desktopChannel = app.isPackaged ? packagedChannel(app.getAppPath()) : 'production';
app.setName(desktopChannel === 'staging' ? 'Tau Staging' : 'Tau');
if (desktopChannel === 'staging') {
  // Development acceptance runs may explicitly isolate their profile; releases retain the channel profile.
  if (environmentLocked || !app.commandLine.hasSwitch('user-data-dir')) {
    app.setPath('userData', join(app.getPath('appData'), 'Tau Staging'));
  }
  app.setPath('sessionData', app.getPath('userData'));
}
const otaProbe = prepareOtaProbe({
  arguments: process.argv,
  profile: app.getPath('userData'),
  appPath: app.getAppPath(),
  version: app.getVersion(),
  channel: desktopChannel,
  packaged: app.isPackaged,
});
const isDevelopment = process.env.ELECTRON_RENDERER_URL !== undefined;
const hideTestWindow = process.env['TAU_E2E_HIDE_WINDOW'] === '1';
/* Packaged executable launches skip Playwright's readiness loader. Hold window
 * creation until its main-process bridge is attached, so an already-navigating
 * window cannot lose the initial CDP navigation event during attachment. */
const playwrightReady =
  process.env['TAU_E2E_WAIT_FOR_PLAYWRIGHT'] === '1' &&
  typeof Reflect.get(globalThis, '__playwright_run') !== 'function'
    ? Promise.withResolvers<void>()
    : undefined;
if (playwrightReady) {
  Object.defineProperty(globalThis, '__playwright_run', { value: playwrightReady.resolve, configurable: true });
}
/* The built SPA, relative to `dist/main/`. Packaging (ruling C7) will relocate
 * this; an env override keeps the e2e lane free to point elsewhere meanwhile. */
const clientRoot =
  process.env['TAU_DESKTOP_CLIENT_ROOT'] ??
  (app.isPackaged
    ? join(process.resourcesPath, 'ui/client')
    : join(import.meta.dirname, '../../../ui/desktop/build/client'));
/* Entries `electron.vite.config.ts` emits beside `index.js`, the bundle this
 * module lands in. */
const kernelUtilityEntry = join(import.meta.dirname, 'kernel-host.js');
const servicesUtilityEntry = join(import.meta.dirname, 'services-host.js');
const geometryUtilityEntry = join(import.meta.dirname, 'geometry-host.js');
const computeStoreWorkerEntry = join(import.meta.dirname, 'compute-store.worker.js');
const applicationResource = (name: string): string =>
  app.isPackaged ? join(process.resourcesPath, 'branding', name) : join(import.meta.dirname, '../../resources', name);
const applicationIcon = applicationResource(`icon.${process.platform === 'win32' ? 'ico' : 'png'}`);
const themedApplicationIcon = (theme: AppIconTheme): string =>
  applicationResource(`icon${theme === 'dark' ? '-dark' : ''}.png`);
const openFiles = createOpenFileQueue({
  extensions: quickLookManifest.formats.flatMap((format) => format.extensions),
  maxBytes: quickLookManifest.limits.maxSourceBytes,
  maxFiles: quickLookManifest.limits.maxFiles,
});
let showOpenFileImport: (() => void) | undefined;
const enqueueOpenFiles = (paths: readonly string[]): void => {
  if (openFiles.enqueue(paths) > 0) {
    showOpenFileImport?.();
  }
};

/* The macOS system may deliver this before `ready`; installing the listener after
 * `whenReady()` silently loses the launch document. */
app.on('open-file', (event, path) => {
  event.preventDefault();
  enqueueOpenFiles([path]);
});
enqueueOpenFiles(process.argv.slice(1));

/** Bring the app forward, whatever asked it to (a second launch, a deep link). */
const focusMainWindow = (): void => {
  if (hideTestWindow) {
    return;
  }
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) {
    window.restore();
  }
  window?.show();
  window?.focus();
};

/*
 * `tau://` deep links (R4, ruling D4).
 *
 * The same pre-`ready` problem as `open-file`: on macOS the link that launched
 * the app arrives before anything could have asked for it, so the listener is
 * installed here and the link is held until the window exists. One slot rather
 * than a list — a launch delivers one link, and if a second arrives first the
 * newer one is the one the person just clicked.
 */
let deliverDeepLink: ((value: string) => void) | undefined;
let queuedDeepLink: string | undefined;
const receiveDeepLink = (value: string): void => {
  if (deliverDeepLink === undefined) {
    queuedDeepLink = value;
    return;
  }
  deliverDeepLink(value);
};
app.on('open-url', (event, url) => {
  event.preventDefault();
  receiveDeepLink(url);
});
/* Windows and Linux hand the link to the process as an argument instead. */
const launchDeepLink = deepLinkArgument(process.argv.slice(1));
if (launchDeepLink !== undefined) {
  receiveDeepLink(launchDeepLink);
}

/* How far each quit wait outlasts the bound it awaits, so the inner reason lands first (rule 9). */
const quitMarginMilliseconds = 3000;

/**
 * How long quit waits for every served project to settle (W19, D31).
 *
 * Derived from the host's own worst case for closing one project — its runs
 * drain, then the live-checkout wait, the close cuts and the sync quiesce — so
 * rule 9's nesting holds whatever those bounds become: the host's reason
 * lands before this wait's. Projects close in parallel, so the per-project
 * bound is the whole bound. The utility's quiesce first waits for machine job
 * starts already admitted, before any project closes, so that wait adds on.
 * After it the durable queue is the guarantee (D28).
 *
 * @internal
 */
export const quitQuiesceMilliseconds = projectCloseMilliseconds + machineStartWaitMilliseconds + quitMarginMilliseconds;

/*
 * The page's own close steps before its sync flush: `cancelRuns`, then
 * `flushProducers`, each on the editor bound of `project-live-sessions.tsx`
 * (`editorFlushTimeoutMilliseconds`, 10 s). ponytail: mirrored, not imported —
 * desktop has no dependency on the ui app; move the page bound into a package
 * both read if it ever changes.
 */
const rendererCloseStepsMilliseconds = 2 * 10_000;

/**
 * How long a binding ceremony may take to reach the printer and answer (D10).
 *
 * The provider's MQTT hello is seconds on the LAN; the bound only bites a
 * printer that is asleep or unreachable, which is exactly when the person
 * should hear "timed out" rather than wait on a spinner.
 */
const machineBindingMilliseconds = 60_000;

/**
 * How long quit waits for the utility to say whether a program is streaming. The utility first quiesces the machine
 * host, which waits up to {@link machineStartWaitMilliseconds} for job starts already admitted, so this bound sits
 * above that wait.
 */
const machineStreamingMilliseconds = machineStartWaitMilliseconds + 2000;

/**
 * How often main asks whether a program is streaming, to keep the computer awake while one does: well inside the
 * shortest idle-sleep timer an operating system offers (one minute).
 */
const keepAwakeIntervalMilliseconds = 20_000;
/* Kernel utility resident ceiling (D-DT-02): the upper bound on half of physical memory. */
const maxKernelResidentBytes = 8 * 1024 * 1024 * 1024;
const kernelResidentPollMilliseconds = 5000;
/* D-DT-09: an unadopted spare retires after the geometry slot's idle time; the next fork warms another. */
const kernelSpareIdleMilliseconds = 120_000;
/* One metrics read serves every sampler for this long. */
const residentMetricsReuseMilliseconds = 500;

/**
 * How long quit waits for the renderer's sessions registry (D31, P49).
 *
 * The page runs every live project's `closing` — cancel, producer flush, sync
 * flush, lease release — and answers `quiesced`. A desktop project's sync
 * flush is the host's close, so the wait is the page's own steps plus
 * {@link projectReleaseMilliseconds} plus a margin (rule 9, RV-W2b #1). The
 * person can cut it short with *Quit anyway*. The bound reports failure to
 * main; it never turns an incomplete close into permission to quit.
 *
 * @internal
 */
export const quitRendererMilliseconds =
  rendererCloseStepsMilliseconds + projectReleaseMilliseconds + quitMarginMilliseconds;

/**
 * Ask every window's sessions registry to close its projects, and wait.
 *
 * Resolves on the first completion or explicit *Quit anyway*, at the bound,
 * or at once when there is no window to ask.
 *
 * @param boundMilliseconds - How long to wait before proceeding regardless.
 * @returns What ended the wait.
 */
const askRendererToQuiesce = async (
  boundMilliseconds: number,
  attemptId: string,
): Promise<'quiesced' | 'forced' | 'timeout' | 'no-window'> => {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
  if (windows.length === 0) {
    return 'no-window';
  }
  return new Promise<'quiesced' | 'forced' | 'timeout' | 'no-window'>((resolve) => {
    const settle = (outcome: 'quiesced' | 'forced' | 'timeout'): void => {
      clearTimeout(timer);
      ipcMain.off(quitChannels.quiesced, onQuiesced);
      resolve(outcome);
    };
    const pending = new Set(windows.map((window) => window.webContents.id));
    let anyForced = false;
    const onQuiesced = (event: IpcMainEvent, replyAttempt: unknown, forced: unknown): void => {
      if (
        replyAttempt !== attemptId ||
        typeof forced !== 'boolean' ||
        !pending.has(event.sender.id) ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        return;
      }
      pending.delete(event.sender.id);
      anyForced ||= forced;
      if (pending.size === 0) {
        settle(anyForced ? 'forced' : 'quiesced');
      }
    };
    const timer = setTimeout(() => {
      settle('timeout');
    }, boundMilliseconds);
    ipcMain.on(quitChannels.quiesced, onQuiesced);
    for (const window of windows) {
      window.webContents.send(quitChannels.ask, attemptId);
    }
  });
};

const ownsSingleInstanceLock = app.requestSingleInstanceLock();
app.on('second-instance', (_event, argv) => {
  enqueueOpenFiles(argv.slice(1));
  const link = deepLinkArgument(argv.slice(1));
  if (link !== undefined) {
    receiveDeepLink(link);
  }
  focusMainWindow();
});

process.title = 'Tau';
/* Unpackaged on Windows and Linux the registration has to name the executable
 * and the script Electron was started with, or the OS records `electron` itself
 * as the handler; on macOS `CFBundleURLTypes` in the packaged bundle is what
 * counts and this call is a no-op for a development run. */
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('tau', process.execPath, [resolve(process.argv[1]!)]);
} else {
  app.setAsDefaultProtocolClient('tau');
}
if (process.platform === 'win32') {
  app.setAppUserModelId('com.taucad.tau');
}

process.on('uncaughtException', (error) => {
  console.error('[desktop] uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[desktop] unhandledRejection', reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const bootstrapElectronApp = async (): Promise<void> => {
  /* Finder hands a packaged app launchd's environment, which finds no vendor
   * CLI and carries none of the user's `CODEX_HOME`, proxy or CA settings; fix
   * it once here so discovery, the model probe and every utility fork inherit
   * the user's own login shell (G-ACP-PKG, decision Q13). The e2e specs that
   * pin the launcher environment opt out inside the helper.
   *
   * Started before `whenReady`, awaited after (D17): spawning `$SHELL -ilc` cost
   * 0.96-3.17 s on a packaged launch and nothing in Electron's own init needs
   * its answer, so the two run side by side instead of end to end. */
  const loginShellApplied = app.isPackaged ? loginShellEnvironment() : undefined;
  await app.whenReady();
  if (playwrightReady) {
    await playwrightReady.promise;
  }
  app.dock?.setIcon(applicationIcon);
  const loginShell = await loginShellApplied;
  const environment = desktopEnvironment(process.env, { locked: environmentLocked, channel: desktopChannel });

  const logDirectory = join(app.getPath('userData'), 'logs');
  /* The `git` this app records revisions with, when this build ships one (OQ3, C68). */
  const gitEnvironment = bundledGitEnvironment(
    app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '../../resources'),
  );
  const esbuildEnvironment = packagedEsbuildEnvironment(app.isPackaged, process.resourcesPath);
  const log = createDiagnosticsLog({ directory: logDirectory, echo: isDevelopment });
  log.log('info', 'main.ready', {
    electron: process.versions.electron,
    packaged: app.isPackaged,
    isDevelopment,
    version: app.getVersion(),
    channel: desktopChannel,
    pid: process.pid,
  });
  if (loginShell !== undefined) {
    /* A fallback means the shell timed out or failed: only well-known CLI
     * directories were added, and nothing from its rc files applied. */
    log.log(loginShell.fallback ? 'warn' : 'info', 'main.login-shell-path', loginShell);
  }

  /* L2's contract: the home root must exist before the renderer's first mount,
   * because `NodeFsProvider` realpath-checks its base. */
  const homeRoot = join(app.getPath('userData'), 'home');
  mkdirSync(homeRoot, { recursive: true });
  const authorityDirectory = join(app.getPath('userData'), 'filesystem-authority');
  mkdirSync(authorityDirectory, { recursive: true });
  /* The per-user machine store every Tau host on this computer shares
   * (`tau serve` opens it too), never under an authored root. The app's old
   * `userData/machines` is imported from once, and only when it is another
   * directory: on a case-insensitive volume `…/Tau` and `…/tau` are one. */
  const tauConfigDirectory =
    desktopChannel === 'staging' ? join(app.getPath('userData'), 'config') : defaultConfigDirectory();
  const machinesEnabled = isMachinesFeatureEnabled(environment['TAU_MACHINES_ENABLED']);
  const machinesDirectory = join(tauConfigDirectory, 'machines');
  if (machinesEnabled) {
    mkdirSync(machinesDirectory, { recursive: true, mode: 0o700 });
  }
  const legacyMachinesDirectory = join(app.getPath('userData'), 'machines');
  const legacyMachinesEnvironment: Readonly<Record<string, string>> =
    machinesEnabled &&
    existsSync(legacyMachinesDirectory) &&
    realpathSync.native(legacyMachinesDirectory) !== realpathSync.native(machinesDirectory)
      ? // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
        { TAU_DESKTOP_LEGACY_MACHINES_DIR: legacyMachinesDirectory }
      : {};

  /* Grants outlive the session: the renderer keeps a picked folder's workspace
   * record in IndexedDB and offers it again on the next launch, so a grant main
   * forgot would answer `EACCES` for a folder the user believes is connected. */
  const roots = createProjectRootRegistry({ storePath: join(app.getPath('userData'), 'granted-roots.json') });
  roots.admit(homeRoot);
  const windowStatePath = join(app.getPath('userData'), 'window-state.json');
  const quickLookTemporaryRoot = join(app.getPath('temp'), 'tau-quick-look');
  removeStaleQuickLookSessions(quickLookTemporaryRoot);
  const quickLookControllers = new Map<number, QuickLookController>();
  let quitting = false;

  const auth = createAuthService({
    apiUrl: environment['TAU_API_URL']!.replace(/\/$/u, ''),
    frontendUrl: environment['TAU_FRONTEND_URL']!.replace(/\/$/u, ''),
    userDataPath: app.getPath('userData'),
    /* Packaged E2E uses memory-only custody because an ad-hoc signature cannot
     * unlock a prior Keychain item unattended. The switch can only disable
     * persistence; it cannot seed or expose a credential. */
    safeStorage:
      environment['TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE'] === '1'
        ? {
            isEncryptionAvailable: () => false,
            encryptString: (value) => safeStorage.encryptString(value),
            decryptString: (value) => safeStorage.decryptString(value),
          }
        : safeStorage,
    openExternal: async (url) => shell.openExternal(url),
    packaged: app.isPackaged,
    seededToken: environment['TAU_DESKTOP_TOKEN'],
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });

  installElectronRuntimeHeaders();

  /* Deny by default; see `grantedPermissions` for the explicit grants and why. */
  const origins = rendererOrigins({ appOrigin, devServerUrl: environment.ELECTRON_RENDERER_URL });
  installBrowserHost({ origins, userDataPath: app.getPath('userData') });
  // The macOS consent prompt appears once; later answers come from System Settings without a prompt.
  session.defaultSession.setPermissionRequestHandler(async (...[contents, permission, callback, details]) => {
    const microphone = isMicrophonePermissionGranted({
      permission,
      frame: contents.mainFrame,
      requester: details.requestingUrl,
      mainFrame: details.isMainFrame,
      mediaTypes: 'mediaTypes' in details ? (details.mediaTypes ?? []) : [],
      origins,
    });
    const granted =
      isPermissionGranted(permission) ||
      (microphone && (process.platform !== 'darwin' || (await systemPreferences.askForMediaAccess('microphone'))));
    log.log(granted ? 'info' : 'warn', granted ? 'permission.granted' : 'permission.denied', { permission });
    callback(granted);
  });
  session.defaultSession.setPermissionCheckHandler(
    (...[contents, permission, requestingOrigin, details]) =>
      isPermissionGranted(permission) ||
      isMicrophonePermissionGranted({
        permission,
        frame: contents?.mainFrame,
        requester: details.requestingUrl ?? details.securityOrigin ?? requestingOrigin,
        mainFrame: details.isMainFrame,
        mediaTypes: details.mediaType === undefined ? [] : [details.mediaType],
        origins,
      }),
  );

  /* Injection covers the API origin and, separately, the WebSocket origin —
   * `ws://localhost:4001` is not `http://localhost:4000`, and the chat RPC and
   * agent sockets are exactly the traffic a browser cannot decorate itself. */
  const authenticatedOrigins = [
    originOf(environment['TAU_API_URL']),
    originOf(environment['TAU_WEBSOCKET_URL']),
  ].filter((origin): origin is string => origin !== undefined);
  installTauHeaderInjection(session.defaultSession.webRequest, {
    allowedOrigins: authenticatedOrigins,
    token: () => auth.token(),
    clientHeader: `tau-desktop/${app.getVersion()}`,
  });

  if (!isDevelopment) {
    const storageOrigin = originOf(environment['TAU_S3_ENDPOINT']);
    /* Product analytics post straight to PostHog; never an authenticated origin, so no bearer reaches it. */
    const analyticsOrigin = environment['POSTHOG_CLIENT_KEY'] ? originOf(environment['POSTHOG_API_HOST']) : undefined;
    const connectOrigins = [storageOrigin, analyticsOrigin].filter((origin): origin is string => origin !== undefined);
    registerAppProtocol({
      clientRoot,
      protocol,
      net,
      /* OQ-P11: development and staging only. Unpackaged is exactly that here — a packaged app
       * has no developer to take the profile. */
      jsProfiling: !app.isPackaged,
      contentSecurityPolicy: contentSecurityPolicy([...authenticatedOrigins, ...connectOrigins]),
    });
    log.log('info', 'main.app-protocol-registered', { clientRoot });
  }

  let computeWorker: Worker | undefined;
  /* One connection per root while some utility runs durable compute on it,
   * counted by holder: a root nobody runs keeps no connection in main. */
  const computeConnections = new Map<
    string,
    { readonly connection: ReturnType<typeof connectSqliteComputeStoreWorker>; holders: number }
  >();
  let registeredProjectRootFor = (_executionRoot: string): string | undefined => undefined;
  const invalidateComputeWorker = (worker: Worker): void => {
    if (computeWorker !== worker) {
      return;
    }
    for (const stale of computeConnections.values()) {
      stale.connection.dispose();
    }
    computeConnections.clear();
    computeWorker = undefined;
  };
  const holdComputeConnection = (projectRoot: string) => {
    let entry = computeConnections.get(projectRoot);
    if (!entry) {
      if (!computeWorker) {
        const worker = new Worker(computeStoreWorkerEntry, {
          workerData: { directory: join(app.getPath('userData'), 'compute') },
        });
        worker.once('exit', () => {
          invalidateComputeWorker(worker);
        });
        worker.on('error', (error) => {
          invalidateComputeWorker(worker);
          log.log('error', 'compute.worker', error);
        });
        computeWorker = worker;
      }
      entry = {
        connection: connectSqliteComputeStoreWorker({ worker: computeWorker, workspace: projectRoot }),
        holders: 0,
      };
      computeConnections.set(projectRoot, entry);
    }
    const held = entry;
    held.holders += 1;
    let released = false;
    return {
      connection: held.connection,
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        held.holders -= 1;
        /* A worker restart already disposed and replaced a stale entry. */
        if (held.holders === 0 && computeConnections.get(projectRoot) === held) {
          computeConnections.delete(projectRoot);
          held.connection.dispose();
        }
      },
    };
  };
  /* A control call holds the root's connection for its own duration only. */
  const withComputeConnection = async <Result>(
    projectRoot: string,
    use: (connection: ReturnType<typeof connectSqliteComputeStoreWorker>) => Promise<Result>,
  ): Promise<Result> => {
    const held = holdComputeConnection(projectRoot);
    try {
      return await use(held.connection);
    } finally {
      held.release();
    }
  };
  /* One `getAppMetrics()` answers every utility sampled in the same moment: the
   * kernel broker samples each adopted utility on one tick, and the geometry
   * slot every second. */
  let appMetrics: { readonly at: number; readonly residentBytes: ReadonlyMap<number, number> } | undefined;
  const residentBytesOf = (utility: { readonly pid?: number | undefined }): number | undefined => {
    if (utility.pid === undefined) {
      return undefined;
    }
    const now = Date.now();
    if (appMetrics === undefined || now - appMetrics.at > residentMetricsReuseMilliseconds) {
      appMetrics = {
        at: now,
        // Electron ProcessMetric workingSetSize is KiB; the broker budgets are bytes.
        residentBytes: new Map(app.getAppMetrics().map((entry) => [entry.pid, entry.memory.workingSetSize * 1024])),
      };
    }
    return appMetrics.residentBytes.get(utility.pid);
  };
  const baseForkResolver = createKernelForkResolver({
    registry: roots,
    defaultRoot: homeRoot,
    isTrustedRoot: (executionRoot) => {
      const projectRoot = registeredProjectRootFor(executionRoot);
      return projectRoot !== undefined && projectRoot !== executionRoot && roots.isTrusted(projectRoot);
    },
  });
  const runtimeMain = registerElectronRuntimeMain({
    utilityEntry: kernelUtilityEntry,
    /* The kernel utility appends its engine-identity record (N5/N6) to the same
     * rotating log main writes, which is the e2e's only observable for which
     * engine actually loaded — the version never crosses the runtime wire. */
    env: utilityEnvironment(environment, {
      ...esbuildEnvironment,
      ...compileCacheEnvironment(app.getPath('userData')),
      TAU_DESKTOP_LOG_DIR: logDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
    }),
    forkEnvAllowlist: [...kernelForkEnvAllowlist],
    /* A fork-loop guard, not a concurrency policy: a live project costs one to
     * three utilities and the sessions registry admits as many as memory holds,
     * so this sits an order of magnitude above realistic use. */
    maxUtilities: 64,
    /* D-DT-02: WebAssembly memory never shrinks, so a kernel utility stays at
     * its peak until it dies. Past the ceiling it is killed and its project
     * reports the exit, rather than the machine swapping. Half of physical
     * memory, at most 8 GiB, sits well above any single healthy model. */
    residentLimit: {
      maxBytes: Math.min(maxKernelResidentBytes, Math.floor(totalmem() / 2)),
      intervalMilliseconds: kernelResidentPollMilliseconds,
      sample: residentBytesOf,
    },
    spareIdleMilliseconds: kernelSpareIdleMilliseconds,
    resolveFork: (context) => {
      const requestedRoot = context['projectRoot'];
      const registeredProjectRoot =
        requestedRoot === undefined ? undefined : registeredProjectRootFor(resolve(requestedRoot));
      const resolved = baseForkResolver(
        registeredProjectRoot === undefined ? context : { ...context, projectRoot: registeredProjectRoot },
      );
      const mode = context['computeMode'] ?? 'memory';
      if (mode !== 'off' && mode !== 'memory' && mode !== 'durable') {
        throw new Error('Desktop shell refused unknown compute mode.');
      }
      if (context['purpose'] === 'ephemeral' && mode === 'durable') {
        throw new Error('Desktop shell refused durable compute for an ephemeral runtime.');
      }
      const executionRoot =
        registeredProjectRoot === undefined
          ? (resolved.env?.['TAU_PROJECT_ROOT'] ?? homeRoot)
          : resolve(requestedRoot ?? homeRoot);
      const computeProjectRoot = roots.canonical(registeredProjectRoot ?? executionRoot);
      if (!computeProjectRoot) {
        throw new Error('Desktop shell refused unadmitted compute project root.');
      }
      /* The execution root reaches the utility rooted on `fileSystemPort`, and
       * never through the process environment: an environment that varied per
       * project would give every open its own pool key, so no warm spare could
       * ever be adopted (W-L03-4). */
      const forkEnvironment = { ...resolved.env };
      delete forkEnvironment['TAU_PROJECT_ROOT'];
      const fileSystem =
        context['purpose'] === 'ephemeral'
          ? {}
          : { fileSystemPort: services.connect('runtimeFileSystem', { workspaceRoot: executionRoot }) };
      /* Held for exactly the utility's life: the broker calls `release` when it goes. */
      let held: ReturnType<typeof holdComputeConnection> | undefined;
      let compute: ComputeBinding;
      if (mode === 'durable') {
        held = holdComputeConnection(computeProjectRoot);
        compute = { mode, store: held.connection.store };
      } else {
        compute = { mode };
      }
      return {
        ...resolved,
        env: forkEnvironment,
        compute,
        ...(held === undefined ? {} : { release: held.release }),
        ...fileSystem,
      };
    },
    serviceName: 'tau-kernel-host',
    onError(error) {
      log.log('error', 'kernel.broker', error);
    },
    ...kernelUtilityDiagnostics(log),
  });
  /* One kernel utility is forked now rather than when the first project asks
   * for it: the fork and its module graph are ~176 ms the person would
   * otherwise wait for with a project already on screen (W-L03-4). */
  runtimeMain.prewarm();
  /* W6: tell the kernel utilities which sealed closure each prepared native kernel runs from; a utility composes its
   * runtime once that frame arrives, and reads the store for every other kernel, which main prepares on first use
   * (`nativeKernels` below). The staging channel keeps its own store beside its own config. Collected at startup (D21). */
  const nativeStorePath = desktopChannel === 'staging' ? join(tauConfigDirectory, 'payloads') : defaultPayloadStore();
  const nativeStoreAbort = new AbortController();
  const nativeStore = startNativeStore({
    store: nativeStorePath,
    hostPath: app.getPath('exe'),
    environment: process.env,
    post: (frame) => {
      runtimeMain.post(frame);
    },
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
    signal: nativeStoreAbort.signal,
  });
  /* First-use download (W6 phase 2): the app ships no kernel closure, so a native kernel refuses with
   * `KERNEL_NOT_PREPARED` until the viewer, or the agent's `prepare_kernel` in the services utility, asks main to
   * prepare it here. Every window sees every download's progress. */
  const nativeKernels = createDesktopKernelPreparer({
    store: nativeStorePath,
    hostPath: app.getPath('exe'),
    environment: process.env,
    deployments: preparableNativeDeployments({ packaged: app.isPackaged, resourcesPath: process.resourcesPath }),
    onProgress: (progress) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && isTrustedSender(window.webContents.mainFrame, origins)) {
          window.webContents.send(desktopNativeKernelChannels.progress, progress);
        }
      }
    },
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });

  const geometry = createGeometryBroker({
    utilityEntry: geometryUtilityEntry,
    env: utilityEnvironment(environment, {
      ...esbuildEnvironment,
      ...compileCacheEnvironment(app.getPath('userData')),
      TAU_DESKTOP_LOG_DIR: logDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
    }),
    fork: (entry, args, forkOptions) => utilityProcess.fork(entry, args, forkOptions),
    createChannel: () => new MessageChannelMain(),
    connectRuntime: (context) => runtimeMain.connect({ purpose: 'main-process-client', context }),
    sampleResidentBytes: residentBytesOf,
    runtimeConfig: {
      tauApiUrl: environment['TAU_API_URL']!,
      tauWebSocketUrl: environment['TAU_WEBSOCKET_URL']!,
    },
    onSpawn: (utility) => {
      forwardUtilityDiagnostics('geometry', utility, log);
    },
    log: (event, detail) => {
      log.log('warn', event, detail);
    },
  });

  const trustedComputeRoot = (event: IpcMainInvokeEvent, projectRoot: unknown): string => {
    if (!trusted(event.senderFrame) || typeof projectRoot !== 'string' || !roots.isTrusted(projectRoot)) {
      throw new Error('Desktop shell refused compute control.');
    }
    const canonicalRoot = roots.canonical(projectRoot)!;
    return roots.canonical(services.computeProjectRoot(canonicalRoot) ?? canonicalRoot)!;
  };
  ipcMain.handle(computeControlChannels.inspect, async (event, projectRoot) =>
    withComputeConnection(trustedComputeRoot(event, projectRoot), async (connection) => connection.control.inspect({})),
  );
  ipcMain.handle(computeControlChannels.clear, async (event, projectRoot) =>
    withComputeConnection(trustedComputeRoot(event, projectRoot), async (connection) => connection.control.clear({})),
  );
  ipcMain.handle(computeControlChannels.collect, async (event, projectRoot, input: unknown) => {
    const root = trustedComputeRoot(event, projectRoot);
    const { budget, cursor } = (input ?? {}) as { budget?: unknown; cursor?: unknown };
    if (!Number.isSafeInteger(budget) || (budget as number) < 1 || (budget as number) > 1000) {
      throw new Error('Desktop shell refused invalid compute collection budget.');
    }
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 1024)) {
      throw new Error('Desktop shell refused invalid compute collection cursor.');
    }
    return withComputeConnection(root, async (connection) =>
      connection.control.collect({ budget: budget as number, ...(cursor ? { cursor } : {}) }),
    );
  });

  const services = createServicesBroker({
    utilityEntry: servicesUtilityEntry,
    env: utilityEnvironment(environment, {
      ...esbuildEnvironment,
      ...gitEnvironment,
      ...compileCacheEnvironment(app.getPath('userData')),
      TAU_CONFIG_DIR: tauConfigDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      TAU_DESKTOP_AUTHORITY_DIR: authorityDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
      ...(machinesEnabled ? { TAU_DESKTOP_MACHINES_DIR: machinesDirectory } : {}),
      ...legacyMachinesEnvironment,
      TAU_DESKTOP_LOG_DIR: logDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
    }),
    fork: (entry, args, forkOptions) => utilityProcess.fork(entry, args, forkOptions),
    createChannel: () => new MessageChannelMain(),
    connectRuntime: (context) => runtimeMain.connect({ purpose: 'main-process-client', context }),
    connectGeometry: (input) => geometry.connectSuite(input),
    prepareNativeKernel: async (kernel, onProgress) => nativeKernels.prepare(kernel, onProgress),
    revokeGeometry: () => {
      geometry.revokeUnauthorized();
    },
    onSpawn: (utility) => {
      forwardUtilityDiagnostics('services', utility, log);
    },
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });
  /* Q-streamed-host: a streamed program needs this computer awake for its whole run. */
  const stopKeepingAwake = machinesEnabled
    ? keepAwakeWhileStreaming({
        streamingMachines: async () => services.peekStreamingMachines(keepAwakeIntervalMilliseconds / 2),
        blocker: {
          hold: () => {
            const id = powerSaveBlocker.start('prevent-app-suspension');
            return () => {
              powerSaveBlocker.stop(id);
            };
          },
        },
        intervalMilliseconds: keepAwakeIntervalMilliseconds,
        log: (level, event, detail) => {
          log.log(level, event, detail);
        },
      })
    : () => undefined;
  const agentHostSessionInput = (
    event: IpcMainInvokeEvent,
    payload: unknown,
  ): Readonly<{ workspaceRoot: string; projectId: string; attachmentId: string }> => {
    const { workspaceRoot, projectId, attachmentId } = (payload ?? {}) as Record<string, unknown>;
    if (
      !trusted(event.senderFrame) ||
      typeof workspaceRoot !== 'string' ||
      !roots.isTrusted(workspaceRoot) ||
      typeof projectId !== 'string' ||
      projectId === '' ||
      typeof attachmentId !== 'string' ||
      attachmentId === '' ||
      attachmentId.length > 256
    ) {
      throw new Error('Desktop shell refused invalid agent-host session ownership.');
    }
    return { workspaceRoot, projectId, attachmentId };
  };
  /*
   * D-DT-04: the attachments each document holds, by the web contents that
   * holds them. A renderer releases its own on the way out, but a deep link,
   * Open-With, a crash reload or a recovery replaces the document without
   * that, and the broker keeps a project's host (and its kernel utility) while
   * any attachment remains. So main releases whatever a document still holds
   * once it navigates away, its process is gone, or its contents are destroyed.
   */
  type AgentHostAttachment = ReturnType<typeof agentHostSessionInput>;
  const documentAttachments = new Map<number, Map<string, AgentHostAttachment>>();
  const attachmentKey = (input: AgentHostAttachment): string =>
    JSON.stringify([input.workspaceRoot, input.attachmentId]);
  const releaseAgentHostAttachment = async (input: AgentHostAttachment): Promise<void> => {
    try {
      await services.releaseAgentHost(input, quitQuiesceMilliseconds);
    } catch (error) {
      log.log('warn', 'main.agent-host-release', error);
    }
  };
  const holdDocumentAttachment = (sender: IpcMainInvokeEvent['sender'], input: AgentHostAttachment): void => {
    let held = documentAttachments.get(sender.id);
    if (held === undefined) {
      const attachments = new Map<string, AgentHostAttachment>();
      held = attachments;
      documentAttachments.set(sender.id, attachments);
      const documentGone = (): void => {
        sender.removeListener('did-navigate', documentGone);
        sender.removeListener('render-process-gone', documentGone);
        sender.removeListener('destroyed', documentGone);
        if (documentAttachments.get(sender.id) === attachments) {
          documentAttachments.delete(sender.id);
        }
        for (const attachment of attachments.values()) {
          void releaseAgentHostAttachment(attachment);
        }
        attachments.clear();
      };
      sender.on('did-navigate', documentGone);
      sender.on('render-process-gone', documentGone);
      sender.on('destroyed', documentGone);
    }
    held.set(attachmentKey(input), input);
  };
  const dropDocumentAttachment = (sender: IpcMainInvokeEvent['sender'], input: AgentHostAttachment): void => {
    documentAttachments.get(sender.id)?.delete(attachmentKey(input));
  };
  ipcMain.handle(agentHostSessionChannels.retain, async (event, payload) => {
    const input = agentHostSessionInput(event, payload);
    services.retainAgentHost(input);
    holdDocumentAttachment(event.sender, input);
  });
  ipcMain.handle(agentHostSessionChannels.release, async (event, payload) => {
    const input = agentHostSessionInput(event, payload);
    dropDocumentAttachment(event.sender, input);
    await services.releaseAgentHost(input, quitQuiesceMilliseconds);
  });
  /* The secret half of the binding ceremony (D10). The renderer never keeps
   * the access code: it rides this one invoke to the utility, which saves it
   * only once the printer accepts it. Without one the utility reuses the
   * printer's saved code while its certificate still matches. A real X1C
   * answers its MQTT hello in seconds, but a wrong code or a sleeping printer
   * is only known at the provider's own timeout, hence the bound. */
  ipcMain.handle(machinesChannels.completeBinding, async (event, payload) => {
    if (!machinesEnabled) {
      return {
        status: 'failed',
        code: 'MACHINES_DISABLED',
        message: machinesDisabledMessage,
      } satisfies DesktopMachineBindingFailure;
    }
    const { ceremonyId, address, accessCode } = (payload ?? {}) as Record<string, unknown>;
    const optionalString = (value: unknown): value is string | undefined =>
      value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= 256);
    if (
      !trusted(event.senderFrame) ||
      typeof ceremonyId !== 'string' ||
      ceremonyId === '' ||
      ceremonyId.length > 256 ||
      !optionalString(address) ||
      !optionalString(accessCode)
    ) {
      throw new Error('Desktop shell refused invalid machine binding completion.');
    }
    try {
      return await services.completeMachineBinding(
        {
          ceremonyId,
          ...(address === undefined ? {} : { address }),
          ...(accessCode === undefined ? {} : { accessCode }),
        },
        machineBindingMilliseconds,
      );
    } catch (error) {
      /* Resolved, not thrown: an error crossing the context bridge keeps only its message, and the host's typed code
       * is what the renderer reads. */
      const code =
        typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined;
      return {
        status: 'failed',
        ...(code === undefined ? {} : { code }),
        message: error instanceof Error ? error.message : String(error),
      } satisfies DesktopMachineBindingFailure;
    }
  });
  registeredProjectRootFor = (executionRoot) => services.computeProjectRoot(executionRoot);
  const publishRoots = (): void => {
    services.post({ type: 'allowRoots', roots: roots.roots() });
  };
  /* The session's user id rides with the bearer as the launcher's `principal` (GI-Q6). */
  const publishCredential = (): void => {
    services.post({ type: 'authToken', token: auth.token(), principal: auth.principal() });
  };
  /* Kernel utilities run project code, so they get a Zoo-scoped token rather
   * than the session: it opens Tau's Zoo proxy as this user and nothing else. */
  const zooProxyToken = createZooProxyTokenSource({
    apiUrl: environment['TAU_API_URL']!.replace(/\/$/u, ''),
    proxyUrl: `${environment['TAU_WEBSOCKET_URL']!}/v1/kernels/zoo`,
    sessionToken: () => auth.token(),
    publish: (frame) => {
      runtimeMain.post(frame);
    },
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });
  const publishZooProxyToken = (): void => {
    // async-iife: bootstrap -- the source logs its own failures and keeps the last good token.
    void (async (): Promise<void> => {
      try {
        await zooProxyToken.update();
      } catch (error) {
        log.log('warn', 'zoo-token.update-failed', { message: error instanceof Error ? error.message : String(error) });
      }
    })();
  };
  /* `get-session` names the user; a restored or fresh sign-in asks once rather than waiting for the hourly probe. */
  const identify = (): void => {
    if (auth.token() === undefined || auth.principal() !== undefined) {
      return;
    }
    // async-iife: bootstrap -- a failed probe leaves the principal unknown until the next refresh, as before.
    void (async (): Promise<void> => {
      try {
        await auth.refresh();
      } catch (error) {
        log.log('warn', 'auth.identify-failed', error);
      }
    })();
  };

  await auth.restore();
  publishRoots();
  publishCredential();
  publishZooProxyToken();
  identify();

  /* E7's daemon-capability half: launcher 2 runs in the services utility with a
   * bearer transport (E11's option exists for exactly this host — nothing else
   * constructs it). Configured here rather than left to a renderer request
   * because main owns the gateway URL and the credential; the *workspace root*
   * is not here, because it is per-connection and arrives with the port. */
  /* W4-ACP: which external agents *this machine* can actually start — the
   * pinned adapters that resolve beside this app, minus any whose CLI does not
   * answer `--version`. Resolved here, once, because both halves need the same
   * answer: the utility builds launcher 2's port from the adapters, and the
   * renderer draws one selector row per id out of the preload bootstrap. A
   * machine with neither installed advertises nothing; it is never a refusal. */
  /* Measured on an M-series host, 20 `--version` runs each: `claude` 10 ms warm
   * / 89 ms cold, `codex` 10 ms warm / 13 ms cold. Both probes run together, so
   * boot pays the slower one; 1.5 s is ~17x the worst observed and only bites a
   * CLI that hangs, which is the case the timeout exists for.
   *
   * The *model* probe runs beside it on its own 15 s clock (V5 / EQ1 A): it
   * opens a real vendor session, which can take over 5 s through a cold
   * packaged app.asar adapter. A failure or timeout leaves the agent
   * advertised with no model list; a logged-out CLI cannot remove the row. */
  /**
   * Discover the external agents and configure the host with them.
   *
   * A discovery that rejects must not take the process with it: the page then
   * sees no external agents, which is the same answer a machine with no CLI
   * gives.
   *
   * @returns The descriptors, empty when discovery failed.
   */
  const discoverExternalAgents = async (): Promise<readonly ExternalAgentDescriptor[]> => {
    const baseConfig = {
      gatewayBaseUrl: desktopAgentGatewayBaseUrl(environment),
      systemPrompt: desktopAgentSystemPrompt,
      tauApiUrl: environment['TAU_API_URL']!,
      tauWebSocketUrl: environment['TAU_WEBSOCKET_URL']!,
    };
    try {
      const acp = await discoverAcpAgents({ resolveFrom: import.meta.url, probeTimeout: 1500 });
      log.log('info', 'agent-host.external-agents', {
        agents: acp.agents.map((adapter) => `${adapter.id}:${(adapter.models ?? []).length}`),
        refused: acp.refused.map((refusal) => `${refusal.id}: ${refusal.code}`),
      });
      services.post({
        type: 'agentHost',
        config: {
          ...baseConfig,
          externalAgents: acp.agents,
        },
      });
      /* The one canonical descriptor (VSC1): the renderer draws its rows from this,
       * the utility gets the adapters themselves, and neither builds its own idea
       * of what an agent is called or which models it offers. */
      return externalAgentDescriptors(acp);
    } catch (error) {
      log.log('error', 'agent-host.external-agents-failed', { message: String(error) });
      // Optional CLI discovery cannot leave the project's history and gateway unconfigured.
      services.post({ type: 'agentHost', config: baseConfig });
      return [];
    }
  };
  /* Not awaited here (D17): the window used to be unable to exist until this
   * settled, because the descriptors were frozen into its `additionalArguments`.
   * They are served over `externalAgentsChannel` instead, so a hanging CLI or a
   * slow model probe delays no pixel. */
  const externalAgents = discoverExternalAgents();

  auth.onChange(() => {
    publishCredential();
    publishZooProxyToken();
    identify();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('tau:auth-changed');
    }
  });

  /* Every IPC entry point is pinned to the app's own top-level document. The
   * preload re-runs on whatever the window navigates to, so without this a
   * foreign origin that got loaded in-window would inherit the whole bridge —
   * a filesystem port over every granted root included. The navigation guards
   * below make that hard; these checks make it not worth trying. */
  /* Takes the frame rather than the event because Electron reports it as
   * nullable and the workspace bans `null` in a type position. */
  const trusted = (frame: unknown): boolean => {
    const senderFrame = (frame ?? undefined) as SenderFrame | undefined;
    if (isTrustedSender(senderFrame, origins)) {
      return true;
    }
    log.log('error', 'ipc.untrusted-sender', { url: senderFrame?.url });
    return false;
  };

  const updaterReady = Promise.withResolvers<DesktopUpdater>();
  ipcMain.handle(desktopUpdateChannels.snapshot, async (event) => {
    if (!trusted(event.senderFrame)) {
      throw new Error('Untrusted update request');
    }
    const updater = await updaterReady.promise;
    return updater.snapshot();
  });
  ipcMain.handle(desktopUpdateChannels.check, async (event) => {
    if (!trusted(event.senderFrame)) {
      throw new Error('Untrusted update request');
    }
    const updater = await updaterReady.promise;
    await updater.check();
  });
  ipcMain.handle(desktopUpdateChannels.install, async (event) => {
    if (!trusted(event.senderFrame)) {
      throw new Error('Untrusted update request');
    }
    const updater = await updaterReady.promise;
    await updater.install();
  });
  ipcMain.handle(desktopUpdateChannels.download, async (event) => {
    if (!trusted(event.senderFrame)) {
      throw new Error('Untrusted update request');
    }
    const updater = await updaterReady.promise;
    await updater.download();
  });

  ipcMain.handle(desktopNativeKernelChannels.prepare, async (event, kernel: unknown) => {
    if (!trusted(event.senderFrame) || typeof kernel !== 'string') {
      throw new Error('Untrusted kernel preparation request');
    }
    return nativeKernels.prepare(kernel);
  });
  ipcMain.handle(desktopNativeKernelChannels.cancel, async (event, kernel: unknown) => {
    if (!trusted(event.senderFrame) || typeof kernel !== 'string') {
      throw new Error('Untrusted kernel preparation request');
    }
    nativeKernels.cancel(kernel);
  });

  ipcMain.handle(externalAgentsChannel, async (event) => (trusted(event.senderFrame) ? externalAgents : []));
  /* Blueprint D12: the Print pane's Bambu Studio presets and settings. The
   * service parses every input; this guard keeps other senders out. */
  const bambuStudio = machinesEnabled
    ? createBambuStudioService({ env: environment, pathOverride: !environmentLocked })
    : undefined;
  for (const [channel, call] of [
    [slicersChannels.bambuStudio.status, 'status'],
    [slicersChannels.bambuStudio.catalog, 'catalog'],
    [slicersChannels.bambuStudio.resolveSelection, 'resolveSelection'],
    [slicersChannels.bambuStudio.settings, 'settings'],
  ] as const) {
    ipcMain.handle(channel, async (event, input: unknown) => {
      if (!trusted(event.senderFrame)) {
        throw new Error('Desktop shell refused Bambu Studio request.');
      }
      if (bambuStudio === undefined) {
        throw new Error(machinesDisabledMessage);
      }
      return bambuStudio[call](input);
    });
  }
  ipcMain.handle('tau:auth:sign-in', async (event) => {
    if (trusted(event.senderFrame)) {
      await auth.signIn();
    }
  });
  ipcMain.handle('tau:auth:sign-out', async (event) => {
    if (trusted(event.senderFrame)) {
      await auth.signOut();
    }
  });
  ipcMain.on(appIconThemeChannel, (event, theme: unknown) => {
    if (!trusted(event.senderFrame) || (theme !== 'light' && theme !== 'dark')) {
      return;
    }
    const icon = themedApplicationIcon(theme);
    app.dock?.setIcon(icon);
    BrowserWindow.fromWebContents(event.sender)?.setIcon(icon);
  });

  const handleQuickLook = (
    event: IpcMainInvokeEvent,
    action: (controller: QuickLookController) => void,
  ): QuickLookResult => {
    if (!trusted(event.senderFrame) || process.platform !== 'darwin') {
      return { success: false, error: 'Quick Look is available only from the trusted macOS desktop renderer.' };
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const controller = window === null ? undefined : quickLookControllers.get(window.id);
    if (!controller) {
      return { success: false, error: 'The Quick Look window is no longer available.' };
    }
    try {
      action(controller);
      return { success: true };
    } catch (error) {
      log.log('error', 'quick-look.failed', error);
      return { success: false, error: error instanceof Error ? error.message : 'Quick Look failed.' };
    }
  };

  if (isQuickLookEnabled()) {
    ipcMain.handle(quickLookIpcChannels.previewPath, (event, payload: unknown) =>
      handleQuickLook(event, (controller) => {
        controller.previewPath(payload);
      }),
    );
    ipcMain.handle(quickLookIpcChannels.previewUsdz, (event, payload: unknown) =>
      handleQuickLook(event, (controller) => {
        controller.previewUsdz(payload);
      }),
    );
    ipcMain.on(quickLookIpcChannels.close, (event) => {
      if (!trusted(event.senderFrame)) {
        return;
      }
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window !== null) {
        quickLookControllers.get(window.id)?.close();
      }
    });
  }
  ipcMain.handle(openFilesIpcChannel, async (event) => {
    if (!trusted(event.senderFrame)) {
      return [];
    }
    try {
      return await openFiles.consume();
    } catch (error) {
      log.log('error', 'open-files.failed', error);
      throw error;
    }
  });
  ipcMain.handle(generatedImageIpcChannel, async (event, path: unknown) => {
    if (!trusted(event.senderFrame)) {
      throw new Error('Untrusted generated image request.');
    }
    return readGeneratedImage(path, app.getPath('home'));
  });

  /* Test-only, and only in a development build — the same gate `TAU_DESKTOP_TOKEN`
   * rides. A modal native dialog cannot be driven from an automated run, and the
   * renderer only ever sees an absolute path, so this one function is the whole
   * seam the smoke lane needs. */
  const seededPick = app.isPackaged ? undefined : environment['TAU_E2E_PICK_DIRECTORY'];

  /* `showDirectoryPicker({ id })` reopens at whatever the user last chose under
   * that id; Electron's dialog has no such memory, so main keeps it. Same
   * observable behaviour, which is what the shared picker seam promises. */
  const lastDirectoryById = new Map<string, string>();

  ipcMain.handle(openDirectoryChannel, async (event, path: unknown) => {
    if (!trusted(event.senderFrame) || typeof path !== 'string' || path.includes('\0')) {
      throw new Error('Desktop shell refused the directory request.');
    }
    const directory = roots.canonical(path);
    if (directory === undefined) {
      throw new Error('Reopen this folder from Tau before opening it in the file manager.');
    }
    const info = await stat(directory);
    if (!info.isDirectory()) {
      throw new Error('The project directory is no longer a folder.');
    }
    const error = await shell.openPath(directory);
    if (error) {
      throw new Error(error);
    }
  });

  /* A file opens in its default app under `openPath`, so a file or folder the
   * person names inside a project is selected in its parent instead. */
  ipcMain.handle(revealPathChannel, async (event, path: unknown) => {
    if (!trusted(event.senderFrame) || typeof path !== 'string' || path.includes('\0')) {
      throw new Error('Desktop shell refused the reveal request.');
    }
    const target = roots.canonical(path);
    if (target === undefined) {
      throw new Error('Reopen this folder from Tau before revealing it in the file manager.');
    }
    await stat(target);
    shell.showItemInFolder(target);
  });

  ipcMain.handle('tau:select-directory', async (event, options: unknown) => {
    if (!trusted(event.senderFrame)) {
      return undefined;
    }
    const pickerId = (options as { id?: unknown } | undefined)?.id;
    const rememberedFor = typeof pickerId === 'string' ? pickerId : undefined;
    const directory = await (async () => {
      if (seededPick !== undefined) {
        return seededPick;
      }
      const window = BrowserWindow.fromWebContents(event.sender);
      const remembered = rememberedFor === undefined ? undefined : lastDirectoryById.get(rememberedFor);
      const request = {
        properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
        ...(remembered === undefined ? {} : { defaultPath: remembered }),
      };
      const result = await (window ? dialog.showOpenDialog(window, request) : dialog.showOpenDialog(request));
      return result.canceled ? undefined : result.filePaths[0];
    })();
    if (rememberedFor !== undefined && directory !== undefined) {
      lastDirectoryById.set(rememberedFor, directory);
    }
    if (directory === undefined) {
      return undefined;
    }
    /* The picker *is* the admission event: a root becomes nameable by the
     * renderer only because a human chose it here, and the grant is persisted
     * so the folder is still reachable on the next launch. */
    roots.admit(directory);
    publishRoots();
    log.log('info', 'dialog.directory-admitted', { directory, seeded: seededPick !== undefined });
    return directory;
  });

  ipcMain.on(servicesPortRelayTag, (event, payload: unknown) => {
    if (!trusted(event.senderFrame)) {
      return;
    }
    const { requestId, concern, context } = (payload ?? {}) as {
      requestId?: unknown;
      concern?: unknown;
      context?: unknown;
    };
    if (typeof requestId !== 'string') {
      return;
    }
    /* A refusal is an answer. The renderer awaits this relay for its request
     * id, so returning in silence left `nodeFs` and the agent host waiting on a
     * port main had already decided never to send. The frame can be gone by the
     * time a refusal is written — at quit, where the broker refuses by design. */
    const refuse = (reason: string): void => {
      try {
        event.senderFrame?.postMessage(servicesPortRelayTag, { requestId, error: reason });
      } catch {
        /* The renderer that asked is gone; there is nobody left to tell. */
      }
    };
    /* The renderer names the concern; main validates it against the served set
     * rather than ignoring it, so a future second concern cannot be reached by
     * a stale caller and today's only one cannot be mistyped into silence. */
    if (!rendererServicesConcerns.includes(concern as ServicesConcern)) {
      log.log('error', 'services.unknown-concern', { concern });
      refuse('services.unknown-concern');
      return;
    }
    if (concern === 'machines' && !machinesEnabled) {
      refuse(machinesDisabledMessage);
      return;
    }
    try {
      const resolved = sanitizeServicesContext(context);
      /* Launcher 2 is scoped to one workspace root, and the renderer names it —
       * so it passes the same registry the kernel fork resolver uses. Refusing
       * outright rather than substituting Home: an agent host working over the
       * wrong directory is worse than no agent host. Machines need no root:
       * printers belong to the per-user store, and a job names its own
       * project. */
      if (concern === 'agentHost' && !roots.isTrusted(resolved['workspaceRoot'] ?? '')) {
        log.log('error', 'services.untrusted-root', { concern, workspaceRoot: resolved['workspaceRoot'] });
        refuse('services.untrusted-root');
        return;
      }
      if (
        concern === 'agentHost' &&
        resolved['computeMode'] !== 'off' &&
        resolved['computeMode'] !== 'memory' &&
        resolved['computeMode'] !== 'durable'
      ) {
        log.log('error', 'services.invalid-compute-mode');
        refuse('services.invalid-compute-mode');
        return;
      }
      const port =
        concern === 'exactMeasurement'
          ? geometry.connectMeasurement()
          : services.connect(concern as ServicesConcern, resolved);
      event.senderFrame?.postMessage(servicesPortRelayTag, { requestId }, [port]);
    } catch (error) {
      /* Quit and reload refuse new concerns by design: an expected answer the
       * requester settles, not a connection failure or a capture defect. */
      if (error instanceof ServicesQuiescingError) {
        log.log('info', 'services.connect-refused-quiescing', { concern });
        refuse('services.quiescing');
        return;
      }
      log.log('error', 'services.connect-failed', error);
      refuse('services.connect-failed');
    }
  });

  /**
   * One in-app route, as an absolute URL for whichever renderer is serving.
   *
   * @param path - Route path, already validated by whoever produced it.
   * @returns The URL to load.
   */
  const rendererUrl = (path: string): string =>
    new URL(path, isDevelopment ? environment.ELECTRON_RENDERER_URL! : `${appOrigin}/`).href;

  const createMainWindow = async (): Promise<BrowserWindow> => {
    /* Reopen where the user left the window; the first launch fills the work
     * area (display minus menu bar and dock) of the display the user launched
     * from. */
    const saved = readWindowState(
      windowStatePath,
      screen.getAllDisplays().map((display) => display.workArea),
    );
    const window = new BrowserWindow({
      ...(saved?.bounds ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea),
      show: false,
      icon: applicationIcon,
      title: 'Tau',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        focusOnNavigation: !hideTestWindow,
        /* No DevTools in a packaged build: they run script in the `app://tau`
         * main world, which holds the whole preload bridge. */
        devTools: !app.isPackaged,
        contextIsolation: true,
        nodeIntegration: false,
        /* `sandbox: false` because the preload is ESM; the CJS-preload fix is
         * post-POC hygiene (G18), not a security regression — context
         * isolation is what fences the renderer. */
        sandbox: false,
        preload: join(import.meta.dirname, '../preload/preload.mjs'),
        additionalArguments: [
          `${bootstrapArgumentPrefix}${JSON.stringify({
            env: clientEnvironment(environment),
            homeRoot,
            runtimeKernelIds: desktopNativeKernelIds(),
          })}`,
        ],
      },
    });
    if (isQuickLookEnabled()) {
      quickLookControllers.set(
        window.id,
        createQuickLookController({
          maxOutputBytes: quickLookManifest.limits.maxOutputBytes,
          registry: roots,
          temporaryRoot: quickLookTemporaryRoot,
          window,
        }),
      );
    }
    const publishFullscreen = (): void => {
      window.webContents.send(windowFullscreenChannel, window.isFullScreen());
    };
    window.on('enter-full-screen', publishFullscreen);
    window.on('leave-full-screen', publishFullscreen);
    window.webContents.on('did-finish-load', publishFullscreen);
    window.once('close', () => {
      try {
        writeWindowState(windowStatePath, {
          bounds: window.getNormalBounds(),
          maximized: window.isMaximized(),
          fullScreen: window.isFullScreen(),
        });
      } catch (error) {
        log.log('warn', 'window-state.write-failed', { message: String(error) });
      }
      quickLookControllers.get(window.id)?.dispose();
      quickLookControllers.delete(window.id);
    });
    forwardRendererDiagnostics(window.webContents, log, () => {
      if (!quitting && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.reload();
      }
    });

    /* Deny every new window and every in-window navigation away from the app,
     * sending real links to the user's browser instead. `will-redirect` is
     * listed beside `will-navigate` because a server-side redirect never fires
     * the latter. */
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (navigationDecision(url, origins) === 'open-externally') {
        void shell.openExternal(url);
      }
      log.log('info', 'navigation.window-open-denied', { url });
      return { action: 'deny' };
    });
    const guardNavigation =
      (event: 'will-navigate' | 'will-redirect') =>
      (navigation: { preventDefault: () => void }, url: string): void => {
        const decision = navigationDecision(url, origins);
        if (quitting) {
          navigation.preventDefault();
          return;
        }
        if (decision === 'allow') {
          return;
        }
        navigation.preventDefault();
        if (decision === 'open-externally') {
          void shell.openExternal(url);
        }
        log.log('warn', 'navigation.blocked', { event, url, decision });
      };
    window.webContents.on('will-navigate', guardNavigation('will-navigate'));
    window.webContents.on('will-redirect', guardNavigation('will-redirect'));

    await window.loadURL(rendererUrl(openFiles.hasPending() ? '/import?desktop-open=1' : '/'));
    if (!hideTestWindow) {
      if (saved?.maximized) {
        window.maximize();
      }
      window.show();
      if (saved?.fullScreen) {
        window.setFullScreen(true);
      }
    }
    return window;
  };

  await createMainWindow();
  showOpenFileImport = () => {
    if (quitting) {
      return;
    }
    const window = BrowserWindow.getAllWindows()[0];
    if (!window || window.webContents.getURL().includes('/import?desktop-open=1')) {
      return;
    }
    const navigate = async (): Promise<void> => {
      await window.loadURL(rendererUrl('/import?desktop-open=1'));
      if (!hideTestWindow) {
        window.show();
        window.focus();
      }
    };
    // async-iife: bootstrap -- Electron event callbacks do not consume promises.
    void navigate();
  };
  if (openFiles.hasPending()) {
    showOpenFileImport();
  }

  /*
   * Opening a deep link is a window navigation, not a channel of its own.
   *
   * Every content link resolves to an in-app route the renderer already serves,
   * loaded exactly the way an Open With file loads `/import?desktop-open=1`;
   * the route owns what a signed-out person sees, so main holds nothing back.
   * The sign-in callback is the exception: it carries a credential, is redeemed
   * here, and never reaches the renderer.
   */
  const openDeepLink = async (value: string): Promise<void> => {
    if (quitting) {
      queuedDeepLink = value;
      focusMainWindow();
      return;
    }
    try {
      const link = parseDeepLink(value);
      if (link === undefined) {
        /* A custom scheme has no ownership proof, so a link that is not one of
         * the links the app publishes is another application's, or an attempt. */
        /* Only the shape: a malformed sign-in callback still carries a live
         * one-time token in its query, a refused invitation carries its token in
         * the path, and a share fragment is the payload. */
        log.log('warn', 'deep-link.refused', {
          target: /^tau:\/\/([\w-]{1,32})/iu.exec(value)?.[1],
          length: value.length,
        });
      } else if (link.kind === 'auth-callback') {
        await auth.handleCallback(link);
      } else {
        log.log('info', 'deep-link.opened', { kind: link.kind });
        /* On macOS the app stays alive with every window closed. */
        const window = BrowserWindow.getAllWindows()[0] ?? (await createMainWindow());
        if (link.kind === 'machine') {
          window.webContents.send(quitChannels.navigate, link.route);
        } else if (link.kind === 'host') {
          /* The page redeems the single-use code at the loopback daemon the link named (X54); it is not a route. */
          window.webContents.send(hostHandOffChannel, { origin: link.origin, code: link.code });
        } else {
          await window.loadURL(rendererUrl(link.route));
        }
      }
    } catch (error) {
      log.log('error', 'deep-link.failed', error);
    }
    /* Whatever the outcome, the person clicked something: come forward and say
     * so, rather than leaving the app behind the browser doing nothing. */
    focusMainWindow();
  };
  deliverDeepLink = (value) => {
    // async-iife: bootstrap -- Electron event callbacks do not consume promises.
    void openDeepLink(value);
  };
  if (queuedDeepLink !== undefined) {
    const queued = queuedDeepLink;
    queuedDeepLink = undefined;
    deliverDeepLink(queued);
  }

  app.on('activate', () => {
    if (!quitting && BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  const resumeQueuedNavigation = (): void => {
    if (queuedDeepLink !== undefined) {
      const queued = queuedDeepLink;
      queuedDeepLink = undefined;
      deliverDeepLink?.(queued);
    } else if (openFiles.hasPending()) {
      showOpenFileImport?.();
    }
  };

  let shutdownComplete = false;
  const shutdownDriver = createCallbackLogic<EventObject, ShutdownDriverInput>(({ input, sendBack }) => {
    let active = true;
    const { context, stage } = input;
    const done = (
      result: Extract<ShutdownMachineEvent, { type: 'done' }>['result'],
      extra: Partial<Extract<ShutdownMachineEvent, { type: 'done' }>> = {},
    ): void => {
      if (active) {
        sendBack({ type: 'done', attemptId: context.attemptId, result, ...extra });
      }
    };
    // async-iife: bootstrap -- the invoked actor owns cancellation of the completion.
    void (async () => {
      try {
        switch (stage) {
          case 'assessing': {
            try {
              const machines = await services.streamingMachines(machineStreamingMilliseconds, context.attemptId);
              done(machines.length === 0 ? 'clear' : 'review', { machines });
            } catch (error) {
              done('review', { error: String(error) });
            }
            break;
          }
          case 'reviewing': {
            const names = context.machines?.map(({ name }) => name);
            const { response } = await dialog.showMessageBox({
              type: 'warning',
              buttons: ['View machines', 'Keep Tau open', 'Quit anyway'],
              defaultId: 0,
              cancelId: 1,
              message: names?.length
                ? `Tau is streaming a program to ${new Intl.ListFormat('en', { type: 'conjunction' }).format(names)}.`
                : 'Tau could not check whether a machine needs this connection.',
              detail:
                'Open Machines to review the run and use its stop control. Keep Tau open while it finishes, or explicitly quit and interrupt the connection. Quitting is not an emergency stop; buffered motion may continue.',
            });
            done(response === 0 ? 'view' : response === 2 ? 'force' : 'cancel');
            break;
          }
          case 'confirming': {
            const { response } = await dialog.showMessageBox({
              type: 'warning',
              buttons: ['Go back', 'Quit anyway'],
              defaultId: 0,
              cancelId: 0,
              message: 'Quit and interrupt machine connections?',
              detail:
                'A streamed program may be left incomplete. The machine may continue buffered motion after Tau exits. Use the physical emergency stop if needed. Unsaved project changes may also be lost. Tau will not automatically resend a program on restart.',
            });
            done(response === 1 ? 'confirmed' : 'cancel');
            break;
          }
          case 'renderer': {
            const outcome = await askRendererToQuiesce(quitRendererMilliseconds, context.attemptId);
            log.log('info', 'main.renderer-quiesce', { outcome });
            done(outcome === 'timeout' ? 'failed' : 'settled', {
              error: outcome === 'timeout' ? 'An open window has not finished saving its projects.' : undefined,
            });
            break;
          }
          case 'utility': {
            const outcome = await services.quiesce(quitQuiesceMilliseconds, {
              attemptId: context.attemptId,
              forceMachines: context.forceMachines,
            });
            log.log(
              outcome.status === 'quiesced' || outcome.status === 'no-utility' ? 'info' : 'error',
              'main.quiesce',
              { outcome },
            );
            done(outcome.status === 'quiesced' || outcome.status === 'no-utility' ? 'settled' : 'failed', {
              error: `Project settlement: ${outcome.status}.`,
              retryable:
                outcome.status === 'timeout' ||
                outcome.status === 'streaming' ||
                outcome.status === 'streaming-unknown',
            });
            break;
          }
          case 'settlementReview': {
            const { response } = await dialog.showMessageBox({
              type: 'warning',
              buttons: context.retryable
                ? ['Retry saving', 'Keep Tau open', 'Quit anyway']
                : ['Restore workspace', 'Quit anyway'],
              defaultId: 0,
              cancelId: context.retryable ? 1 : 0,
              message: 'Tau has not finished saving every project.',
              detail: `${context.error ?? ''} Retry saving, or restore the app after pending saves settle. Quitting anyway may lose changes.`,
            });
            done(
              context.retryable
                ? response === 0
                  ? 'retry'
                  : response === 2
                    ? 'force'
                    : 'recover'
                : response === 1
                  ? 'force'
                  : 'recover',
            );
            break;
          }
          case 'recovering': {
            const outcome = await askRendererToQuiesce(quitRendererMilliseconds, context.attemptId);
            if (outcome === 'timeout') {
              throw new Error('Pending edits have not finished saving. Retry recovery to preserve them.');
            }
            if (outcome === 'forced') {
              const { response } = await dialog.showMessageBox({
                type: 'warning',
                buttons: ['Review again', 'Restore and discard unsaved changes'],
                defaultId: 0,
                cancelId: 0,
                message: 'Some renderer edits were not saved.',
                detail:
                  'An earlier Quit anyway skipped these saves. Restoring reloads the workspace from its last saved state and may discard those edits.',
              });
              if (response !== 1) {
                throw new Error('Restoring needs your decision about unsaved renderer edits.');
              }
            }
            await services.recover(context.attemptId, quitQuiesceMilliseconds);
            quitting = false;
            for (const window of BrowserWindow.getAllWindows()) {
              if (!window.isDestroyed()) {
                window.reload();
              }
            }
            resumeQueuedNavigation();
            done('settled');
            settleShutdown?.(false);
            shutdownPending = undefined;
            settleShutdown = undefined;
            break;
          }
          case 'recoveryReview': {
            const { response } = await dialog.showMessageBox({
              type: 'warning',
              buttons: ['Retry recovery', 'Quit anyway'],
              defaultId: 0,
              cancelId: 0,
              message: 'Tau is waiting to restore your workspace.',
              detail: context.error ?? 'Pending saves must settle before the workspace can reopen.',
            });
            done(response === 1 ? 'force' : 'retry');
            break;
          }
          case 'cancelling':
          case 'viewing': {
            services.resumeMachineStarts(context.attemptId);
            quitting = false;
            resumeQueuedNavigation();
            if (stage === 'viewing') {
              const machine = context.machines?.length === 1 ? context.machines[0] : undefined;
              const route = machine
                ? `/machines/${encodeURIComponent(machine.hostId)}/${encodeURIComponent(machine.machineId)}`
                : '/machines';
              const window = BrowserWindow.getAllWindows()[0] ?? (await createMainWindow());
              window.webContents.send(quitChannels.navigate, route);
              focusMainWindow();
            }
            done('settled');
            settleShutdown?.(false);
            shutdownPending = undefined;
            settleShutdown = undefined;
            break;
          }
          case 'exiting': {
            try {
              showOpenFileImport = undefined;
              for (const controller of quickLookControllers.values()) {
                controller.dispose();
              }
              quickLookControllers.clear();
              auth.dispose();
            } catch (error) {
              log.log('error', 'main.shutdown', error);
            }
            stopKeepingAwake();
            try {
              await services.dispose();
            } catch (error) {
              log.log('error', 'main.shutdown', error);
            }
            try {
              await geometry.dispose();
            } catch (error) {
              log.log('error', 'main.shutdown', error);
            }
            zooProxyToken.dispose();
            nativeStoreAbort.abort();
            await nativeStore;
            await nativeKernels.dispose();
            try {
              runtimeMain.dispose();
            } catch (error) {
              log.log('error', 'main.shutdown', error);
            }
            try {
              for (const { connection } of computeConnections.values()) {
                connection.dispose();
              }
              computeConnections.clear();
              await computeWorker?.terminate();
              computeWorker = undefined;
            } catch (error) {
              log.log('error', 'main.shutdown', error);
            }
            shutdownComplete = true;
            done('settled');
            settleShutdown?.(true);
            break;
          }
        }
      } catch (error) {
        done('failed', { error: String(error) });
      }
    })();
    return () => {
      active = false;
    };
  });
  const shutdown = createShutdownActor({ identity: randomUUID() }, { actors: { shutdownDriver } }).start();
  let shutdownPending: Promise<boolean> | undefined;
  let settleShutdown: ((settled: boolean) => void) | undefined;
  const prepareToQuit = async (purpose: 'quit' | 'restart'): Promise<boolean> => {
    if (shutdownComplete) {
      return true;
    }
    if (shutdownPending) {
      return shutdown.getSnapshot().context.purpose === purpose ? shutdownPending : false;
    }
    quitting = true;
    shutdownPending = new Promise<boolean>((resolve) => {
      settleShutdown = resolve;
    });
    shutdown.send({ type: 'quit', purpose });
    return shutdownPending;
  };
  let pendingQuit: Promise<void> | undefined;
  const quitWhenReady = async (): Promise<void> => {
    try {
      if (await prepareToQuit('quit')) {
        app.quit();
      }
    } finally {
      pendingQuit = undefined;
    }
  };
  app.on('before-quit', (event) => {
    if (shutdownComplete) {
      return;
    }
    event.preventDefault();
    pendingQuit ??= quitWhenReady();
  });
  if (otaProbe) {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) {
      throw new Error('OTA probe has no renderer window');
    }
    const deadline = Date.now() + 120_000;
    let ready = false;
    /* oxlint-disable no-await-in-loop -- Observe one renderer's real quit registration before updater admission. */
    while (Date.now() < deadline) {
      const observed: unknown = await window.webContents.executeJavaScript(
        'location.protocol === "app:" && location.host === "tau" && document.querySelector("main") !== null && globalThis.tau?.quit?.isReady() === true',
      );
      if (observed === true) {
        ready = true;
        break;
      }
      await sleep(250);
    }
    /* oxlint-enable no-await-in-loop */
    if (!ready) {
      throw new Error('OTA renderer did not become ready with its save handler');
    }
    otaProbe.complete();
  }
  /* Start only once the shared shutdown owner and normal application startup are ready. */
  const updater = startDesktopUpdater({
    platform: process.platform,
    arch: process.arch,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    channel: desktopChannel,
    environment,
    autoUpdater,
    prepareToRestart: async () => prepareToQuit('restart'),
    ...(otaProbe ? { candidateTag: otaProbe.candidateTag } : {}),
    fetchJson: async (url) => {
      const response = await net.fetch(url);
      if (!response.ok) {
        throw new Error(`update feed answered ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    },
    installForProbe: otaProbe !== undefined,
    onState: (snapshot) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && trusted(window.webContents.mainFrame)) {
          window.webContents.send(desktopUpdateChannels.changed, snapshot);
        }
      }
    },
    openExternal: async (url) => shell.openExternal(url),
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });

  updaterReady.resolve(updater);
  const checkForUpdates = async (): Promise<void> => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
    focusMainWindow();
    await updater.check(true);
  };
  const applicationMenu = Menu.getApplicationMenu();
  const appSubmenu = applicationMenu?.items[0]?.submenu;
  if (applicationMenu && appSubmenu) {
    appSubmenu.insert(
      1,
      new MenuItem({
        label: 'Check for Updates…',
        click: () => {
          void checkForUpdates();
        },
      }),
    );
    // Native menus must be reinstalled after adding items.
    Menu.setApplicationMenu(applicationMenu);
  }
};

/* Electron fires `ready` only after the main ESM module finishes evaluating, so
 * a top-level `await app.whenReady()` deadlocks the app silently (observed live
 * in the L0 probe). Detach the bootstrap instead. */
/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- see comment above */
if (ownsSingleInstanceLock) {
  bootstrapElectronApp().catch((error: unknown) => {
    console.error('[desktop] bootstrap failed', error);
    app.exit(1);
  });
} else {
  app.quit();
}
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */
