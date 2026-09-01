import { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  Layout,
  Eye,
  ArrowRight,
  Table as TableIcon,
  Cog,
  Trash,
  AlertCircle,
  Zap,
  Brain,
  Wrench,
  Cpu,
  PackageX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { VisibilityState, SortingState } from '@tanstack/react-table';
import type { EngineeringDiscipline, Project } from '@taucad/types';
import type { KernelProvider } from '@taucad/runtime';
import { engineeringDisciplines } from '@taucad/types/constants';
import { createColumns } from '#routes/projects_.library/columns.js';
import { CategoryBadge } from '#components/category-badge.js';
import { Button, buttonVariants } from '#components/ui/button.js';
import { Card, CardContent, CardHeader, CardDescription, CardFooter } from '#components/ui/card.js';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { CadPreviewViewer } from '#components/cad-preview.js';
import { CadPreviewProvider } from '#hooks/use-cad-preview.js';
import { FileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { toast } from '#components/ui/sonner.js';
import type { Handle } from '#types/matches.types.js';
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
import { ProjectActionDropdown } from '#routes/projects_.library/project-action-dropdown.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Loader } from '#components/ui/loader.js';
import { cookieName } from '#constants/cookie.constants.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { KernelSelector } from '#components/chat/kernel-selector.js';
import { ChatComposerProvider } from '#hooks/active-chat-provider.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useKernel } from '#hooks/use-kernel.js';

// Note: useCookie is still used for projectViewMode (user preference, not per-build state)

const categoryIconsFromEngineeringDiscipline = {
  mechanical: Wrench,
  electrical: Zap,
  firmware: Cpu,
  software: Brain,
} as const satisfies Record<EngineeringDiscipline, LucideIcon>;

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant='ghost'>
        <Link to='/projects/library'>Library</Link>
      </Button>
    );
  },
  enableOverflowY: true,
};

export type ProjectActions = {
  handleDelete: (project: Project) => void;
  handleDuplicate: (project: Project) => Promise<void>;
  handleRename: (projectId: string, newName: string) => Promise<void>;
  handleRestore: (project: Project) => void;
};

