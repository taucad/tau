import { Copy, Ellipsis, Pencil, Trash, ArrowUpRightSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ProjectListItem } from '#types/project.types.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Button } from '@taucad/ui/components/button';
import type { ProjectActions } from '#components/project-library/project-library.js';
import { Popover, PopoverContent } from '@taucad/ui/components/popover';
import { Input } from '@taucad/ui/components/input';
import { CloseProjectDialog } from '#components/nav/project-close-dialogs.js';
import { useProjectSidebarRow } from '#hooks/use-sidebar-status.js';

type ProjectActionDropdownProps = {
  readonly project: ProjectListItem;
  readonly actions: ProjectActions;
};

export function ProjectActionDropdown({ project, actions }: ProjectActionDropdownProps): ReactNode {
  const isDeleted = Boolean(project.deletedAt);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const [newName, setNewName] = useState(project.name);
  const row = useProjectSidebarRow(project.id);

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newName.trim() && newName !== project.name) {
      try {
        await actions.handleRename(project.id, newName);
        setIsRenaming(false);
      } catch {
        // Error is already handled in the action
      }
    } else {
      setIsRenaming(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='icon' aria-label={`Actions for ${project.name}`}>
            <Ellipsis className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          {isDeleted ? (
            <>
              <DropdownMenuItem
                data-action='restore'
                data-id={project.id}
                data-name={project.name}
                onClick={() => {
                  actions.handleRestore(project);
                }}
              >
                <ArrowUpRightSquare />
                <span>Restore</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                data-action='permanent-delete'
                data-id={project.id}
                data-name={project.name}
                onClick={() => {
                  actions.handlePermanentlyDelete(project);
                }}
              >
                <Trash />
                <span>Delete permanently</span>
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem
                data-action='duplicate'
                data-id={project.id}
                data-name={project.name}
                onClick={async () => actions.handleDuplicate(project)}
              >
                <Copy />
                <span>Duplicate</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                data-action='rename'
                data-id={project.id}
                data-name={project.name}
                onClick={() => {
                  setNewName(project.name);
                  setIsRenaming(true);
                }}
              >
                <Pencil />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant='destructive'
                data-action='delete'
                data-id={project.id}
                data-name={project.name}
                onClick={() => {
                  if (row.runs > 0) {
                    setIsConfirmingClose(true);
                  } else {
                    actions.handleDelete(project);
                  }
                }}
              >
                <Trash />
                <span>Move to Trash</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={isRenaming} onOpenChange={setIsRenaming}>
        <PopoverContent align='end' className='w-64 p-1'>
          <form className='flex items-center gap-2 align-middle' onSubmit={handleRename}>
            <Input
              autoFocus
              autoComplete='off'
              value={newName}
              className='h-7'
              onChange={(event) => {
                setNewName(event.target.value);
              }}
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <Button type='submit' size='sm' disabled={!newName.trim() || newName === project.name}>
              Save
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      {isConfirmingClose ? (
        <CloseProjectDialog
          row={row}
          name={project.name}
          isOpen
          onOpenChange={setIsConfirmingClose}
          onConfirm={() => {
            actions.handleDelete(project);
          }}
        />
      ) : null}
    </>
  );
}
