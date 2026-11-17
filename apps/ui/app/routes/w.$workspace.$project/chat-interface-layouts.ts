import type * as ChatInterfaceDesktopModule from '#routes/w.$workspace.$project/chat-interface-desktop.js';
import type * as ChatInterfaceMobileModule from '#routes/w.$workspace.$project/chat-interface-mobile.js';

/**
 * The workspace layouts' imports, shared by the layout's `lazy` and the open's warm-up (STO-25 SP5).
 *
 * A layout renders only once the project's session is live and focus has settled on it, so its chunk graph (the
 * desktop shell is the open's largest: the viewer, the dockview workbench and the composer) used to start downloading
 * and evaluating only then, after the session's own start. Warmed as soon as the session module (whose graph holds
 * this module) has loaded, it loads while the session starts and the render finds it in the module map.
 *
 * It lives in the session module's graph, never in the app runtime's: the bundler writes each layout's preload list
 * (its whole chunk graph) beside the `import()` that names it, so this module keeps those lists out of the runtime's
 * chunk and the shell's critical graph unchanged (G3).
 *
 * Each layout has one import in flight at a time, shared by both callers: a failure is one failure (one chunk-error
 * report, one recovery), seen by the warm-up and by the render alike. A failed import is forgotten, so the next
 * caller after it, a retry, imports again.
 */

type LayoutLoad<T> = () => Promise<T>;

/**
 * Share one import per layout, forgotten once it rejects.
 *
 * @param importLayout - The layout's dynamic import.
 * @returns The shared loader.
 */
const sharedLoad = <T>(importLayout: LayoutLoad<T>): LayoutLoad<T> => {
  let pending: Promise<T> | undefined;
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- every caller receives the one shared promise.
  return () => {
    if (pending !== undefined) {
      return pending;
    }
    const load = importLayout();
    pending = load;
    // async-iife: bootstrap -- forgets a failed import; the callers hold `load` and see its failure themselves.
    void (async () => {
      try {
        await load;
      } catch {
        if (pending === load) {
          pending = undefined;
        }
      }
    })();
    return load;
  };
};

/** @returns The desktop shell's module. */
export const loadChatInterfaceDesktop: LayoutLoad<typeof ChatInterfaceDesktopModule> = sharedLoad(
  async () => import('#routes/w.$workspace.$project/chat-interface-desktop.js'),
);

/** @returns The phone shell's module. */
export const loadChatInterfaceMobile: LayoutLoad<typeof ChatInterfaceMobileModule> = sharedLoad(
  async () => import('#routes/w.$workspace.$project/chat-interface-mobile.js'),
);

/* `useIsMobile`'s query (`@taucad/ui/hooks/use-mobile`): the layout this viewport mounts is the one warmed. */
const phoneViewportQuery = '(max-width: 767px)';

/**
 * Start the import of the layout this viewport will mount (D13: a phone never asks for the desktop shell).
 *
 * Only a hint, and it never throws: nothing waits on it and nothing is decided by it. The layout's `lazy` still picks
 * the layout on its first client render and shares this import, so a failure is the render's to report through its
 * own `lazy`. With no viewport to measure (server rendering, an environment without `matchMedia`) it does nothing.
 */
export const warmWorkspaceLayout = (): void => {
  try {
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent during SSR
    if (globalThis.window === undefined || typeof globalThis.matchMedia !== 'function') {
      return;
    }
    const phone = (globalThis.matchMedia(phoneViewportQuery) as Partial<MediaQueryList> | undefined)?.matches;
    /* An answer that is not a measurement warms nothing rather than guess the desktop shell on a phone (D13). */
    if (typeof phone !== 'boolean') {
      return;
    }
    const load: LayoutLoad<unknown> = phone ? loadChatInterfaceMobile : loadChatInterfaceDesktop;
    // async-iife: bootstrap -- warming only starts the shared import; the layout's `lazy` reports its failure.
    void (async () => {
      try {
        await load();
      } catch {
        // The render's `lazy` holds the same import and sees the same failure.
      }
    })();
  } catch {
    // A viewport that cannot be measured warms nothing; the render picks and imports its layout as before.
  }
};
