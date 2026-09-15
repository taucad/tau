import { useEffect, useRef, useState } from 'react';
import { Check, GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
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
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const chatId = session?.activeChatId;
  const [open, setOpen] = useState(false);
  const createdBranch = useRef<string | undefined>(undefined);
  const isBusy = status?.branchVerb.busy === true || status?.branchVerb.asking === true;

  useEffect(() => {
    if (
      createdBranch.current !== undefined &&
      !isBusy &&
      status?.branches.some((row) => row.name === createdBranch.current) === true
    ) {
      commands.switchTo(createdBranch.current);
      createdBranch.current = undefined;
    }
  }, [commands, isBusy, status?.branches]);

  if (status?.branch === undefined) {
    return undefined;
  }

  const chatBranch =
    chatId === undefined ? undefined : status.branches.find((row) => row.leaseChatIds.includes(chatId))?.name;
  const branch = chatBranch ?? status.branch;
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
          if (name !== branch) {
            commands.switchTo(name);
          }
        }}
        footer={
          <>
            <div className='border-t' />
            <NewBranchForm
              isBusy={isBusy}
              className='p-1 [&>button]:w-full [&>button]:justify-start'
              onCreate={(name) => {
                if (!status.branches.some((row) => row.name === name)) {
                  createdBranch.current = name;
                }
                setOpen(false);
                commands.createBranch(name);
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
            aria-label={`Work in ${branch}. Choose a branch.`}
            className='h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7'
          >
            <GitBranch aria-hidden className='size-4 @[22rem]:hidden' />
            <span className='hidden max-w-24 truncate text-xs @[22rem]:block'>{branch}</span>
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>Works in {branch}</TooltipContent>
    </Tooltip>
  );
}
