import { useSelector } from '@xstate/react';
import { GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useProject } from '#hooks/use-project.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';

/**
 * The workbench's checkout, in one always-on header chip (S29, A19).
 *
 * `⎇ main · Rev 12` at all times, because the chat may be working on a
 * different branch than the panes show and a person must be able to see that
 * without opening anything. Clicking opens Revisions, which is where every
 * branch verb lives — the chip carries no popover of its own (A19: one place
 * outside the pane names a branch, and it names only the one you are on).
 *
 * *Follow chat* appears only while the focused chat's branch and the
 * workbench's differ, and disappears the moment they agree.
 *
 * @returns The chip, or nothing before the project's root has answered.
 */
export function RevisionStatusAction(): React.JSX.Element | undefined {
  const { branch, headRevisionId, revisions } = useRevisions();
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const { editorRef } = useProject();
  const { openPanel } = useProjectWorkspace();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);

  /* Before the root answers there is nothing to be on; an *unborn* branch is a
   * different thing, and the chip says what *Where you are* says rather than
   * vanishing at the moment a person most wants to know (review R10). */
  if (status === undefined) {
    return undefined;
  }
  const line = branch ?? 'Setting up';

  const head = revisions.find((revision) => revision.revisionId === headRevisionId);
  const revisionName = head?.n === undefined ? undefined : `Rev ${String(head.n)}`;
  /* Which branch the focused chat works on is already in the projection: a
   * branch row carries the chats placed on it, so no second reader is needed. */
  const chatBranch =
    focusedChatId === undefined
      ? undefined
      : status.branches.find((row) => row.leaseChatIds.includes(focusedChatId))?.name;
  const hasDiverged = chatBranch !== undefined && chatBranch !== line;

  return (
    <span className='flex items-center'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='gap-1.5 px-2'
            aria-label={
              revisionName === undefined
                ? `Open Revisions. You are on ${line}.`
                : `Open Revisions. You are on ${line}, ${revisionName}.`
            }
            onClick={() => {
              openPanel('revisions');
            }}
          >
            <GitBranch aria-hidden className='size-3.5 shrink-0' />
            <span className='hidden max-w-32 truncate @xl/viewer:inline'>{line}</span>
            {revisionName === undefined ? null : (
              <>
                <span aria-hidden className='hidden text-muted-foreground @xl/viewer:inline'>
                  ·
                </span>
                <span className='font-mono'>{revisionName}</span>
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open Revisions</TooltipContent>
      </Tooltip>
      {hasDiverged && focusedChatId !== undefined ? (
        <Button
          variant='ghost'
          size='sm'
          className='px-2 text-muted-foreground'
          aria-label={`Follow chat, which is working on ${chatBranch}`}
          onClick={() => {
            commands.followChat(focusedChatId);
          }}
        >
          Follow chat
        </Button>
      ) : null}
    </span>
  );
}
