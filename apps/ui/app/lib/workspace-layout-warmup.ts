import type * as ChatInterfaceDesktopModule from '#routes/w.$workspace.$project/chat-interface-desktop.js';
import type * as ChatInterfaceMobileModule from '#routes/w.$workspace.$project/chat-interface-mobile.js';

/**
 * The workspace layouts' imports, shared by the layout's `lazy` and the open's warm-up (STO-25 SP5).
 *
 * A layout renders only once the project's session is live and focus has settled on it, so its chunk graph (the
 * desktop shell is the open's largest: the viewer, the dockview workbench and the composer) used to start downloading
 * and evaluating only then, after the session's own start. Asked for as the open begins, it loads beside the session
 * and the render finds it in the module map. Both callers name the same specifier, so the browser loads each layout
 * once whichever asks first.
 */

/** @returns The desktop shell's module. */
export const loadChatInterfaceDesktop = async (): Promise<typeof ChatInterfaceDesktopModule> =>
  import('#routes/w.$workspace.$project/chat-interface-desktop.js');

/** @returns The phone shell's module. */
export const loadChatInterfaceMobile = async (): Promise<typeof ChatInterfaceMobileModule> =>
  import('#routes/w.$workspace.$project/chat-interface-mobile.js');

/* `useIsMobile`'s query (`@taucad/ui/hooks/use-mobile`): the layout this viewport mounts is the one warmed. */
const phoneViewportQuery = '(max-width: 767px)';

/**
 * Start the import of the layout this viewport will mount (D13: a phone never asks for the desktop shell).
 *
 * Only a hint: nothing waits on it and nothing is decided by it. The layout's `lazy` still picks the layout on its
 * first client render and imports it then if the viewport changed, and a failed warm-up is the render's to report
 * when its own import fails. With no viewport (server rendering) it does nothing.
 */
export const warmWorkspaceLayout = (): void => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent during SSR
  if (globalThis.window === undefined || typeof globalThis.matchMedia !== 'function') {
    return;
  }
  const load = globalThis.matchMedia(phoneViewportQuery).matches ? loadChatInterfaceMobile : loadChatInterfaceDesktop;
  // async-iife: bootstrap -- warming only starts the import; the layout's render owns the load and shows its failure.
  void (async () => {
    try {
      await load();
    } catch {
      // The layout's `lazy` imports again when it renders and reports a failure there.
    }
  })();
};
