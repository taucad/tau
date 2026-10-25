/**
 * The renderer's permission bridge (W9): plain functions over the permission channels. Main validates each call and
 * the services host answers with the mode now in force; the renderer never keeps a mode of its own.
 */

import type { IpcRenderer } from 'electron';

import { permissionChannels } from '#shared/permission-channels.js';
import type { DesktopPermissionMode } from '#shared/permission-channels.js';

type ChatInput = Readonly<{ projectRoot: string; chatId: string }>;
type ModeInput = Readonly<{ mode: DesktopPermissionMode; confirmed?: boolean }>;

/** `window.tau.permissions`: each call answers the mode in force, which the renderer parses. */
export type PreloadPermissionBridge = Readonly<{
  chatMode: (input: ChatInput) => Promise<unknown>;
  setChatMode: (input: ChatInput & ModeInput) => Promise<unknown>;
  seedChat: (input: ChatInput) => Promise<unknown>;
  removeChat: (input: ChatInput) => Promise<unknown>;
  defaultMode: () => Promise<unknown>;
  setDefaultMode: (input: ModeInput) => Promise<unknown>;
}>;

/**
 * Build `window.tau.permissions`.
 *
 * @param ipc - The preload's `ipcRenderer`.
 * @returns The bridge.
 */
export const permissionBridge = (ipc: Pick<IpcRenderer, 'invoke'>): PreloadPermissionBridge => ({
  chatMode: async (input) => ipc.invoke(permissionChannels.chatMode, input) as Promise<unknown>,
  /** `confirmed` is the in-app Bypass confirmation's answer; main refuses Bypass without it. */
  setChatMode: async (input) => ipc.invoke(permissionChannels.setChatMode, input) as Promise<unknown>,
  seedChat: async (input) => ipc.invoke(permissionChannels.seedChat, input) as Promise<unknown>,
  removeChat: async (input) => ipc.invoke(permissionChannels.removeChat, input) as Promise<unknown>,
  defaultMode: async () => ipc.invoke(permissionChannels.defaultMode) as Promise<unknown>,
  setDefaultMode: async (input) => ipc.invoke(permissionChannels.setDefaultMode, input) as Promise<unknown>,
});
