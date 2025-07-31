import { Copy, Ellipsis, Pencil, Star, Trash, ArrowUpRightSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { Button } from '#components/ui/button.js';
import type { Build } from '#types/build.types.js';
import type { BuildActions } from '#routes/builds_.library/route.js';
import { Popover, PopoverContent } from '#components/ui/popover.js';
import { Input } from '#components/ui/input.js';

type BuildActionDropdownProps = {
  readonly build: Build;
  readonly actions: BuildActions;
  readonly shouldStopPropagation?: boolean;
};

export function BuildActionDropdown({
  build,
  actions,
  shouldStopPropagation = false,
}: BuildActionDropdownProps): ReactNode {
  const isDeleted = Boolean(build.deletedAt);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(build.name);

  const handleClick = (event: React.MouseEvent): void => {
    if (shouldStopPropagation) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newName.trim() && newName !== build.name) {
      try {
        await actions.handleRename(build.id, newName);
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
          <Button variant="ghost" size="icon" onClick={handleClick}>
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={handleClick}>
          {isDeleted ? (
            <DropdownMenuItem
              data-action="restore"
              data-id={build.id}
              data-name={build.name}
              onClick={() => {
                actions.handleRestore(build);
              }}
            >
              <ArrowUpRightSquare className="mr-2 size-4" />
              <span>Restore</span>
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                data-action="duplicate"
                data-id={build.id}
                data-name={build.name}
                onClick={async () => actions.handleDuplicate(build)}
              >
                <Copy className="mr-2 size-4" />
                <span>Duplicate</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                data-action="rename"
                data-id={build.id}
                data-name={build.name}
                onClick={() => {
                  setNewName(build.name);
                  setIsRenaming(true);
                }}
              >
                <Pencil className="mr-2 size-4" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Star className="mr-2 size-4" />
                <span>Favorite</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                data-action="delete"
                data-id={build.id}
                data-name={build.name}
                onClick={() => {
                  actions.handleDelete(build);
                }}
              >
                <Trash className="mr-2 size-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={isRenaming} onOpenChange={setIsRenaming}>
        <PopoverContent align="end" className="w-64 p-1">
          <form className="flex items-center gap-2 align-middle" onSubmit={handleRename}>
            <Input
              autoFocus
              autoComplete="off"
              value={newName}
              className="h-7"
              onChange={(event) => {
                setNewName(event.target.value);
              }}
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || newName === build.name}>
              Save
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </>
  );
}
