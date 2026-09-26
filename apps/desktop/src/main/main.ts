/**
 * Electron main process (work item E2).
 *
 * Main brokers and nothing else: the window, `app://` delivery, response and
 * request headers, one kernel utility per client, one singleton services
 * utility, the auth service, native dialogs, and the diagnostics sinks. Heavy
 * work — kernels, disk, the agent host — lives in the utilities.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

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
import type { IpcMainInvokeEvent } from 'electron';
import { installElectronRuntimeHeaders, registerElectronRuntimeMain } from '@taucad/runtime/electron/main';
import { connectSqliteComputeStoreWorker } from '@taucad/runtime/node';
import type { ComputeBinding } from '@taucad/runtime/types';
import { defaultConfigDirectory, discoverAcpAgents, externalAgentDescriptors } from '@taucad/host';
import type { ExternalAgentDescriptor } from '@taucad/agent-host';

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
import { createServicesBroker, rendererServicesConcerns } from '#main/services-broker.js';
import type { ServicesConcern } from '#main/services-broker.js';
import {
  compileCacheEnvironment,
  loginShellEnvironment,
  packagedEsbuildEnvironment,
  utilityEnvironment,
} from '#main/utility-environment.js';
import { createQuickLookController, removeStaleQuickLookSessions } from '#main/quick-look.js';
import type { QuickLookController } from '#main/quick-look.js';
import { deepLinkArgument, parseDeepLink } from '#main/deep-links.js';
import { createOpenFileQueue } from '#main/open-files.js';
import {
  appIconThemeChannel,
  agentHostSessionChannels,
  externalAgentsChannel,
  quitChannels,
  bootstrapArgumentPrefix,
  desktopNativeKernelIds,
  computeControlChannels,
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
/* Entries `electron.vite.config.ts` emits beside `index.js`, the bundle this
 * module lands in. */
const kernelUtilityEntry = join(import.meta.dirname, 'kernel-host.js');
const servicesUtilityEntry = join(import.meta.dirname, 'services-host.js');
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

/**
 * How long quit waits for every served project to settle (W19, D31).
 *
 * Long enough for a close cut plus W13's `closeFlushMilliseconds` sync wait on
 * several projects, short enough that a wedged utility never holds the app
 * open: after it the durable queue is the guarantee (D28).
 */
const quitQuiesceMilliseconds = 20_000;

/**
 * How long quit waits for the renderer's sessions registry (D31, P49).
 *
 * The page runs every live project's `closing` — cancel, sync flush, lease
 * release — and answers `quiesced`. The person can cut it short with *Quit
 * anyway*. The bound reports failure to main; it never turns an incomplete
 * close into permission to quit.
 */
