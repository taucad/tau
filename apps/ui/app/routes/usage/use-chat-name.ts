/* oxlint-disable typescript/no-restricted-types -- The billing wire returns explicit JSON nulls; swapping them for `undefined` would stop modelling what the API returns. */
import { useQuery } from '@tanstack/react-query';
import { useProjectManager } from '#hooks/use-project-manager.js';

/**
 * The name of the chat a receipt was spent in.
 *
 * Chats live in their project's own storage, so this reads exactly the one
 * project the receipt names — never the whole inventory, which would mean
 * opening every project this device holds. Nothing is read until a caller
 * mounts this, and the only caller is the detail row a reader opened: the page
 * itself, including the prerendered offline shell, still renders with no local
 * source behind it.
 *
 * @param projectHint - `activity.projectHint`; the project whose storage holds the chat.
 * @param chatHint - `activity.chatHint`; the chat being named.
 * @returns The name, `null` when there is nothing to look up or the lookup came
 * back empty, and `undefined` while it is still being read.
 */
export const useChatName = (projectHint: string | null, chatHint: string | null): string | null | undefined => {
  const { getChatsForResource } = useProjectManager();
  const enabled = projectHint !== null && chatHint !== null;
  const { data, isPending } = useQuery({
    queryKey: ['usage-chat-name', projectHint, chatHint],
    enabled,
    /* A rename is rarer than reopening rows, and the read costs a project's
       chat directory; a minute of reuse keeps repeated opens free. */
    staleTime: 60_000,
    /* Storage that cannot answer is a settled answer here — the row says the
       chat is not on this device rather than retrying behind a stuck label. */
    retry: false,
    queryFn: async (): Promise<string | null> => {
      /* Deleted included: a receipt outlives the chat that earned it, and a
         soft-deleted chat still has the name its spend was made under. */
      const chats = await getChatsForResource(projectHint ?? '', { includeDeleted: true });
      return chats.find((chat) => chat.id === chatHint)?.name ?? null;
    },
  });
  if (!enabled) {
    return null;
  }
  return isPending ? undefined : (data ?? null);
};
