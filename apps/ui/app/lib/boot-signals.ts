/**
 * The renderer's two boot signals (desktop resilient startup blueprint, D0; R12, R17).
 *
 * - `shell-mounted`: the app shell is on screen and can show UI, including a classified error panel. `Page` reports it
 *   from its first mount.
 * - `home-ready`: the root file manager (`rootFiles`) is ready, so Home works. `AppRuntimeProvider` reports it.
 *
 * Each is reported once per page load, `shell-mounted` first: a `home-ready` that arrives before the shell is held
 * until the shell mounts. Both are written to `globalThis.__tauBoot`, which the web build's inline watchdog reads
 * (`lib/boot-watchdog.ts`), and sent through the desktop bridge's `tau.boot.report` when the preload installed one.
 *
 * Safe mode on the web (`?safe=1`) is read here too, once, by the client entry before the runtime is created.
 */
import type { ProjectRootConfiguration } from '@taucad/filesystem';
import { isDesktopTarget } from '#lib/build-target.js';

/** A boot stage the renderer reports. @public */
export type BootStage = 'shell-mounted' | 'home-ready';

/** The page global the inline watchdog and the renderer share. @public */
export type BootGlobal = {
  shellMounted?: boolean;
  homeReady?: boolean;
};

/** The global's name; the inline watchdog reads the same. @public */
export const bootGlobalName = '__tauBoot';

/** The element id of the watchdog's static strip, which the shell hides again if it mounts late. @public */
export const bootStripId = 'tau-boot-strip';

/** The query parameter that starts the web page in safe mode, for one page load. @public */
export const safeModeParameter = 'safe';

/** Where the strip and the error document send a person who asks for safe mode. @public */
export const safeModeHref = `/?${safeModeParameter}=1`;

type BootHolder = { [bootGlobalName]?: BootGlobal };
type DesktopBootBridge = { tau?: { boot?: { report?: (stage: BootStage) => void } } };

const bootGlobal = (): BootGlobal => {
  const holder = globalThis as BootHolder;
  holder[bootGlobalName] ??= {};
  return holder[bootGlobalName];
};

/* Whether `home-ready` was asked for before the shell mounted. */
let isHomeReadyHeld = false;

/* Who waits for a stage (adaptive app deployment mode I1: the Cloud loader starts only after `home-ready`). */
const stageListeners: Record<BootStage, Set<() => void>> = { 'shell-mounted': new Set(), 'home-ready': new Set() };

const reached = (stage: BootStage): boolean =>
  stage === 'shell-mounted' ? bootGlobal().shellMounted === true : bootGlobal().homeReady === true;

const notify = (stage: BootStage): void => {
  const listeners = [...stageListeners[stage]];
  stageListeners[stage].clear();
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A waiter that throws must not stop the boot report. */
    }
  }
};

/**
 * Call `listener` once the stage is reached: at once when it already is.
 *
 * @param stage - The stage to wait for.
 * @param listener - Called once.
 * @returns A cancel that drops the wait.
 * @public
 */
export function onceBootStage(stage: BootStage, listener: () => void): () => void {
  if (reached(stage)) {
    listener();
    return () => undefined;
  }
  stageListeners[stage].add(listener);
  return () => {
    stageListeners[stage].delete(listener);
  };
}

const send = (stage: BootStage): void => {
  if (!isDesktopTarget()) {
    return;
  }
  try {
    (globalThis as DesktopBootBridge).tau?.boot?.report?.(stage);
  } catch {
    /* A bridge that throws must not take the shell down with it; main's watchdog covers a missing signal. */
  }
};

const hideStrip = (): void => {
  if (typeof document === 'undefined') {
    return;
  }
  const strip = document.querySelector<HTMLElement>(`#${bootStripId}`);
  if (strip) {
    strip.hidden = true;
  }
};

/**
 * Report a boot stage, once per page load and in order.
 *
 * @param stage - The stage reached.
 * @public
 */
export function reportBootStage(stage: BootStage): void {
  const state = bootGlobal();
  if (stage === 'shell-mounted') {
    if (state.shellMounted === true) {
      return;
    }
    state.shellMounted = true;
    hideStrip();
    send('shell-mounted');
    notify('shell-mounted');
    if (isHomeReadyHeld) {
      isHomeReadyHeld = false;
      reportBootStage('home-ready');
    }
    return;
  }
  if (state.homeReady === true) {
    return;
  }
  if (state.shellMounted !== true) {
    isHomeReadyHeld = true;
    return;
  }
  state.homeReady = true;
  send('home-ready');
  notify('home-ready');
}

/**
 * Forget every report: for tests, which share one page global.
 *
 * @public
 */
export function resetBootSignals(): void {
  isHomeReadyHeld = false;
  stageListeners['shell-mounted'].clear();
  stageListeners['home-ready'].clear();
  delete (globalThis as { __tauBoot?: BootGlobal }).__tauBoot;
}

/** The part of a file manager's snapshot the home-ready check reads. */
type RootFilesSnapshot = Readonly<{ matches: (state: 'ready') => boolean }>;

/** The part of `rootFiles` the home-ready check follows. */
type RootFilesSource = Readonly<{
  getSnapshot: () => RootFilesSnapshot;
  subscribe: (listener: (snapshot: RootFilesSnapshot) => void) => { unsubscribe: () => void };
}>;

/**
 * Report `home-ready` the first time `rootFiles` is ready, and stop following it.
 *
 * @param rootFiles - The runtime's file manager for `/`.
 * @returns A function that stops following it.
 * @public
 */
export function followHomeReady(rootFiles: RootFilesSource): () => void {
  const isReady = (snapshot: RootFilesSnapshot): boolean => snapshot.matches('ready');
  if (isReady(rootFiles.getSnapshot())) {
    reportBootStage('home-ready');
    return () => undefined;
  }
  const subscription = rootFiles.subscribe((snapshot) => {
    if (isReady(snapshot)) {
      subscription.unsubscribe();
      reportBootStage('home-ready');
    }
  });
  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Whether a page URL asks for safe mode (`?safe=1`).
 *
 * @param search - The URL's query string.
 * @returns Whether safe mode was asked for.
 * @public
 */
export const isSafeModeRequested = (search: string): boolean =>
  new URLSearchParams(search).get(safeModeParameter) === '1';

/**
 * The Home-only configuration safe mode publishes: Home's root alone, the projects that live on it, and no checkouts.
 * Home is always the first root the handle store publishes. Shared by the web's `?safe=1` and the desktop's safe mode.
 *
 * @param configuration - The full configuration.
 * @returns The configuration narrowed to Home.
 * @public
 */
export function homeOnlyConfiguration(configuration: ProjectRootConfiguration): ProjectRootConfiguration {
  const [home] = configuration.roots;
  if (home === undefined) {
    return { projects: [], roots: [] };
  }
  const projects = configuration.projects.filter((project) => {
    if (home.backend === 'node') {
      return project.backend === 'node' && project.path === home.path;
    }
    return project.backend === home.backend;
  });
  return { projects, roots: [home] };
}
