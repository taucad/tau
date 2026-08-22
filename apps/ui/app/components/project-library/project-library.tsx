import { useState, useEffect, useCallback } from 'react';
import { Grid, ArrowRight, Table as TableIcon, Cog, Trash, AlertCircle, PackageX } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { VisibilityState, SortingState } from '@tanstack/react-table';
import type { ProjectLocator } from '@taucad/filesystem';
import type { ProjectListItem } from '#types/project.types.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import { createColumns } from '#components/project-library/columns.js';
import { Button, buttonVariants } from '#components/ui/button.js';
import { CardHeader, CardFooter } from '#components/ui/card.js';
import {
  DataTable,
  DataTableSearch,
  DataTablePagination,
  DataTableSortingDropdown,
  DataTableColumnVisibilityDropdown,
} from '#components/ui/data-table.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '#components/ui/dropdown-menu.js';
import { cn } from '#utils/ui.utils.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { toast } from '#components/ui/sonner.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog.js';
import { useCookie } from '#hooks/use-cookie.js';
import { ProjectActionDropdown } from '#components/project-library/project-action-dropdown.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Loader } from '#components/ui/loader.js';
import { cookieName } from '#constants/cookie.constants.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { NewProjectChatComposer } from '#components/chat/new-project-chat-composer.js';
import { ChatComposerProvider } from '#hooks/active-chat-provider.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { ProjectCard, ProjectCardCadPreview, ProjectCardMedia } from '#components/project-card.js';
import { projectSlugOf, projectUrlOr } from '#utils/project-url.utils.js';

// Note: useCookie is still used for projectViewMode (user preference, not per-build state)

export type ProjectActions = {
  handleDelete: (project: ProjectListItem) => void;
  handlePermanentlyDelete: (project: ProjectListItem) => void;
  handleDuplicate: (project: ProjectListItem) => Promise<void>;
  handleRename: (projectId: string, newName: string) => Promise<void>;
  handleRestore: (project: ProjectListItem) => void;
};

/** Physical directory an unfinished operation is stuck on. */
const recoveryDirectoryName = (recovery: PendingProjectRecovery): string =>
  recovery.storage.providerBasePath.split('/').findLast(Boolean) ?? recovery.storage.providerBasePath;

