import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { NavLink } from 'react-router';
import type { ReactNode } from 'react';
import type { ProjectListItem } from '#types/project.types.js';
import { DataTableColumnHeader } from '#components/ui/data-table.js';
import { Button } from '@taucad/ui/components/button';
import { Checkbox } from '@taucad/ui/components/checkbox';
import { formatRelativeTime } from '#utils/date.utils.js';
import type { ProjectActions } from '#components/project-library/project-library.js';
import { ProjectActionDropdown } from '#components/project-library/project-action-dropdown.js';
import { Loader } from '#components/ui/loader.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';

import { projectSlugOf, projectUrlOr } from '#utils/project-url.utils.js';

// Rename component for table cells
function ProjectNameCell({
  project,
  actions,
}: {
  readonly project: ProjectListItem;
  readonly actions: ProjectActions;
}) {
  const thumbnailSource = useProjectThumbnail(project.id);
  return (
    <div className='flex w-full items-center justify-between gap-3 pr-2'>
      <div className='flex items-center gap-3'>
        <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-full'>
          <img
            src={thumbnailSource ?? '/placeholder.svg'}
            alt={project.name}
            className='absolute inset-0 h-full w-full object-cover'
          />
          {!thumbnailSource && (
            <div className='absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground'>
              {project.name.charAt(0)}
            </div>
          )}
        </div>
        <div className='min-w-0'>
          <InlineTextEditor
            value={project.name}
            className='h-7 [&_[data-slot=button]]:font-medium'
            onSave={async (value) => actions.handleRename(project.id, value)}
          />
          {/* Two projects may share a display name; the directory slug is what
              tells them apart on disk and in the URL (blueprint F5). */}
          <div className='truncate pl-2 font-mono text-xs text-muted-foreground'>{projectSlugOf(project.locator)}</div>
        </div>
      </div>
    </div>
  );
}

function ProjectOpenButton({ project }: { readonly project: ProjectListItem }): ReactNode {
  return (
    <Button asChild variant='outline' size='sm' className='ml-auto flex items-center gap-1'>
      <NavLink to={projectUrlOr(project.slugs)}>
        {({ isPending }) =>
          isPending ? (
            <Loader />
          ) : (
            <>
              Open
              <ArrowRight />
            </>
          )
        }
      </NavLink>
    </Button>
  );
}

// Create a factory function for columns that accepts actions
export const createColumns = (actions: ProjectActions): Array<ColumnDef<ProjectListItem>> => [
  {
    id: 'select',
    header: ({ table }) => (
      <div className='pl-2'>
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          aria-label='Select all'
          onCheckedChange={(value) => {
            table.toggleAllPageRowsSelected(Boolean(value));
          }}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className='pl-2'>
        <Checkbox
          checked={row.getIsSelected()}
          aria-label='Select row'
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
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell({ row }): ReactNode {
      return <ProjectNameCell project={row.original} actions={actions} />;
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Description' />,
    cell({ row }): ReactNode {
      return <div className='max-w-xs truncate'>{row.original.description}</div>;
    },
    enableHiding: true,
  },
  {
    id: 'entryPath',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Entry File' />,
    cell({ row }): ReactNode {
      return <div className='font-mono text-xs'>{row.original.assets.main.entryPath}</div>;
    },
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: 'lastActivityAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Last Updated' />,
    cell({ row }): ReactNode {
      return <div>{formatRelativeTime(row.original.lastActivityAt)}</div>;
    },
    sortingFn: 'datetime',
    enableHiding: true,
  },
  {
    id: 'actions',
    cell({ row }): ReactNode {
      const project = row.original;
      const isDeleted = Boolean(project.deletedAt);

      return (
        <div className='flex items-center justify-end gap-2'>
          <ProjectActionDropdown project={project} actions={actions} />

          {!isDeleted && <ProjectOpenButton project={project} />}
        </div>
      );
    },
    enableHiding: false,
  },
];