const quitRendererMilliseconds = 20_000;

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
    const onQuiesced = (_event: unknown, forced: unknown): void => {
      settle(forced === true ? 'forced' : 'quiesced');
    };
    const timer = setTimeout(() => {
      settle('timeout');
    }, boundMilliseconds);
    ipcMain.on(quitChannels.quiesced, onQuiesced);
    for (const window of windows) {
      window.webContents.send(quitChannels.ask);
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

app.setName('Tau');
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
  app.dock?.setIcon(applicationIcon);
  const loginShell = await loginShellApplied;
  const environment = desktopEnvironment();

  const logDirectory = join(app.getPath('userData'), 'logs');
  const build123dResourceRoot = app.isPackaged
    ? join(process.resourcesPath, 'python')
    : join(import.meta.dirname, '../../resources/python');
  const picogkResourceRoot = app.isPackaged
    ? join(process.resourcesPath, 'picogk')
    : join(import.meta.dirname, '../../resources/picogk');
  /*
   * The `git` this app records revisions with (OQ3, C68).
   *
   * One binary, not two: the bundled git's own exec path carries `git-lfs`, so
   * `git lfs` resolves through it and nothing has to name a second executable.
   * Absent — a development tree, or a platform whose payload is not built — the
   * toolchain comes from `PATH`, which on a Finder launch is
   * `/usr/bin:/bin:/usr/sbin:/sbin`; a machine that has neither is told once,
   * by name, through `revision.unavailable`.
   */
  const bundledGitExecutable = join(
    app.isPackaged ? join(process.resourcesPath, 'git') : join(import.meta.dirname, '../../resources/git'),
    `${process.platform}-${process.arch}`,
    'bin',
    process.platform === 'win32' ? 'git.exe' : 'git',
  );
  const gitEnvironment: Readonly<Record<string, string>> = existsSync(bundledGitExecutable)
    ? // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
      { TAU_GIT_EXECUTABLE: bundledGitExecutable }
    : {};
  const esbuildEnvironment = packagedEsbuildEnvironment(app.isPackaged, process.resourcesPath);
  const log = createDiagnosticsLog({ directory: logDirectory, echo: isDevelopment });
  log.log('info', 'main.ready', { electron: process.versions.electron, packaged: app.isPackaged, isDevelopment });
  if (loginShell !== undefined) {
    log.log('info', 'main.login-shell-path', loginShell);
  }

  /* L2's contract: the home root must exist before the renderer's first mount,
   * because `NodeFsProvider` realpath-checks its base. */
  const homeRoot = join(app.getPath('userData'), 'home');
  mkdirSync(homeRoot, { recursive: true });
  const authorityDirectory = join(app.getPath('userData'), 'filesystem-authority');
  mkdirSync(authorityDirectory, { recursive: true });

  /* Grants outlive the session: the renderer keeps a picked folder's workspace
   * record in IndexedDB and offers it again on the next launch, so a grant main
   * forgot would answer `EACCES` for a folder the user believes is connected. */
  const roots = createProjectRootRegistry({ storePath: join(app.getPath('userData'), 'granted-roots.json') });
  roots.admit(homeRoot);
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
    registerAppProtocol({
      clientRoot,
      protocol,
      net,
      /* OQ-P11: development and staging only. Unpackaged is exactly that here — a packaged app
       * has no developer to take the profile. */
      jsProfiling: !app.isPackaged,
      contentSecurityPolicy: contentSecurityPolicy(
        storageOrigin === undefined ? authenticatedOrigins : [...authenticatedOrigins, storageOrigin],
      ),
    });
    log.log('info', 'main.app-protocol-registered', { clientRoot });
  }

  let computeWorker: Worker | undefined;
  const computeConnections = new Map<string, ReturnType<typeof connectSqliteComputeStoreWorker>>();
  let registeredProjectRootFor = (_executionRoot: string): string | undefined => undefined;
  const invalidateComputeWorker = (worker: Worker): void => {
    if (computeWorker !== worker) {
      return;
    }
    for (const stale of computeConnections.values()) {
      stale.dispose();
    }
    computeConnections.clear();
    computeWorker = undefined;
  };
  const computeConnection = (projectRoot: string) => {
    let connection = computeConnections.get(projectRoot);
    if (!connection) {
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
      connection = connectSqliteComputeStoreWorker({ worker: computeWorker, workspace: projectRoot });
      computeConnections.set(projectRoot, connection);
    }
    return connection;
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
      TAU_BUILD123D_RESOURCE_ROOT: build123dResourceRoot, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      TAU_PICOGK_RESOURCE_ROOT: picogkResourceRoot, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
    }),
    forkEnvAllowlist: [...kernelForkEnvAllowlist],
    /* A fork-loop guard, not a concurrency policy: a live project costs one to
     * three utilities and the sessions registry admits as many as memory holds,
     * so this sits an order of magnitude above realistic use. */
    maxUtilities: 64,
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
      const compute: ComputeBinding =
        mode === 'durable' ? { mode, store: computeConnection(computeProjectRoot).store } : { mode };
      /* The execution root reaches the utility rooted on `fileSystemPort`, and
       * never through the process environment: an environment that varied per
       * project would give every open its own pool key, so no warm spare could
       * ever be adopted (W-L03-4). */
      const forkEnvironment = { ...resolved.env };
      delete forkEnvironment['TAU_PROJECT_ROOT'];
      return {
        ...resolved,
        env: forkEnvironment,
        compute,
        ...(context['purpose'] === 'ephemeral'
          ? {}
          : {
              fileSystemPort: services.connect('runtimeFileSystem', { workspaceRoot: executionRoot }),
            }),
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

  const trustedComputeRoot = (event: IpcMainInvokeEvent, projectRoot: unknown): string => {
    if (!trusted(event.senderFrame) || typeof projectRoot !== 'string' || !roots.isTrusted(projectRoot)) {
      throw new Error('Desktop shell refused compute control.');
    }
    const canonicalRoot = roots.canonical(projectRoot)!;
    return roots.canonical(services.computeProjectRoot(canonicalRoot) ?? canonicalRoot)!;
  };
  ipcMain.handle(computeControlChannels.inspect, async (event, projectRoot) =>
    computeConnection(trustedComputeRoot(event, projectRoot)).control.inspect({}),
  );
  ipcMain.handle(computeControlChannels.clear, async (event, projectRoot) =>
    computeConnection(trustedComputeRoot(event, projectRoot)).control.clear({}),
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
    return computeConnection(root).control.collect({ budget: budget as number, ...(cursor ? { cursor } : {}) });
  });

  const tauConfigDirectory = defaultConfigDirectory();
  const services = createServicesBroker({
    utilityEntry: servicesUtilityEntry,
    env: utilityEnvironment(environment, {
      ...esbuildEnvironment,
      ...gitEnvironment,
      ...compileCacheEnvironment(app.getPath('userData')),
      TAU_CONFIG_DIR: tauConfigDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      TAU_DESKTOP_AUTHORITY_DIR: authorityDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
      TAU_DESKTOP_LOG_DIR: logDirectory, // eslint-disable-line @typescript-eslint/naming-convention -- environment name
    }),
    fork: (entry, args, forkOptions) => utilityProcess.fork(entry, args, forkOptions),
    createChannel: () => new MessageChannelMain(),
    connectRuntime: (context) => runtimeMain.connect({ purpose: 'main-process-client', context }),
    onSpawn: (utility) => {
      forwardUtilityDiagnostics('services', utility, log);
    },
    log: (level, event, detail) => {
      log.log(level, event, detail);
    },
  });
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
  ipcMain.handle(agentHostSessionChannels.retain, async (event, payload) => {
    services.retainAgentHost(agentHostSessionInput(event, payload));
  });
  ipcMain.handle(agentHostSessionChannels.release, async (event, payload) => {
    await services.releaseAgentHost(agentHostSessionInput(event, payload), quitQuiesceMilliseconds);
  });
  registeredProjectRootFor = (executionRoot) => services.computeProjectRoot(executionRoot);
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
   * The *model* probe runs beside it on its own 5 s clock (V5 / EQ1 A): it
   * opens a real vendor session, which Claude answered in 1.9 s here, so one
   * shared budget would either kill it or make every boot wait on it. A probe
   * that fails or times out leaves the agent advertised with no model list — a
   * logged-out CLI must never remove the row. */
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
    try {
      const acp = await discoverAcpAgents({ resolveFrom: import.meta.url, probeTimeout: 1500 });
      log.log('info', 'agent-host.external-agents', {
        agents: acp.agents.map((adapter) => `${adapter.id}:${(adapter.models ?? []).length}`),
        refused: acp.refused.map((refusal) => `${refusal.id}: ${refusal.code}`),
      });
      services.post({
        type: 'agentHost',
        config: {
          gatewayBaseUrl: desktopAgentGatewayBaseUrl(environment),
          systemPrompt: desktopAgentSystemPrompt,
          tauApiUrl: environment['TAU_API_URL']!,
          tauWebSocketUrl: environment['TAU_WEBSOCKET_URL']!,
          externalAgents: acp.agents,
        },
      });
      /* The one canonical descriptor (VSC1): the renderer draws its rows from this,
       * the utility gets the adapters themselves, and neither builds its own idea
       * of what an agent is called or which models it offers. */
      return externalAgentDescriptors(acp);
    } catch (error) {
      log.log('error', 'agent-host.external-agents-failed', { message: String(error) });
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

  ipcMain.handle(externalAgentsChannel, async (event) => (trusted(event.senderFrame) ? externalAgents : []));
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
    try {
      const resolved = sanitizeServicesContext(context);
      /* Launcher 2 is scoped to one workspace root, and the renderer names it —
       * so it passes the same registry the kernel fork resolver uses. Refusing
       * outright rather than substituting Home: an agent host working over the
       * wrong directory is worse than no agent host. */
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
      const port = services.connect(concern as ServicesConcern, resolved);
      event.senderFrame?.postMessage(servicesPortRelayTag, { requestId }, [port]);
    } catch (error) {
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
    window.show();
    return window;
  };

  await createMainWindow();
  showOpenFileImport = () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window || window.webContents.getURL().includes('/import?desktop-open=1')) {
      return;
    }
    const navigate = async (): Promise<void> => {
      await window.loadURL(rendererUrl('/import?desktop-open=1'));
      window.show();
      window.focus();
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
    try {
      const link = parseDeepLink(value);
      if (link === undefined) {
        /* A custom scheme has no ownership proof, so a link that is not one of
         * the four the app publishes is another application's, or an attempt. */
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
        await window.loadURL(rendererUrl(link.route));
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
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  let shutdownComplete = false;
  let shutdown: Promise<void> | undefined;
  /**
   * Tell the person a quit could not settle, and offer to quit anyway (C69, R13).
   *
   * Both abort paths below leave the app live on purpose — the unrecorded work
   * is still there — but the renderer has already taken its own overlay down by
   * then, so without this Cmd+Q is silent and there is nothing to act on.
   *
   * @param detail - What could not settle, in the person's own words.
   * @returns Whether to go on with the quit regardless.
   */
  const askToQuitAnyway = async (detail: string): Promise<boolean> => {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Keep Tau open', 'Quit anyway'],
      defaultId: 0,
      cancelId: 0,
      message: 'Tau is still saving your work.',
      detail: `${detail} Quitting now would leave those changes out of a revision.`,
    });
    return response === 1;
  };
  app.on('before-quit', (event) => {
    quitting = true;
    if (shutdownComplete) {
      return;
    }
    event.preventDefault();
    if (!shutdown) {
      shutdown = (async () => {
        /*
         * The quit hold (D31, W19).
         *
         * Every project the services utility serves takes its close cut and
         * waits for W13's `awaitSyncSettled` before this process ends. Without
         * this round trip `services.dispose()` killed the utility outright —
         * `ServicesHost.dispose()` is synchronous fire-and-forget — so the last
         * edits of a quit were recorded by nothing. A timeout or negative
         * acknowledgement leaves the app live so the same owners can retry.
         */
        /*
         * The renderer's half first (P49): the browser-side registry owns the
         * file manager, compute admission and every `chat-session`, and only
         * it can cancel runs and release the leases its turns took. It shows
         * the *Backing up…* overlay while it does, with *Quit anyway*.
         */
        const rendererOutcome = await askRendererToQuiesce(quitRendererMilliseconds);
        log.log('info', 'main.renderer-quiesce', { outcome: rendererOutcome });
        let forced = rendererOutcome === 'forced';
        if (
          rendererOutcome === 'timeout' &&
          !(await askToQuitAnyway('This window did not finish closing its projects.'))
        ) {
          quitting = false;
          shutdown = undefined;
          return;
        }
        forced ||= rendererOutcome === 'timeout';
        const utilityOutcome = await services.quiesce(quitQuiesceMilliseconds);
        log.log(
          utilityOutcome.status === 'quiesced' || utilityOutcome.status === 'no-utility' ? 'info' : 'error',
          'main.quiesce',
          { outcome: utilityOutcome },
        );
        if (
          !forced &&
          utilityOutcome.status !== 'quiesced' &&
          utilityOutcome.status !== 'no-utility' &&
          !(await askToQuitAnyway('Tau could not finish saving every open project.'))
        ) {
          quitting = false;
          shutdown = undefined;
          return;
        }
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
        try {
          await services.dispose();
        } catch (error) {
          log.log('error', 'main.shutdown', error);
        }
        try {
          runtimeMain.dispose();
        } catch (error) {
          log.log('error', 'main.shutdown', error);
        }
        try {
          for (const connection of computeConnections.values()) {
            connection.dispose();
          }
          computeConnections.clear();
          await computeWorker?.terminate();
          computeWorker = undefined;
        } catch (error) {
          log.log('error', 'main.shutdown', error);
        }
        shutdownComplete = true;
        app.quit();
      })();
      // async-iife: bootstrap -- Electron event callbacks cannot return shutdown completion.
      void shutdown;
    }
  });
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
