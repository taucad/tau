import { useState } from 'react';
import { Check, GitBranch } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
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
  const [open, setOpen] = useState(false);
  const chatId = session?.activeChatId;

  if (status?.branch === undefined) {
    return undefined;
  }

  const chatBranch =
    chatId === undefined ? undefined : status.branches.find((row) => row.leaseChatIds.includes(chatId))?.name;
  const branch = chatBranch ?? status.branch;
  const isBusy = status.branchVerb.busy || status.branchVerb.asking;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant='outline'
              size='sm'
              data-slot='chat-branch-picker'
              aria-label={`Work in ${branch}. Choose a branch.`}
              className='h-7 cursor-pointer! rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7'
            >
              <GitBranch aria-hidden className='size-4 @[22rem]:hidden' />
              <span className='hidden max-w-24 truncate text-xs @[22rem]:block'>{branch}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Works in {branch}</TooltipContent>
      </Tooltip>
      <PopoverContent align='start' className='flex w-64 flex-col gap-1 p-2'>
        <p className='px-1 text-xs font-medium text-muted-foreground'>Work in</p>
        <ul aria-label='Branches' className='flex list-none flex-col'>
          {status.branches.map((row) => {
            const isCurrent = row.name === branch;
            return (
              <li key={row.name}>
                <Button
                  variant='ghost'
                  size='sm'
                  disabled={isBusy || isCurrent}
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={isCurrent ? `Working in ${row.name}` : `Work in ${row.name}`}
                  className={cn('w-full justify-start gap-2', isCurrent ? 'disabled:opacity-100' : undefined)}
                  onClick={() => {
                    setOpen(false);
                    commands.switchTo(row.name);
                  }}
                >
                  <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
                  <span className='truncate text-sm'>{row.name}</span>
                  <span className='flex-1' />
                  {isCurrent ? <Check aria-hidden className='size-3.5 shrink-0 text-primary' /> : null}
                </Button>
              </li>
            );
          })}
        </ul>
        <NewBranchForm
          isBusy={isBusy}
          onCreate={(name) => {
            setOpen(false);
            commands.createBranch(name);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
