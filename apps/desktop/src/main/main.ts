/**
 * Electron main process (work item E2).
 *
 * Main brokers and nothing else: the window, `app://` delivery, response and
 * request headers, one kernel utility per client, one singleton services
 * utility, the auth service, native dialogs, and the diagnostics sinks. Heavy
 * work — kernels, disk, the agent host — lives in the utilities.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageChannelMain,
  net,
  protocol,
  safeStorage,
  session,
  shell,
  utilityProcess,
} from 'electron';
import type { IpcMainInvokeEvent, MessageBoxOptions } from 'electron';
import { installElectronRuntimeHeaders, registerElectronRuntimeMain } from '@taucad/runtime/electron/main';

import kernelUtilityEntry from '#tau/kernel-host?modulePath';
import servicesUtilityEntry from '#tau/services-host?modulePath';

import { appOrigin, appSchemePrivileges, registerAppProtocol } from '#main/app-protocol.js';
import { createAuthService } from '#main/auth-service.js';
import { createDiagnosticsLog, forwardRendererDiagnostics, forwardUtilityDiagnostics } from '#main/diagnostics.js';
import {
  clientEnvironment,
  desktopAgentModel,
  desktopAgentSystemPrompt,
  desktopEnvironment,
} from '#main/environment.js';
import { installTauHeaderInjection, originOf } from '#main/header-injection.js';
import {
  contentSecurityPolicy,
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
import { createServicesBroker, servicesConcerns } from '#main/services-broker.js';
import type { ServicesConcern } from '#main/services-broker.js';
import { utilityEnvironment } from '#main/utility-environment.js';
import { createQuickLookController, removeStaleQuickLookSessions } from '#main/quick-look.js';
import type { QuickLookController } from '#main/quick-look.js';
import { createOpenFileQueue } from '#main/open-files.js';
import { createNativeProjectTrustStore } from '#main/native-project-trust.js';
import {
  appIconThemeChannel,
  bootstrapArgumentPrefix,
  desktopNativeKernelIds,
  nativeCodeTrustChannels,
  servicesPortRelayTag,
} from '#shared/desktop-bootstrap.js';
import type { AppIconTheme } from '#shared/desktop-bootstrap.js';
import { openFilesIpcChannel, quickLookIpcChannels } from '#shared/quick-look.js';
import type { QuickLookResult } from '#shared/quick-look.js';
import quickLookManifest from '#macos/quick-look-formats.json' with { type: 'json' };

/* Must precede `app.whenReady()`: a scheme cannot gain `standard`/`secure`
 * privileges once the network service has started. */
protocol.registerSchemesAsPrivileged([...appSchemePrivileges]);

const isDevelopment = process.env.ELECTRON_RENDERER_URL !== undefined;
/* The built SPA, relative to `dist/main/`. Packaging (ruling C7) will relocate
 * this; an env override keeps the e2e lane free to point elsewhere meanwhile. */
const clientRoot =
  process.env['TAU_DESKTOP_CLIENT_ROOT'] ??
  (app.isPackaged
    ? join(process.resourcesPath, 'ui/client')
    : join(import.meta.dirname, '../../../ui/desktop/build/client'));
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

const ownsSingleInstanceLock = app.requestSingleInstanceLock();
app.on('second-instance', (_event, argv) => {
  enqueueOpenFiles(argv.slice(1));
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) {
    window.restore();
  }
  window?.show();
  window?.focus();
});

app.setName('Tau');
process.title = 'Tau';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.taucad.tau');
}

