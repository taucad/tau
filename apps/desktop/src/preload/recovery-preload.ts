/**
 * The recovery window's preload (desktop resilient startup blueprint, D0; R12).
 *
 * Minimal on purpose: the static page in `resources/recovery/index.html` reads the launch's recovery state, hears when
 * it changes, and asks main for one recovery action. Main checks that the sender is the recovery window and parses
 * every action (`recovery-window.ts`); nothing else crosses.
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * `recoveryChannels` from `#shared/desktop-bootstrap.js`, repeated here on purpose: a sandboxed preload can require
 * nothing but `electron`, and importing the shared module would make the build split it into a chunk both preloads
 * require. `recovery-preload.test.ts` holds the two equal.
 */
export const recoveryPreloadChannels = {
  state: 'tau:recovery:state',
  changed: 'tau:recovery:changed',
  action: 'tau:recovery:action',
} as const;
const recoveryChannels = recoveryPreloadChannels;

contextBridge.exposeInMainWorld('tauRecovery', {
  state: async (): Promise<unknown> => ipcRenderer.invoke(recoveryChannels.state),
  act: async (action: unknown): Promise<void> => {
    await ipcRenderer.invoke(recoveryChannels.action, action);
  },
  onChange: (listener: (state: unknown) => void): (() => void) => {
    const handler = (_event: unknown, state: unknown): void => {
      listener(state);
    };
    ipcRenderer.on(recoveryChannels.changed, handler);
    return () => {
      ipcRenderer.off(recoveryChannels.changed, handler);
    };
  },
});
