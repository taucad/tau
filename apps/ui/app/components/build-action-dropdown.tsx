import { Copy, Ellipsis, Pencil, Star, Trash, ArrowUpRightSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js';
import { Button } from '~/components/ui/button.js';
import type { Build } from '~/types/build.js';
import type { BuildActions } from '~/routes/builds_.library/route.js';

type BuildActionDropdownProps = {
  readonly build: Build;
  readonly actions: BuildActions;
  readonly onRenameClick: (build: Build) => void;
  readonly shouldStopPropagation?: boolean;
};

export function BuildActionDropdown({
  build,
  actions,
  onRenameClick,
  shouldStopPropagation = false,
}: BuildActionDropdownProps): ReactNode {
  const isDeleted = Boolean(build.deletedAt);

  const handleClick = (event: React.MouseEvent): void => {
    if (shouldStopPropagation) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  return (
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
                onRenameClick(build);
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
  );
}
