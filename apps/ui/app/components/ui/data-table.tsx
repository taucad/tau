import type { ReactNode } from 'react';
import { useRef } from 'react';
import type { Column, ColumnDef, Table as TanstackTable } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  EyeOff,
  List,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@taucad/ui/components/table';
import { Button } from '@taucad/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@taucad/ui/components/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { toTitleCase } from '#utils/string.utils.js';
import { SearchInput } from '#components/search-input.js';
import { cn } from '@taucad/ui/utils/cn';

// =============================================================================
// DataTable
// =============================================================================

type DataTableProps<Data> = {
  readonly table: TanstackTable<Data>;
  readonly columns: Array<ColumnDef<Data>>;
  readonly emptyMessage?: string;
  readonly onRowClick?: (row: Data) => void;
};

export function DataTable<Data>({
  table,
  columns,
  emptyMessage = 'No results.',
  onRowClick,
}: DataTableProps<Data>): ReactNode {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? undefined : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(row.getIsSelected() ? 'bg-muted/50' : undefined, onRowClick && 'cursor-pointer')}
              onClick={
                onRowClick
                  ? () => {
                      onRowClick(row.original);
                    }
                  : undefined
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className='h-24 text-center'>
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// =============================================================================
// DataTableVirtualized
// =============================================================================

type DataTableVirtualizedProps<Data> = {
  readonly table: TanstackTable<Data>;
  readonly columns: Array<ColumnDef<Data>>;
  readonly emptyMessage?: string;
  readonly height?: number;
  readonly estimatedRowHeight?: number;
  readonly overscan?: number;
  readonly onRowClick?: (row: Data) => void;
};

/**
 * Virtualized data table for large datasets.
 * Only renders visible rows for better performance.
 */
export function DataTableVirtualized<Data>({
  table,
  columns,
  emptyMessage = 'No results.',
  height = 400,
  estimatedRowHeight = 48,
  overscan = 10,
  onRowClick,
}: DataTableVirtualizedProps<Data>): ReactNode {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Calculate padding for virtual scrolling
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows.at(-1);
  const paddingTop = firstVirtualRow ? firstVirtualRow.start : 0;
  const paddingBottom = lastVirtualRow ? totalSize - lastVirtualRow.end : 0;

  return (
    <div ref={tableContainerRef} className='overflow-auto' style={{ height }}>
      <Table>
        <TableHeader className='sticky top-0 z-10 bg-background'>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? undefined : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) {
                  return undefined;
                }

                return (
                  <TableRow
                    key={row.id}
                    data-index={virtualRow.index}
                    className={cn(row.getIsSelected() ? 'bg-muted/50' : undefined, onRowClick && 'cursor-pointer')}
                    onClick={
                      onRowClick
                        ? () => {
                            onRowClick(row.original);
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: paddingBottom }} />
                </tr>
              )}
            </>
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className='h-24 text-center'>
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// =============================================================================
// DataTableSearch
// =============================================================================

type DataTableSearchProps<Data> = {
  readonly table: TanstackTable<Data>;
  readonly placeholder?: string;
  readonly className?: string;
  readonly containerClassName?: string;
};

export function DataTableSearch<Data>({
  table,
  placeholder = 'Search...',
  className,
  containerClassName,
}: DataTableSearchProps<Data>): ReactNode {
  const globalFilter = table.getState().globalFilter as string;

  return (
    <SearchInput
      autoComplete='off'
      className={cn('h-8', className)}
      placeholder={placeholder}
      value={globalFilter}
      containerClassName={containerClassName}
      onChange={(event) => {
        table.setGlobalFilter(event.target.value);
      }}
      onClear={() => {
        table.setGlobalFilter('');
      }}
    />
  );
}

// =============================================================================
// DataTablePagination
// =============================================================================

type DataTablePaginationProps<Data> = {
  readonly table: TanstackTable<Data>;
  readonly pageSizeOptions?: number[];
  readonly withSelectedCount?: boolean;
  readonly itemName?: string;
};

const defaultPageSizeOptions = [10, 20, 30, 40, 50];

export function DataTablePagination<Data>({
  table,
  pageSizeOptions = defaultPageSizeOptions,
  withSelectedCount = true,
  itemName = 'row',
}: DataTablePaginationProps<Data>): ReactNode {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const totalCount = table.getFilteredRowModel().rows.length;

  return (
    <div className='flex items-center justify-between'>
      {withSelectedCount ? (
        <div className='flex-1 text-sm text-muted-foreground'>
          {selectedCount} of {totalCount} {itemName}(s) selected.
        </div>
      ) : (
        <div className='flex-1' />
      )}
      <div className='flex items-center space-x-6 lg:space-x-8'>
        <div className='flex items-center space-x-2'>
          <p className='text-sm font-medium whitespace-nowrap'>Items per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger size='sm' className='w-[70px] pr-2'>
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent position='popper' side='top'>
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex w-[100px] items-center justify-center text-sm font-medium'>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className='flex items-center space-x-2'>
          <Button
            variant='outline'
            className='hidden h-7 w-8 p-0 lg:flex'
            disabled={!table.getCanPreviousPage()}
            onClick={() => {
              table.setPageIndex(0);
            }}
          >
            <span className='sr-only'>Go to first page</span>
            <ChevronsLeft className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='h-7 w-8 p-0'
            disabled={!table.getCanPreviousPage()}
            onClick={() => {
              table.previousPage();
            }}
          >
            <span className='sr-only'>Go to previous page</span>
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='h-7 w-8 p-0'
            disabled={!table.getCanNextPage()}
            onClick={() => {
              table.nextPage();
            }}
          >
            <span className='sr-only'>Go to next page</span>
            <ChevronRight className='h-4 w-4' />
          </Button>
          <Button
            variant='outline'
            className='hidden h-7 w-8 p-0 lg:flex'
            disabled={!table.getCanNextPage()}
            onClick={() => {
              table.setPageIndex(table.getPageCount() - 1);
            }}
          >
            <span className='sr-only'>Go to last page</span>
            <ChevronsRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DataTableColumnHeader
// =============================================================================

type DataTableColumnHeaderProps<Data, Value> = {
  readonly column: Column<Data, Value>;
  readonly title: string;
  readonly className?: string;
};

export function DataTableColumnHeader<Data, Value>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<Data, Value>): ReactNode {
  if (!column.getCanSort()) {
    return <div className={cn('text-sm font-medium', className)}>{title}</div>;
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' size='sm' className='-ml-3 h-7 text-sm font-medium data-[state=open]:bg-accent'>
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className='ml-2 h-4 w-4' />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className='ml-2 h-4 w-4' />
            ) : (
              <ChevronsUpDown className='ml-2 h-4 w-4' />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuItem
            onClick={() => {
              column.toggleSorting(false);
            }}
          >
            <ArrowUp className='text-muted-foreground/70' />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              column.toggleSorting(true);
            }}
          >
            <ArrowDown className='text-muted-foreground/70' />
            Desc
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  column.toggleVisibility(false);
                }}
              >
                <EyeOff className='text-muted-foreground/70' />
                Hide
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// =============================================================================
// DataTableSortingDropdown
// =============================================================================

