/**
 * The desktop permission selector's wire (blueprint D19, D25, W9): the preload channels the renderer invokes, the frames
 * main forwards to the services host, and the one validator both ends of the forward apply.
 *
 * The services host is the store's only reader and writer; main validates the sender window and the project and
 * forwards. Nothing here carries a mode the model or a project file could have written: a chat's entry is keyed by the
 * host-admitted project root main canonicalised, plus the chat id.
 */

/** Who approves widening for one chat: Ask puts each widening in front of the person, Bypass grants it. */
export type DesktopPermissionMode = 'ask' | 'bypass';

/** The preload channels, one per operation. */
export const permissionChannels = {
  chatMode: 'tau:permissions:chat-mode',
  setChatMode: 'tau:permissions:set-chat-mode',
  seedChat: 'tau:permissions:seed-chat',
  removeChat: 'tau:permissions:remove-chat',
  defaultMode: 'tau:permissions:default-mode',
  setDefaultMode: 'tau:permissions:set-default-mode',
} as const;

/** One store operation as main forwards it, after validation. `projectRoot` is main's canonical spelling. */
export type PermissionOperation =
  | Readonly<{ operation: 'chat-mode'; projectRoot: string; chatId: string }>
  | Readonly<{ operation: 'set-chat-mode'; projectRoot: string; chatId: string; mode: DesktopPermissionMode }>
  | Readonly<{ operation: 'seed-chat'; projectRoot: string; chatId: string }>
  | Readonly<{ operation: 'remove-chat'; projectRoot: string; chatId: string }>
  | Readonly<{ operation: 'default-mode' }>
  | Readonly<{ operation: 'set-default-mode'; mode: DesktopPermissionMode }>;

/** Main → services host. */
export type PermissionRequestFrame = Readonly<{ type: 'permissions-request'; requestId: string }> & PermissionOperation;

/** Services host → main: the mode now in force for what was asked, or why the store could not answer. */
export type PermissionAnswerFrame =
  | Readonly<{ type: 'permissions-answered'; requestId: string; mode: DesktopPermissionMode }>
  | Readonly<{ type: 'permissions-failed'; requestId: string; message: string }>;

/** A chat id as the renderer mints it: a UUID or a prefixed id, never a path. */
const chatIdPattern = /^[\w-]{1,128}$/u;

/**
 * Whether a value is a mode.
 *
 * @param value - Anything off the wire.
 * @returns Whether it is `ask` or `bypass`.
 */
export const isPermissionMode = (value: unknown): value is DesktopPermissionMode =>
  value === 'ask' || value === 'bypass';

/**
 * Whether a value is a chat id the store keys by.
 *
 * @param value - Anything off the wire.
 * @returns Whether it is a bounded id with no path characters.
 */
export const isPermissionChatId = (value: unknown): value is string =>
  typeof value === 'string' && chatIdPattern.test(value);

/**
 * Read a forwarded operation back out of a frame, refusing anything malformed. The services host applies it to every
 * frame, so a frame that skipped main's validation still cannot name a bad chat or mode.
 *
 * @param frame - The frame as received.
 * @returns The operation, or undefined.
 */
export const permissionOperationOf = (frame: Readonly<Record<string, unknown>>): PermissionOperation | undefined => {
  const { operation, projectRoot, chatId, mode } = frame;
  if (operation === 'default-mode') {
    return { operation };
  }
  if (operation === 'set-default-mode') {
    return isPermissionMode(mode) ? { operation, mode } : undefined;
  }
  if (
    typeof projectRoot !== 'string' ||
    projectRoot === '' ||
    projectRoot.includes('\0') ||
    !isPermissionChatId(chatId)
  ) {
    return undefined;
  }
  switch (operation) {
    case 'chat-mode':
    case 'seed-chat':
    case 'remove-chat': {
      return { operation, projectRoot, chatId };
    }
    case 'set-chat-mode': {
      return isPermissionMode(mode) ? { operation, projectRoot, chatId, mode } : undefined;
    }
    default: {
      return undefined;
    }
  }
};
