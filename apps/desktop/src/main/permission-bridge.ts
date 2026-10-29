/**
 * Main's half of the permission bridge (blueprint D19, D25, W9): validates each preload call's sender window and
 * project, then forwards it to the services host, which alone reads and writes the store.
 *
 * Main never writes a mode itself and never takes one from a project file. A sender that is not one of Tau's own
 * windows, a root the person never granted, a malformed chat id or mode, or a switch to Bypass the renderer did not
 * confirm is refused before anything reaches the store.
 */

import { isAbsolute } from 'node:path';

import { canonicalPath } from '#main/project-roots.js';
import { isPermissionChatId, isPermissionMode, permissionChannels } from '#shared/permission-channels.js';
import type {
  DesktopPermissionMode,
  PermissionAnswerFrame,
  PermissionOperation,
  PermissionRequestFrame,
} from '#shared/permission-channels.js';

type InvokeEvent = Readonly<{ senderFrame: unknown }>;

/** @public */
export type PermissionBridgeOptions = Readonly<{
  /** `ipcMain.handle`. */
  handle: (channel: string, listener: (event: InvokeEvent, payload: unknown) => Promise<unknown>) => void;
  /** Whether the frame is one of Tau's own windows. */
  trusted: (senderFrame: unknown) => boolean;
  /** Main's granted roots. */
  roots: Readonly<{ isTrusted: (directory: string) => boolean; canonical: (directory: string) => string | undefined }>;
  /** Forward one frame to the services host. */
  send: (frame: PermissionRequestFrame) => void;
  /** How long to wait for the host's answer. */
  boundMilliseconds?: number | undefined;
  log?: ((level: 'info' | 'warn', event: string, detail?: unknown) => void) | undefined;
}>;

/** @public */
export type PermissionBridge = Readonly<{
  /** Consume a utility frame that answers one of this bridge's requests; the broker's `onUtilityFrame`. */
  accept: (frame: Readonly<Record<string, unknown>>) => boolean;
}>;

/** The refusal every invalid call gets; it names nothing about why, to a sender that may be hostile. */
const refusal = 'Desktop shell refused the permission request.';

/**
 * Register the six permission channels.
 *
 * @public
 * @param options - Electron seams, the trust checks and the forward.
 * @returns The answer sink to hand the services broker.
 */
export const registerPermissionBridge = (options: PermissionBridgeOptions): PermissionBridge => {
  const bound = options.boundMilliseconds ?? 10_000;
  const waiters = new Map<string, PromiseWithResolvers<DesktopPermissionMode>>();
  let requests = 0;

  const forward = async (operation: PermissionOperation): Promise<DesktopPermissionMode> => {
    requests += 1;
    const requestId = `permissions-${String(requests)}`;
    const answer = Promise.withResolvers<DesktopPermissionMode>();
    waiters.set(requestId, answer);
    let answerTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      options.send({ type: 'permissions-request', requestId, ...operation });
      const deadline = new Promise<never>((_resolve, reject) => {
        answerTimeout = setTimeout(() => {
          reject(new Error('The permission store did not answer.'));
        }, bound);
        answerTimeout.unref();
      });
      return await Promise.race([answer.promise, deadline]);
    } finally {
      clearTimeout(answerTimeout);
      waiters.delete(requestId);
    }
  };

  const refuse = (event: string, detail?: unknown): never => {
    options.log?.('warn', `permissions.${event}`, detail);
    throw new Error(refusal);
  };

  /** The canonical admitted root and chat, or a refusal. Removing accepts any absolute root: it only lowers to Ask. */
  const chatOf = (
    event: InvokeEvent,
    payload: unknown,
    admitted: boolean,
  ): Readonly<{ projectRoot: string; chatId: string; mode: unknown; confirmed: unknown }> => {
    if (!options.trusted(event.senderFrame)) {
      return refuse('untrusted-sender');
    }
    const { projectRoot, chatId, mode, confirmed } = (payload ?? {}) as Record<string, unknown>;
    if (typeof projectRoot !== 'string' || projectRoot.includes('\0') || !isAbsolute(projectRoot)) {
      return refuse('invalid-root');
    }
    if (!isPermissionChatId(chatId)) {
      return refuse('invalid-chat');
    }
    if (admitted) {
      const canonical = options.roots.isTrusted(projectRoot) ? options.roots.canonical(projectRoot) : undefined;
      return canonical === undefined ? refuse('ungranted-root') : { projectRoot: canonical, chatId, mode, confirmed };
    }
    return { projectRoot: canonicalPath(projectRoot), chatId, mode, confirmed };
  };

  /** A mode a person chose: Bypass only with the in-app confirmation's flag (RQ2). */
  const chosenMode = (mode: unknown, confirmed: unknown): DesktopPermissionMode => {
    if (!isPermissionMode(mode)) {
      return refuse('invalid-mode');
    }
    if (mode === 'bypass' && confirmed !== true) {
      return refuse('unconfirmed-bypass');
    }
    return mode;
  };

  options.handle(permissionChannels.chatMode, async (event, payload) => {
    const { projectRoot, chatId } = chatOf(event, payload, true);
    return forward({ operation: 'chat-mode', projectRoot, chatId });
  });
  options.handle(permissionChannels.setChatMode, async (event, payload) => {
    const { projectRoot, chatId, mode, confirmed } = chatOf(event, payload, true);
    return forward({ operation: 'set-chat-mode', projectRoot, chatId, mode: chosenMode(mode, confirmed) });
  });
  options.handle(permissionChannels.seedChat, async (event, payload) => {
    const { projectRoot, chatId } = chatOf(event, payload, true);
    return forward({ operation: 'seed-chat', projectRoot, chatId });
  });
  options.handle(permissionChannels.removeChat, async (event, payload) => {
    const { projectRoot, chatId } = chatOf(event, payload, false);
    return forward({ operation: 'remove-chat', projectRoot, chatId });
  });
  options.handle(permissionChannels.defaultMode, async (event) => {
    if (!options.trusted(event.senderFrame)) {
      return refuse('untrusted-sender');
    }
    return forward({ operation: 'default-mode' });
  });
  options.handle(permissionChannels.setDefaultMode, async (event, payload) => {
    if (!options.trusted(event.senderFrame)) {
      return refuse('untrusted-sender');
    }
    const { mode, confirmed } = (payload ?? {}) as Record<string, unknown>;
    return forward({ operation: 'set-default-mode', mode: chosenMode(mode, confirmed) });
  });

  return {
    accept: (frame) => {
      const { type, requestId } = frame;
      if ((type !== 'permissions-answered' && type !== 'permissions-failed') || typeof requestId !== 'string') {
        return false;
      }
      const waiter = waiters.get(requestId);
      const answer = frame as PermissionAnswerFrame;
      if (answer.type === 'permissions-answered' && isPermissionMode(answer.mode)) {
        waiter?.resolve(answer.mode);
      } else {
        waiter?.reject(new Error(answer.type === 'permissions-failed' ? answer.message : refusal));
      }
      return true;
    },
  };
};