type DataTableSortingDropdownProps<Data> = {
  readonly table: TanstackTable<Data>;
};

export function DataTableSortingDropdown<Data>({ table }: DataTableSortingDropdownProps<Data>): ReactNode {
  const sortingState = table.getState().sorting[0];

  // Dynamically get sortable columns from the table
  const sortFields = table
    .getAllColumns()
    .filter((column) => column.getCanSort())
    .map((column) => ({
      id: column.id,
      label: toTitleCase(column.id),
    }));

  const toggleSorting = (id: string): void => {
    if (sortingState?.id === id) {
      // Toggle direction if already sorting by this column
      table.setSorting([{ id, desc: !sortingState.desc }]);
    } else {
      // Set to descending order by default on first click
      table.setSorting([{ id, desc: true }]);
    }
  };

  const renderSortIndicator = (fieldId: string): ReactNode => {
    if (sortingState?.id !== fieldId) {
      return undefined;
    }

    return sortingState.desc ? <ArrowDown className='ml-auto' /> : <ArrowUp className='ml-auto' />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='icon'>
          <ArrowUpDown className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sortFields.map((field) => (
          <DropdownMenuItem
            key={field.id}
            className='flex w-full items-center'
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

// =============================================================================
// DataTableColumnVisibilityDropdown
// =============================================================================

type DataTableColumnVisibilityDropdownProps<Data> = {
  readonly table: TanstackTable<Data>;
};

export function DataTableColumnVisibilityDropdown<Data>({
  table,
}: DataTableColumnVisibilityDropdownProps<Data>): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='icon'>
          <List className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
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
