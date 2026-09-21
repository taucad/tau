import { useState } from 'react';
import { Check, GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useChats } from '#hooks/use-chats.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import { NewBranchForm } from '#routes/w.$workspace.$project/revision-branches.js';

/**
 * Which branch this chat works in, in the composer's bottom row (S23, A29).
 *
 * It replaces the deleted `chat-revision-selector.tsx`, which offered *modes*.
 * There are no modes: a chat attaches to a checkout, non-branching is the
 * default (A3), and the only thing to say is where this chat's next turn will
 * work — which is what the canvas's `ComposerPicker` artboard says, as a
 * popover of branch rows with *New branch* under them.
 *
 * It is present at **one** branch, unlike the pane's *Branches* region, which
 * appears at two (S26). That asymmetry is the point: a control that needs a
 * second branch cannot be where the second branch is made, so this is the only
 * always-reachable way out of a fresh project (W7 review R1).
 *
 * It says where the chat works; it does not record it. The chat workspace
 * authority is the one writer of `Chat.checkoutId`, and a placement handed to
 * it as the settling *New branch* verb is one an admission waits for (P1).
 *
 * @returns The chip and its popover, or nothing before the root has answered.
 */
export function ChatBranchPicker(): React.JSX.Element | undefined {
  /* The composer's bottom row also renders where no project is mounted (the
   * home composer, and every suite that exercises those controls). Revisions
   * belong to a project, so outside one this is nothing at all — and the read
   * that would throw happens in the child, below this gate. */
  const project = useProject({ enableNoContext: true });

  return project === undefined ? undefined : <BranchPicker />;
}

function BranchPicker(): React.JSX.Element | undefined {
  const { session } = useChatComposer();
  const { projectId } = useProject();
  const { chats } = useChats(projectId);
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const authority = useOptionalChatWorkspaceAuthority();
  const chatId = session?.activeChatId;
  const [open, setOpen] = useState(false);
  const isBusy = status?.branchVerb.busy === true || status?.branchVerb.asking === true;

  if (status?.branch === undefined) {
    return undefined;
  }

  const checkoutId = chats.find((chat) => chat.id === chatId)?.checkoutId;
  const chatBranch = status.branches.find((row) => row.checkoutId === checkoutId)?.name;
  const branch = checkoutId === undefined ? status.branch : chatBranch;
  const selectedBranch = status.branches.find((row) => row.name === branch);

  return (
    <Tooltip>
      <ComboBoxResponsive
        className="data-[slot='popover-content']:w-[300px]"
        popoverProperties={{ align: 'start' }}
        isOpen={open}
        onOpenChange={setOpen}
        groupedItems={[{ name: 'Work in', items: [...status.branches] }]}
        getValue={(row) => row.name}
        value={selectedBranch}
        isDisabled={() => isBusy}
        searchPlaceHolder='Search branches...'
        emptyListMessage='No branches found.'
        title='Select a branch'
        description='Select the branch this chat will work in.'
        renderLabel={(row) => {
          const isCurrent = row.name === branch;
          return (
            <>
              <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
              <span className='truncate text-sm'>{row.name}</span>
              <span className='flex-1' />
              {isCurrent ? <Check aria-hidden className='size-3.5 shrink-0 text-primary' /> : null}
            </>
          );
        }}
        onSelect={(name) => {
          const selected = status.branches.find((row) => row.name === name);
          if (chatId !== undefined && selected?.checkoutId !== undefined && selected.checkoutId !== checkoutId) {
            void authority?.placeChat(chatId, selected.checkoutId);
          }
        }}
        footer={
          <>
            <div className='border-t' />
            <NewBranchForm
              isBusy={isBusy}
              className='p-1 [&>button]:w-full [&>button]:justify-start'
              onCreate={(name) => {
                setOpen(false);
                if (chatId === undefined || authority === undefined) {
                  /* Nothing to place: the verb still runs, and its refusal is
                     the toast channel's — as it is for the pane's own *New
                     branch*, which also just asks for it. Caught because the
                     verb answers now: `void` would leave the refusal loose. */
                  // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- the toast channel owns this refusal; only the loose rejection is ours
                  void commands.createBranch(name).catch(() => undefined);
                  return;
                }
                /* The settling verb *is* the placement: the authority holds the
                   promise, so a send fired before the branch exists waits for
                   it rather than leasing the one the record still names (Q2). */
                void authority.placeChat(chatId, commands.createBranch(name));
              }}
            />
          </>
        }
      >
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            data-slot='chat-branch-picker'
            aria-label={
              branch === undefined ? 'Branch unavailable. Choose a branch.' : `Work in ${branch}. Choose a branch.`
            }
            className='h-7 max-w-32 rounded-full text-muted-foreground hover:text-foreground'
          >
            <GitBranch aria-hidden className='size-4 shrink-0' />
            <span className='max-w-20 truncate text-xs'>{branch ?? 'Unavailable'}</span>
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>
        {branch === undefined ? 'Choose an available branch before continuing.' : `Works in ${branch}`}
      </TooltipContent>
    </Tooltip>
  );
}
