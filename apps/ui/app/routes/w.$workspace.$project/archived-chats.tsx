import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProject } from '#hooks/use-project.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useChats } from '#hooks/use-chats.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { stringParameter } from '#utils/search-parameter.codecs.js';
import { ArchivedChatsView } from '#routes/w.$workspace.$project/archived-chats-view.js';

const queryCodec = stringParameter();

/** The project archive's metadata and query-state boundary; no transcript subscriptions. */
export function ArchivedChats(): React.JSX.Element {
  const { projectId } = useProject();
  const { chats, isLoading, error, retry } = useChatRecords(projectId, { includeDeleted: true });
  const { restoreChat, purgeChat } = useChats(projectId, { enabled: false });
  const [query, setQuery] = useSearchParameter(searchParameterName.query, queryCodec);
  const [, setSearchParameters] = useSearchParams();
  const searchSetter = useRef(setSearchParameters);
  useEffect(() => {
    searchSetter.current = setSearchParameters;
  }, [setSearchParameters]);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const archived = useMemo(
    () =>
      chats
        .filter((chat) => chat.resourceId === projectId && chat.deletedAt !== undefined && chat.purgedAt === undefined)
        .sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0) || left.id.localeCompare(right.id)),
    [chats, projectId],
  );

  const leave = (chatId?: string): void => {
    searchSetter.current(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(searchParameterName.archivedChats);
        next.delete(searchParameterName.query);
        if (chatId !== undefined) {
          next.set(searchParameterName.chat, chatId);
        }
        return next;
      },
      { replace: true },
    );
  };
  const unarchive = async (chat: ChatRecord): Promise<void> => {
    const restored = await restoreChat(chat.id);
    if (
      !restored ||
      restored.resourceId !== projectId ||
      restored.deletedAt !== undefined ||
      restored.purgedAt !== undefined
    ) {
      throw new Error(`Could not unarchive ${chat.name}. Try again.`);
    }
    if (mounted.current) {
      leave(chat.id);
    }
  };
  const remove = async (selected: readonly ChatRecord[]): Promise<void> => {
    const outcomes = await Promise.allSettled(selected.map(async (chat) => purgeChat(chat.id)));
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected').length;
    if (failures > 0) {
      throw new Error(`Could not delete ${failures} archived ${failures === 1 ? 'chat' : 'chats'}. Try again.`);
    }
  };

  return (
    <ArchivedChatsView
      chats={archived}
      isLoading={isLoading}
      error={error}
      query={query}
      onQueryChange={setQuery}
      onBack={() => {
        leave();
      }}
      onRetry={() => {
        void retry();
      }}
      onUnarchive={unarchive}
      onDelete={remove}
    />
  );
}