export function ProjectLibrary(): React.JSX.Element {
  const [viewMode, setViewMode] = useCookie<'grid' | 'table'>(cookieName.projectViewMode, 'grid');
  const [showDeleted, setShowDeleted] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<ProjectListItem | undefined>();
  const {
    projects,
    conflicts,
    recoveries,
    error: listingError,
    retry,
    deleteProject,
    duplicateProject,
    restoreProject,
    permanentlyDeleteProject: deleteProjectPermanently,
    adoptProject,
    updateName,
  } = useProjects({ includeDeleted: showDeleted });
  const navigate = useNavigate();
  const projectManager = useProjectManager();

  const handleToggleDeleted = useCallback((value: boolean) => {
    setShowDeleted(value);
  }, []);

  // The toast follows the mutation, never precedes it: a row that has already
  // vanished is a failure, not a silent success (DF3).
  const trashProject = useCallback(
    async (project: ProjectListItem): Promise<void> => {
      try {
        const trashed = await deleteProject(project.id);
        if (trashed) {
          toast.success(`Moved ${project.name} to Trash`, {
            description: 'Its files remain on disk and can be restored from this browser profile.',
          });
          return;
        }
        toast.error(`Could not move ${project.name} to Trash`);
      } catch (error) {
        toast.error(`Could not move ${project.name} to Trash`);
        console.error('Error trashing project:', error);
      }
    },
    [deleteProject],
  );

  const handleDelete = useCallback(
    (project: ProjectListItem) => {
      void trashProject(project);
    },
    [trashProject],
  );

  const handlePermanentlyDelete = useCallback((project: ProjectListItem) => {
    setPermanentDeleteTarget(project);
  }, []);

  const handleDiscardRecovery = useCallback(
    async (operationId: string): Promise<void> => {
      try {
        await projectManager.discardRecovery(operationId);
      } catch (error) {
        toast.error('Could not discard the unfinished operation');
        console.error('Error discarding recovery:', error);
      }
    },
    [projectManager],
  );

  const handleAdopt = useCallback(
    async (locator: ProjectLocator, name: string): Promise<void> => {
      try {
        await adoptProject(locator);
        toast.success(`Adopted ${name}`);
      } catch (error) {
        toast.error(`Could not adopt ${name}`);
        console.error('Error adopting project:', error);
      }
    },
    [adoptProject],
  );

  const confirmPermanentDelete = useCallback(async () => {
    const project = permanentDeleteTarget;
    if (!project) {
      return;
    }
    try {
      await deleteProjectPermanently(project.id);
      setPermanentDeleteTarget(undefined);
      toast.success(`Permanently deleted ${project.name}`);
    } catch (error) {
      toast.error(`Could not permanently delete ${project.name}`);
      console.error('Error permanently deleting project:', error);
    }
  }, [deleteProjectPermanently, permanentDeleteTarget]);

  const handleDuplicate = useCallback(
    async (project: ProjectListItem) => {
      try {
        await duplicateProject(project.id);
        toast.success(`Duplicated ${project.name}`, {
          action: {
            label: 'Open',
            onClick() {
              void navigate(projectUrlOr(project.slugs));
            },
          },
        });
      } catch (error) {
        toast.error('Failed to duplicate project');
        console.error('Error in component:', error);
      }
    },
    [duplicateProject, navigate],
  );

  const restoreFromTrash = useCallback(
    async (project: ProjectListItem): Promise<void> => {
      try {
        await restoreProject(project.id);
        toast.success(`Restored ${project.name}`);
      } catch (error) {
        toast.error(`Could not restore ${project.name}`);
        console.error('Error restoring project:', error);
      }
    },
    [restoreProject],
  );

  const handleRestore = useCallback(
    (project: ProjectListItem) => {
      void restoreFromTrash(project);
    },
    [restoreFromTrash],
  );

  const handleRename = useCallback(
    async (projectId: string, newName: string) => {
      try {
        await updateName(projectId, newName);
        toast.success(`Renamed to ${newName}`);
      } catch (error) {
        toast.error('Failed to rename project');
        console.error('Error renaming project:', error);
      }
    },
    [updateName],
  );

  const actions: ProjectActions = {
    handleDelete,
    handlePermanentlyDelete,
    handleDuplicate,
    handleRename,
    handleRestore,
  };

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-3xl font-bold'>Projects</h1>
        <Button asChild>
          <NavLink to='/'>{({ isPending }) => (isPending ? <Loader /> : 'New Project')}</NavLink>
        </Button>
      </div>

      {conflicts.length > 0 && (
        <div className='mb-6 space-y-2' aria-label='Project conflicts'>
          {conflicts.map((conflict) => {
            const key = `${conflict.locator.storageRootKey}:${conflict.locator.relativeDirectory}`;
            const label =
              conflict.status === 'invalid'
                ? (conflict.locator.relativeDirectory.split('/').at(-1) ?? conflict.locator.relativeDirectory)
                : conflict.manifest.name;
            return (
              <div key={key} className='border-amber-500/40 flex items-center gap-3 rounded-md border p-3'>
                <AlertCircle className='text-amber-600 size-4 shrink-0' />
                <div className='min-w-0 flex-1'>
                  <div className='truncate font-medium'>{label}</div>
                  <div className='text-sm text-muted-foreground'>
                    {conflict.status === 'adoption-required'
                      ? 'This project needs a Tau identity before it can be opened.'
                      : conflict.status === 'duplicate-id'
                        ? 'This copied project shares an identity with another directory.'
                        : conflict.status === 'route-blocked'
                          ? 'This project’s workspace is not connected. Reconnect the folder to open it.'
                          : conflict.issue.code === 'manifest-unreadable'
                            ? 'This project directory could not be read.'
                            : 'The tau.json manifest is invalid and was not opened.'}
                  </div>
                </div>
                {conflict.status === 'adoption-required' && (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={async () => handleAdopt(conflict.locator, conflict.manifest.name)}
                  >
                    Adopt
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {recoveries.length > 0 && (
        <div className='mb-6 space-y-2' aria-label='Project recovery'>
          {recoveries.map((recovery) => (
            <div
              key={recovery.operationId}
              className='border-amber-500/40 flex items-center gap-3 rounded-md border p-3'
            >
              <AlertCircle className='text-amber-600 size-4 shrink-0' />
              <div className='min-w-0 flex-1'>
                {/* The directory is the only handle the user has on an
                    unfinished operation — an unnamed banner is unactionable (DF11). */}
                <div className='truncate font-medium'>{recoveryDirectoryName(recovery)}</div>
                <div className='text-sm text-muted-foreground'>
                  {recovery.status === 'recovering'
                    ? 'Tau is finishing this project.'
                    : recovery.reason === 'workspace-unavailable'
                      ? 'Reconnect its workspace folder so Tau can finish recovery.'
                      : recovery.reason === 'identity-conflict'
                        ? 'The project directory belongs to different or unidentifiable content.'
                        : recovery.reason === 'local-state-error'
                          ? 'The project files committed, but local project state could not be restored.'
                          : 'Tau could not finish writing the project files.'}
                </div>
              </div>
              {recovery.status === 'failed' && (
                <Button size='sm' variant='outline' onClick={async () => handleDiscardRecovery(recovery.operationId)}>
                  Discard
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {listingError && projects.length > 0 ? (
        <div className='mb-6 flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3'>
          <span className='text-sm'>Projects could not be refreshed.</span>
          <Button size='sm' variant='outline' onClick={() => void retry()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className='mb-4 flex justify-end gap-2'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='icon'>
              {viewMode === 'grid' ? <Grid /> : <TableIcon />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuCheckboxItem
              checked={viewMode === 'grid'}
              onCheckedChange={() => {
                setViewMode('grid');
              }}
            >
              Grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={viewMode === 'table'}
              onCheckedChange={() => {
                setViewMode('table');
              }}
            >
              Table
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='icon'>
              <Cog className='size-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showDeleted} onCheckedChange={handleToggleDeleted}>
              Show trashed projects
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {listingError && projects.length === 0 ? (
        <div className='flex min-h-80 flex-col items-center justify-center gap-3 rounded-md border p-6 text-center'>
          <PackageX className='size-8 text-muted-foreground' />
          <div>
            <div className='font-medium'>Projects could not be loaded</div>
            <div className='text-sm text-muted-foreground'>Check the connected workspace and try again.</div>
          </div>
          <Button variant='outline' onClick={() => void retry()}>
            Retry
          </Button>
        </div>
      ) : (
        <UnifiedProjectList projects={projects} viewMode={viewMode} actions={actions} />
      )}
      <AlertDialog
        open={permanentDeleteTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPermanentDeleteTarget(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the exact project directory and its local chats and editor state. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                void confirmPermanentDelete();
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type UnifiedProjectListProps = {
  readonly projects: ProjectListItem[];
  readonly viewMode: 'grid' | 'table';
  readonly actions: ProjectActions;
};

// Page size options for different view modes
const gridPageSizes = [12, 24, 36, 48, 60];
const tablePageSizes = [10, 20, 30, 40, 50];

function UnifiedProjectList({ projects, viewMode, actions }: UnifiedProjectListProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lastActivityAt', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  // Find the most appropriate page size based on current selected count
  const getAppropriatePageSize = useCallback((selectedCount = 0, isGrid = true) => {
    const pageSizes = isGrid ? gridPageSizes : tablePageSizes;
    // If no items are selected, use default page size
    if (selectedCount === 0) {
      return pageSizes[0];
    }

    // Find the closest page size that can accommodate all selected items
    for (const size of pageSizes) {
      if (size >= selectedCount) {
        return size;
      }
    }

    // If selected count is larger than any page size, return the largest available
    return pageSizes.at(-1);
  }, []);

  const table = useReactTable({
    data: projects,
    columns: createColumns(actions),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: viewMode === 'grid' ? gridPageSizes[0] : tablePageSizes[0],
      },
    },
  });

  // Update page size when view mode changes or selection changes
  useEffect(() => {
    const selectedCount = Object.keys(rowSelection).length;
    const newPageSize = getAppropriatePageSize(selectedCount, viewMode === 'grid');
    if (newPageSize) {
      table.setPageSize(newPageSize);
    }
  }, [viewMode, rowSelection, getAppropriatePageSize, table]);

  // Show empty state if no projects at all
  if (projects.length === 0) {
    return (
      <EmptyItems className='min-h-[60vh]'>
        {/* Empty-library CTA — composer-only, no chat session to attach to. */}
        <ChatComposerProvider>
          <div className='mx-auto max-w-2xl space-y-6'>
            <div className='flex flex-col items-center space-y-4 text-center'>
              <PackageX className='size-16 text-muted-foreground' strokeWidth={1} />
              <div className='space-y-2'>
                <h2 className='text-xl font-semibold'>No projects yet</h2>
                <p className='text-sm'>Start by describing what you want to build, or create from code</p>
              </div>
            </div>
            <NewProjectChatComposer className='pt-1 shadow-none' />
            <div className='flex items-center justify-center gap-4 text-sm text-muted-foreground'>
              <div className='h-px flex-1 bg-border' />
              <span>or</span>
              <div className='h-px flex-1 bg-border' />
            </div>
            <div className='flex justify-center'>
              <NavLink to='/projects/new' tabIndex={-1}>
                {({ isPending }) => (
                  <InteractiveHoverButton className='flex items-center gap-2 font-light [&_svg]:size-4 [&_svg]:stroke-1'>
                    {isPending ? <Loader /> : 'Build from code'}
                  </InteractiveHoverButton>
                )}
              </NavLink>
            </div>
          </div>
        </ChatComposerProvider>
      </EmptyItems>
    );
  }

  const columns = createColumns(actions);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <DataTableSearch table={table} placeholder='Search projects...' containerClassName='grow' />
        <div className='flex items-center gap-2'>
          {/* Add bulk actions when rows are selected */}
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <BulkActions table={table} deleteProject={actions.handleDelete} />
          )}
          <DataTableSortingDropdown table={table} />
          <DataTableColumnVisibilityDropdown table={table} />
        </div>
      </div>

      {viewMode === 'table' ? (
        // Table View
        <DataTable table={table} columns={columns} />
      ) : (
        // Grid View
        <div className='grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'>
          {table.getRowModel().rows.map((row) => (
            <ProjectLibraryCard
              key={row.original.id}
              project={row.original}
              actions={actions}
              isSelected={row.getIsSelected()}
              onSelect={() => {
                row.toggleSelected();
              }}
            />
          ))}
        </div>
      )}

      <DataTablePagination
        table={table}
        pageSizeOptions={viewMode === 'grid' ? gridPageSizes : tablePageSizes}
        itemName='project'
      />
    </div>
  );
}

type ProjectLibraryCardProps = {
  readonly project: ProjectListItem;
  readonly actions: ProjectActions;
  readonly isSelected?: boolean;
  readonly onSelect?: () => void;
};

export function ProjectLibraryCard({
  project,
  actions,
  isSelected,
  onSelect,
}: ProjectLibraryCardProps): React.JSX.Element {
  const [showPreview, setShowPreview] = useState(false);
  const thumbnailSource = useProjectThumbnail(project.id);

  const mainFile = project.assets.main.entryPath;

  return (
    <ProjectCard
      to={projectUrlOr(project.slugs)}
      linkLabel={`Open ${project.name}`}
      className={cn('flex flex-col', isSelected && 'ring-3 ring-primary')}
    >
      <div className='absolute top-2 left-2 z-20'>
        <Checkbox
          size='large'
          aria-label={`Select ${project.name}`}
          checked={isSelected}
          onCheckedChange={() => onSelect?.()}
        />
      </div>
      <ProjectCardMedia
        name={project.name}
        thumbnailSource={thumbnailSource}
        isPreviewVisible={showPreview}
        onPreviewVisibilityChange={setShowPreview}
      >
        {showPreview ? (
          <SharedWorkerGate>
            <HomeFileManagerProvider key={project.id} projectId={project.id} rootDirectory={`/projects/${project.id}`}>
              <CadPreviewProvider projectId={project.id} mainFile={mainFile}>
                <ProjectCardCadPreview />
              </CadPreviewProvider>
            </HomeFileManagerProvider>
          </SharedWorkerGate>
        ) : null}
      </ProjectCardMedia>
      <CardHeader>
        <div className='relative z-20 -mx-2 flex flex-1 flex-col items-start justify-start overflow-hidden py-1'>
          <InlineTextEditor
            value={project.name}
            className='h-7 w-full [&_[data-slot=button]]:w-full [&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:text-base [&_[data-slot=button]]:font-semibold'
            onSave={async (value) => actions.handleRename(project.id, value)}
          />
          {/* Same display name, different directory: the slug is the only
              distinguishing label the library can show (blueprint F5). */}
          <div className='w-full truncate px-2 font-mono text-xs text-muted-foreground'>
            {projectSlugOf(project.locator)}
          </div>
        </div>
      </CardHeader>
      <CardFooter className='mt-auto flex items-center justify-between'>
        <Button asChild variant='outline'>
          <span aria-hidden='true' className='pointer-events-none'>
            <ArrowRight className='size-4' />
            <span>Open</span>
          </span>
        </Button>

        <div className='relative z-20'>
          <ProjectActionDropdown project={project} actions={actions} />
        </div>
      </CardFooter>
    </ProjectCard>
  );
}

type BulkActionsProps = {
  readonly table: ReturnType<typeof useReactTable<ProjectListItem>>;
  readonly deleteProject: (project: ProjectListItem) => void;
};

function BulkActions({ table, deleteProject }: BulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Get selected row data
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  const handleBulkDelete = () => {
    // Close the dialog
    setShowDeleteDialog(false);

    let successCount = 0;
    let errorCount = 0;

    // Delete each selected project
    for (const row of selectedRows) {
      try {
        const project = row.original;
        deleteProject(project);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Error deleting project:', error);
      }
    }

    // Clear selection after deleting
    table.resetRowSelection();

    // Show toast with results
    if (successCount > 0 && errorCount === 0) {
      toast.success(`Successfully deleted ${successCount} project${successCount === 1 ? '' : 's'}`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(
        `Deleted ${successCount} project${successCount === 1 ? '' : 's'}, but failed to delete ${errorCount}`,
      );
    } else {
      toast.error(`Failed to delete selected projects`);
    }
  };

  return (
    <>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          className='gap-1 border-destructive text-destructive hover:bg-destructive/10'
          onClick={() => {
            setShowDeleteDialog(true);
          }}
        >
          <Trash className='h-4 w-4' />
          Delete
          <span className='ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs'>{selectedCount}</span>
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 text-destructive' />
              Delete {selectedCount} project{selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription className='space-y-2'>
              <p>The following projects will be moved to the trash:</p>
              <ul className='max-h-40 list-disc overflow-y-auto pl-6 text-sm'>
                {selectedRows.map((row) => {
                  const project = row.original;
                  return (
                    <li key={row.id}>
                      {project.name}{' '}
                      <span className='text-muted-foreground/70 italic'>
                        (modified {formatRelativeTime(project.lastActivityAt)})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={handleBulkDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
