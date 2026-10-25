/**
 * The Tau agent's permission mode on desktop (blueprint D19, D25, W9): one chat's mode and the Settings default, read
 * from and written to the services host through {@link desktopPermissions}. The host's answer is the only state; a
 * failed write leaves the last answer showing.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { desktopPermissions } from '#filesystem/desktop-permissions.js';
import type { PermissionChat, PermissionMode } from '#filesystem/desktop-permissions.js';
import { desktopWorkspaceRoot } from '#lib/agent-host-placement.js';

const permissionKeys = {
  all: ['permission-mode'] as const,
  chat: (projectId: string, chatId: string) => ['permission-mode', 'chat', projectId, chatId] as const,
  default: ['permission-mode', 'default'] as const,
};

/** The store's identity for a chat: the project's folder on this computer, never its `tau.json` id. */
const chatOf = async (projectId: string, chatId: string): Promise<PermissionChat> => ({
  projectRoot: await desktopWorkspaceRoot(projectId),
  chatId,
});

/** @public */
export type PermissionModeState = Readonly<{
  /** Undefined while loading, and where the selector does not apply. */
  mode: PermissionMode | undefined;
  /** Bypass needs `confirmed` (RQ2). Resolves with the mode in force after the write. */
  setMode: (mode: PermissionMode, confirmed: boolean) => Promise<PermissionMode>;
  isSaving: boolean;
}>;

/**
 * One chat's permission mode. Only a desktop chat on a project stored on this computer has one.
 *
 * @public
 * @param projectId - The chat's project.
 * @param chatId - The chat.
 * @returns The mode and its setter.
 */
export function useChatPermissionMode(projectId: string | undefined, chatId: string | undefined): PermissionModeState {
  const bridge = desktopPermissions();
  const queryClient = useQueryClient();
  const enabled = bridge !== undefined && projectId !== undefined && chatId !== undefined;
  const key = permissionKeys.chat(projectId ?? '', chatId ?? '');
  const { data } = useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => bridge!.chatMode(await chatOf(projectId!, chatId!)),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async ({ mode, confirmed }: { mode: PermissionMode; confirmed: boolean }) => {
      if (!enabled) {
        throw new Error('This chat has no permission mode.');
      }
      return bridge.setChatMode(await chatOf(projectId, chatId), mode, confirmed);
    },
    onSuccess: (mode) => {
      queryClient.setQueryData(key, mode);
    },
  });
  return {
    mode: enabled ? data : undefined,
    setMode: async (mode, confirmed) => mutateAsync({ mode, confirmed }),
    isSaving: isPending,
  };
}

/**
 * The Settings default new chats copy. Undefined off desktop.
 *
 * @public
 * @returns The default and its setter.
 */
export function useDefaultPermissionMode(): PermissionModeState {
  const bridge = desktopPermissions();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: permissionKeys.default,
    enabled: bridge !== undefined,
    queryFn: async () => bridge!.defaultMode(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const { mutateAsync, isPending } = useMutation({
    mutationFn: async ({ mode, confirmed }: { mode: PermissionMode; confirmed: boolean }) => {
      if (bridge === undefined) {
        throw new Error('This build has no permission default.');
      }
      return bridge.setDefaultMode(mode, confirmed);
    },
    onSuccess: (mode) => {
      queryClient.setQueryData(permissionKeys.default, mode);
    },
  });
  return {
    mode: bridge === undefined ? undefined : data,
    setMode: async (mode, confirmed) => mutateAsync({ mode, confirmed }),
    isSaving: isPending,
  };
}

/**
 * Copy the Settings default into a chat just created on this computer. Best effort: a chat that is never seeded reads
 * Ask, the safe side.
 *
 * @public
 * @param projectId - The new chat's project.
 * @param chatId - The new chat.
 * @returns Once the host answered or the seed was skipped.
 */
export const seedChatPermission = async (projectId: string, chatId: string): Promise<void> => {
  const bridge = desktopPermissions();
  if (bridge === undefined) {
    return;
  }
  try {
    await bridge.seedChat(await chatOf(projectId, chatId));
  } catch {
    /* Not stored on disk, or the host is down: the chat stays Ask. */
  }
};

/**
 * Drop a deleted chat's entry, so it never outlives the chat. Best effort, like the seed.
 *
 * @public
 * @param projectId - The chat's project.
 * @param chatId - The deleted chat.
 * @returns Once the host answered or the removal was skipped.
 */
export const removeChatPermission = async (projectId: string, chatId: string): Promise<void> => {
  const bridge = desktopPermissions();
  if (bridge === undefined) {
    return;
  }
  try {
    await bridge.removeChat(await chatOf(projectId, chatId));
  } catch {
    /* The project is gone or the host is down. Chat ids are never reused, so a stale entry is never read again. */
  }
};
