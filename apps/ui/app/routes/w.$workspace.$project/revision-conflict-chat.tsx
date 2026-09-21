import { useEffect, useRef } from 'react';
import { toast } from '#components/ui/sonner.js';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionClient } from '#hooks/use-revision-status.js';
import { useChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import { buildUserMessage } from '#utils/chat.utils.js';

/**
 * What the seeded chat is asked to do (AC14, A18/I12 — document words only).
 *
 * The prompt names the files and nothing else: the three terms are in the
 * graph, and the turn's placement carries the revision to read them from, so
 * restating the sides here would be a second, staler copy of them.
 *
 * @param paths - The files still without a side.
 * @returns The first message of the resolution chat.
 */
const resolutionPrompt = (paths: readonly string[]): string =>
  [
    `Two lines changed the same ${paths.length === 1 ? 'file' : 'files'}. Please compose them:`,
    ...paths.map((path) => `- ${path}`),
    '',
    'Keep both sets of changes where they do not fight, and pick the one that belongs where they do.',
  ].join('\n');

/**
 * *Ask chat to resolve* — the second half of AC14.
 *
 * `resolution.machine` answers the verb with the fact, not the turn: only a
 * page (or a CLI) can start a chat, and both hold the root (A38). So the fact
 * crosses the port as `resolveWithChat` and lands here, which seeds one chat
 * and binds its placement.
 *
 * The binding is what makes the turn a *resolution*: it lands on the conflicted
 * branch's own checkout and its body names the conflicted revision, so the
 * agent reads the three terms back out of the graph rather than out of the
 * prompt (A22). Nothing here materializes markers, and nothing writes them into
 * a tree.
 *
 * @returns Nothing; this is a subscriber, not a surface.
 */
export function RevisionConflictChat(): undefined {
  const client = useRevisionClient();
  const { projectId, setFocusedChatId } = useProject();
  const { createChat } = useChats(projectId);
  const { bindConflict } = useChatWorkspaceAuthority();

  /* The seeding is tracked rather than fired and forgotten: two facts arriving
   * together would otherwise race into two chats for one conflict, and a
   * rejection would be lost. One chain, in arrival order. */
  const seeding = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    const seed = async (
      request: Readonly<{ revisionId: string; checkoutId: string | undefined; paths: readonly string[] }>,
    ): Promise<void> => {
      const message = buildUserMessage({ text: resolutionPrompt(request.paths) });
      /* The same one-shot startup request *Fix with AI* uses, so the seeded
       * turn fires once on hydration and a plain pending tail is still only
       * display state (apps/ui/AGENTS.md). */
      const chat = await createChat({
        name: 'Resolve conflict',
        messages: [message],
        startupRequest: {
          id: generatePrefixedId(idPrefix.request),
          kind: 'regenerate-tail',
          messageId: message.id,
          source: 'resolve-conflict-new-chat',
          createdAt: Date.now(),
        },
      });
      bindConflict(chat.id, {
        revisionId: request.revisionId,
        paths: request.paths,
        checkoutId: request.checkoutId,
      });
      setFocusedChatId(chat.id);
    };
    return client.subscribeToasts((entry) => {
      if (entry.type !== 'resolveWithChat') {
        return;
      }
      const previous = seeding.current;
      seeding.current = (async () => {
        try {
          await previous;
        } catch {
          /* An earlier seed's failure is its own; it was reported there. */
        }
        try {
          await seed(entry);
        } catch (error) {
          /* Whatever threw is an engine sentence naming a checkout or a lease,
           * which Rule 1 forbids showing; the console is where it belongs. */
          console.error('[revisions] resolve with chat', error);
          toast.error('Could not start a chat to resolve this', {
            description: 'Tau could not start that chat. Try again.',
          });
        }
      })();
    });
  }, [bindConflict, client, createChat, setFocusedChatId]);

  return undefined;
}
