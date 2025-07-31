import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { VisibilityState, SortingState } from '@tanstack/react-table';
import { useActor, useSelector } from '@xstate/react';
import { createColumns } from '#routes/builds_.library/columns.js';
import { CategoryBadge } from '#components/category-badge.js';
import { Button, buttonVariants } from '#components/ui/button.js';
import { SearchInput } from '#components/search-input.js';
import { Input } from '#components/ui/input.js';
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
import { cn } from '#utils/ui.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import type { Category } from '#types/cad.types.js';
import { categories } from '#types/cad.types.js';
import type { Build } from '#types/build.types.js';
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
import { BuildProvider } from '#hooks/use-build.js';
import { useCookie } from '#hooks/use-cookie.js';
import { BuildActionDropdown } from '#routes/builds_.library/build-action-dropdown.js';
import { createBuildMutations } from '#hooks/build-mutations.js';
import { Checkbox } from '#components/ui/checkbox.js';
import { formatRelativeTime } from '#utils/date.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#components/ui/table.js';
import { toSentenceCase } from '#utils/string.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { cadMachine } from '#machines/cad.machine.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { cookieName } from '#constants/cookie.constants.js';
import { LoadingSpinner } from '#components/loading-spinner.js';

export const handle: Handle = {
  breadcrumb() {
    return (
      <Button asChild variant="ghost" className="p-2">
        <Link to="/builds/library">Library</Link>
      </Button>
    );
  },
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
  const { builds, deleteBuild, duplicateBuild, restoreBuild } = useBuilds({ includeDeleted: showDeleted });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const buildMutations = useMemo(() => createBuildMutations(queryClient), [queryClient]);

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
        await buildMutations.updateName(buildId, newName);
        toast.success(`Renamed to ${newName}`);
      } catch (error) {
        toast.error('Failed to rename build');
        console.error('Error renaming build:', error);
      }
    },
    [buildMutations],
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
          setActiveFilter(value as 'all' | Category);
        }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Layout className="size-4" />
              <span className="hidden sm:inline">All</span>
            </TabsTrigger>
            {Object.entries(categories).map(([key, { icon: Icon, color }]) => (
              <TabsTrigger key={key} value={key} className="flex items-center gap-2 capitalize">
                <Icon className={`size-4 ${color}`} />
                <span className="hidden sm:inline">{key}</span>
              </TabsTrigger>
            ))}
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
          <UnifiedBuildList projects={filteredBuilds} viewMode={viewMode} actions={actions} />
        </TabsContent>
        <TabsContent enableAnimation={false} value="mechanical">
          <UnifiedBuildList
            projects={filteredBuilds.filter((p) => Object.keys(p.assets).includes('mechanical'))}
            viewMode={viewMode}
            actions={actions}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value="electrical">
          <UnifiedBuildList
            projects={filteredBuilds.filter((p) => Object.keys(p.assets).includes('electrical'))}
            viewMode={viewMode}
            actions={actions}
          />
        </TabsContent>
        <TabsContent enableAnimation={false} value="firmware">
          <UnifiedBuildList
            projects={filteredBuilds.filter((p) => Object.keys(p.assets).includes('firmware'))}
            viewMode={viewMode}
            actions={actions}
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
};

// Page size options for different view modes
const gridPageSizes = [12, 24, 36, 48, 60];
const tablePageSizes = [10, 20, 30, 40, 50];

function UnifiedBuildList({ projects, viewMode, actions }: UnifiedBuildListProps) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SearchInput
          autoComplete="off"
          className="h-7"
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {table.getRowModel().rows.map((row) => (
            <BuildProvider key={row.original.id} buildId={row.original.id}>
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
      label: toSentenceCase(column.id),
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
                {toSentenceCase(column.id)}
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
  const [_, send, actorRef] = useActor(cadMachine, { input: { shouldInitializeKernelOnStart: false } });
  const geometries = useSelector(actorRef, (state) => state.context.geometries);

  const mechanicalAsset = build.assets.mechanical;
  if (!mechanicalAsset) {
    throw new Error('Mechanical asset not found');
  }

  const code = mechanicalAsset.files[mechanicalAsset.main]?.content ?? '';
  const { parameters } = mechanicalAsset;
  const status = useSelector(actorRef, (state) => state.value);
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(build.name);

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() && name !== build.name) {
      try {
        await actions.handleRename(build.id, name);
      } catch {
        // Error is already handled in the action
      }
    }

    setIsEditing(false);
  };

  useEffect(() => {
    if (showPreview) {
      send({ type: 'initializeModel', code, parameters, kernelType: mechanicalAsset.language });
    }
  }, [code, parameters, mechanicalAsset.language, showPreview, send]);

  return (
    <Card className={cn('group relative flex flex-col overflow-hidden pt-0', isSelected && 'ring-2 ring-primary')}>
      <div className="absolute top-2 left-2 z-10">
        <Checkbox size="large" checked={isSelected} onCheckedChange={() => onSelect?.()} />
      </div>
      <div className="relative aspect-video overflow-hidden bg-muted">
        {!showPreview && (
          <img
            src={build.thumbnail || '/placeholder.svg'}
            alt={build.name}
            className="size-full scale-95 object-cover transition-transform group-hover:scale-100"
            loading="lazy"
          />
        )}
        {showPreview ? (
          <div
            className="absolute inset-0"
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
        <div className="flex items-start justify-between">
          <Popover open={isEditing} onOpenChange={setIsEditing}>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="cursor-text justify-start p-0 text-xl font-semibold">
                {build.name}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 -translate-x-2 p-1">
              <form className="flex items-center gap-2 align-middle" onSubmit={handleRename}>
                <Input
                  autoFocus
                  autoComplete="off"
                  value={name}
                  className="h-7"
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                  onFocus={(event) => {
                    event.target.select();
                  }}
                />
                <Button type="submit" size="sm" disabled={!name.trim() || name === build.name}>
                  Save
                </Button>
              </form>
            </PopoverContent>
          </Popover>
        </div>
        <CardDescription>{build.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {Object.keys(build.assets).map((cat) => (
              <CategoryBadge key={cat} category={cat as Category} />
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
          className="h-7 gap-1 border-destructive text-destructive hover:bg-destructive/10"
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
