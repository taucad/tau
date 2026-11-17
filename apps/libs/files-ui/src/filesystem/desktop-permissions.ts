/**
 * The desktop permission selector's renderer seam (blueprint D19, D25, W9): `window.tau.permissions`, parsed.
 *
 * The services host keeps every chat's mode and the Settings default; this page only asks and shows. A chat with no
 * entry reads Ask. Nothing here touches cookies or project files, which can be shared: a mode never rides either.
 */

import { z } from 'zod';

import { isDesktopTarget } from '#filesystem/desktop-bridge.js';

/**
 * Who approves the Tau agent's widening requests on this chat: Ask puts each in front of the person, Bypass grants it
 * without asking. Neither changes what contains the command.
 *
 * @public
 */
export type PermissionMode = 'ask' | 'bypass';

/** One chat in the store's terms: the project's folder on this computer plus the chat id. @public */
export type PermissionChat = Readonly<{ projectRoot: string; chatId: string }>;

type PermissionShell = Readonly<{
  chatMode(input: PermissionChat): Promise<unknown>;
  setChatMode(input: PermissionChat & Readonly<{ mode: PermissionMode; confirmed?: boolean }>): Promise<unknown>;
  seedChat(input: PermissionChat): Promise<unknown>;
  removeChat(input: PermissionChat): Promise<unknown>;
  defaultMode(): Promise<unknown>;
  setDefaultMode(input: Readonly<{ mode: PermissionMode; confirmed?: boolean }>): Promise<unknown>;
}>;

/** @public */
export type DesktopPermissions = Readonly<{
  chatMode(chat: PermissionChat): Promise<PermissionMode>;
  /** Bypass needs `confirmed`: the person accepted the in-app confirmation (RQ2). */
  setChatMode(chat: PermissionChat, mode: PermissionMode, confirmed: boolean): Promise<PermissionMode>;
  /** Copy the Settings default into a new chat; an existing entry is kept. */
  seedChat(chat: PermissionChat): Promise<PermissionMode>;
  /** Drop a deleted chat's entry. */
  removeChat(chat: PermissionChat): Promise<PermissionMode>;
  defaultMode(): Promise<PermissionMode>;
  setDefaultMode(mode: PermissionMode, confirmed: boolean): Promise<PermissionMode>;
}>;

const modeSchema = z.enum(['ask', 'bypass']);

/**
 * The permission bridge, on a desktop build whose shell has one.
 *
 * @public
 * @returns The bridge, or undefined in the browser and on an older shell.
 */
export const desktopPermissions = (): DesktopPermissions | undefined => {
  const shell = isDesktopTarget
    ? (globalThis as { tau?: { permissions?: PermissionShell } }).tau?.permissions
    : undefined;
  if (shell === undefined) {
    return undefined;
  }
  const parse = async (answer: Promise<unknown>): Promise<PermissionMode> => modeSchema.parse(await answer);
  return {
    chatMode: async (chat) => parse(shell.chatMode(chat)),
    setChatMode: async (chat, mode, confirmed) => parse(shell.setChatMode({ ...chat, mode, confirmed })),
    seedChat: async (chat) => parse(shell.seedChat(chat)),
    removeChat: async (chat) => parse(shell.removeChat(chat)),
    defaultMode: async () => parse(shell.defaultMode()),
    setDefaultMode: async (mode, confirmed) => parse(shell.setDefaultMode({ mode, confirmed })),
  };
};
