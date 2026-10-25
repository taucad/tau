/**
 * The services host's half of the permission bridge (W9): applies each operation main forwards to the permission
 * store and answers it. The utility re-checks every frame itself, as it does for an agent-host port, because it is the
 * process that writes the file.
 */

import type { PermissionMode } from '@taucad/host';

import { permissionOperationOf } from '#shared/permission-channels.js';
import type { PermissionAnswerFrame, PermissionOperation } from '#shared/permission-channels.js';
import type { PermissionStore } from '#tau/permission-store.js';

/** @public */
export type PermissionHostOptions = Readonly<{
  store: PermissionStore;
  /** The utility's own admitted-root check. */
  isTrustedRoot: (root: string) => boolean;
  /** Post one answer back to main. */
  answer: (frame: PermissionAnswerFrame) => void;
  log?: ((event: string, detail?: unknown, level?: 'info' | 'warn') => void) | undefined;
}>;

/** @public */
export type PermissionHost = Readonly<{
  /** Apply one `permissions-request` frame; always answers, once. */
  handle: (frame: Readonly<Record<string, unknown>>) => Promise<void>;
}>;

const apply = async (store: PermissionStore, operation: PermissionOperation): Promise<PermissionMode> => {
  switch (operation.operation) {
    case 'chat-mode': {
      return store.modeOf(operation.projectRoot, operation.chatId);
    }
    case 'set-chat-mode': {
      return store.setChatMode(operation.projectRoot, operation.chatId, operation.mode);
    }
    case 'seed-chat': {
      return store.seed(operation.projectRoot, operation.chatId);
    }
    case 'remove-chat': {
      return store.remove(operation.projectRoot, operation.chatId);
    }
    case 'default-mode': {
      return store.defaultMode();
    }
    case 'set-default-mode': {
      return store.setDefaultMode(operation.mode);
    }
  }
};

/**
 * Serve the permission store to main's forwarded requests.
 *
 * @public
 * @param options - The store, the root check and the answer sink.
 * @returns The frame handler.
 */
export const createPermissionHost = (options: PermissionHostOptions): PermissionHost => ({
  handle: async (frame) => {
    const { requestId } = frame;
    if (typeof requestId !== 'string' || requestId === '') {
      return;
    }
    const operation = permissionOperationOf(frame);
    /* Removing only ever lowers a chat to Ask, so a chat whose folder was disconnected can still drop its entry. */
    if (
      operation === undefined ||
      ('projectRoot' in operation &&
        operation.operation !== 'remove-chat' &&
        !options.isTrustedRoot(operation.projectRoot))
    ) {
      options.log?.('permissions.refused', { operation: frame['operation'] }, 'warn');
      options.answer({ type: 'permissions-failed', requestId, message: 'The permission request was refused.' });
      return;
    }
    try {
      const mode = await apply(options.store, operation);
      if (operation.operation.startsWith('set-')) {
        options.log?.('permissions.mode-changed', { operation: operation.operation, mode });
      }
      options.answer({ type: 'permissions-answered', requestId, mode });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.log?.('permissions.failed', { operation: operation.operation, message }, 'warn');
      options.answer({ type: 'permissions-failed', requestId, message: 'Tau could not save the permission setting.' });
    }
  },
});