export default function PersonalCadProjects(): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useCookie<'grid' | 'table'>(cookieName.projectViewMode, 'grid');
  const [showDeleted, setShowDeleted] = useState(false);
  const { projects, deleteProject, duplicateProject, restoreProject, updateName } = useProjects({
    includeDeleted: showDeleted,
  });
  const navigate = useNavigate();
  const { kernel, setKernel } = useKernel();
  const projectManager = useProjectManager();

  const handleToggleDeleted = useCallback((value: boolean) => {
    setShowDeleted(value);
  }, []);

  const handleDelete = useCallback(
    (project: Project) => {
      void deleteProject(project.id);
      toast.success(`Deleted ${project.name}`);
    },
    [deleteProject],
  );

  const handleDuplicate = useCallback(
    async (project: Project) => {
      try {
        await duplicateProject(project.id);
        toast.success(`Duplicated ${project.name}`, {
          action: {
            label: 'Open',
            onClick() {
              void navigate(`/projects/${project.id}`);
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

  const handleRestore = useCallback(
    (project: Project) => {
      void restoreProject(project.id);
      toast.success(`Restored ${project.name}`);
    },
    [restoreProject],
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

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, imageUrls }) => {
      try {
        const createdProject = await projectManager.createProject({
          kernel,
          initialMessage: { content, imageUrls },
          editorState: { panelState: { openPanels: { chat: true } } },
        });

        await navigate(`/projects/${createdProject.id}`);
      } catch {
        toast.error('Failed to create project');
      }
    },
    [kernel, projectManager, navigate],
  );

  const actions: ProjectActions = {
    handleDelete,
    handleDuplicate,
    handleRename,
    handleRestore,
  };

  const filteredProjects = projects.filter(
    (project) => activeFilter === 'all' || Object.keys(project.assets).includes(activeFilter),
  );

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-3xl font-bold'>Projects</h1>
        <Button asChild>
          <NavLink to='/'>{({ isPending }) => (isPending ? <Loader /> : 'New Project')}</NavLink>
        </Button>
      </div>

      <Tabs
        value={activeFilter}
        onValueChange={(value) => {
          setActiveFilter(value as 'all' | EngineeringDiscipline);
        }}
      >
        <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
          <TabsList className=''>
            <TabsTrigger value='all' className='flex items-center gap-2'>
              <Layout className='size-4' />
              <span className='hidden sm:inline'>All</span>
            </TabsTrigger>
            {Object.entries(engineeringDisciplines).map(([key, discipline]) => {
              const Icon = categoryIconsFromEngineeringDiscipline[key as EngineeringDiscipline];
              return (
                <TabsTrigger key={key} value={key} className='flex items-center gap-2 capitalize'>
                  <Icon className='size-4' />
                  <span className='hidden sm:inline'>{discipline.name}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className='flex items-center gap-2'>
            {/* View mode toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='icon'>
                  {viewMode === 'grid' ? <Grid /> : <TableIcon />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align='end'
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                }}
              >
                <DropdownMenuCheckboxItem
                  checked={viewMode === 'grid'}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setViewMode('grid');
                    }
                  }}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  <span>Grid</span>
                  <Grid className='ml-auto' />
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={viewMode === 'table'}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setViewMode('table');
                    }
                  }}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  <span>Table</span>
                  <TableIcon className='ml-auto' />
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Settings menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='icon'>
                  <Cog className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showDeleted}
                  onCheckedChange={handleToggleDeleted}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  Show deleted projects
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <TabsContent enableAnimation={false} value='all'>
          <UnifiedProjectList
            projects={filteredProjects}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={kernel}
            onKernelChange={setKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value='mechanical'>
          <UnifiedProjectList
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('mechanical'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={kernel}
            onKernelChange={setKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value='electrical'>
          <UnifiedProjectList
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('electrical'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={kernel}
            onKernelChange={setKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value='firmware'>
          <UnifiedProjectList
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('firmware'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={kernel}
            onKernelChange={setKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value='software'>
          <UnifiedProjectList
            projects={filteredProjects.filter((p) => Object.keys(p.assets).includes('software'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={kernel}
            onKernelChange={setKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type UnifiedProjectListProps = {
  readonly projects: Project[];
  readonly viewMode: 'grid' | 'table';
  readonly actions: ProjectActions;
  readonly onSubmit: ChatTextareaProperties['onSubmit'];
  readonly selectedKernel: KernelProvider;
  readonly onKernelChange: (kernel: KernelProvider) => void;
};

// Page size options for different view modes
const gridPageSizes = [12, 24, 36, 48, 60];
const tablePageSizes = [10, 20, 30, 40, 50];

function UnifiedProjectList({
  projects,
  viewMode,
  actions,
  onSubmit,
  selectedKernel,
  onKernelChange,
}: UnifiedProjectListProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }]);
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
            <div className='space-y-4'>
              <div className='flex justify-center'>
                <KernelSelector selectedKernel={selectedKernel} onKernelChange={onKernelChange} />
              </div>
              <ChatTextarea
                enableContextActions={false}
                enableKernelSelector={false}
                className='pt-1 shadow-none'
                onSubmit={onSubmit}
              />
            </div>
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
  readonly project: Project;
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

  const mechanicalAsset = project.assets.mechanical;
  if (!mechanicalAsset) {
    throw new Error('Mechanical asset not found');
  }

  const mainFile = mechanicalAsset.main;

  return (
    <Card className={cn('group relative flex flex-col overflow-hidden pt-0', isSelected && 'ring-3 ring-primary')}>
      <div className='absolute top-2 left-2 z-10'>
        <Checkbox size='large' checked={isSelected} onCheckedChange={() => onSelect?.()} />
      </div>
      <div className='relative aspect-video h-fit w-full overflow-hidden bg-muted'>
        {!showPreview && (
          <img
            src={project.thumbnail || '/placeholder.svg'}
            alt={project.name}
            className='size-full origin-center object-cover transition-transform group-hover:scale-120'
            loading='lazy'
          />
        )}
        {showPreview ? (
          <div
            className='size-full origin-center scale-80 object-cover transition-transform group-hover:scale-100'
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <SharedWorkerGate>
              <FileManagerProvider
                projectId={project.id}
                rootDirectory={`/projects/${project.id}`}
                initialBackend='indexeddb'
              >
                <CadPreviewProvider projectId={project.id} mainFile={mainFile}>
                  <CadPreviewViewer
                    enablePan={false}
                    stageOptions={{ zoomLevel: 1.5 }}
                    graphicsOptions={{
                      enableLines: false,
                      viewerClassName: 'bg-muted',
                    }}
                  />
                </CadPreviewProvider>
              </FileManagerProvider>
            </SharedWorkerGate>
          </div>
        ) : null}
        <Button
          variant='outline'
          size='icon'
          aria-label='Preview model'
          className={cn('absolute top-2 right-2', showPreview && 'text-primary')}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            setShowPreview(!showPreview);
          }}
        >
          <Eye className='size-4' />
        </Button>
      </div>
      <CardHeader>
        <div className='-mx-2 flex flex-1 items-start justify-start overflow-hidden py-1'>
          <InlineTextEditor
            value={project.name}
            className='h-7 w-full [&_[data-slot=button]]:w-full [&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:text-base [&_[data-slot=button]]:font-semibold'
            onSave={async (value) => actions.handleRename(project.id, value)}
          />
        </div>
        <CardDescription className='line-clamp-2'>{project.description}</CardDescription>
      </CardHeader>
      <CardContent className='grow'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div className='flex flex-wrap gap-2'>
            {Object.keys(project.assets).map((cat) => (
              <CategoryBadge key={cat} category={cat as EngineeringDiscipline} />
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className='flex items-center justify-between'>
        <Button asChild variant='outline'>
          <NavLink to={`/projects/${project.id}`} tabIndex={-1}>
            {({ isPending }) => (
              <>
                {isPending ? <Loader /> : <ArrowRight className='size-4' />}
                <span>Open</span>
              </>
            )}
          </NavLink>
        </Button>

        <ProjectActionDropdown shouldStopPropagation project={project} actions={actions} />
      </CardFooter>
    </Card>
  );
}

type BulkActionsProps = {
  readonly table: ReturnType<typeof useReactTable<Project>>;
  readonly deleteProject: (project: Project) => void;
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
                        (modified {formatRelativeTime(project.updatedAt)})
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
