import { useSelector } from '@xstate/react';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@taucad/ui/utils/cn';
import { PaneButton } from '@taucad/workbench-panes/components/pane-button';
import { useProject } from '#hooks/use-project.js';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { useRevisionCommands } from '#hooks/use-revision-status.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { revisionAccessibleName, useRevisionFacts } from '#routes/w.$workspace.$project/revision-vocabulary.js';

/** The focused chat's other branch, and the verb that moves the workbench onto it. @public */
export type FollowChat = Readonly<{
  /** The focused chat, as the phone's project sheet names it. */
  chatName: string;
  /** The line the focused chat works on. */
  branch: string;
  /** Pin the workbench to the chat's checkout. */
  follow: () => void;
}>;

/**
 * Whether the focused chat works on a branch other than the workbench's, read
 * once here so the desktop trigger and the phone status line cannot disagree
 * about when *Switch to ⟨branch⟩* applies (I4).
 *
 * @param status - The revision status projection, from the caller's {@link useRevisionFacts}.
 * @param branch - The line the workbench is on.
 * @returns The chat's branch and the verb, or `undefined` while the chat is where the workbench is, or the workbench's line is not known yet.
 * @public
 */
export function useFollowChat(
  status: RevisionStatusProjection | undefined,
  branch: string | undefined,
): FollowChat | undefined {
  const commands = useRevisionCommands();
  const { editorRef, projectId } = useProject();
  const { chats } = useChatRecords(projectId);
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  /* While the workbench's own line is unknown there is no "elsewhere" to switch from. */
  if (status === undefined || branch === undefined || focusedChatId === undefined) {
    return undefined;
  }
  const focusedChat = chats.find((chat) => chat.id === focusedChatId);
  const chatCheckoutId = focusedChat?.checkoutId;
  const chatBranch =
    chatCheckoutId === undefined ? undefined : status.branches.find((row) => row.checkoutId === chatCheckoutId)?.name;
  if (focusedChat === undefined || chatCheckoutId === undefined || chatBranch === undefined || chatBranch === branch) {
    return undefined;
  }
  return {
    chatName: focusedChat.name,
    branch: chatBranch,
    follow: () => {
      commands.pinTo(chatCheckoutId);
    },
  };
}

/**
 * The workbench's checkout in the header (S29): `[glyph] main` at rest, where
 * one glyph says the most urgent thing about it. Its tooltip is the branch and
 * the status sentence; click opens History, which owns every verb. There is no
 * hover card (C6): it repeated the pane and could not be reached by touch.
 *
 * While the focused chat works on another branch, *Switch to ⟨branch⟩* sits
 * before it and moves the workbench there (M2).
 *
 * @returns The trigger, or nothing before the project's root has answered.
 */
export function RevisionStatusAction(): React.JSX.Element | undefined {
  const { where, facts, status } = useRevisionFacts();
  const { branch } = where;
  const { openPanel } = useProjectWorkspace();
  const switchTo = useFollowChat(status, branch);

  /* Before the root answers there is nothing to be on; an *unborn* branch is a
   * different thing, and the trigger says *Setting up* rather than vanishing
   * at the moment a person most wants to know (review R10). */
  if (status === undefined) {
    return undefined;
  }

  const label = branch ?? 'Setting up';

  return (
    <span className='flex items-center gap-1'>
      {switchTo === undefined ? null : (
        <PaneButton
          data-slot='revision-switch'
          size='label'
          tooltip={`This chat is working on ${switchTo.branch}`}
          onClick={switchTo.follow}
        >
          <ArrowLeftRight aria-hidden className='size-3.5' />
          <span className='max-w-40 truncate'>Switch to {switchTo.branch}</span>
        </PaneButton>
      )}
      <PaneButton
        data-slot='revision-trigger'
        size='label'
        className='max-w-full'
        aria-label={revisionAccessibleName(where, facts.sentence)}
        tooltip={`${label} · ${facts.sentence}`}
        onClick={() => {
          openPanel('revisions');
        }}
      >
        <facts.icon aria-hidden data-slot='revision-icon' className={cn('size-3.5', facts.tone)} />
        {/* Share and Export's weight and colour: the glyph carries the state, not the label. */}
        <span className='max-w-40 truncate'>{label}</span>
      </PaneButton>
    </span>
  );
}
