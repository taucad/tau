import { useSelector } from '@xstate/react';
import { GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { useProject } from '#hooks/use-project.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useChats } from '#hooks/use-chats.js';

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
  const { branch, headRevisionId, revisions, isDirty } = useRevisions();
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const { editorRef, projectId } = useProject();
  const { chats } = useChats(projectId);
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
  const accessibleStatus = `${line}${revisionName === undefined ? '' : `, ${revisionName}`}${isDirty ? ', Modified' : ''}`;
  const chatCheckoutId = chats.find((chat) => chat.id === focusedChatId)?.checkoutId;
  const chatBranch =
    chatCheckoutId === undefined ? undefined : status.branches.find((row) => row.checkoutId === chatCheckoutId)?.name;
  const hasDiverged = chatBranch !== undefined && chatBranch !== line;

  return (
    <span className='flex items-center'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='max-w-full gap-1.5 px-2 text-xs'
            aria-label={`Open Revisions. You are on ${accessibleStatus}.`}
            onClick={() => {
              openPanel('revisions');
            }}
          >
            <GitBranch aria-hidden className='size-3.5 shrink-0' />
            <span className='max-w-24 truncate'>{line}</span>
            {revisionName === undefined ? null : (
              <>
                {/* R33 reads `main · Rev 3` everywhere, so the chip does too at
                    every width; hiding it below `@xl/viewer` made the narrow
                    chip the one surface that said `main Rev 1` (C47). */}
                <span aria-hidden className='text-muted-foreground'>
                  ·
                </span>
                <span className='font-mono'>{revisionName}</span>
              </>
            )}
            {isDirty ? <span className='text-muted-foreground'>· Modified</span> : null}
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
            if (chatCheckoutId !== undefined) commands.pinTo(chatCheckoutId);
          }}
        >
          Follow chat
        </Button>
      ) : null}
    </span>
  );
}
