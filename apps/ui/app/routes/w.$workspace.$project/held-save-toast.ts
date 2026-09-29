/**
 * The toast for a save another run's lease held (V5 A6, TS-R17): it names the chat whose agent holds the files and
 * never says "Nothing to save", because the person's edits are saved with that agent's revision (V5 Q10, option A).
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { TurnAttemptKey } from '@taucad/revisions';
import { toast } from '#components/ui/sonner.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import { projectChatUrl } from '#utils/project-url.utils.js';

/**
 * Where the run holding the files is. `background` is a window the browser froze, so the run cannot finish until it
 * is open again (I25).
 *
 * @public
 */
export type HeldSaveHolder = 'thisWindow' | 'otherWindow' | 'background';

/**
 * The held save's words, as the V5 design review approved them.
 *
 * @param chatName - The holding chat's name, or `undefined` when this page does not know the chat.
 * @param holder - Where its run is.
 * @returns The toast's title and description, and whether *Open chat* can reach the chat from here.
 * @public
 */
export const heldSaveCopy = (
  chatName: string | undefined,
  holder: HeldSaveHolder,
): Readonly<{ title: string; description: string; canOpen: boolean }> => {
  const title = chatName === undefined ? 'Saving waits for another chat' : `Saving waits for “${chatName}”`;
  switch (holder) {
    case 'otherWindow': {
      return {
        title,
        description:
          'Its agent is changing these files in another window. Your edits will be saved with the agent’s revision when it finishes.',
        canOpen: false,
      };
    }
    case 'background': {
      return {
        title,
        description:
          'Its agent is changing these files in a background window, so it can’t finish until that window is open again. Your edits will be saved with the agent’s revision.',
        canOpen: false,
      };
    }
    case 'thisWindow': {
      return {
        title,
        description:
          'Its agent is changing these files. Your edits will be saved with the agent’s revision when it finishes.',
        canOpen: true,
      };
    }
  }
};

/**
 * Raise the held save's toast for the run that holds the lease.
 *
 * ponytail: `background` needs the holding window's visibility, which W6's leadership keeps inside the host worker;
 * until the page can read it, a run this page does not follow reads as `otherWindow`.
 *
 * @returns A function that raises the toast for one lease key.
 * @public
 */
export function useHeldSaveToast(): (heldBy: TurnAttemptKey) => void {
  const { projectId } = useProject();
  const { chats } = useChats(projectId);
  const store = useChatSessionStore();
  const slugs = useProjectSlugs(projectId);
  const navigate = useNavigate();
  return useCallback(
    (heldBy: TurnAttemptKey) => {
      /* This page follows the run: its log is open here, so the chat is one click away. */
      const isHere = store.getProjection(heldBy.chatId)?.ledger.runs[heldBy.runId]?.appendState === 'open';
      const copy = heldSaveCopy(
        chats.find((chat) => chat.id === heldBy.chatId)?.name,
        isHere ? 'thisWindow' : 'otherWindow',
      );
      toast.info(copy.title, {
        description: copy.description,
        ...(copy.canOpen && slugs.status === 'resolved'
          ? {
              action: {
                label: 'Open chat',
                onClick: () => {
                  void navigate(projectChatUrl(slugs.value, heldBy.chatId));
                },
              },
            }
          : {}),
      });
    },
    [chats, navigate, slugs, store],
  );
}