process.on('uncaughtException', (error) => {
  console.error('[tau-desktop:main] uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[tau-desktop:main] unhandledRejection', reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export const bootstrapElectronApp = async (): Promise<void> => {
  await app.whenReady();
  app.dock?.setIcon(applicationIcon);
  const environment = desktopEnvironment();

  const logDirectory = join(app.getPath('userData'), 'logs');
  const build123dResourceRoot = app.isPackaged
    ? join(process.resourcesPath, 'python')
    : join(import.meta.dirname, '../../resources/python');
  const picogkResourceRoot = app.isPackaged
    ? join(process.resourcesPath, 'picogk')
    : join(import.meta.dirname, '../../resources/picogk');
  const log = createDiagnosticsLog({ directory: logDirectory, echo: isDevelopment });
  log.log('info', 'main.ready', { electron: process.versions.electron, packaged: app.isPackaged, isDevelopment });

  /* L2's contract: the home root must exist before the renderer's first mount,
   * because `NodeFsProvider` realpath-checks its base. */
  const homeRoot = join(app.getPath('userData'), 'home');
  mkdirSync(homeRoot, { recursive: true });

  /* Grants outlive the session: the renderer keeps a picked folder's workspace
   * record in IndexedDB and offers it again on the next launch, so a grant main
   * forgot would answer `EACCES` for a folder the user believes is connected. */
  const roots = createProjectRootRegistry({ storePath: join(app.getPath('userData'), 'granted-roots.json') });
  roots.admit(homeRoot);
  const nativeTrust = createNativeProjectTrustStore({
    storePath: join(app.getPath('userData'), 'native-project-trust.json'),
    markerRoot: join(app.getPath('userData'), 'native-project-trust'),
  });
  const quickLookTemporaryRoot = join(app.getPath('temp'), 'tau-quick-look');
  removeStaleQuickLookSessions(quickLookTemporaryRoot);
  const quickLookControllers = new Map<number, QuickLookController>();

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

  /* Deny by default; see `grantedPermissions` for the single exception and why. */
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    const granted = isPermissionGranted(permission);
    log.log(granted ? 'info' : 'warn', granted ? 'permission.granted' : 'permission.denied', { permission });
    callback(granted);
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => isPermissionGranted(permission));

  /* Injection covers the API origin and, separately, the WebSocket origin —
   * `ws://localhost:4001` is not `http://localhost:4000`, and the chat RPC and
   * agent sockets are exactly the traffic a browser cannot decorate itself. */
  const allowedOrigins = [originOf(environment['TAU_API_URL']), originOf(environment['TAU_WEBSOCKET_URL'])].filter(
    (origin): origin is string => origin !== undefined,
  );
  installTauHeaderInjection(session.defaultSession.webRequest, {
    allowedOrigins,
    token: () => auth.token(),
    clientHeader: `tau-desktop/${app.getVersion()}`,
  });

  if (!isDevelopment) {
    registerAppProtocol({ clientRoot, protocol, net, contentSecurityPolicy: contentSecurityPolicy(allowedOrigins) });
    log.log('info', 'main.app-protocol-registered', { clientRoot });
  }

  registerElectronRuntimeMain({
    utilityEntry: kernelUtilityEntry,
    /* The kernel utility appends its engine-identity record (N5/N6) to the same
     * rotating log main writes, which is the e2e's only observable for which
     * engine actually loaded — the version never crosses the runtime wire. */
    env: utilityEnvironment(environment, {
      TAU_DESKTOP_LOG_DIR: logDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      TAU_BUILD123D_RESOURCE_ROOT: build123dResourceRoot, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      TAU_PICOGK_RESOURCE_ROOT: picogkResourceRoot, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
    }),
    forkEnvAllowlist: [...kernelForkEnvAllowlist],
    resolveFork: createKernelForkResolver({
      registry: roots,
      defaultRoot: homeRoot,
      nativeTrustMarkerPath: nativeTrust.markerPath,
    }),
    serviceName: 'tau-kernel-host',
    onError(error) {
      log.log('error', 'kernel.broker', error);
    },
  });

  const services = createServicesBroker({
    utilityEntry: servicesUtilityEntry,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE
    env: utilityEnvironment(environment, { TAU_DESKTOP_LOG_DIR: logDirectory }),
    fork: (entry, args, forkOptions) => utilityProcess.fork(entry, args, forkOptions),
    createChannel: () => new MessageChannelMain(),
    onSpawn: (utility) => {
      forwardUtilityDiagnostics('services', utility, log);
    },
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });
  const publishRoots = (): void => {
    services.post({ type: 'allowRoots', roots: roots.roots() });
  };
  const publishCredential = (): void => {
    services.post({ type: 'authToken', token: auth.token() });
  };

  await auth.restore();
  publishRoots();
  publishCredential();

  /* E7's daemon-capability half: launcher 2 runs in the services utility with a
   * bearer transport (E11's option exists for exactly this host — nothing else
   * constructs it). Configured here rather than left to a renderer request
   * because main owns the gateway URL and the credential; the *workspace root*
   * is not here, because it is per-connection and arrives with the port. */
  const gatewayBaseUrl = environment['TAU_API_URL']!;
  services.post({
    type: 'agentHost',
    config: {
      /* Test seam for the launcher-2 e2e leg: the services utility's gateway
       * calls are Node `fetch`, which Playwright cannot route the way it
       * routes the renderer's, so the smoke tier points them at its fixture
       * here. Production keeps the API's own gateway. */
      gatewayBaseUrl: environment['TAU_DESKTOP_AGENT_GATEWAY_URL'] ?? `${gatewayBaseUrl.replace(/\/$/u, '')}/v1/llm`,
      model: desktopAgentModel,
      systemPrompt: desktopAgentSystemPrompt,
    },
  });

  auth.onChange(() => {
    publishCredential();
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('tau:auth-changed');
    }
  });

  /* Every IPC entry point is pinned to the app's own top-level document. The
   * preload re-runs on whatever the window navigates to, so without this a
   * foreign origin that got loaded in-window would inherit the whole bridge —
   * a filesystem port over every granted root included. The navigation guards
   * below make that hard; these checks make it not worth trying. */
  const origins = rendererOrigins({ appOrigin, devServerUrl: environment.ELECTRON_RENDERER_URL });
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
  ipcMain.handle(nativeCodeTrustChannels.status, (event, projectRoot: unknown) => {
    if (!trusted(event.senderFrame) || typeof projectRoot !== 'string' || !roots.isTrusted(projectRoot)) {
      return false;
    }
    return nativeTrust.isTrusted(projectRoot);
  });
  ipcMain.handle(nativeCodeTrustChannels.grant, async (event, projectRoot: unknown) => {
    if (!trusted(event.senderFrame) || typeof projectRoot !== 'string' || !roots.isTrusted(projectRoot)) {
      return false;
    }
    const trustPrompt = {
      type: 'warning',
      title: 'Trust native code?',
      message: 'This project can run native language runtimes and libraries on your computer.',
      detail:
        'Only continue for code you trust. Native project code can read files, use the network, launch programs, and modify data with your user permissions.',
      buttons: ['Cancel', 'Trust and run'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    } satisfies MessageBoxOptions;
    const window = BrowserWindow.fromWebContents(event.sender);
    const trustWithoutPrompt = !app.isPackaged && environment['TAU_E2E_TRUST_NATIVE_CODE'] === '1';
    const promptResult = trustWithoutPrompt
      ? undefined
      : await (window ? dialog.showMessageBox(window, trustPrompt) : dialog.showMessageBox(trustPrompt));
    const accepted = trustWithoutPrompt || promptResult?.response === 1;
    if (!accepted) {
      return false;
    }
    nativeTrust.grant(projectRoot);
    log.log('warn', 'native-code.trusted', { projectRoot });
    return true;
  });
  ipcMain.handle(nativeCodeTrustChannels.revoke, (event, projectRoot: unknown) => {
    if (!trusted(event.senderFrame) || typeof projectRoot !== 'string' || !roots.isTrusted(projectRoot)) {
      return;
    }
    nativeTrust.revoke(projectRoot);
    log.log('warn', 'native-code.revoked', { projectRoot });
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

  /* Test-only, and only in a development build — the same gate `TAU_DESKTOP_TOKEN`
   * rides. A modal native dialog cannot be driven from an automated run, and the
   * renderer only ever sees an absolute path, so this one function is the whole
   * seam the smoke lane needs. */
  const seededPick = app.isPackaged ? undefined : environment['TAU_E2E_PICK_DIRECTORY'];

  /* `showDirectoryPicker({ id })` reopens at whatever the user last chose under
   * that id; Electron's dialog has no such memory, so main keeps it. Same
   * observable behaviour, which is what the shared picker seam promises. */
  const lastDirectoryById = new Map<string, string>();

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
    /* The renderer names the concern; main validates it against the served set
     * rather than ignoring it, so a future second concern cannot be reached by
     * a stale caller and today's only one cannot be mistyped into silence. */
    if (!servicesConcerns.includes(concern as ServicesConcern)) {
      log.log('error', 'services.unknown-concern', { concern });
      return;
    }
    try {
      const resolved = sanitizeServicesContext(context);
      /* Launcher 2 is scoped to one workspace root, and the renderer names it —
       * so it passes the same registry the kernel fork resolver uses. Refusing
       * outright rather than substituting Home: an agent host working over the
       * wrong directory is worse than no agent host. */
      if (concern === 'agentHost' && !roots.isTrusted(resolved['workspaceRoot'] ?? '')) {
        log.log('error', 'services.untrusted-root', { concern, workspaceRoot: resolved['workspaceRoot'] });
        return;
      }
      const port = services.connect(concern as ServicesConcern, resolved);
      event.senderFrame?.postMessage(servicesPortRelayTag, { requestId }, [port]);
    } catch (error) {
      log.log('error', 'services.connect-failed', error);
    }
  });

  const createMainWindow = async (): Promise<BrowserWindow> => {
    const window = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      icon: applicationIcon,
      title: 'Tau',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
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
            runtimeKernelIds: desktopNativeKernelIds,
          })}`,
        ],
      },
    });
    const quickLook = createQuickLookController({
      maxOutputBytes: quickLookManifest.limits.maxOutputBytes,
      registry: roots,
      temporaryRoot: quickLookTemporaryRoot,
      window,
    });
    quickLookControllers.set(window.id, quickLook);
    window.once('close', () => {
      quickLook.dispose();
      quickLookControllers.delete(window.id);
    });
    forwardRendererDiagnostics(window.webContents, log);

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

    const path = openFiles.hasPending() ? '/import?desktop-open=1' : '/';
    const rendererUrl = new URL(path, isDevelopment ? environment.ELECTRON_RENDERER_URL! : `${appOrigin}/`).href;
    await window.loadURL(rendererUrl);
    window.show();
    return window;
  };

  await createMainWindow();
  showOpenFileImport = () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window || window.webContents.getURL().includes('/import?desktop-open=1')) {
      return;
    }
    const rendererUrl = new URL(
      '/import?desktop-open=1',
      isDevelopment ? environment.ELECTRON_RENDERER_URL! : `${appOrigin}/`,
    ).href;
    const navigate = async (): Promise<void> => {
      await window.loadURL(rendererUrl);
      window.show();
      window.focus();
    };
    // async-iife: bootstrap -- Electron event callbacks do not consume promises.
    void navigate();
  };
  if (openFiles.hasPending()) {
    showOpenFileImport();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  app.on('will-quit', () => {
    showOpenFileImport = undefined;
    for (const controller of quickLookControllers.values()) {
      controller.dispose();
    }
    quickLookControllers.clear();
    auth.dispose();
    services.dispose();
  });
};

/* Electron fires `ready` only after the main ESM module finishes evaluating, so
 * a top-level `await app.whenReady()` deadlocks the app silently (observed live
 * in the L0 probe). Detach the bootstrap instead. */
/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- see comment above */
if (ownsSingleInstanceLock) {
  bootstrapElectronApp().catch((error: unknown) => {
    console.error('[tau-desktop:main] bootstrap failed', error);
    app.exit(1);
  });
} else {
  app.quit();
}
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */
