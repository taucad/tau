import { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  Layout,
  Eye,
  ArrowRight,
  Table as TableIcon,
  Cog,
  List,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash,
  AlertCircle,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Zap,
  Brain,
  Wrench,
  Cpu,
  PackageX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { VisibilityState, SortingState } from '@tanstack/react-table';
import { useSelector } from '@xstate/react';
import type { EngineeringDiscipline, Build, KernelProvider } from '@taucad/types';
import { engineeringDisciplines, messageRole, messageStatus, idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { createInitialBuild } from '#constants/build.constants.js';
import { createColumns } from '#routes/builds_.library/columns.js';
import { CategoryBadge } from '#components/category-badge.js';
import { Button, buttonVariants } from '#components/ui/button.js';
import { SearchInput } from '#components/search-input.js';
import { Card, CardContent, CardHeader, CardDescription, CardFooter } from '#components/ui/card.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '#components/ui/dropdown-menu.js';
import { cn } from '#utils/ui.utils.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { useBuilds } from '#hooks/use-builds.js';
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
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import { useCookie } from '#hooks/use-cookie.js';
import { BuildActionDropdown } from '#routes/builds_.library/build-action-dropdown.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#components/ui/table.js';
import { toTitleCase } from '#utils/string.utils.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { cookieName } from '#constants/cookie.constants.js';
import { LoadingSpinner } from '#components/ui/loading-spinner.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea.js';
import { KernelSelector } from '#components/chat/kernel-selector.js';
import { ChatProvider } from '#components/chat/chat-provider.js';
import { InteractiveHoverButton } from '#components/magicui/interactive-hover-button.js';
import { createMessage } from '#utils/chat.utils.js';
import { getMainFile, getEmptyCode } from '#utils/kernel.utils.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { defaultBuildName } from '#constants/build-names.js';
import { useBuildManager } from '#hooks/use-build-manager.js';

const categoryIconsFromEngineeringDiscipline = {
  mechanical: Wrench,
  electrical: Zap,
  firmware: Cpu,
  software: Brain,
} as const satisfies Record<EngineeringDiscipline, LucideIcon>;

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant="ghost">
        <Link to="/builds/library">Library</Link>
      </Button>
    );
  },
  enableOverflowY: true,
};

export type BuildActions = {
  handleDelete: (build: Build) => void;
  handleDuplicate: (build: Build) => Promise<void>;
  handleRename: (buildId: string, newName: string) => Promise<void>;
  handleRestore: (build: Build) => void;
};

export default function PersonalCadProjects(): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useCookie<'grid' | 'table'>(cookieName.buildViewMode, 'grid');
  const [showDeleted, setShowDeleted] = useState(false);
  const { builds, deleteBuild, duplicateBuild, restoreBuild, updateName } = useBuilds({ includeDeleted: showDeleted });
  const navigate = useNavigate();
  const [selectedKernel, setSelectedKernel] = useCookie<KernelProvider>(cookieName.cadKernel, 'openscad');
  const [, setIsChatOpen] = useCookie(cookieName.chatOpHistory, true);
  const buildManager = useBuildManager();

  const handleToggleDeleted = useCallback((value: boolean) => {
    setShowDeleted(value);
  }, []);

  const handleDelete = useCallback(
    (build: Build) => {
      void deleteBuild(build.id);
      toast.success(`Deleted ${build.name}`);
    },
    [deleteBuild],
  );

  const handleDuplicate = useCallback(
    async (build: Build) => {
      try {
        await duplicateBuild(build.id);
        toast.success(`Duplicated ${build.name}`, {
          action: {
            label: 'Open',
            onClick() {
              void navigate(`/builds/${build.id}`);
            },
          },
        });
      } catch (error) {
        toast.error('Failed to duplicate build');
        console.error('Error in component:', error);
      }
    },
    [duplicateBuild, navigate],
  );

  const handleRestore = useCallback(
    (build: Build) => {
      void restoreBuild(build.id);
      toast.success(`Restored ${build.name}`);
    },
    [restoreBuild],
  );

  const handleRename = useCallback(
    async (buildId: string, newName: string) => {
      try {
        await updateName(buildId, newName);
        toast.success(`Renamed to ${newName}`);
      } catch (error) {
        toast.error('Failed to rename build');
        console.error('Error renaming build:', error);
      }
    },
    [updateName],
  );

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content, model, metadata, imageUrls }) => {
      try {
        const mainFileName = getMainFile(selectedKernel);
        const emptyCode = getEmptyCode(selectedKernel);

        // Create the initial message as pending
        const userMessage = createMessage({
          content,
          role: messageRole.user,
          model,
          status: messageStatus.pending,
          metadata: metadata ?? {},
          imageUrls,
        });

        const chatId = generatePrefixedId(idPrefix.chat);

        // Create initial build using factory function
        const { buildData, files } = createInitialBuild({
          buildName: defaultBuildName,
          chatId,
          initialMessage: userMessage,
          mainFileName,
          emptyCodeContent: encodeTextFile(emptyCode),
        });

        const createdBuild = await buildManager.createBuild(buildData, files);

        // Ensure chat is open when navigating to the build page
        setIsChatOpen(true);

        // Navigate immediately - the build page will handle the streaming
        await navigate(`/builds/${createdBuild.id}`);
      } catch {
        toast.error('Failed to create build');
      }
    },
    [selectedKernel, buildManager, setIsChatOpen, navigate],
  );

  const actions: BuildActions = {
    handleDelete,
    handleDuplicate,
    handleRename,
    handleRestore,
  };

  const filteredBuilds = builds.filter(
    (build) => activeFilter === 'all' || Object.keys(build.assets).includes(activeFilter),
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Builds</h1>
        <Button asChild>
          <NavLink to="/">{({ isPending }) => (isPending ? <LoadingSpinner /> : 'New Build')}</NavLink>
        </Button>
      </div>

      <Tabs
        value={activeFilter}
        onValueChange={(value) => {
          setActiveFilter(value as 'all' | EngineeringDiscipline);
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Layout className="size-4" />
              <span className="hidden sm:inline">All</span>
            </TabsTrigger>
            {Object.entries(engineeringDisciplines).map(([key, discipline]) => {
              const Icon = categoryIconsFromEngineeringDiscipline[key as EngineeringDiscipline];
              return (
                <TabsTrigger key={key} value={key} className="flex items-center gap-2 capitalize">
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{discipline.name}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  {viewMode === 'grid' ? <Grid /> : <TableIcon />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
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
                  <Grid className="ml-auto" />
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
                  <TableIcon className="ml-auto" />
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Settings menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Cog className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showDeleted}
                  onCheckedChange={handleToggleDeleted}
                  onSelect={(event) => {
                    event.preventDefault();
                  }}
                >
                  Show deleted builds
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <TabsContent enableAnimation={false} value="all">
          <UnifiedBuildList
            projects={filteredBuilds}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={selectedKernel}
            onKernelChange={setSelectedKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value="mechanical">
          <UnifiedBuildList
            projects={filteredBuilds.filter((p) => Object.keys(p.assets).includes('mechanical'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={selectedKernel}
            onKernelChange={setSelectedKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value="electrical">
          <UnifiedBuildList
            projects={filteredBuilds.filter((p) => Object.keys(p.assets).includes('electrical'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={selectedKernel}
            onKernelChange={setSelectedKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value="firmware">
          <UnifiedBuildList
            projects={filteredBuilds.filter((p) => Object.keys(p.assets).includes('firmware'))}
            viewMode={viewMode}
            actions={actions}
            selectedKernel={selectedKernel}
            onKernelChange={setSelectedKernel}
            onSubmit={onSubmit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type UnifiedBuildListProps = {
  readonly projects: Build[];
  readonly viewMode: 'grid' | 'table';
  readonly actions: BuildActions;
  readonly onSubmit: ChatTextareaProperties['onSubmit'];
  readonly selectedKernel: KernelProvider;
  readonly onKernelChange: (kernel: KernelProvider) => void;
};

// Page size options for different view modes
const gridPageSizes = [12, 24, 36, 48, 60];
const tablePageSizes = [10, 20, 30, 40, 50];

function UnifiedBuildList({
  projects,
  viewMode,
  actions,
  onSubmit,
  selectedKernel,
  onKernelChange,
}: UnifiedBuildListProps) {
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
      <EmptyItems className="min-h-[60vh]">
        <ChatProvider value={{}}>
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <PackageX className="size-16 text-muted-foreground" strokeWidth={1} />
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">No builds yet</h2>
                <p className="text-sm">Start by describing what you want to build, or create from code</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-center">
                <KernelSelector selectedKernel={selectedKernel} onKernelChange={onKernelChange} />
              </div>
              <ChatTextarea
                enableContextActions={false}
                enableKernelSelector={false}
                className="pt-1 shadow-none"
                onSubmit={onSubmit}
              />
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex justify-center">
              <NavLink to="/builds/new" tabIndex={-1}>
                {({ isPending }) => (
                  <InteractiveHoverButton className="flex items-center gap-2 font-light [&_svg]:size-6 [&_svg]:stroke-1">
                    {isPending ? <LoadingSpinner /> : 'Build from code'}
                  </InteractiveHoverButton>
                )}
              </NavLink>
            </div>
          </div>
        </ChatProvider>
      </EmptyItems>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SearchInput
          autoComplete="off"
          className="h-8"
          placeholder="Search builds..."
          value={globalFilter}
          containerClassName="flex-grow"
          onChange={(event) => {
            setGlobalFilter(event.target.value);
          }}
          onClear={() => {
            setGlobalFilter('');
          }}
        />
        <div className="flex items-center gap-2">
          {/* Add bulk actions when rows are selected */}
          {table.getFilteredSelectedRowModel().rows.length > 0 && (
            <BulkActions table={table} deleteBuild={actions.handleDelete} />
          )}
          <SortingDropdown table={table} />
          <ViewOptionsDropdown table={table} />
        </div>
      </div>

      {viewMode === 'table' ? (
        // Table View
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={row.getIsSelected() ? 'bg-muted/50' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        // Grid View
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {table.getRowModel().rows.map((row) => (
            <BuildProvider key={row.original.id} buildId={row.original.id} input={{ shouldLoadModelOnStart: false }}>
              <BuildLibraryCard
                build={row.original}
                actions={actions}
                isSelected={row.getIsSelected()}
                onSelect={() => {
                  row.toggleSelected();
                }}
              />
            </BuildProvider>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} build(s)
          selected.
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Items per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-7 w-[70px]">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {viewMode === 'grid'
                  ? [12, 24, 36, 48, 60].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))
                  : [10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-7 w-8 p-0 lg:flex"
              disabled={!table.getCanPreviousPage()}
              onClick={() => {
                table.setPageIndex(0);
              }}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-7 w-8 p-0"
              disabled={!table.getCanPreviousPage()}
              onClick={() => {
                table.previousPage();
              }}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-7 w-8 p-0"
              disabled={!table.getCanNextPage()}
              onClick={() => {
                table.nextPage();
              }}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-7 w-8 p-0 lg:flex"
              disabled={!table.getCanNextPage()}
              onClick={() => {
                table.setPageIndex(table.getPageCount() - 1);
              }}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortingDropdown({ table }: { readonly table: ReturnType<typeof useReactTable<Build>> }) {
  const sortingState = table.getState().sorting[0];

  // Dynamically get sortable columns from the table
  const sortFields = table
    .getAllColumns()
    .filter((column) => column.getCanSort())
    .map((column) => ({
      id: column.id,
      label: toTitleCase(column.id),
    }));

  const toggleSorting = (id: string) => {
    if (sortingState?.id === id) {
      // Toggle direction if already sorting by this column
      table.setSorting([{ id, desc: !sortingState.desc }]);
    } else {
      // Set to descending order by default on first click
      table.setSorting([{ id, desc: true }]);
    }
  };

  const renderSortIndicator = (fieldId: string) => {
    if (sortingState?.id !== fieldId) {
      return null;
    }

    return sortingState.desc ? <ArrowDown className="ml-auto" /> : <ArrowUp className="ml-auto" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <ArrowUpDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sortFields.map((field) => (
          <DropdownMenuItem
            key={field.id}
            className="flex w-full items-center"
            onClick={() => {
              toggleSorting(field.id);
            }}
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            {field.label}
            {renderSortIndicator(field.id)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewOptionsDropdown({ table }: { readonly table: ReturnType<typeof useReactTable<Build>> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <List className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => {
                  column.toggleVisibility(Boolean(value));
                }}
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                {toTitleCase(column.id)}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BuildLibraryCardProps = {
  readonly build: Build;
  readonly actions: BuildActions;
  readonly isSelected?: boolean;
  readonly onSelect?: () => void;
};

function BuildLibraryCard({ build, actions, isSelected, onSelect }: BuildLibraryCardProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [hasLoadedModel, setHasLoadedModel] = useState(false);

  // Get actors from BuildProvider context
  const { cadRef, buildRef } = useBuild();
  const geometries = useSelector(cadRef, (state) => state.context.geometries);
  const status = useSelector(cadRef, (state) => state.value);

  const mechanicalAsset = build.assets.mechanical;
  if (!mechanicalAsset) {
    throw new Error('Mechanical asset not found');
  }

  // Load the CAD model when preview is enabled for the first time
  useEffect(() => {
    if (showPreview && !hasLoadedModel) {
      buildRef.send({ type: 'loadModel' });
      setHasLoadedModel(true);
    }
  }, [showPreview, hasLoadedModel, buildRef]);

  return (
    <Card className={cn('group relative flex flex-col overflow-hidden pt-0', isSelected && 'ring-3 ring-primary')}>
      <div className="absolute top-2 left-2 z-10">
        <Checkbox size="large" checked={isSelected} onCheckedChange={() => onSelect?.()} />
      </div>
      <div className="relative aspect-video h-fit w-full overflow-hidden bg-muted">
        {!showPreview && (
          <img
            src={build.thumbnail || '/placeholder.svg'}
            alt={build.name}
            className="size-full origin-center object-cover transition-transform group-hover:scale-120"
            loading="lazy"
          />
        )}
        {showPreview ? (
          <div
            className="size-full origin-center scale-80 object-cover transition-transform group-hover:scale-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            {['initializing', 'booting'].includes(status) ? (
              <div className="flex size-full items-center justify-center">
                <HammerAnimation className="size-10" />
              </div>
            ) : null}
            <CadViewer
              geometries={geometries}
              enablePan={false}
              enableLines={false}
              enableMatcap={false}
              className="bg-muted"
              stageOptions={{
                zoomLevel: 1.5,
              }}
            />
          </div>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          className={cn('absolute top-2 right-2', showPreview && 'text-primary')}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            setShowPreview(!showPreview);
          }}
        >
          <Eye className="size-4" />
        </Button>
      </div>
      <CardHeader>
        <div className="-mx-2 flex flex-1 items-start justify-start overflow-hidden py-1">
          <InlineTextEditor
            value={build.name}
            className="h-7 w-full [&_[data-slot=button]]:w-full [&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:text-base [&_[data-slot=button]]:font-semibold"
            onSave={async (value) => actions.handleRename(build.id, value)}
          />
        </div>
        <CardDescription className="line-clamp-2">{build.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {Object.keys(build.assets).map((cat) => (
              <CategoryBadge key={cat} category={cat as EngineeringDiscipline} />
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <Button asChild variant="outline">
          <NavLink to={`/builds/${build.id}`} tabIndex={-1}>
            {({ isPending }) => (
              <>
                {isPending ? <LoadingSpinner /> : <ArrowRight className="size-4" />}
                <span>Open</span>
              </>
            )}
          </NavLink>
        </Button>

        <BuildActionDropdown shouldStopPropagation build={build} actions={actions} />
      </CardFooter>
    </Card>
  );
}

type BulkActionsProps = {
  readonly table: ReturnType<typeof useReactTable<Build>>;
  readonly deleteBuild: (build: Build) => void;
};

function BulkActions({ table, deleteBuild }: BulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Get selected row data
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  const handleBulkDelete = () => {
    // Close the dialog
    setShowDeleteDialog(false);

    let successCount = 0;
    let errorCount = 0;

    // Delete each selected build
    for (const row of selectedRows) {
      try {
        const build = row.original;
        deleteBuild(build);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Error deleting build:', error);
      }
    }

    // Clear selection after deleting
    table.resetRowSelection();

    // Show toast with results
    if (successCount > 0 && errorCount === 0) {
      toast.success(`Successfully deleted ${successCount} build${successCount === 1 ? '' : 's'}`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(
        `Deleted ${successCount} build${successCount === 1 ? '' : 's'}, but failed to delete ${errorCount}`,
      );
    } else {
      toast.error(`Failed to delete selected builds`);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1 border-destructive text-destructive hover:bg-destructive/10"
          onClick={() => {
            setShowDeleteDialog(true);
          }}
        >
          <Trash className="h-4 w-4" />
          Delete
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">{selectedCount}</span>
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete {selectedCount} build{selectedCount === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>The following builds will be moved to the trash:</p>
              <ul className="max-h-40 list-disc overflow-y-auto pl-6 text-sm">
                {selectedRows.map((row) => {
                  const build = row.original;
                  return (
                    <li key={row.id}>
                      {build.name}{' '}
                      <span className="text-muted-foreground/70 italic">
                        (modified {formatRelativeTime(build.updatedAt)})
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
