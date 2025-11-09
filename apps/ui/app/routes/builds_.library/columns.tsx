import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { NavLink } from 'react-router';
import type { ReactNode } from 'react';
import type { Build, EngineeringDiscipline } from '@taucad/types';
import { CategoryBadge } from '#components/category-badge.js';
import { DataTableColumnHeader } from '#routes/builds_.library/data-table-column-header.js';
import { Button } from '#components/ui/button.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import type { BuildActions } from '#routes/builds_.library/route.js';
import { BuildActionDropdown } from '#routes/builds_.library/build-action-dropdown.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';

// Rename component for table cells
function BuildNameCell({ build, actions }: { readonly build: Build; readonly actions: BuildActions }) {
  return (
    <div className="flex w-full items-center justify-between gap-3 pr-2">
      <div className="flex items-center gap-3">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
          <img
            src={build.thumbnail || '/placeholder.svg'}
            alt={build.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {!build.thumbnail && !build.author.avatar && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
              {build.name.charAt(0)}
            </div>
          )}
        </div>
        <InlineTextEditor
          value={build.name}
          className="h-7 [&_[data-slot=button]]:font-medium"
          onSave={async (value) => actions.handleRename(build.id, value)}
        />
      </div>
    </div>
  );
}

// Create a factory function for columns that accepts actions
export const createColumns = (actions: BuildActions): Array<ColumnDef<Build>> => [
  {
    id: 'select',
    header: ({ table }) => (
      <div className="pl-2">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          aria-label="Select all"
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(Boolean(value));
          }}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="pl-2">
        <Checkbox
          checked={row.getIsSelected()}
          aria-label="Select row"
          onCheckedChange={(value) => {
            row.toggleSelected(Boolean(value));
          }}
        />
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell({ row }): ReactNode {
      return <BuildNameCell build={row.original} actions={actions} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell({ row }): ReactNode {
      return <div className="max-w-xs truncate">{row.original.description}</div>;
    },
    enableHiding: true,
  },
  {
    accessorKey: 'assets',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Assets" />,
    cell({ row }): ReactNode {
      const build = row.original;
      return (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(build.assets) as EngineeringDiscipline[]).map((cat) => (
            <CategoryBadge key={cat} category={cat} />
          ))}
        </div>
      );
    },
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last Updated" />,
    cell({ row }): ReactNode {
      return <div>{formatRelativeTime(row.original.updatedAt)}</div>;
    },
    sortingFn: 'datetime',
    enableHiding: true,
  },
  {
    id: 'actions',
    cell({ row }): ReactNode {
      const build = row.original;
      const isDeleted = Boolean(build.deletedAt);

      return (
        <div className="flex items-center justify-end gap-2">
          <BuildActionDropdown build={build} actions={actions} />

          {!isDeleted && (
            <Button asChild variant="outline" size="sm" className="ml-auto flex items-center gap-1">
              <NavLink to={`/builds/${build.id}`}>
                {({ isPending }) =>
                  isPending ? (
                    <LoadingSpinner />
                  ) : (
                    <>
                      Open
                      <ArrowRight />
                    </>
                  )
                }
              </NavLink>
            </Button>
          )}
        </div>
      );
    },
    enableHiding: false,
  },
];
